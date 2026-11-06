// acompanhamentos/lancamento.js — lançamento do professor: planilha da turma, salvar rascunho/enviar e enviar para revisão.
// Montado em /api/acompanhamentos (o login já foi exigido em routes/acompanhamentos.routes.js).

const { Router } = require('express');

const db = require('../../db');
const schemas = require('../../schemas');
const validar = require('../../middlewares/validar');
const { autorizar } = require('../../middlewares/auth');
const AppError = require('../../utils/AppError');
const asyncHandler = require('../../utils/asyncHandler');
const { status, motivosDevolucao, tagsDe, gravarTags, professorLeciona } = require('./comum');

const router = Router();

// ---------------------------------------------------------------------------
// Planilha de lançamento: todos os alunos da turma + o registro de cada um
// ---------------------------------------------------------------------------
router.get(
  '/',
  autorizar('professor', 'admin'),
  validar(schemas.filtroLancamentos, 'query'),
  asyncHandler(async (req, res) => {
    const { turma_id, disciplina_id, bimestre_id } = req.validado.query;

    if (req.usuario.perfil === 'professor' && !(await professorLeciona(req.usuario.professorId, turma_id, disciplina_id))) {
      throw AppError.semPermissao('Você não leciona esta disciplina nesta turma.');
    }

    const [bimestre] = await db.query(
      `SELECT id, ano_letivo, numero, digitacao_inicio, digitacao_fim,
              (NOW() BETWEEN digitacao_inicio AND digitacao_fim) AS aberto
         FROM bimestre WHERE id = ?`,
      [bimestre_id]
    );
    if (!bimestre) throw AppError.naoEncontrado('Bimestre não encontrado.');

    const linhas = await db.query(
      `SELECT a.id AS aluno_id, a.nome, a.matricula,
              ac.id, ac.media, ac.faltas, ac.descricao, ac.status, ac.versao, ac.atualizado_em
         FROM turma_aluno ta
         JOIN aluno a ON a.id = ta.aluno_id
         LEFT JOIN acompanhamento ac
                ON ac.aluno_id = a.id AND ac.disciplina_id = ? AND ac.bimestre_id = ?
        WHERE ta.turma_id = ? AND a.ativo = TRUE
        ORDER BY a.nome`,
      [disciplina_id, bimestre_id, turma_id]
    );

    const ids = linhas.filter((l) => l.id).map((l) => l.id);
    const [tags, motivos] = await Promise.all([tagsDe(ids), motivosDevolucao(ids)]);

    res.json({
      dados: {
        bimestre: { ...bimestre, aberto: Boolean(bimestre.aberto) },
        alunos: linhas.map((l) => ({
          aluno_id: l.aluno_id,
          nome: l.nome,
          matricula: l.matricula,
          acompanhamento: l.id
            ? {
                id: l.id,
                media: l.media,
                faltas: l.faltas,
                descricao: l.descricao,
                status: status(l.status),
                versao: l.versao,
                atualizado_em: l.atualizado_em,
                tags: tags[l.id] || [],
                motivo_devolucao: l.status === 'DEVOLVIDO' ? motivos[l.id] || null : null,
              }
            : null,
        })),
      },
    });
  })
);

