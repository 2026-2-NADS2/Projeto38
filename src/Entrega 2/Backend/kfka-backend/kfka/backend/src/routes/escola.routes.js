// escola.routes.js — cadastros de apoio da escola.
//
//   GET  /api/turmas                     (logado)  turmas do ano; professor vê só as que leciona
//   POST /api/turmas                     (admin)   cria turma
//   GET  /api/disciplinas?turma_id=      (logado)  disciplinas da turma (professor: só as dele)
//   GET  /api/bimestres?ano_letivo=      (logado)  bimestres e se a digitação está aberta agora
//   GET  /api/tags                       (logado)  tags de desempenho ativas
//
// Gestão escolar (coordenação):
//   PUT    /api/turmas/:id                       edita turma (inclusive ativa/desativa)
//   GET    /api/areas                            áreas do conhecimento
//   POST   /api/disciplinas  · PUT /api/disciplinas/:id
//   GET    /api/vinculos?turma_id=               professor de cada disciplina na turma + dias da grade
//   PUT    /api/vinculos                         vincula (ou troca) o professor { turma_id, disciplina_id, professor_id, dias }
//   DELETE /api/vinculos/:turmaId/:disciplinaId  remove o vínculo
//   PUT    /api/bimestres/:id                    datas do bimestre e da digitação
//   GET    /api/anos-letivos                     anos com bimestres configurados
//   POST   /api/anos-letivos                     cria um ano letivo com EXATAMENTE 4 bimestres
//   POST   /api/areas · PUT /api/areas/:id · DELETE /api/areas/:id (só sem disciplinas)
//   GET    /api/tags?todas=1 · POST /api/tags · PUT /api/tags/:id · DELETE /api/tags/:id (só sem uso)
//
// Situação do bimestre (calculada pelas datas, no fuso da escola):
//   situacao: futuro | em_andamento | encerrado      (data_inicio/data_fim)
//   digitacao: agendada | aberta | encerrada          (digitacao_inicio/digitacao_fim)
// Toda troca de vínculo fica registrada em historico_vinculo; tudo vai também para a auditoria.

const { Router } = require('express');

// Cada assunto fica no seu arquivo (backend/src/routes/escola/). A ordem de montagem não importa:
// os caminhos não se sobrepõem.
const router = Router();
router.use(require('./escola/turmas'));
router.use(require('./escola/disciplinas'));
router.use(require('./escola/tags'));
router.use(require('./escola/vinculos'));
router.use(require('./escola/bimestres'));

module.exports = router;
