// acompanhamentos.routes.js — lançamento bimestral e fluxo editorial.
//
// Fluxo de status (validado pelo trigger trg_acomp_bu no banco):
//   RASCUNHO -> ENVIADO -> EM_REVISAO -> PUBLICADO
//                  \____________\-------> DEVOLVIDO -> ENVIADO ...
//   PUBLICADO -> EM_REVISAO (retificação)
//
//   GET   /api/acompanhamentos?turma_id&disciplina_id&bimestre_id  (professor, admin)  planilha da turma
//   PUT   /api/acompanhamentos                                     (professor)  salva rascunho ou envia
//   POST  /api/acompanhamentos/:id/enviar                          (professor)  rascunho/devolvido -> enviado
//   GET   /api/acompanhamentos/fila?status=pendentes|devolvidos|publicados|rascunhos
//   PATCH /api/acompanhamentos/:id/publicar                        (admin)
//   PATCH /api/acompanhamentos/:id/devolver   { motivo }           (admin)
//   PATCH /api/acompanhamentos/:id/retificar  { motivo }           (admin)  publicado -> em revisão
//   PATCH /api/acompanhamentos/:id/revisar                         (admin)  enviado -> em revisão
//   PATCH /api/acompanhamentos/:id/editar     { media, faltas, descricao, tags, motivo, versao? }
//                                                                  (admin)  altera antes de publicar (gera nova versão)
//   PATCH /api/acompanhamentos/:id/cancelar   { motivo }           (admin)  qualquer estado não publicado -> cancelado
//   GET   /api/acompanhamentos/:id/historico                       (admin, professor do registro)
//   POST  /api/acompanhamentos/:id/ciencia    { observacao? }      (responsável)
//
// Toda gravação passa por db.transacao(), que define @usuario_id para a auditoria.

const { Router } = require('express');
const { autenticar } = require('../middlewares/auth');

// Cada parte do fluxo fica no seu arquivo (backend/src/routes/acompanhamentos/)
const router = Router();
router.use(autenticar);
router.use(require('./acompanhamentos/lancamento'));
router.use(require('./acompanhamentos/revisao'));
router.use(require('./acompanhamentos/historico'));

module.exports = router;