// ---------------------------------------------------------------------------
// Salvar (rascunho) ou salvar e enviar para revisão
// ---------------------------------------------------------------------------
router.put(
  '/',
  autorizar('professor'),
  validar(schemas.lancamento),
  asyncHandler(async (req, res) => {
    const { aluno_id, disciplina_id, bimestre_id, media, faltas, descricao, tags, enviar } = req.body;
    const professorId = req.usuario.professorId;

    const resultado = await db.transacao(req.usuario.id, async (tx) => {
      const [bimestre] = await tx.query('SELECT id, ano_letivo FROM bimestre WHERE id = ?', [bimestre_id]);
      if (!bimestre) throw AppError.naoEncontrado('Bimestre não encontrado.');

      // A turma do aluno no ano do bimestre (a FK composta exige que ele esteja matriculado)
      const [matricula] = await tx.query(
        `SELECT ta.turma_id FROM turma_aluno ta JOIN aluno a ON a.id = ta.aluno_id
          WHERE ta.aluno_id = ? AND ta.ano_letivo = ? AND a.ativo = TRUE`,
        [aluno_id, bimestre.ano_letivo]
      );
      if (!matricula) throw AppError.naoEncontrado('Aluno não matriculado em nenhuma turma neste ano.');

      const vinculo = await tx.query(
        'SELECT turma_id FROM turma_disciplina_professor WHERE turma_id = ? AND disciplina_id = ? AND professor_id = ?',
        [matricula.turma_id, disciplina_id, professorId]
      );
      if (!vinculo.length) throw AppError.semPermissao('Você não leciona esta disciplina na turma do aluno.');

      const [atual] = await tx.query(
        'SELECT id, status FROM acompanhamento WHERE aluno_id = ? AND disciplina_id = ? AND bimestre_id = ? FOR UPDATE',
        [aluno_id, disciplina_id, bimestre_id]
      );

      let id;
      let criado = false;
      if (!atual) {
        // O trigger trg_acomp_bi confere o período de digitação e grava a CRIACAO no histórico
        const r = await tx.query(
          `INSERT INTO acompanhamento
             (aluno_id, turma_id, disciplina_id, professor_id, bimestre_id, descricao, media, faltas, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [aluno_id, matricula.turma_id, disciplina_id, professorId, bimestre_id, descricao, media, faltas, enviar ? 'ENVIADO' : 'RASCUNHO']
        );
        // Lê o id pela chave única (aluno, disciplina, bimestre): não depende do insertId,
        // que alguns servidores compatíveis com MySQL deixam em 0 quando um trigger roda no INSERT
        id = r.insertId || (await tx.query(
          'SELECT id FROM acompanhamento WHERE aluno_id = ? AND disciplina_id = ? AND bimestre_id = ?',
          [aluno_id, disciplina_id, bimestre_id]
        ))[0].id;
        criado = true;
      } else {
        if (!['RASCUNHO', 'DEVOLVIDO'].includes(atual.status)) {
          throw AppError.conflito(
            `Este registro está "${status(atual.status).replace('_', ' ')}" e não pode mais ser editado pelo professor.`
          );
        }
        // O trigger trg_acomp_bu valida período e transição e grava a EDICAO no histórico
        await tx.query('UPDATE acompanhamento SET media = ?, faltas = ?, descricao = ?, status = ? WHERE id = ?', [
          media,
          faltas,
          descricao,
          enviar ? 'ENVIADO' : atual.status,
          atual.id,
        ]);
        id = atual.id;
      }

      await gravarTags(tx, id, tags);

      const [salvo] = await tx.query(
        'SELECT id, media, faltas, descricao, status, versao, atualizado_em FROM acompanhamento WHERE id = ?',
        [id]
      );
      return { criado, salvo };
    });

    const { criado, salvo } = resultado;
    const tagsSalvas = (await tagsDe([salvo.id]))[salvo.id] || [];
    res.status(criado ? 201 : 200).json({ dados: { ...salvo, status: status(salvo.status), tags: tagsSalvas } });
  })
);

router.post(
  '/:id/enviar',
  autorizar('professor'),
  validar(schemas.paramId, 'params'),
  asyncHandler(async (req, res) => {
    const id = req.validado.params.id;
    const salvo = await db.transacao(req.usuario.id, async (tx) => {
      const [atual] = await tx.query('SELECT id, status, professor_id FROM acompanhamento WHERE id = ? FOR UPDATE', [id]);
      if (!atual || atual.professor_id !== req.usuario.professorId) throw AppError.naoEncontrado('Registro não encontrado.');
      if (!['RASCUNHO', 'DEVOLVIDO'].includes(atual.status)) {
        throw AppError.conflito('Só é possível enviar registros em rascunho ou devolvidos.');
      }
      await tx.query("UPDATE acompanhamento SET status = 'ENVIADO' WHERE id = ?", [id]);
      return (await tx.query('SELECT id, status, enviado_em FROM acompanhamento WHERE id = ?', [id]))[0];
    });
    res.json({ dados: { ...salvo, status: status(salvo.status) } });
  })
);

module.exports = router;
