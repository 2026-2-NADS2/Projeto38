// aulas.routes.js — relatório por aula (diário de classe) e registro de frequência.
//
//   GET    /api/aulas?turma_id=&disciplina_id=&status=         histórico de aulas (professor: as dele; admin: todas)
//   GET    /api/aulas/sem-registro                              dias da grade sem aula registrada (professor)
//   GET    /api/aulas/chamada?turma_id=&disciplina_id=&data=    formulário: aula do dia (se houver) + alunos e presença
//   PUT    /api/aulas                                           salva rascunho ou finaliza { ..., presencas, finalizar }
//   DELETE /api/aulas/:id                                       exclui um rascunho
//
// Regras:
//   - só o professor da disciplina na turma registra (FK composta + conferência aqui)
//   - aula finalizada não é mais editada
//   - para finalizar, todos os alunos ativos da turma precisam ter presença marcada
//   - a justificativa de falta aparece só como situação (o motivo pode ser de saúde)

const { Router } = require('express');

const db = require('../db');
const env = require('../config/env');
const schemas = require('../schemas');
const validar = require('../middlewares/validar');
const { autenticar, autorizar } = require('../middlewares/auth');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { professorLeciona } = require('../utils/acesso');
const { hoje, somarDias, diaSemana } = require('../utils/datas');

const router = Router();
router.use(autenticar, autorizar('professor', 'admin'));

const st = (s) => String(s).toLowerCase();

async function exigirVinculo(usuario, turmaId, disciplinaId) {
  if (usuario.perfil === 'admin') return;
  if (!(await professorLeciona(usuario.professorId, turmaId, disciplinaId))) {
    throw AppError.semPermissao('Você não leciona esta disciplina nesta turma.');
  }
}

router.get(
  '/',
  validar(schemas.filtroAulas, 'query'),
  asyncHandler(async (req, res) => {
    const { turma_id, disciplina_id, status } = req.validado.query;
    const doProf = req.usuario.perfil === 'professor' ? req.usuario.professorId : null;
    const linhas = await db.query(
      `SELECT a.id, a.data, a.conteudo, a.status, a.finalizado_em, a.atualizado_em,
              a.turma_id, t.nome AS turma, a.disciplina_id, d.nome AS disciplina, u.nome AS professor,
              (SELECT COUNT(*) FROM aula_presenca p WHERE p.aula_id = a.id) AS marcados,
              (SELECT COUNT(*) FROM aula_presenca p WHERE p.aula_id = a.id AND p.presente = FALSE) AS faltas,
              (SELECT COUNT(*) FROM turma_aluno ta JOIN aluno al ON al.id = ta.aluno_id
                WHERE ta.turma_id = a.turma_id AND al.ativo = TRUE) AS total_alunos
         FROM aula a
         JOIN turma t ON t.id = a.turma_id
         JOIN disciplina d ON d.id = a.disciplina_id
         JOIN professor p ON p.id = a.professor_id
         JOIN usuario u ON u.id = p.usuario_id
        WHERE (? IS NULL OR a.professor_id = ?)
          AND (? IS NULL OR a.turma_id = ?)
          AND (? IS NULL OR a.disciplina_id = ?)
          AND (? IS NULL OR a.status = ?)
        ORDER BY a.data DESC, t.nome
        LIMIT 300`,
      [doProf, doProf, turma_id ?? null, turma_id ?? null, disciplina_id ?? null, disciplina_id ?? null, status ?? null, status ?? null]
    );
    res.json({
      dados: linhas.map((a) => ({
        ...a,
        status: st(a.status),
        marcados: Number(a.marcados),
        faltas: Number(a.faltas),
        total_alunos: Number(a.total_alunos),
      })),
    });
  })
);

