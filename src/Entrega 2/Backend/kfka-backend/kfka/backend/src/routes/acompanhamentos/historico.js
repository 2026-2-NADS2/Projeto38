// acompanhamentos/historico.js — histórico do lançamento (triggers + retorno da família) e ciência do responsável.
// Montado em /api/acompanhamentos (o login já foi exigido em routes/acompanhamentos.routes.js).

const { Router } = require('express');

const db = require('../../db');
const schemas = require('../../schemas');
const validar = require('../../middlewares/validar');
const { autorizar, perfilApi } = require('../../middlewares/auth');
const AppError = require('../../utils/AppError');
const asyncHandler = require('../../utils/asyncHandler');
const { auditarNaTransacao } = require('../../utils/auditoria');
const { status } = require('./comum');

const router = Router();

// ---------------------------------------------------------------------------
// Histórico (auditoria gravada pelos triggers)
// ---------------------------------------------------------------------------
router.get(
  '/:id/historico',
  autorizar('admin', 'professor'),
  validar(schemas.paramId, 'params'),
  asyncHandler(async (req, res) => {
    const id = req.validado.params.id;
    const [registro] = await db.query(
      `SELECT acompanhamento_id AS id, aluno, disciplina, bimestre, turma, professor_id, status, versao
         FROM vw_acompanhamento_completo WHERE acompanhamento_id = ?`,
      [id]
    );
    if (!registro || (req.usuario.perfil === 'professor' && registro.professor_id !== req.usuario.professorId)) {
      throw AppError.naoEncontrado('Registro não encontrado.');
    }

    const eventos = await db.query(
      `SELECT h.id, h.acao, h.status_anterior, h.status_novo, h.media_anterior, h.media_nova,
              h.faltas_anterior, h.faltas_nova, h.descricao_anterior, h.descricao_nova,
              h.observacao, h.data_hora, u.nome AS usuario, u.perfil
         FROM historico_acompanhamento h
         JOIN usuario u ON u.id = h.usuario_id
        WHERE h.acompanhamento_id = ?
        ORDER BY h.data_hora, h.id`,
      [id]
    );

    // Retornos do responsável (RF12): ciência + observação, com autor e data
    const ciencias = await db.query(
      `SELECT c.data_ciencia, c.observacao, u.nome AS responsavel, ar.parentesco
         FROM ciencia_responsavel c
         JOIN responsavel r ON r.id = c.responsavel_id
         JOIN usuario u     ON u.id = r.usuario_id
         JOIN acompanhamento ac ON ac.id = c.acompanhamento_id
         LEFT JOIN aluno_responsavel ar ON ar.responsavel_id = r.id AND ar.aluno_id = ac.aluno_id
        WHERE c.acompanhamento_id = ?
        ORDER BY c.data_ciencia`,
      [id]
    );

    res.json({
      dados: {
        registro: { ...registro, status: status(registro.status) },
        ciencias,
        eventos: eventos.map((e) => ({
          ...e,
          status_anterior: status(e.status_anterior),
          status_novo: status(e.status_novo),
          perfil: perfilApi(e.perfil),
        })),
      },
    });
  })
);

// ---------------------------------------------------------------------------
// Ciência do responsável (com retorno opcional para a escola)
// ---------------------------------------------------------------------------
router.post(
  '/:id/ciencia',
  autorizar('responsavel'),
  validar(schemas.paramId, 'params'),
  validar(schemas.ciencia),
  asyncHandler(async (req, res) => {
    const id = req.validado.params.id;
    // A view só traz registros PUBLICADOS de alunos vinculados e autorizados
    const [relatorio] = await db.query(
      `SELECT acompanhamento_id, data_ciencia FROM vw_relatorio_responsavel
        WHERE responsavel_id = ? AND acompanhamento_id = ?`,
      [req.usuario.responsavelId, id]
    );
    if (!relatorio) throw AppError.naoEncontrado('Relatório não encontrado ou ainda não publicado.');
    if (relatorio.data_ciencia) throw AppError.conflito('Você já confirmou a ciência deste relatório.');

    // Ciência e registro de auditoria na mesma transação
    await db.transacao(req.usuario.id, async (tx) => {
      await tx.query('INSERT INTO ciencia_responsavel (acompanhamento_id, responsavel_id, observacao) VALUES (?, ?, ?)', [
        id,
        req.usuario.responsavelId,
        req.body.observacao,
      ]);
      await auditarNaTransacao(tx, req, res, {
        acao: 'CIENCIA_RELATORIO',
        entidade: 'acompanhamento',
        entidade_id: id,
        detalhes: { com_observacao: Boolean(req.body.observacao) },
      });
    });
    const [salva] = await db.query(
      'SELECT data_ciencia, observacao FROM ciencia_responsavel WHERE acompanhamento_id = ? AND responsavel_id = ?',
      [id, req.usuario.responsavelId]
    );
    res.status(201).json({ dados: { acompanhamento_id: id, ...salva } });
  })
);

module.exports = router;
