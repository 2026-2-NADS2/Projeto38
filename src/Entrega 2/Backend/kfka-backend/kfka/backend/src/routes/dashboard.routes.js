// dashboard.routes.js
//
//   GET /api/dashboard/resumo   números e indicadores do painel, de acordo com o perfil
//
// Equipe: usa as views vw_indicadores_turma_disciplina e vw_frequencia_tags do banco.

const { Router } = require('express');

const db = require('../db');
const env = require('../config/env');
const { autenticar } = require('../middlewares/auth');
const asyncHandler = require('../utils/asyncHandler');

const router = Router();
router.use(autenticar);

const contar = async (sql, params) => Number((await db.query(sql, params))[0].n) || 0;

router.get(
  '/resumo',
  asyncHandler(async (req, res) => {
    const { id, perfil, professorId, responsavelId } = req.usuario;
    const ano = env.ANO_LETIVO;

    const naoLidas = await contar(
      'SELECT COUNT(*) AS n FROM mensagem WHERE destinatario_id = ? AND lida = FALSE',
      [id]
    );

    // ---------------- Responsável ----------------
    if (perfil === 'responsavel') {
      const [r] = await db.query(
        `SELECT COUNT(*) AS publicados,
                SUM(CASE WHEN data_ciencia IS NULL THEN 1 ELSE 0 END) AS aguardando_ciencia,
                AVG(media) AS media_geral,
                SUM(faltas) AS faltas_total
           FROM vw_relatorio_responsavel WHERE responsavel_id = ? AND ano_letivo = ?`,
        [responsavelId, ano]
      );
      const filhos = await contar(
        `SELECT COUNT(*) AS n FROM aluno_responsavel ar JOIN aluno a ON a.id = ar.aluno_id
          WHERE ar.responsavel_id = ? AND ar.autorizado = TRUE AND a.ativo = TRUE`,
        [responsavelId]
      );
      return res.json({
        dados: {
          perfil,
          filhos,
          publicados: Number(r.publicados) || 0,
          aguardando_ciencia: Number(r.aguardando_ciencia) || 0,
          media_geral: r.media_geral === null ? null : Number(Number(r.media_geral).toFixed(1)),
          faltas_total: Number(r.faltas_total) || 0,
          mensagens_nao_lidas: naoLidas,
        },
      });
    }

    // ---------------- Equipe (admin vê tudo; professor vê o que é dele) ----------------
    const doProf = perfil === 'professor' ? professorId : null;

    const [contagem] = await db.query(
      `SELECT SUM(CASE WHEN status IN ('ENVIADO', 'EM_REVISAO') THEN 1 ELSE 0 END) AS pendentes,
              SUM(CASE WHEN status = 'DEVOLVIDO' THEN 1 ELSE 0 END) AS devolvidos,
              SUM(CASE WHEN status = 'RASCUNHO'  THEN 1 ELSE 0 END) AS rascunhos,
              SUM(CASE WHEN status = 'PUBLICADO' THEN 1 ELSE 0 END) AS publicados
         FROM acompanhamento a JOIN bimestre b ON b.id = a.bimestre_id
        WHERE b.ano_letivo = ? AND (? IS NULL OR a.professor_id = ?)`,
      [ano, doProf, doProf]
    );

    const totalAlunos = await contar(
      `SELECT COUNT(DISTINCT ta.aluno_id) AS n
         FROM turma_aluno ta JOIN aluno a ON a.id = ta.aluno_id
        WHERE ta.ano_letivo = ? AND a.ativo = TRUE
          AND (? IS NULL OR ta.turma_id IN (SELECT turma_id FROM turma_disciplina_professor WHERE professor_id = ?))`,
      [ano, doProf, doProf]
    );

    // Indicadores por turma x disciplina x bimestre (view do banco)
    let nomeProfessor = null;
    if (doProf) {
      [{ nome: nomeProfessor }] = await db.query(
        'SELECT u.nome FROM professor p JOIN usuario u ON u.id = p.usuario_id WHERE p.id = ?',
        [doProf]
      );
    }
    const indicadores = await db.query(
      `SELECT bimestre, turma, disciplina, professor, qtd_registros, qtd_publicados, media_geral,
              menor_media, maior_media, qtd_abaixo_de_6, total_faltas
         FROM vw_indicadores_turma_disciplina
        WHERE ano_letivo = ? AND (? IS NULL OR professor = ?)
        ORDER BY bimestre DESC, turma, disciplina`,
      [ano, nomeProfessor, nomeProfessor]
    );

    // Tags mais frequentes (view do banco); o professor vê as das turmas dele
    const tags = await db.query(
      `SELECT tag, SUM(ocorrencias) AS total
         FROM vw_frequencia_tags
        WHERE ano_letivo = ?
          AND (? IS NULL OR turma IN (SELECT t.nome FROM turma t
                 JOIN turma_disciplina_professor tdp ON tdp.turma_id = t.id
                WHERE tdp.professor_id = ? AND t.ano_letivo = ?))
        GROUP BY tag
        ORDER BY total DESC, tag
        LIMIT 6`,
      [ano, doProf, doProf, ano]
    );

    const n = (v) => Number(v) || 0;
    return res.json({
      dados: {
        perfil,
        total_alunos: totalAlunos,
        pendentes: n(contagem.pendentes),
        devolvidos: n(contagem.devolvidos),
        rascunhos: n(contagem.rascunhos),
        publicados: n(contagem.publicados),
        mensagens_nao_lidas: naoLidas,
        indicadores: indicadores.map((i) => ({
          ...i,
          qtd_registros: n(i.qtd_registros),
          qtd_publicados: n(i.qtd_publicados),
          qtd_abaixo_de_6: n(i.qtd_abaixo_de_6),
          total_faltas: n(i.total_faltas),
          media_geral: i.media_geral === null ? null : Number(i.media_geral),
        })),
        tags: tags.map((t) => ({ tag: t.tag, total: n(t.total) })),
      },
    });
  })
);

module.exports = router;
