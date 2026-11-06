// justificativas.routes.js — justificativa de faltas.
//
//   GET   /api/justificativas?status=&aluno_id=     responsável: as suas · admin: todas · professor: das suas turmas (sem o motivo)
//   GET   /api/justificativas/faltas                (responsável) faltas registradas nas aulas e se já têm justificativa
//   POST  /api/justificativas                       (responsável) envia { aluno_id, data_inicio, data_fim?, motivo, descricao }
//   PUT   /api/justificativas/:id                   (responsável) complementa (pendente ou "necessita de informações")
//   PATCH /api/justificativas/:id/analise           (admin) { status, parecer }
//
// Fluxo: PENDENTE -> EM_ANALISE -> APROVADA | RECUSADA | NECESSITA_INFO -> (responsável complementa) -> PENDENTE
// Privacidade: o motivo e a descrição podem conter dados de saúde; o professor vê só a situação e as datas.
// Comprovantes (atestados): o envio de arquivos ainda não é suportado — a tela orienta a entregar na secretaria.

const { Router } = require('express');

const db = require('../db');
const env = require('../config/env');
const schemas = require('../schemas');
const validar = require('../middlewares/validar');
const { autenticar, autorizar } = require('../middlewares/auth');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { consultaPaginada } = require('../utils/paginacao');
const { alunosDoResponsavel, turmasDoProfessor } = require('../utils/acesso');

const router = Router();
router.use(autenticar);

const st = (s) => (s ? String(s).toLowerCase() : null);

const SQL = `
  SELECT j.id, j.aluno_id, al.nome AS aluno, t.nome AS turma, j.responsavel_id, ur.nome AS responsavel,
         j.data_inicio, j.data_fim, j.motivo, j.descricao, j.status, j.parecer,
         ua.nome AS analisado_por, j.analisado_em, j.criado_em, j.atualizado_em
    FROM justificativa_falta j
    JOIN aluno al ON al.id = j.aluno_id
    JOIN responsavel r ON r.id = j.responsavel_id
    JOIN usuario ur ON ur.id = r.usuario_id
    LEFT JOIN usuario ua ON ua.id = j.analisado_por
    LEFT JOIN turma_aluno ta ON ta.aluno_id = al.id AND ta.ano_letivo = ${Number(env.ANO_LETIVO)}
    LEFT JOIN turma t ON t.id = ta.turma_id`;

const formatar = (j) => ({ ...j, motivo: st(j.motivo), status: st(j.status) });

// Professor: só datas e situação (sem motivo/descrição/parecer)
const resumoProfessor = ({ id, aluno_id, aluno, turma, data_inicio, data_fim, status }) => ({
  id,
  aluno_id,
  aluno,
  turma,
  data_inicio,
  data_fim,
  status: st(status),
});

// Quem vê quais justificativas (mesma regra na lista e no detalhe)
async function filtroAcesso(u, { status = null, alunoId = null, id = null } = {}) {
  const filtros = ['(? IS NULL OR j.status = ?)', '(? IS NULL OR j.aluno_id = ?)', '(? IS NULL OR j.id = ?)'];
  const params = [status, status, alunoId, alunoId, id, id];
  if (u.perfil === 'responsavel') {
    filtros.push('j.responsavel_id = ?');
    params.push(u.responsavelId);
  } else if (u.perfil === 'professor') {
    const turmas = await turmasDoProfessor(u.professorId);
    filtros.push('ta.turma_id IN (?)');
    params.push(turmas.length ? turmas : [0]);
  }
  return { filtros, params };
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const u = req.usuario;
    const status = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : null;
    const alunoId = Number(req.query.aluno_id) || null;
    const { filtros, params } = await filtroAcesso(u, { status, alunoId });

    const { linhas, meta } = await consultaPaginada(
      req,
      `${SQL} WHERE ${filtros.join(' AND ')}
        ORDER BY CASE j.status WHEN 'PENDENTE' THEN 0 WHEN 'EM_ANALISE' THEN 1 WHEN 'NECESSITA_INFO' THEN 2 ELSE 3 END,
                 j.criado_em DESC, j.id DESC`,
      params
    );
    res.json({ dados: linhas.map(u.perfil === 'professor' ? resumoProfessor : formatar), ...(meta ? { meta } : {}) });
  })
);

