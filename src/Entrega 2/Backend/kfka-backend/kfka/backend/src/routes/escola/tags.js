// escola/tags.js — tags de desempenho (tag usada em registros não é excluída: é desativada).
// Montado em /api pelo routes/escola.routes.js; o login é exigido rota a rota.

const { Router } = require('express');

const db = require('../../db');
const schemas = require('../../schemas');
const validar = require('../../middlewares/validar');
const { autenticar, autorizar } = require('../../middlewares/auth');
const AppError = require('../../utils/AppError');
const asyncHandler = require('../../utils/asyncHandler');
const { comAuditoria, diferenca } = require('../../utils/auditoria');

const router = Router();

router.get(
  '/tags',
  autenticar,
  asyncHandler(async (req, res) => {
    const todas = req.usuario.perfil === 'admin' && req.query.todas === '1' ? 1 : 0;
    const linhas = await db.query(
      `SELECT t.id, t.nome, t.descricao, t.ativo,
              (SELECT COUNT(*) FROM acompanhamento_tag x WHERE x.tag_id = t.id) AS usos
         FROM tag t WHERE t.ativo = TRUE OR ? = 1 ORDER BY t.nome`,
      [todas]
    );
    res.json({ dados: linhas.map((t) => ({ ...t, ativo: Boolean(t.ativo), usos: Number(t.usos) || 0 })) });
  })
);

router.post(
  '/tags',
  autenticar,
  autorizar('admin'),
  validar(schemas.tag),
  asyncHandler(async (req, res) => {
    const { nome, descricao, ativo } = req.body;
    const r = await comAuditoria(
      req,
      res,
      (tx) => tx.query('INSERT INTO tag (nome, descricao, ativo) VALUES (?, ?, ?)', [nome, descricao, ativo]),
      (ins) => ({ acao: 'CRIAR_TAG', entidade: 'tag', entidade_id: ins.insertId, detalhes: { nome, ativo } })
    );
    res.status(201).json({ dados: { id: r.insertId, nome, descricao, ativo, usos: 0 } });
  })
);

router.put(
  '/tags/:id',
  autenticar,
  autorizar('admin'),
  validar(schemas.paramId, 'params'),
  validar(schemas.tag),
  asyncHandler(async (req, res) => {
    const id = req.validado.params.id;
    const { nome, descricao, ativo } = req.body;
    const [antes] = await db.query('SELECT nome, descricao, ativo FROM tag WHERE id = ?', [id]);
    if (!antes) throw AppError.naoEncontrado('Tag não encontrada.');
    await comAuditoria(req, res, (tx) => tx.query('UPDATE tag SET nome = ?, descricao = ?, ativo = ? WHERE id = ?', [nome, descricao, ativo, id]), {
      acao: antes.ativo && !ativo ? 'DESATIVAR_TAG' : !antes.ativo && ativo ? 'ATIVAR_TAG' : 'EDITAR_TAG',
      entidade: 'tag',
      entidade_id: id,
      detalhes: diferenca({ ...antes, ativo: Boolean(antes.ativo) }, req.body, ['nome', 'descricao', 'ativo']),
    });
    res.json({ dados: { id, nome, descricao, ativo } });
  })
);

// Tag já usada em registros não é apagada (preserva o histórico): a coordenação a desativa
router.delete(
  '/tags/:id',
  autenticar,
  autorizar('admin'),
  validar(schemas.paramId, 'params'),
  asyncHandler(async (req, res) => {
    const id = req.validado.params.id;
    const [t] = await db.query(
      'SELECT nome, (SELECT COUNT(*) FROM acompanhamento_tag x WHERE x.tag_id = tag.id) AS n FROM tag WHERE id = ?',
      [id]
    );
    if (!t) throw AppError.naoEncontrado('Tag não encontrada.');
    if (Number(t.n) > 0) throw AppError.conflito('Esta tag já foi usada em registros. Desative-a em vez de excluir.');
    await comAuditoria(req, res, (tx) => tx.query('DELETE FROM tag WHERE id = ?', [id]), {
      acao: 'EXCLUIR_TAG',
      entidade: 'tag',
      entidade_id: id,
      detalhes: { nome: t.nome },
    });
    res.status(204).end();
  })
);

module.exports = router;
