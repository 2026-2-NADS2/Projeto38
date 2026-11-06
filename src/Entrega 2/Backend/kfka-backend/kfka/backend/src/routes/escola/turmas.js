// escola/turmas.js — turmas: lista (professor vê só as que leciona), criação e edição/ativação.
// Montado em /api pelo routes/escola.routes.js; o login é exigido rota a rota.

const { Router } = require('express');

const db = require('../../db');
const env = require('../../config/env');
const schemas = require('../../schemas');
const validar = require('../../middlewares/validar');
const { autenticar, autorizar } = require('../../middlewares/auth');
const AppError = require('../../utils/AppError');
const asyncHandler = require('../../utils/asyncHandler');
const { comAuditoria, diferenca } = require('../../utils/auditoria');
const { professorDe } = require('./comum');

const router = Router();

router.get(
  '/turmas',
  autenticar,
  asyncHandler(async (req, res) => {
    const professorId = professorDe(req.usuario);
    const todas = req.usuario.perfil === 'admin' && req.query.todas === '1' ? 1 : 0;
    const linhas = await db.query(
      `SELECT t.id, t.nome, t.serie, t.ano_letivo, t.turno, t.ativo,
              (SELECT COUNT(*) FROM turma_aluno ta JOIN aluno a ON a.id = ta.aluno_id
                WHERE ta.turma_id = t.id AND a.ativo = TRUE) AS total_alunos,
              (SELECT COUNT(*) FROM turma_disciplina_professor x WHERE x.turma_id = t.id) AS total_disciplinas
         FROM turma t
        WHERE (t.ativo = TRUE OR ? = 1) AND t.ano_letivo = ?
          AND (? IS NULL OR t.id IN (SELECT turma_id FROM turma_disciplina_professor WHERE professor_id = ?))
        ORDER BY t.serie, t.nome`,
      [todas, env.ANO_LETIVO, professorId, professorId]
    );
    res.json({
      dados: linhas.map((t) => ({
        ...t,
        ativo: Boolean(t.ativo),
        total_alunos: Number(t.total_alunos) || 0,
        total_disciplinas: Number(t.total_disciplinas) || 0,
      })),
    });
  })
);

router.post(
  '/turmas',
  autenticar,
  autorizar('admin'),
  validar(schemas.turma),
  asyncHandler(async (req, res) => {
    const { nome, serie, turno } = req.body;
    const ano_letivo = req.body.ano_letivo ?? env.ANO_LETIVO;
    const r = await comAuditoria(
      req,
      res,
      (tx) => tx.query('INSERT INTO turma (nome, serie, ano_letivo, turno) VALUES (?, ?, ?, ?)', [nome, serie, ano_letivo, turno]),
      (ins) => ({ acao: 'CRIAR_TURMA', entidade: 'turma', entidade_id: ins.insertId, detalhes: { nome, serie, ano_letivo, turno } })
    );
    res.status(201).json({ dados: { id: r.insertId, nome, serie, ano_letivo, turno } });
  })
);

// ---------------------------------------------------------------------------
// Gestão escolar (coordenação)
// ---------------------------------------------------------------------------
router.put(
  '/turmas/:id',
  autenticar,
  autorizar('admin'),
  validar(schemas.paramId, 'params'),
  validar(schemas.edicaoTurma),
  asyncHandler(async (req, res) => {
    const { nome, serie, turno, ativo } = req.body;
    const [antes] = await db.query('SELECT nome, serie, turno, ativo FROM turma WHERE id = ?', [req.validado.params.id]);
    if (!antes) throw AppError.naoEncontrado('Turma não encontrada.');
    await comAuditoria(
      req,
      res,
      (tx) => tx.query('UPDATE turma SET nome = ?, serie = ?, turno = ?, ativo = ? WHERE id = ?', [nome, serie, turno, ativo, req.validado.params.id]),
      {
        acao: antes.ativo && !ativo ? 'DESATIVAR_TURMA' : !antes.ativo && ativo ? 'ATIVAR_TURMA' : 'EDITAR_TURMA',
        entidade: 'turma',
        entidade_id: req.validado.params.id,
        detalhes: diferenca({ ...antes, ativo: Boolean(antes.ativo) }, req.body, ['nome', 'serie', 'turno', 'ativo']),
      }
    );
    res.json({ dados: { id: req.validado.params.id, nome, serie, turno, ativo } });
  })
);

module.exports = router;
