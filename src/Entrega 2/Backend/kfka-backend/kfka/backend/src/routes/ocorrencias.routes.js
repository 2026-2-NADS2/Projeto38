// ocorrencias.routes.js — registro e acompanhamento de ocorrências escolares.
//
//   GET   /api/ocorrencias?status=&categoria=&aluno_id=   lista (conforme o perfil)
//   GET   /api/ocorrencias/:id                            detalhe + histórico de atualizações
//   POST  /api/ocorrencias                                registra (admin: qualquer aluno; professor: alunos das suas turmas)
//   POST  /api/ocorrencias/:id/atualizacoes               acrescenta atualização { texto, status?, providencias? }
//   PATCH /api/ocorrencias/:id/restricao                  (admin) { restrita }
//
// Acesso (dados sensíveis de crianças e adolescentes — LGPD art. 14):
//   admin      -> todas
//   professor  -> as que ele registrou + as NÃO restritas das turmas em que leciona
//   responsável-> não acessa ocorrências pela plataforma (a escola entra em contato pelo mural)
// Categoria "Saúde ou bem-estar" é sempre restrita.
// Só a coordenação muda a situação; o professor pode acrescentar observações nas que registrou.

const { Router } = require('express');
const { z } = require('zod');

const db = require('../db');
const schemas = require('../schemas');
const validar = require('../middlewares/validar');
const { autenticar, autorizar, perfilApi } = require('../middlewares/auth');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { consultaPaginada } = require('../utils/paginacao');
const { exigirAluno, turmaDoAluno, turmasDoProfessor } = require('../utils/acesso');

const router = Router();
router.use(autenticar, autorizar('admin', 'professor'));

const st = (s) => (s ? String(s).toLowerCase() : null);

const SQL = `
  SELECT o.id, o.aluno_id, al.nome AS aluno, al.matricula, o.turma_id, t.nome AS turma, o.data_hora, o.categoria,
         o.descricao, o.providencias, o.status, o.restrita, o.registrado_por AS registrado_por_id,
         u.nome AS registrado_por, u.perfil AS registrado_perfil, o.criado_em, o.atualizado_em
    FROM ocorrencia o
    JOIN aluno al ON al.id = o.aluno_id
    LEFT JOIN turma t ON t.id = o.turma_id
    JOIN usuario u ON u.id = o.registrado_por`;

const formatar = (o, usuario) => ({
  ...o,
  categoria: st(o.categoria),
  status: st(o.status),
  restrita: Boolean(o.restrita),
  registrado_perfil: perfilApi(o.registrado_perfil),
  minha: o.registrado_por_id === usuario.id,
});

async function filtroVisibilidade(usuario) {
  if (usuario.perfil === 'admin') return { sql: '', params: [] };
  const turmas = await turmasDoProfessor(usuario.professorId);
  return {
    sql: 'AND (o.registrado_por = ? OR (o.restrita = FALSE AND o.turma_id IN (?)))',
    params: [usuario.id, turmas.length ? turmas : [0]],
  };
}

async function buscar(usuario, id) {
  const f = await filtroVisibilidade(usuario);
  const [o] = await db.query(`${SQL} WHERE o.id = ? ${f.sql}`, [id, ...f.params]);
  if (!o) throw AppError.naoEncontrado('Ocorrência não encontrada.');
  return o;
}

router.get(
  '/',
  validar(schemas.filtroOcorrencias, 'query'),
  asyncHandler(async (req, res) => {
    const { status, categoria, aluno_id } = req.validado.query;
    const f = await filtroVisibilidade(req.usuario);
    const { linhas, meta } = await consultaPaginada(
      req,
      `${SQL}
        WHERE (? IS NULL OR o.status = ?) AND (? IS NULL OR o.categoria = ?) AND (? IS NULL OR o.aluno_id = ?)
          ${f.sql}
        ORDER BY CASE o.status WHEN 'ABERTA' THEN 0 WHEN 'EM_ACOMPANHAMENTO' THEN 1 ELSE 2 END, o.data_hora DESC, o.id DESC`,
      [status ?? null, status ?? null, categoria ?? null, categoria ?? null, aluno_id ?? null, aluno_id ?? null, ...f.params]
    );
    res.json({ dados: linhas.map((o) => formatar(o, req.usuario)), ...(meta ? { meta } : {}) });
  })
);