// Faltas das aulas registradas pelos professores (para o responsável escolher a data)
router.get(
  '/faltas',
  autorizar('responsavel'),
  asyncHandler(async (req, res) => {
    const filhos = await alunosDoResponsavel(req.usuario.responsavelId);
    if (!filhos.length) return res.json({ dados: [] });
    const faltas = await db.query(
      `SELECT p.aluno_id, al.nome AS aluno, a.data, d.nome AS disciplina
         FROM aula_presenca p
         JOIN aula a ON a.id = p.aula_id
         JOIN aluno al ON al.id = p.aluno_id
         JOIN disciplina d ON d.id = a.disciplina_id
        WHERE p.presente = FALSE AND p.aluno_id IN (?) AND a.data >= ?
        ORDER BY a.data DESC, al.nome`,
      [filhos, `${env.ANO_LETIVO}-01-01`]
    );
    const justs = await db.query(
      `SELECT aluno_id, data_inicio, data_fim, status FROM justificativa_falta
        WHERE aluno_id IN (?) AND status <> 'RECUSADA'`,
      [filhos]
    );
    // Agrupa por aluno + dia (várias disciplinas no mesmo dia = uma falta a justificar)
    const mapa = new Map();
    for (const f of faltas) {
      const chave = `${f.aluno_id}|${f.data}`;
      if (!mapa.has(chave)) {
        const j = justs.find((x) => x.aluno_id === f.aluno_id && f.data >= x.data_inicio && f.data <= x.data_fim);
        mapa.set(chave, { aluno_id: f.aluno_id, aluno: f.aluno, data: f.data, disciplinas: [], justificativa: j ? st(j.status) : null });
      }
      mapa.get(chave).disciplinas.push(f.disciplina);
    }
    res.json({ dados: [...mapa.values()] });
  })
);

async function buscar(id) {
  const [j] = await db.query(`${SQL} WHERE j.id = ?`, [id]);
  if (!j) throw AppError.naoEncontrado('Justificativa não encontrada.');
  return j;
}

router.post(
  '/',
  autorizar('responsavel'),
  validar(schemas.justificativa),
  asyncHandler(async (req, res) => {
    const { aluno_id, data_inicio, data_fim, motivo, descricao } = req.body;
    if (!(await alunosDoResponsavel(req.usuario.responsavelId)).includes(aluno_id)) {
      throw AppError.naoEncontrado('Aluno não encontrado.');
    }
    const repetida = await db.query(
      `SELECT id FROM justificativa_falta
        WHERE aluno_id = ? AND status NOT IN ('RECUSADA') AND data_inicio <= ? AND data_fim >= ?`,
      [aluno_id, data_fim, data_inicio]
    );
    if (repetida.length) throw AppError.conflito('Já existe uma justificativa para este aluno neste período.');

    const r = await db.query(
      `INSERT INTO justificativa_falta (aluno_id, responsavel_id, data_inicio, data_fim, motivo, descricao)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [aluno_id, req.usuario.responsavelId, data_inicio, data_fim, motivo, descricao]
    );
    res.status(201).json({ dados: formatar(await buscar(r.insertId)) });
  })
);

router.put(
  '/:id',
  autorizar('responsavel'),
  validar(schemas.paramId, 'params'),
  validar(schemas.justificativa),
  asyncHandler(async (req, res) => {
    const j = await buscar(req.validado.params.id);
    if (j.responsavel_id !== req.usuario.responsavelId) throw AppError.naoEncontrado('Justificativa não encontrada.');
    if (!['PENDENTE', 'NECESSITA_INFO'].includes(j.status)) {
      throw AppError.conflito('Esta justificativa já está em análise ou foi concluída e não pode ser alterada.');
    }
    if (req.body.aluno_id !== j.aluno_id) throw AppError.conflito('Não é possível trocar o aluno de uma justificativa.');
    const { data_inicio, data_fim, motivo, descricao } = req.body;
    await db.query(
      `UPDATE justificativa_falta SET data_inicio = ?, data_fim = ?, motivo = ?, descricao = ?, status = 'PENDENTE'
        WHERE id = ?`,
      [data_inicio, data_fim, motivo, descricao, j.id]
    );
    res.json({ dados: formatar(await buscar(j.id)) });
  })
);

router.patch(
  '/:id/analise',
  autorizar('admin'),
  validar(schemas.paramId, 'params'),
  validar(schemas.analiseJustificativa),
  asyncHandler(async (req, res) => {
    const j = await buscar(req.validado.params.id);
    if (['APROVADA', 'RECUSADA'].includes(j.status)) throw AppError.conflito('Esta justificativa já foi concluída.');
    await db.query(
      'UPDATE justificativa_falta SET status = ?, parecer = ?, analisado_por = ?, analisado_em = NOW() WHERE id = ?',
      [req.body.status, req.body.parecer, req.usuario.id, j.id]
    );
    res.json({ dados: formatar(await buscar(j.id)) });
  })
);

// Detalhe (o link de uma pendência pode apontar para item fora da página atual da lista)
router.get(
  '/:id',
  validar(schemas.paramId, 'params'),
  asyncHandler(async (req, res) => {
    const u = req.usuario;
    const { filtros, params } = await filtroAcesso(u, { id: req.validado.params.id });
    const [j] = await db.query(`${SQL} WHERE ${filtros.join(' AND ')}`, params);
    if (!j) throw AppError.naoEncontrado('Justificativa não encontrada.');
    res.json({ dados: u.perfil === 'professor' ? resumoProfessor(j) : formatar(j) });
  })
);

module.exports = router;
