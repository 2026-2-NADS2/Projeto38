// escola/vinculos.js — vínculos professor × disciplina × turma e grade semanal (com histórico em historico_vinculo).
// Montado em /api pelo routes/escola.routes.js; o login é exigido rota a rota.

const { Router } = require('express');

const db = require('../../db');
const env = require('../../config/env');
const schemas = require('../../schemas');
const validar = require('../../middlewares/validar');
const { autenticar, autorizar } = require('../../middlewares/auth');
const AppError = require('../../utils/AppError');
const asyncHandler = require('../../utils/asyncHandler');
const { auditarNaTransacao } = require('../../utils/auditoria');
const { erroCampo } = require('./comum');

const router = Router();

router.get(
  '/vinculos',
  autenticar,
  autorizar('admin'),
  asyncHandler(async (req, res) => {
    const turmaId = Number(req.query.turma_id) || null;
    const linhas = await db.query(
      `SELECT tdp.turma_id, t.nome AS turma, tdp.disciplina_id, d.nome AS disciplina,
              tdp.professor_id, u.nome AS professor
         FROM turma_disciplina_professor tdp
         JOIN turma t      ON t.id = tdp.turma_id
         JOIN disciplina d ON d.id = tdp.disciplina_id
         JOIN professor p  ON p.id = tdp.professor_id
         JOIN usuario u    ON u.id = p.usuario_id
        WHERE t.ano_letivo = ? AND (? IS NULL OR tdp.turma_id = ?)
        ORDER BY t.serie, t.nome, d.nome`,
      [env.ANO_LETIVO, turmaId, turmaId]
    );
    const grade = await db.query('SELECT turma_id, disciplina_id, dia_semana FROM grade_aula ORDER BY dia_semana');
    res.json({
      dados: linhas.map((v) => ({
        ...v,
        dias: grade.filter((g) => g.turma_id === v.turma_id && g.disciplina_id === v.disciplina_id).map((g) => g.dia_semana),
      })),
    });
  })
);

