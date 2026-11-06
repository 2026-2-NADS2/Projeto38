// eventos.routes.js — calendário escolar.
//
//   GET    /api/eventos?inicio=&fim=&turma_id=&aluno_id=&tipo=   (logado)
//   POST   /api/eventos           (admin)  cadastra evento
//   PUT    /api/eventos/:id       (admin)  edita
//   DELETE /api/eventos/:id       (admin)  exclui
//
// O calendário junta três fontes:
//   1. eventos cadastrados pela coordenação (tabela evento)
//   2. início e fim dos bimestres e o prazo de digitação das notas (tabela bimestre)
//   3. prazos de entrega das atividades publicadas (tabela atividade)
//
// Visibilidade:
//   admin       -> tudo
//   professor   -> eventos da escola + das turmas em que leciona; atividades dele
//   responsável -> eventos da escola (exceto os só da equipe) + das turmas dos filhos;
//                  atividades publicadas dessas turmas

const { Router } = require('express');

const db = require('../db');
const env = require('../config/env');
const schemas = require('../schemas');
const validar = require('../middlewares/validar');
const { autenticar, autorizar } = require('../middlewares/auth');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { alunosDoResponsavel, turmasDoProfessor, turmaDoAluno } = require('../utils/acesso');
const { paraIsoLocal } = require('../utils/datas');

const router = Router();
router.use(autenticar);

const horaCurta = (h) => (h ? String(h).slice(0, 5) : null);

// Turmas que o usuário pode ver no calendário (null = todas)
async function turmasVisiveis(usuario, { turmaId, alunoId }) {
  if (usuario.perfil === 'admin') return turmaId ? [turmaId] : null;

  let minhas;
  if (usuario.perfil === 'professor') {
    minhas = await turmasDoProfessor(usuario.professorId);
  } else {
    const filhos = await alunosDoResponsavel(usuario.responsavelId);
    if (alunoId && !filhos.includes(alunoId)) throw AppError.naoEncontrado('Aluno não encontrado.');
    const alvo = alunoId ? [alunoId] : filhos;
    minhas = [];
    for (const id of alvo) {
      const t = await turmaDoAluno(id);
      if (t && !minhas.includes(t)) minhas.push(t);
    }
  }
  if (turmaId) {
    if (!minhas.includes(turmaId)) throw AppError.semPermissao('Você não tem acesso ao calendário desta turma.');
    return [turmaId];
  }
  return minhas;
}

router.get(
  '/',
  validar(schemas.filtroEventos, 'query'),
  asyncHandler(async (req, res) => {
    const { inicio, fim, turma_id, aluno_id, tipo } = req.validado.query;
    const usuario = req.usuario;
    const turmas = await turmasVisiveis(usuario, { turmaId: turma_id, alunoId: aluno_id });
    const tipos = tipo ? tipo.split(',').map((t) => t.trim().toUpperCase()).filter(Boolean) : null;
    const quer = (t) => !tipos || tipos.includes(t);
    const ehEquipe = usuario.perfil !== 'responsavel';
    const listaTurmas = turmas && turmas.length ? turmas : [0];
    const itens = [];

    // 1. Eventos cadastrados
    const eventos = await db.query(
      `SELECT e.id, e.titulo, e.descricao, e.tipo, e.data_inicio, e.data_fim, e.hora_inicio, e.hora_fim,
              e.turma_id, t.nome AS turma, e.disciplina_id, d.nome AS disciplina, e.publico
         FROM evento e
         LEFT JOIN turma t ON t.id = e.turma_id
         LEFT JOIN disciplina d ON d.id = e.disciplina_id
        WHERE e.data_inicio <= ? AND COALESCE(e.data_fim, e.data_inicio) >= ?
          AND (? = 1 OR e.publico = 'TODOS')
          AND (? = 1 OR e.turma_id IS NULL OR e.turma_id IN (?))
        ORDER BY e.data_inicio, e.hora_inicio`,
      [fim, inicio, ehEquipe ? 1 : 0, turmas === null ? 1 : 0, listaTurmas]
    );
    for (const e of eventos) {
      // Filtro por turma: mostra os da turma e os da escola toda
      if (!quer(e.tipo)) continue;
      itens.push({
        id: `evento-${e.id}`,
        evento_id: e.id,
        origem: 'evento',
        tipo: e.tipo,
        titulo: e.titulo,
        descricao: e.descricao,
        data_inicio: e.data_inicio,
        data_fim: e.data_fim,
        hora_inicio: horaCurta(e.hora_inicio),
        hora_fim: horaCurta(e.hora_fim),
        turma_id: e.turma_id,
        turma: e.turma,
        disciplina_id: e.disciplina_id,
        disciplina: e.disciplina,
        publico: e.publico,
        editavel: usuario.perfil === 'admin',
      });
    }

    // 2. Bimestres (início/fim) e prazo de digitação (só equipe)
    const bimestres = await db.query(
      `SELECT id, numero, data_inicio, data_fim, digitacao_inicio, digitacao_fim
         FROM bimestre WHERE ano_letivo = ?`,
      [env.ANO_LETIVO]
    );
    const noPeriodo = (d) => d && d >= inicio && d <= fim;
    for (const b of bimestres) {
      if (quer('BIMESTRE')) {
        if (noPeriodo(b.data_inicio)) {
          itens.push(marco(`bim-${b.id}-ini`, 'BIMESTRE', `Início do ${b.numero}º bimestre`, b.data_inicio));
        }
        if (noPeriodo(b.data_fim)) {
          itens.push(marco(`bim-${b.id}-fim`, 'BIMESTRE', `Fim do ${b.numero}º bimestre`, b.data_fim));
        }
      }
      const fimDigitacao = paraIsoLocal(b.digitacao_fim);
      if (ehEquipe && quer('PRAZO') && noPeriodo(fimDigitacao)) {
        itens.push(
          marco(`bim-${b.id}-dig`, 'PRAZO', `Último dia para lançar as notas do ${b.numero}º bimestre`, fimDigitacao, 'Lançamentos de média, faltas e parecer.')
        );
      }
    }

    // 3. Prazos de atividades
    if (quer('ENTREGA')) {
      const doProf = usuario.perfil === 'professor' ? usuario.professorId : null;
      const atividades = await db.query(
        `SELECT a.id, a.titulo, a.prazo, a.status, t.nome AS turma, a.turma_id, d.nome AS disciplina
           FROM atividade a
           JOIN turma t ON t.id = a.turma_id
           JOIN disciplina d ON d.id = a.disciplina_id
          WHERE a.status IN ('PUBLICADA', 'ENCERRADA')
            AND a.prazo >= ? AND a.prazo < ?
            AND (? IS NULL OR a.professor_id = ?)
            AND (? = 1 OR a.turma_id IN (?))`,
        [`${inicio} 00:00:00`, `${fim} 23:59:59`, doProf, doProf, turmas === null ? 1 : 0, listaTurmas]
      );
      for (const a of atividades) {
        const dia = paraIsoLocal(a.prazo);
        itens.push({
          ...marco(`atv-${a.id}`, 'ENTREGA', `Entrega: ${a.titulo}`, dia, `${a.disciplina} · ${a.turma}`),
          hora_inicio: horaDe(a.prazo),
          turma_id: a.turma_id,
          turma: a.turma,
          disciplina: a.disciplina,
          link: `/atividades?abrir=${a.id}`,
        });
      }
    }

    itens.sort((x, y) => (x.data_inicio + (x.hora_inicio || '')).localeCompare(y.data_inicio + (y.hora_inicio || '')));
    res.json({ dados: itens });
  })
);