router.get(
  '/:id',
  validar(schemas.paramId, 'params'),
  asyncHandler(async (req, res) => {
    const o = await buscar(req.usuario, req.validado.params.id);
    const atualizacoes = await db.query(
      `SELECT a.id, a.texto, a.status_anterior, a.status_novo, a.data_hora, u.nome AS usuario, u.perfil
         FROM ocorrencia_atualizacao a JOIN usuario u ON u.id = a.usuario_id
        WHERE a.ocorrencia_id = ? ORDER BY a.data_hora, a.id`,
      [o.id]
    );
    res.json({
      dados: {
        ...formatar(o, req.usuario),
        atualizacoes: atualizacoes.map((a) => ({
          ...a,
          status_anterior: st(a.status_anterior),
          status_novo: st(a.status_novo),
          perfil: perfilApi(a.perfil),
        })),
      },
    });
  })
);

router.post(
  '/',
  validar(schemas.ocorrencia),
  asyncHandler(async (req, res) => {
    const { aluno_id, data_hora, categoria, descricao, providencias } = req.body;
    await exigirAluno(req.usuario, aluno_id); // professor: só alunos das turmas dele
    const restrita = categoria === 'SAUDE' ? true : req.body.restrita;
    const turmaId = await turmaDoAluno(aluno_id);

    const id = await db.transacao(req.usuario.id, async (tx) => {
      const r = await tx.query(
        `INSERT INTO ocorrencia (aluno_id, turma_id, data_hora, categoria, descricao, providencias, restrita, registrado_por)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [aluno_id, turmaId, data_hora, categoria, descricao, providencias, restrita, req.usuario.id]
      );
      await tx.query(
        `INSERT INTO ocorrencia_atualizacao (ocorrencia_id, usuario_id, texto, status_anterior, status_novo)
         VALUES (?, ?, 'Ocorrência registrada.', NULL, 'ABERTA')`,
        [r.insertId, req.usuario.id]
      );
      return r.insertId;
    });
    res.status(201).json({ dados: formatar(await buscar(req.usuario, id), req.usuario) });
  })
);

router.post(
  '/:id/atualizacoes',
  validar(schemas.paramId, 'params'),
  validar(schemas.atualizacaoOcorrencia),
  asyncHandler(async (req, res) => {
    const o = await buscar(req.usuario, req.validado.params.id);
    const ehAdmin = req.usuario.perfil === 'admin';
    if (!ehAdmin && o.registrado_por_id !== req.usuario.id) {
      throw AppError.semPermissao('Só quem registrou a ocorrência ou a coordenação pode atualizá-la.');
    }
    if (!ehAdmin && req.body.status && req.body.status !== o.status) {
      throw AppError.semPermissao('Só a coordenação pode mudar a situação da ocorrência.');
    }
    const novo = (ehAdmin && req.body.status) || o.status;

    await db.transacao(req.usuario.id, async (tx) => {
      await tx.query(
        `INSERT INTO ocorrencia_atualizacao (ocorrencia_id, usuario_id, texto, status_anterior, status_novo)
         VALUES (?, ?, ?, ?, ?)`,
        [o.id, req.usuario.id, req.body.texto, o.status, novo]
      );
      const temProvidencias = typeof req.body.providencias === 'string';
      await tx.query(
        `UPDATE ocorrencia SET status = ?, providencias = ${temProvidencias ? '?' : 'providencias'}, atualizado_em = NOW()
          WHERE id = ?`,
        temProvidencias ? [novo, req.body.providencias || null, o.id] : [novo, o.id]
      );
    });
    res.status(201).json({ dados: formatar(await buscar(req.usuario, o.id), req.usuario) });
  })
);

router.patch(
  '/:id/restricao',
  autorizar('admin'),
  validar(schemas.paramId, 'params'),
  validar(z.object({ restrita: z.boolean({ required_error: 'Informe restrita: true ou false.' }) })),
  asyncHandler(async (req, res) => {
    const o = await buscar(req.usuario, req.validado.params.id);
    if (o.categoria === 'SAUDE' && !req.body.restrita) {
      throw AppError.conflito('Ocorrências de saúde ou bem-estar são sempre restritas.');
    }
    await db.query('UPDATE ocorrencia SET restrita = ? WHERE id = ?', [req.body.restrita, o.id]);
    res.json({ dados: formatar(await buscar(req.usuario, o.id), req.usuario) });
  })
);

module.exports = router;
