// acompanhamentos/revisao.js — revisão da coordenação: fila, iniciar revisão, alterar, devolver, publicar, retificar e cancelar.
// Montado em /api/acompanhamentos (o login já foi exigido em routes/acompanhamentos.routes.js).

const { Router } = require('express');

const db = require('../../db');
const schemas = require('../../schemas');
const validar = require('../../middlewares/validar');
const { autorizar } = require('../../middlewares/auth');
const AppError = require('../../utils/AppError');
const asyncHandler = require('../../utils/asyncHandler');
const { consultaPaginada } = require('../../utils/paginacao');
const { auditarNaTransacao, diferenca } = require('../../utils/auditoria');
const { status, motivosDevolucao, tagsDe, gravarTags, conferirCompleto, travar, estadoFinal } = require('./comum');

const router = Router();

// ---------------------------------------------------------------------------
// Fila de revisão (usa a view vw_acompanhamento_completo do banco)
// ---------------------------------------------------------------------------
const FILAS = {
  pendentes: ['ENVIADO', 'EM_REVISAO'],
  devolvidos: ['DEVOLVIDO'],
  publicados: ['PUBLICADO'],
  rascunhos: ['RASCUNHO'],
  cancelados: ['CANCELADO'],
};

router.get(
  '/fila',
  autorizar('admin', 'professor'),
  validar(schemas.filtroFila, 'query'),
  asyncHandler(async (req, res) => {
    const filtro = req.validado.query.status;
    const doProfessor = req.usuario.perfil === 'professor';
    const { linhas, meta } = await consultaPaginada(
      req,
      `SELECT v.acompanhamento_id AS id, v.ano_letivo, v.bimestre, v.turma, v.aluno_id, v.aluno, v.disciplina,
              v.professor_id, v.professor, v.media, v.faltas, v.descricao, v.status, v.versao, v.tags,
              v.revisor, v.enviado_em, v.publicado_em
         FROM vw_acompanhamento_completo v
        WHERE v.status IN (?) AND (? IS NULL OR v.professor_id = ?)
        ORDER BY v.enviado_em, v.acompanhamento_id`,
      [FILAS[filtro], doProfessor ? req.usuario.professorId : null, doProfessor ? req.usuario.professorId : null]
    );

    const motivos = filtro === 'devolvidos' ? await motivosDevolucao(linhas.map((l) => l.id)) : {};
    const agora = Date.now();
    res.json({
      dados: linhas.map((l) => ({
        ...l,
        status: status(l.status),
        tags: l.tags ? l.tags.split(', ') : [],
        motivo_devolucao: motivos[l.id] || null,
        horas_aguardando:
          FILAS.pendentes.includes(l.status) && l.enviado_em
            ? Math.max(0, Math.floor((agora - new Date(l.enviado_em).getTime()) / 3600000))
            : null,
      })),
      meta: meta || { total: linhas.length },
    });
  })
);

router.patch(
  '/:id/publicar',
  autorizar('admin'),
  validar(schemas.paramId, 'params'),
  asyncHandler(async (req, res) => {
    const id = req.validado.params.id;
    const dados = await db.transacao(req.usuario.id, async (tx) => {
      const atual = await travar(tx, id);
      if (!['ENVIADO', 'EM_REVISAO'].includes(atual.status)) {
        throw AppError.conflito(`Só é possível publicar registros enviados ou em revisão (atual: ${status(atual.status)}).`);
      }
      conferirCompleto(atual);
      // O banco exige passar por EM_REVISAO antes de PUBLICADO — as duas etapas
      // ficam registradas no histórico, na mesma transação
      if (atual.status === 'ENVIADO') {
        await tx.query("UPDATE acompanhamento SET status = 'EM_REVISAO' WHERE id = ?", [id]);
      }
      await tx.query("UPDATE acompanhamento SET status = 'PUBLICADO' WHERE id = ?", [id]);
      const final = await estadoFinal(tx, id);
      await auditarNaTransacao(tx, req, res, {
        acao: 'PUBLICAR_RELATORIO',
        entidade: 'acompanhamento',
        entidade_id: id,
        detalhes: { status: { de: status(atual.status), para: 'publicado' }, versao: final.versao },
      });
      return final;
    });
    res.json({ dados });
  })
);

router.patch(
  '/:id/devolver',
  autorizar('admin'),
  validar(schemas.paramId, 'params'),
  validar(schemas.devolucao),
  asyncHandler(async (req, res) => {
    const id = req.validado.params.id;
    const dados = await db.transacao(req.usuario.id, async (tx) => {
      const atual = await travar(tx, id);
      if (!['ENVIADO', 'EM_REVISAO'].includes(atual.status)) {
        throw AppError.conflito(`Só é possível devolver registros enviados ou em revisão (atual: ${status(atual.status)}).`);
      }
      await tx.observacao(req.body.motivo); // vai para historico_acompanhamento.observacao
      await tx.query("UPDATE acompanhamento SET status = 'DEVOLVIDO' WHERE id = ?", [id]);
      await auditarNaTransacao(tx, req, res, {
        acao: 'DEVOLVER_RELATORIO',
        entidade: 'acompanhamento',
        entidade_id: id,
        detalhes: { status: { de: status(atual.status), para: 'devolvido' }, motivo: req.body.motivo },
      });
      return estadoFinal(tx, id);
    });
    res.json({ dados: { ...dados, motivo_devolucao: req.body.motivo } });
  })
);