router.put(
  '/vinculos',
  autenticar,
  autorizar('admin'),
  validar(schemas.vinculo),
  asyncHandler(async (req, res) => {
    const { turma_id, disciplina_id, professor_id, dias } = req.body;

    const [prof] = await db.query(
      'SELECT p.id FROM professor p JOIN usuario u ON u.id = p.usuario_id WHERE p.id = ? AND u.ativo = TRUE',
      [professor_id]
    );
    if (!prof) throw erroCampo('professor_id', 'Professor não encontrado ou com a conta desativada.');

    // Vínculo compatível (RF03): turma ativa do ano letivo corrente e disciplina ativa
    const [turma] = await db.query('SELECT id, ativo, ano_letivo FROM turma WHERE id = ?', [turma_id]);
    if (!turma || !turma.ativo) throw erroCampo('turma_id', 'Turma não encontrada ou desativada.');
    if (turma.ano_letivo !== env.ANO_LETIVO) {
      throw erroCampo('turma_id', `A turma é de ${turma.ano_letivo}; os vínculos são do ano letivo ${env.ANO_LETIVO}.`);
    }
    const [disc] = await db.query('SELECT id, ativo FROM disciplina WHERE id = ?', [disciplina_id]);
    if (!disc || !disc.ativo) throw erroCampo('disciplina_id', 'Disciplina não encontrada ou desativada.');

    const resultado = await db.transacao(req.usuario.id, async (tx) => {
      const [atual] = await tx.query(
        'SELECT professor_id FROM turma_disciplina_professor WHERE turma_id = ? AND disciplina_id = ? FOR UPDATE',
        [turma_id, disciplina_id]
      );

      if (!atual) {
        await tx.query('INSERT INTO turma_disciplina_professor (turma_id, disciplina_id, professor_id) VALUES (?, ?, ?)', [
          turma_id,
          disciplina_id,
          professor_id,
        ]);
        await registrarVinculo(tx, turma_id, disciplina_id, professor_id, 'VINCULADO', req.usuario.id);
      } else if (atual.professor_id !== professor_id) {
        // Troca de professor: os lançamentos, aulas e atividades já feitos pertencem ao anterior
        // (a chave estrangeira impede a troca). Nesse caso, a coordenação é avisada.
        const usados = await tx.query(
          `SELECT (SELECT COUNT(*) FROM acompanhamento WHERE turma_id = ? AND disciplina_id = ?) +
                  (SELECT COUNT(*) FROM aula WHERE turma_id = ? AND disciplina_id = ?) +
                  (SELECT COUNT(*) FROM atividade WHERE turma_id = ? AND disciplina_id = ?) AS n`,
          [turma_id, disciplina_id, turma_id, disciplina_id, turma_id, disciplina_id]
        );
        if (Number(usados[0].n) > 0) {
          throw AppError.conflito(
            'Esta disciplina já tem lançamentos, aulas ou atividades do professor atual nesta turma; por isso a troca não pode ser feita aqui. Fale com o suporte técnico para transferir os registros.'
          );
        }
        await tx.query('UPDATE turma_disciplina_professor SET professor_id = ? WHERE turma_id = ? AND disciplina_id = ?', [
          professor_id,
          turma_id,
          disciplina_id,
        ]);
        await registrarVinculo(tx, turma_id, disciplina_id, atual.professor_id, 'DESVINCULADO', req.usuario.id);
        await registrarVinculo(tx, turma_id, disciplina_id, professor_id, 'VINCULADO', req.usuario.id);
      }

      await tx.query('DELETE FROM grade_aula WHERE turma_id = ? AND disciplina_id = ?', [turma_id, disciplina_id]);
      for (const dia of dias) {
        await tx.query('INSERT INTO grade_aula (turma_id, disciplina_id, dia_semana) VALUES (?, ?, ?)', [
          turma_id,
          disciplina_id,
          dia,
        ]);
      }
      await auditarNaTransacao(tx, req, res, {
        acao: atual ? 'ALTERAR_VINCULO' : 'CRIAR_VINCULO',
        entidade: 'vinculo',
        entidade_id: `${turma_id}-${disciplina_id}`,
        detalhes: { turma_id, disciplina_id, professor_id: { de: atual?.professor_id ?? null, para: professor_id }, dias },
      });
      return { criado: !atual };
    });

    res.status(resultado.criado ? 201 : 200).json({ dados: { turma_id, disciplina_id, professor_id, dias } });
  })
);

router.delete(
  '/vinculos/:turmaId/:disciplinaId',
  autenticar,
  autorizar('admin'),
  asyncHandler(async (req, res) => {
    const turmaId = Number(req.params.turmaId) || 0;
    const disciplinaId = Number(req.params.disciplinaId) || 0;
    await db.transacao(req.usuario.id, async (tx) => {
      const [atual] = await tx.query(
        'SELECT professor_id FROM turma_disciplina_professor WHERE turma_id = ? AND disciplina_id = ? FOR UPDATE',
        [turmaId, disciplinaId]
      );
      if (!atual) throw AppError.naoEncontrado('Vínculo não encontrado.');
      // Com lançamentos/aulas/atividades, a FK do banco recusa (erro 1451 -> 409 com mensagem clara)
      await tx.query('DELETE FROM grade_aula WHERE turma_id = ? AND disciplina_id = ?', [turmaId, disciplinaId]);
      await tx.query('DELETE FROM turma_disciplina_professor WHERE turma_id = ? AND disciplina_id = ?', [
        turmaId,
        disciplinaId,
      ]);
      await registrarVinculo(tx, turmaId, disciplinaId, atual.professor_id, 'DESVINCULADO', req.usuario.id);
      await auditarNaTransacao(tx, req, res, {
        acao: 'REMOVER_VINCULO',
        entidade: 'vinculo',
        entidade_id: `${turmaId}-${disciplinaId}`,
        detalhes: { turma_id: turmaId, disciplina_id: disciplinaId, professor_id: atual.professor_id },
      });
    });
    res.status(204).end();
  })
);

async function registrarVinculo(tx, turmaId, disciplinaId, professorId, acao, usuarioId) {
  await tx.query(
    'INSERT INTO historico_vinculo (turma_id, disciplina_id, professor_id, acao, usuario_id) VALUES (?, ?, ?, ?, ?)',
    [turmaId, disciplinaId, professorId, acao, usuarioId]
  );
}

module.exports = router;
