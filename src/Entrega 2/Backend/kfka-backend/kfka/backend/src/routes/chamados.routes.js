// chamados.routes.js — SAC: central de atendimento e suporte.
//
//   GET   /api/chamados?status=          meus chamados (coordenação: todos)
//   GET   /api/chamados/:id              detalhe + conversa
//   POST  /api/chamados                  abre chamado { categoria, assunto, descricao }
//   POST  /api/chamados/:id/interacoes   responde { texto, status? (só coordenação) }
//   PATCH /api/chamados/:id/status       (coordenação) muda a situação { status }
//
// Quando o usuário responde a um chamado "aguardando você", ele volta para "em atendimento".

const { Router } = require('express');

const db = require('../db');
const schemas = require('../schemas');
const validar = require('../middlewares/validar');
const { autenticar, autorizar, perfilApi } = require('../middlewares/auth');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { consultaPaginada } = require('../utils/paginacao');

const router = Router();
router.use(autenticar);

const st = (s) => String(s).toLowerCase();

const SQL = `
  SELECT c.id, c.usuario_id, u.nome AS usuario, u.perfil, c.categoria, c.assunto, c.descricao, c.status,
         c.criado_em, c.atualizado_em,
         (SELECT COUNT(*) FROM chamado_interacao i WHERE i.chamado_id = c.id) AS interacoes
    FROM chamado c JOIN usuario u ON u.id = c.usuario_id`;

const formatar = (c) => ({
  ...c,
  categoria: st(c.categoria),
  status: st(c.status),
  perfil: perfilApi(c.perfil),
  interacoes: Number(c.interacoes),
});

async function buscar(usuario, id) {
  const [c] = await db.query(`${SQL} WHERE c.id = ?`, [id]);
  if (!c || (usuario.perfil !== 'admin' && c.usuario_id !== usuario.id)) throw AppError.naoEncontrado('Chamado não encontrado.');
  return c;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const ehAdmin = req.usuario.perfil === 'admin';
    const status = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : null;
    const abertos = status === 'ABERTOS' ? 1 : 0;
    const { linhas, meta } = await consultaPaginada(
      req,
      `${SQL}
        WHERE (? = 1 OR c.usuario_id = ?)
          AND (? = 0 OR c.status IN ('ABERTO', 'EM_ATENDIMENTO', 'AGUARDANDO_USUARIO'))
        ORDER BY c.atualizado_em DESC, c.id DESC`,
      [ehAdmin ? 1 : 0, req.usuario.id, abertos]
    );
    res.json({ dados: linhas.map(formatar), ...(meta ? { meta } : {}) });
  })
);

router.get(
  '/:id',
  validar(schemas.paramId, 'params'),
  asyncHandler(async (req, res) => {
    const c = await buscar(req.usuario, req.validado.params.id);
    const interacoes = await db.query(
      `SELECT i.id, i.texto, i.criado_em, u.nome AS usuario, u.perfil, i.usuario_id
         FROM chamado_interacao i JOIN usuario u ON u.id = i.usuario_id
        WHERE i.chamado_id = ? ORDER BY i.criado_em, i.id`,
      [c.id]
    );
    res.json({
      dados: {
        ...formatar(c),
        conversa: interacoes.map((i) => ({ ...i, perfil: perfilApi(i.perfil), minha: i.usuario_id === req.usuario.id })),
      },
    });
  })
);

router.post(
  '/',
  validar(schemas.chamado),
  asyncHandler(async (req, res) => {
    const { categoria, assunto, descricao } = req.body;
    const r = await db.query('INSERT INTO chamado (usuario_id, categoria, assunto, descricao) VALUES (?, ?, ?, ?)', [
      req.usuario.id,
      categoria,
      assunto,
      descricao,
    ]);
    res.status(201).json({ dados: formatar(await buscar(req.usuario, r.insertId)) });
  })
);

router.post(
  '/:id/interacoes',
  validar(schemas.paramId, 'params'),
  validar(schemas.interacaoChamado),
  asyncHandler(async (req, res) => {
    const c = await buscar(req.usuario, req.validado.params.id);
    const ehAdmin = req.usuario.perfil === 'admin';
    if (!ehAdmin && ['RESOLVIDO', 'FECHADO'].includes(c.status)) {
      throw AppError.conflito('Este chamado já foi encerrado. Abra um novo chamado, se precisar.');
    }
    let novoStatus = c.status;
    if (ehAdmin) novoStatus = req.body.status || (c.status === 'ABERTO' ? 'EM_ATENDIMENTO' : c.status);
    else if (c.status === 'AGUARDANDO_USUARIO') novoStatus = 'EM_ATENDIMENTO';

    await db.transacao(req.usuario.id, async (tx) => {
      await tx.query('INSERT INTO chamado_interacao (chamado_id, usuario_id, texto) VALUES (?, ?, ?)', [
        c.id,
        req.usuario.id,
        req.body.texto,
      ]);
      // Sempre atualiza atualizado_em (mesmo sem mudar a situação), para ordenar a fila
      await tx.query('UPDATE chamado SET status = ?, atualizado_em = NOW() WHERE id = ?', [novoStatus, c.id]);
    });
    res.status(201).json({ dados: formatar(await buscar(req.usuario, c.id)) });
  })
);

router.patch(
  '/:id/status',
  autorizar('admin'),
  validar(schemas.paramId, 'params'),
  validar(schemas.statusChamado),
  asyncHandler(async (req, res) => {
    const c = await buscar(req.usuario, req.validado.params.id);
    await db.query('UPDATE chamado SET status = ? WHERE id = ?', [req.body.status, c.id]);
    res.json({ dados: formatar(await buscar(req.usuario, c.id)) });
  })
);

module.exports = router;