// Dias da grade (últimas 2 semanas, dentro dos bimestres) sem aula registrada.
// Exportada para o painel de pendências.
async function aulasSemRegistro(professorId, dias = 14) {
  const ate = hoje();
  const de = somarDias(ate, -(dias - 1));

  const grade = await db.query(
    `SELECT g.turma_id, t.nome AS turma, g.disciplina_id, d.nome AS disciplina, g.dia_semana
       FROM grade_aula g
       JOIN turma_disciplina_professor tdp ON tdp.turma_id = g.turma_id AND tdp.disciplina_id = g.disciplina_id
       JOIN turma t ON t.id = g.turma_id AND t.ativo = TRUE AND t.ano_letivo = ?
       JOIN disciplina d ON d.id = g.disciplina_id
      WHERE tdp.professor_id = ?`,
    [env.ANO_LETIVO, professorId]
  );
  if (!grade.length) return [];

  const [bimestres, feriados, feitas] = await Promise.all([
    db.query('SELECT data_inicio, data_fim FROM bimestre WHERE ano_letivo = ? AND data_inicio IS NOT NULL', [env.ANO_LETIVO]),
    db.query(
      `SELECT data_inicio, COALESCE(data_fim, data_inicio) AS data_fim FROM evento
        WHERE tipo = 'FERIADO' AND turma_id IS NULL AND data_inicio <= ? AND COALESCE(data_fim, data_inicio) >= ?`,
      [ate, de]
    ),
    db.query('SELECT turma_id, disciplina_id, data FROM aula WHERE professor_id = ? AND data BETWEEN ? AND ?', [
      professorId,
      de,
      ate,
    ]),
  ]);

  const letivo = (d) => bimestres.some((b) => d >= b.data_inicio && d <= (b.data_fim || b.data_inicio));
  const feriado = (d) => feriados.some((f) => d >= f.data_inicio && d <= f.data_fim);
  const registrada = (g, d) => feitas.some((a) => a.turma_id === g.turma_id && a.disciplina_id === g.disciplina_id && a.data === d);

  const faltando = [];
  for (let d = de; d <= ate; d = somarDias(d, 1)) {
    if (!letivo(d) || feriado(d)) continue;
    const dia = diaSemana(d);
    for (const g of grade) {
      if (g.dia_semana === dia && !registrada(g, d)) {
        faltando.push({ turma_id: g.turma_id, turma: g.turma, disciplina_id: g.disciplina_id, disciplina: g.disciplina, data: d });
      }
    }
  }
  return faltando.sort((a, b) => b.data.localeCompare(a.data));
}

router.get(
  '/sem-registro',
  autorizar('professor'),
  asyncHandler(async (req, res) => {
    res.json({ dados: await aulasSemRegistro(req.usuario.professorId) });
  })
);

async function alunosDaTurma(turmaId) {
  return db.query(
    `SELECT a.id AS aluno_id, a.nome, a.matricula
       FROM turma_aluno ta JOIN aluno a ON a.id = ta.aluno_id
      WHERE ta.turma_id = ? AND a.ativo = TRUE
      ORDER BY a.nome`,
    [turmaId]
  );
}

async function montarChamada(turmaId, disciplinaId, data) {
  const [aula] = await db.query(
    `SELECT a.id, a.data, a.conteudo, a.descricao, a.atividades, a.observacoes, a.status, a.finalizado_em,
            a.atualizado_em, u.nome AS professor
       FROM aula a JOIN professor p ON p.id = a.professor_id JOIN usuario u ON u.id = p.usuario_id
      WHERE a.turma_id = ? AND a.disciplina_id = ? AND a.data = ?`,
    [turmaId, disciplinaId, data]
  );
  const alunos = await alunosDaTurma(turmaId);
  const presencas = aula ? await db.query('SELECT aluno_id, presente, observacao FROM aula_presenca WHERE aula_id = ?', [aula.id]) : [];
  const ids = alunos.map((a) => a.aluno_id);
  const justificativas = ids.length
    ? await db.query(
        `SELECT aluno_id, status FROM justificativa_falta
          WHERE aluno_id IN (?) AND ? BETWEEN data_inicio AND data_fim
          ORDER BY criado_em`,
        [ids, data]
      )
    : [];

  return {
    aula: aula ? { ...aula, status: st(aula.status) } : null,
    alunos: alunos.map((a) => {
      const p = presencas.find((x) => x.aluno_id === a.aluno_id);
      const j = justificativas.filter((x) => x.aluno_id === a.aluno_id).pop();
      return {
        ...a,
        presente: p ? Boolean(p.presente) : null,
        observacao: p?.observacao ?? null,
        justificativa: j ? st(j.status) : null,
      };
    }),
  };
}

router.get(
  '/chamada',
  asyncHandler(async (req, res) => {
    const parse = schemas.aula.pick({ turma_id: true, disciplina_id: true, data: true }).safeParse(req.query);
    if (!parse.success) {
      throw new AppError(
        422,
        'DADOS_INVALIDOS',
        'Verifique os dados enviados.',
        parse.error.issues.map((i) => ({ campo: i.path.join('.'), mensagem: i.message }))
      );
    }
    const { turma_id, disciplina_id, data } = parse.data;
    await exigirVinculo(req.usuario, turma_id, disciplina_id);
    res.json({ dados: await montarChamada(turma_id, disciplina_id, data) });
  })
);