function marco(id, tipo, titulo, data, descricao = null) {
  return {
    id,
    origem: tipo === 'ENTREGA' ? 'atividade' : 'bimestre',
    tipo,
    titulo,
    descricao,
    data_inicio: data,
    data_fim: null,
    hora_inicio: null,
    hora_fim: null,
    turma_id: null,
    turma: null,
    disciplina: null,
    editavel: false,
  };
}

// Hora local (HH:MM) de um DATETIME lido do banco
function horaDe(valor) {
  if (!valor) return null;
  if (typeof valor === 'string') return valor.slice(11, 16) || null;
  return new Date(valor).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: fusoIana(),
  });
}

// "-03:00" -> "Etc/GMT+3" (o sinal do Etc/GMT é invertido)
function fusoIana() {
  const [, sinal, h, m] = env.DB_TIMEZONE.match(/^([+-])(\d{2}):(\d{2})$/);
  if (m !== '00') return 'America/Sao_Paulo';
  const horas = Number(h);
  return horas === 0 ? 'UTC' : `Etc/GMT${sinal === '-' ? '+' : '-'}${horas}`;
}

async function validarReferencias(corpo) {
  if (corpo.turma_id) {
    const [t] = await db.query('SELECT id FROM turma WHERE id = ?', [corpo.turma_id]);
    if (!t) throw campoInvalido('turma_id', 'Turma não encontrada.');
  }
  if (corpo.disciplina_id) {
    const [d] = await db.query('SELECT id FROM disciplina WHERE id = ?', [corpo.disciplina_id]);
    if (!d) throw campoInvalido('disciplina_id', 'Disciplina não encontrada.');
  }
}

const campoInvalido = (campo, mensagem) =>
  new AppError(422, 'DADOS_INVALIDOS', 'Verifique os dados enviados.', [{ campo, mensagem }]);

const CAMPOS = ['titulo', 'descricao', 'tipo', 'data_inicio', 'data_fim', 'hora_inicio', 'hora_fim', 'turma_id', 'disciplina_id', 'publico'];

router.post(
  '/',
  autorizar('admin'),
  validar(schemas.evento),
  asyncHandler(async (req, res) => {
    await validarReferencias(req.body);
    const r = await db.query(
      `INSERT INTO evento (${CAMPOS.join(', ')}, criado_por) VALUES (${CAMPOS.map(() => '?').join(', ')}, ?)`,
      [...CAMPOS.map((c) => req.body[c] ?? null), req.usuario.id]
    );
    res.status(201).json({ dados: { id: r.insertId, ...req.body } });
  })
);

router.put(
  '/:id',
  autorizar('admin'),
  validar(schemas.paramId, 'params'),
  validar(schemas.evento),
  asyncHandler(async (req, res) => {
    await validarReferencias(req.body);
    const r = await db.query(`UPDATE evento SET ${CAMPOS.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, [
      ...CAMPOS.map((c) => req.body[c] ?? null),
      req.validado.params.id,
    ]);
    if (!r.affectedRows) throw AppError.naoEncontrado('Evento não encontrado.');
    res.json({ dados: { id: req.validado.params.id, ...req.body } });
  })
);

router.delete(
  '/:id',
  autorizar('admin'),
  validar(schemas.paramId, 'params'),
  asyncHandler(async (req, res) => {
    const r = await db.query('DELETE FROM evento WHERE id = ?', [req.validado.params.id]);
    if (!r.affectedRows) throw AppError.naoEncontrado('Evento não encontrado.');
    res.status(204).end();
  })
);

module.exports = router;
module.exports.horaDe = horaDe;
