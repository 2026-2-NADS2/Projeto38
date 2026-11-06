// auditoria.routes.js — consulta da trilha de auditoria (RNF06). Somente leitura e só a coordenação.
// Não existe rota para alterar ou apagar: o banco também recusa (triggers trg_auditoria_bu/bd).
//
//   GET /api/auditoria?usuario_id&entidade&acao&resultado&de&ate&pagina&por_pagina
//   GET /api/auditoria/opcoes     entidades e ações já registradas (para os filtros)
//   GET /api/auditoria/registro/:entidade/:id   linha do tempo de um registro específico

const { Router } = require('express');
const { z } = require('zod');

const db = require('../db');
const schemas = require('../schemas');
const validar = require('../middlewares/validar');
const { autenticar, autorizar } = require('../middlewares/auth');
const asyncHandler = require('../utils/asyncHandler');

const router = Router();
router.use(autenticar, autorizar('admin'));

// JSON volta como objeto no MySQL (mysql2) e como texto em outros drivers
const lerDetalhes = (v) => {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') return v;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
};

const COLUNAS = 'id, data_hora, usuario_id, usuario_nome, perfil, acao, entidade, entidade_id, resultado, detalhes, ip';

router.get(
  '/',
  validar(schemas.filtroAuditoria, 'query'),
  asyncHandler(async (req, res) => {
    const f = req.validado.query;
    const cond = [];
    const params = [];
    const filtrar = (sql, valor) => {
      cond.push(sql);
      params.push(valor);
    };
    if (f.usuario_id) filtrar('usuario_id = ?', f.usuario_id);
    if (f.entidade) filtrar('entidade = ?', f.entidade);
    // Busca parcial pela ação; % _ e \ digitados valem como texto (escapados para o LIKE)
    if (f.acao) filtrar('acao LIKE ?', `%${f.acao.replace(/[\\%_]/g, '\\$&')}%`);
    if (f.resultado) filtrar('resultado = ?', f.resultado);
    if (f.de) filtrar('data_hora >= ?', `${f.de} 00:00:00`);
    if (f.ate) filtrar('data_hora <= ?', `${f.ate} 23:59:59`);
    const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';

    const [{ total }] = await db.query(`SELECT COUNT(*) AS total FROM auditoria ${where}`, params);
    const linhas = await db.query(`SELECT ${COLUNAS} FROM auditoria ${where} ORDER BY id DESC LIMIT ? OFFSET ?`, [
      ...params,
      f.por_pagina,
      (f.pagina - 1) * f.por_pagina,
    ]);
    res.json({
      dados: linhas.map((l) => ({ ...l, detalhes: lerDetalhes(l.detalhes) })),
      meta: { total: Number(total), pagina: f.pagina, por_pagina: f.por_pagina, paginas: Math.max(1, Math.ceil(Number(total) / f.por_pagina)) },
    });
  })
);

router.get(
  '/opcoes',
  asyncHandler(async (req, res) => {
    const [entidades, acoes, usuarios] = await Promise.all([
      db.query('SELECT DISTINCT entidade FROM auditoria ORDER BY entidade'),
      db.query('SELECT DISTINCT acao FROM auditoria ORDER BY acao'),
      db.query(
        `SELECT DISTINCT a.usuario_id AS id, a.usuario_nome AS nome FROM auditoria a
          WHERE a.usuario_id IS NOT NULL ORDER BY a.usuario_nome`
      ),
    ]);
    res.json({
      dados: {
        entidades: entidades.map((e) => e.entidade),
        acoes: acoes.map((a) => a.acao),
        // O mesmo id pode ter mudado de nome: fica o primeiro nome encontrado
        usuarios: [...new Map(usuarios.map((u) => [u.id, u])).values()],
      },
    });
  })
);

router.get(
  '/registro/:entidade/:id',
  validar(z.object({ entidade: z.string().regex(/^[a-z_]{1,60}$/), id: z.string().regex(/^[\w-]{1,40}$/) }), 'params'),
  asyncHandler(async (req, res) => {
    const { entidade, id } = req.validado.params;
    const linhas = await db.query(`SELECT ${COLUNAS} FROM auditoria WHERE entidade = ? AND entidade_id = ? ORDER BY id`, [entidade, id]);
    res.json({ dados: linhas.map((l) => ({ ...l, detalhes: lerDetalhes(l.detalhes) })) });
  })
);

module.exports = router;