router.put(
  '/',
  autorizar('professor'),
  validar(schemas.aula),
  asyncHandler(async (req, res) => {
    const { turma_id, disciplina_id, data, conteudo, descricao, atividades, observacoes, presencas, finalizar } = req.body;
    const professorId = req.usuario.professorId;
    await exigirVinculo(req.usuario, turma_id, disciplina_id);

    const alunos = await alunosDaTurma(turma_id);
    const daTurma = new Set(alunos.map((a) => a.aluno_id));
    const estranho = presencas.find((p) => !daTurma.has(p.aluno_id));
    if (estranho) {
      throw new AppError(422, 'DADOS_INVALIDOS', 'Verifique os dados enviados.', [
        { campo: 'presencas', mensagem: 'Há aluno que não pertence a esta turma na lista de presença.' },
      ]);
    }
    if (finalizar) {
      const marcados = new Set(presencas.map((p) => p.aluno_id));
      const faltando = alunos.filter((a) => !marcados.has(a.aluno_id));
      if (faltando.length) {
        throw new AppError(422, 'DADOS_INVALIDOS', 'Verifique os dados enviados.', [
          {
            campo: 'presencas',
            mensagem: `Marque a presença de todos os alunos antes de finalizar (faltam: ${faltando.map((a) => a.nome).join(', ')}).`,
          },
        ]);
      }
    }

    const criado = await db.transacao(req.usuario.id, async (tx) => {
      const [atual] = await tx.query(
        'SELECT id, status, professor_id FROM aula WHERE turma_id = ? AND disciplina_id = ? AND data = ? FOR UPDATE',
        [turma_id, disciplina_id, data]
      );
      let id;
      if (!atual) {
        const r = await tx.query(
          `INSERT INTO aula (turma_id, disciplina_id, professor_id, data, conteudo, descricao, atividades, observacoes, status, finalizado_em)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ${finalizar ? 'NOW()' : 'NULL'})`,
          [turma_id, disciplina_id, professorId, data, conteudo, descricao, atividades, observacoes, finalizar ? 'FINALIZADA' : 'RASCUNHO']
        );
        id = r.insertId;
      } else {
        if (atual.status === 'FINALIZADA') throw AppError.conflito('Esta aula já foi finalizada e não pode mais ser alterada.');
        if (atual.professor_id !== professorId) throw AppError.semPermissao('Esta aula foi registrada por outro professor.');
        await tx.query(
          `UPDATE aula SET conteudo = ?, descricao = ?, atividades = ?, observacoes = ?, status = ?,
                  finalizado_em = ${finalizar ? 'NOW()' : 'NULL'}
            WHERE id = ?`,
          [conteudo, descricao, atividades, observacoes, finalizar ? 'FINALIZADA' : 'RASCUNHO', atual.id]
        );
        id = atual.id;
      }
      await tx.query('DELETE FROM aula_presenca WHERE aula_id = ?', [id]);
      for (const p of presencas) {
        await tx.query('INSERT INTO aula_presenca (aula_id, aluno_id, presente, observacao) VALUES (?, ?, ?, ?)', [
          id,
          p.aluno_id,
          p.presente,
          p.observacao,
        ]);
      }
      return !atual;
    });

    res.status(criado ? 201 : 200).json({ dados: await montarChamada(turma_id, disciplina_id, data) });
  })
);

router.delete(
  '/:id',
  autorizar('professor'),
  validar(schemas.paramId, 'params'),
  asyncHandler(async (req, res) => {
    const [aula] = await db.query('SELECT id, status, professor_id FROM aula WHERE id = ?', [req.validado.params.id]);
    if (!aula || aula.professor_id !== req.usuario.professorId) throw AppError.naoEncontrado('Aula não encontrada.');
    if (aula.status !== 'RASCUNHO') throw AppError.conflito('Só é possível excluir aulas em rascunho.');
    await db.query('DELETE FROM aula WHERE id = ?', [aula.id]);
    res.status(204).end();
  })
);

module.exports = router;
module.exports.aulasSemRegistro = aulasSemRegistro;
