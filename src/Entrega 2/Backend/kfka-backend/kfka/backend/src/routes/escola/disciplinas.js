// escola/disciplinas.js — disciplinas e áreas do conhecimento (área com disciplinas não é excluída).
// Montado em /api pelo routes/escola.routes.js; o login é exigido rota a rota.

const { Router } = require('express');

const db = require('../../db');
const schemas = require('../../schemas');
const validar = require('../../middlewares/validar');
const { autenticar, autorizar } = require('../../middlewares/auth');
const AppError = require('../../utils/AppError');
const asyncHandler = require('../../utils/asyncHandler');
const { comAuditoria, diferenca } = require('../../utils/auditoria');
const { professorDe } = require('./comum');

const router = Router();

router.get(
  '/disciplinas',
  autenticar,
  asyncHandler(async (req, res) => {
    const turmaId = Number(req.query.turma_id) || null;
    const professorId = professorDe(req.usuario);

    // Sem turma: catálogo completo de disciplinas (a coordenação vê também as inativas)
    if (!turmaId) {
      const todas = req.usuario.perfil === 'admin' && req.query.todas === '1' ? 1 : 0;
      const linhas = await db.query(
        `SELECT d.id, d.nome, d.area_id, ar.nome AS area, d.ativo
           FROM disciplina d JOIN area ar ON ar.id = d.area_id
          WHERE d.ativo = TRUE OR ? = 1 ORDER BY d.nome`,
        [todas]
      );
      return res.json({ dados: linhas.map((d) => ({ ...d, ativo: Boolean(d.ativo) })) });
    }

    const linhas = await db.query(
      `SELECT d.id, d.nome, ar.nome AS area, up.nome AS professor
         FROM turma_disciplina_professor tdp
         JOIN disciplina d ON d.id = tdp.disciplina_id
         JOIN area ar      ON ar.id = d.area_id
         JOIN professor p  ON p.id = tdp.professor_id
         JOIN usuario up   ON up.id = p.usuario_id
        WHERE tdp.turma_id = ? AND (? IS NULL OR tdp.professor_id = ?)
        ORDER BY d.nome`,
      [turmaId, professorId, professorId]
    );
    return res.json({ dados: linhas });
  })
);

router.get(
  '/areas',
  autenticar,
  asyncHandler(async (req, res) => {
    const linhas = await db.query(
      'SELECT a.id, a.nome, (SELECT COUNT(*) FROM disciplina d WHERE d.area_id = a.id) AS disciplinas FROM area a ORDER BY a.nome'
    );
    res.json({ dados: linhas.map((a) => ({ ...a, disciplinas: Number(a.disciplinas) || 0 })) });
  })
);

router.post(
  '/areas',
  autenticar,
  autorizar('admin'),
  validar(schemas.area),
  asyncHandler(async (req, res) => {
    const r = await comAuditoria(
      req,
      res,
      (tx) => tx.query('INSERT INTO area (nome) VALUES (?)', [req.body.nome]),
      (ins) => ({ acao: 'CRIAR_AREA', entidade: 'area', entidade_id: ins.insertId, detalhes: { nome: req.body.nome } })
    );
    res.status(201).json({ dados: { id: r.insertId, nome: req.body.nome } });
  })
);

router.put(
  '/areas/:id',
  autenticar,
  autorizar('admin'),
  validar(schemas.paramId, 'params'),
  validar(schemas.area),
  asyncHandler(async (req, res) => {
    const id = req.validado.params.id;
    const [antes] = await db.query('SELECT nome FROM area WHERE id = ?', [id]);
    if (!antes) throw AppError.naoEncontrado('Área não encontrada.');
    await comAuditoria(req, res, (tx) => tx.query('UPDATE area SET nome = ? WHERE id = ?', [req.body.nome, id]), {
      acao: 'EDITAR_AREA',
      entidade: 'area',
      entidade_id: id,
      detalhes: diferenca(antes, req.body, ['nome']),
    });
    res.json({ dados: { id, nome: req.body.nome } });
  })
);

// Área com disciplinas não é apagada (a FK recusa e a API responde 409 com explicação)
router.delete(
  '/areas/:id',
  autenticar,
  autorizar('admin'),
  validar(schemas.paramId, 'params'),
  asyncHandler(async (req, res) => {
    const id = req.validado.params.id;
    const [a] = await db.query(
      'SELECT nome, (SELECT COUNT(*) FROM disciplina d WHERE d.area_id = area.id) AS n FROM area WHERE id = ?',
      [id]
    );
    if (!a) throw AppError.naoEncontrado('Área não encontrada.');
    if (Number(a.n) > 0) throw AppError.conflito('Esta área tem disciplinas. Mude as disciplinas de área antes de excluí-la.');
    await comAuditoria(req, res, (tx) => tx.query('DELETE FROM area WHERE id = ?', [id]), {
      acao: 'EXCLUIR_AREA',
      entidade: 'area',
      entidade_id: id,
      detalhes: { nome: a.nome },
    });
    res.status(204).end();
  })
);

router.post(
  '/disciplinas',
  autenticar,
  autorizar('admin'),
  validar(schemas.disciplina),
  asyncHandler(async (req, res) => {
    const { nome, area_id, ativo } = req.body;
    const r = await comAuditoria(
      req,
      res,
      (tx) => tx.query('INSERT INTO disciplina (area_id, nome, ativo) VALUES (?, ?, ?)', [area_id, nome, ativo]),
      (ins) => ({ acao: 'CRIAR_DISCIPLINA', entidade: 'disciplina', entidade_id: ins.insertId, detalhes: { nome, area_id, ativo } })
    );
    res.status(201).json({ dados: { id: r.insertId, nome, area_id, ativo } });
  })
);

router.put(
  '/disciplinas/:id',
  autenticar,
  autorizar('admin'),
  validar(schemas.paramId, 'params'),
  validar(schemas.disciplina),
  asyncHandler(async (req, res) => {
    const { nome, area_id, ativo } = req.body;
    const [antes] = await db.query('SELECT nome, area_id, ativo FROM disciplina WHERE id = ?', [req.validado.params.id]);
    if (!antes) throw AppError.naoEncontrado('Disciplina não encontrada.');
    await comAuditoria(
      req,
      res,
      (tx) => tx.query('UPDATE disciplina SET nome = ?, area_id = ?, ativo = ? WHERE id = ?', [nome, area_id, ativo, req.validado.params.id]),
      {
        acao: antes.ativo && !ativo ? 'DESATIVAR_DISCIPLINA' : !antes.ativo && ativo ? 'ATIVAR_DISCIPLINA' : 'EDITAR_DISCIPLINA',
        entidade: 'disciplina',
        entidade_id: req.validado.params.id,
        detalhes: diferenca({ ...antes, ativo: Boolean(antes.ativo) }, req.body, ['nome', 'area_id', 'ativo']),
      }
    );
    res.json({ dados: { id: req.validado.params.id, nome, area_id, ativo } });
  })
);

module.exports = router;