router.patch(
  '/:id/retificar',
  autorizar('admin'),
  validar(schemas.paramId, 'params'),
  validar(schemas.retificacao),
  asyncHandler(async (req, res) => {
    const id = req.validado.params.id;
    const dados = await db.transacao(req.usuario.id, async (tx) => {
      const atual = await travar(tx, id);
      if (atual.status !== 'PUBLICADO') throw AppError.conflito('Só registros publicados podem ser retificados.');
      await tx.observacao(req.body.motivo);
      await tx.query("UPDATE acompanhamento SET status = 'EM_REVISAO' WHERE id = ?", [id]);
      await auditarNaTransacao(tx, req, res, {
        acao: 'RETIFICAR_RELATORIO',
        entidade: 'acompanhamento',
        entidade_id: id,
        detalhes: { status: { de: 'publicado', para: 'em_revisao' }, motivo: req.body.motivo },
      });
      return estadoFinal(tx, id);
    });
    res.json({ dados });
  })
);

// Coordenação abre o registro para revisão (sai de "enviado" para "em revisão")
router.patch(
  '/:id/revisar',
  autorizar('admin'),
  validar(schemas.paramId, 'params'),
  asyncHandler(async (req, res) => {
    const id = req.validado.params.id;
    const dados = await db.transacao(req.usuario.id, async (tx) => {
      const atual = await travar(tx, id);
      if (atual.status === 'EM_REVISAO') return estadoFinal(tx, id);
      if (atual.status !== 'ENVIADO') throw AppError.conflito('Só registros enviados podem entrar em revisão.');
      await tx.query("UPDATE acompanhamento SET status = 'EM_REVISAO' WHERE id = ?", [id]);
      await auditarNaTransacao(tx, req, res, {
        acao: 'INICIAR_REVISAO',
        entidade: 'acompanhamento',
        entidade_id: id,
        detalhes: { status: { de: 'enviado', para: 'em_revisao' } },
      });
      return estadoFinal(tx, id);
    });
    res.json({ dados });
  })
);

// Coordenação altera o conteúdo antes de publicar (RF06). Fica registrado no histórico com o
// motivo (trigger trg_acomp_au: valores anteriores e novos) e gera nova versão.
// "versao" (opcional) protege contra duas pessoas editando ao mesmo tempo.
router.patch(
  '/:id/editar',
  autorizar('admin'),
  validar(schemas.paramId, 'params'),
  validar(schemas.edicaoCoordenacao),
  asyncHandler(async (req, res) => {
    const id = req.validado.params.id;
    const { media, faltas, descricao, tags, motivo, versao } = req.body;
    const r = await db.transacao(req.usuario.id, async (tx) => {
      const atual = await travar(tx, id);
      if (!['ENVIADO', 'EM_REVISAO'].includes(atual.status)) {
        throw AppError.conflito(
          `Só registros enviados ou em revisão podem ser alterados pela coordenação (atual: ${status(atual.status)}). ` +
            'Para alterar um relatório publicado, use "Retificar".'
        );
      }
      if (versao !== undefined && versao !== atual.versao) {
        throw AppError.conflito('Este registro foi alterado por outra pessoa enquanto você editava. Recarregue e tente de novo.');
      }
      const tagsAntes = (await tagsDe([id], tx))[id] || [];
      if (atual.status === 'ENVIADO') {
        await tx.query("UPDATE acompanhamento SET status = 'EM_REVISAO' WHERE id = ?", [id]);
      }
      await tx.observacao(`Alterado pela coordenação: ${motivo}`);
      await tx.query('UPDATE acompanhamento SET media = ?, faltas = ?, descricao = ? WHERE id = ?', [media, faltas, descricao, id]);
      await gravarTags(tx, id, tags);
      const [salvo] = await tx.query(
        'SELECT id, media, faltas, descricao, status, versao, atualizado_em FROM acompanhamento WHERE id = ?',
        [id]
      );
      const tagsDepois = (await tagsDe([id], tx))[id] || [];
      await auditarNaTransacao(tx, req, res, {
        acao: 'EDITAR_RELATORIO',
        entidade: 'acompanhamento',
        entidade_id: id,
        detalhes: {
          ...diferenca(atual, salvo, ['media', 'faltas', 'versao']),
          descricao_alterada: atual.descricao !== salvo.descricao,
          tags: { de: tagsAntes.map((t) => t.nome), para: tagsDepois.map((t) => t.nome) },
          motivo,
        },
      });
      return { salvo, tagsDepois };
    });
    res.json({ dados: { ...r.salvo, status: status(r.salvo.status), tags: r.tagsDepois } });
  })
);

// Cancelamento (ex.: aluno transferido, lançamento em duplicidade). Publicado precisa ser
// retificado antes. Cancelado não volta: o trigger recusa qualquer alteração depois disso.
router.patch(
  '/:id/cancelar',
  autorizar('admin'),
  validar(schemas.paramId, 'params'),
  validar(schemas.cancelamento),
  asyncHandler(async (req, res) => {
    const id = req.validado.params.id;
    const dados = await db.transacao(req.usuario.id, async (tx) => {
      const atual = await travar(tx, id);
      if (atual.status === 'PUBLICADO') {
        throw AppError.conflito('Relatório publicado não pode ser cancelado direto: retifique-o antes.');
      }
      if (atual.status === 'CANCELADO') throw AppError.conflito('Este registro já está cancelado.');
      await tx.observacao(req.body.motivo);
      await tx.query("UPDATE acompanhamento SET status = 'CANCELADO' WHERE id = ?", [id]);
      await auditarNaTransacao(tx, req, res, {
        acao: 'CANCELAR_RELATORIO',
        entidade: 'acompanhamento',
        entidade_id: id,
        detalhes: { status: { de: status(atual.status), para: 'cancelado' }, motivo: req.body.motivo },
      });
      return estadoFinal(tx, id);
    });
    res.json({ dados });
  })
);

module.exports = router;
