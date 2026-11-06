// atividades.routes.js — atividades escolares e entregas.
//
//   GET    /api/atividades?turma_id=&aluno_id=&situacao=   lista conforme o perfil
//   GET    /api/atividades/:id                             detalhe (+ entregas para o professor)
//   POST   /api/atividades                                 (professor) cria { ..., publicar }
//   PUT    /api/atividades/:id                             (professor) edita (rascunho ou publicada)
//   PATCH  /api/atividades/:id/status                      (professor) publicar, encerrar ou cancelar
//   DELETE /api/atividades/:id                             (professor) exclui rascunho
//   PUT    /api/atividades/:id/entregas                    (professor) registra a entrega de cada aluno
//
// Situação de um aluno numa atividade (vista pelo responsável):
//   concluida    -> entregue (no prazo ou com atraso)
//   pendente     -> ainda no prazo, sem entrega registrada
//   atrasada     -> prazo vencido sem entrega, ou marcada como "não entregue"
//
// Responsáveis veem só atividades PUBLICADAS/ENCERRADAS das turmas dos filhos.

const { Router } = require('express');

const db = require('../db');
const env = require('../config/env');
const schemas = require('../schemas');
const validar = require('../middlewares/validar');
const { autenticar, autorizar } = require('../middlewares/auth');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { professorLeciona, alunosDoResponsavel } = require('../utils/acesso');

const router = Router();
router.use(autenticar);

const st = (s) => (s ? String(s).toLowerCase() : null);

const SQL_BASE = `
  SELECT a.id, a.turma_id, t.nome AS turma, a.disciplina_id, d.nome AS disciplina, a.professor_id, u.nome AS professor,
         a.titulo, a.descricao, a.link_material, a.prazo, a.status, a.publicada_em, a.criado_em, a.atualizado_em,
         (a.prazo < NOW()) AS vencida
    FROM atividade a
    JOIN turma t ON t.id = a.turma_id
    JOIN disciplina d ON d.id = a.disciplina_id
    JOIN professor p ON p.id = a.professor_id
    JOIN usuario u ON u.id = p.usuario_id`;

function situacaoAluno(atividade, entrega) {
  if (entrega === 'ENTREGUE' || entrega === 'ENTREGUE_ATRASO') return 'concluida';
  if (entrega === 'NAO_ENTREGUE' || atividade.vencida || atividade.status === 'ENCERRADA') return 'atrasada';
  return 'pendente';
}

const formatar = (a) => ({ ...a, status: st(a.status), vencida: Boolean(a.vencida) });

// ---------------------------------------------------------------------------
router.get(
  '/',
  validar(schemas.filtroAtividades, 'query'),
  asyncHandler(async (req, res) => {
    const { turma_id, aluno_id, situacao } = req.validado.query;
    const u = req.usuario;

    if (u.perfil === 'responsavel') {
      const filhos = await alunosDoResponsavel(u.responsavelId);
      if (aluno_id && !filhos.includes(aluno_id)) throw AppError.naoEncontrado('Aluno não encontrado.');
      const alvo = aluno_id ? [aluno_id] : filhos;
      if (!alvo.length) return res.json({ dados: [] });

      const linhas = await db.query(
        `SELECT x.*, al.id AS aluno_id, al.nome AS aluno, e.situacao AS entrega
           FROM (${SQL_BASE}) x
           JOIN turma_aluno ta ON ta.turma_id = x.turma_id AND ta.ano_letivo = ?
           JOIN aluno al ON al.id = ta.aluno_id
           LEFT JOIN atividade_entrega e ON e.atividade_id = x.id AND e.aluno_id = al.id
          WHERE al.id IN (?) AND x.status IN ('PUBLICADA', 'ENCERRADA')
          ORDER BY x.prazo DESC`,
        [env.ANO_LETIVO, alvo]
      );
      let dados = linhas.map((l) => {
        const { entrega, ...a } = l;
        return { ...formatar(a), entrega: st(entrega), situacao_aluno: situacaoAluno(l, entrega) };
      });
      const filtroResp = { pendentes: 'pendente', concluidas: 'concluida', atrasadas: 'atrasada' }[situacao];
      if (filtroResp) dados = dados.filter((d) => d.situacao_aluno === filtroResp);
      return res.json({ dados });
    }

    // Equipe: professor vê as suas; coordenação vê todas (somente leitura)
    const doProf = u.perfil === 'professor' ? u.professorId : null;
    const linhas = await db.query(
      `SELECT x.*,
              (SELECT COUNT(*) FROM turma_aluno ta JOIN aluno al ON al.id = ta.aluno_id
                WHERE ta.turma_id = x.turma_id AND al.ativo = TRUE) AS total_alunos,
              (SELECT COUNT(*) FROM atividade_entrega e
                WHERE e.atividade_id = x.id AND e.situacao IN ('ENTREGUE', 'ENTREGUE_ATRASO')) AS entregues
         FROM (${SQL_BASE}) x
        WHERE (? IS NULL OR x.professor_id = ?) AND (? IS NULL OR x.turma_id = ?)
        ORDER BY x.prazo DESC`,
      [doProf, doProf, turma_id ?? null, turma_id ?? null]
    );
    let dados = linhas.map((l) => ({ ...formatar(l), total_alunos: Number(l.total_alunos), entregues: Number(l.entregues) }));
    const filtros = {
      rascunhos: (a) => a.status === 'rascunho',
      pendentes: (a) => a.status === 'publicada' && !a.vencida,
      encerradas: (a) => a.status === 'encerrada' || (a.status === 'publicada' && a.vencida),
    };
    if (filtros[situacao]) dados = dados.filter(filtros[situacao]);
    res.json({ dados });
  })
);

async function buscar(id) {
  const [a] = await db.query(`${SQL_BASE} WHERE a.id = ?`, [id]);
  if (!a) throw AppError.naoEncontrado('Atividade não encontrada.');
  return a;
}

async function buscarDoProfessor(usuario, id) {
  const a = await buscar(id);
  if (a.professor_id !== usuario.professorId) throw AppError.naoEncontrado('Atividade não encontrada.');
  return a;
}

async function entregasDe(atividade) {
  const linhas = await db.query(
    `SELECT al.id AS aluno_id, al.nome, al.matricula, e.situacao, e.registrado_em
       FROM turma_aluno ta
       JOIN aluno al ON al.id = ta.aluno_id AND al.ativo = TRUE
       LEFT JOIN atividade_entrega e ON e.atividade_id = ? AND e.aluno_id = al.id
      WHERE ta.turma_id = ?
      ORDER BY al.nome`,
    [atividade.id, atividade.turma_id]
  );
  return linhas.map((l) => ({ ...l, situacao: st(l.situacao) || 'pendente', situacao_aluno: situacaoAluno(atividade, l.situacao) }));
}

router.get(
  '/:id',
  validar(schemas.paramId, 'params'),
  asyncHandler(async (req, res) => {
    const u = req.usuario;
    const a = await buscar(req.validado.params.id);

    if (u.perfil === 'responsavel') {
      if (!['PUBLICADA', 'ENCERRADA'].includes(a.status)) throw AppError.naoEncontrado('Atividade não encontrada.');
      const filhos = await alunosDoResponsavel(u.responsavelId);
      const daTurma = filhos.length
        ? await db.query(
            `SELECT al.id AS aluno_id, al.nome, e.situacao FROM turma_aluno ta
               JOIN aluno al ON al.id = ta.aluno_id
               LEFT JOIN atividade_entrega e ON e.atividade_id = ? AND e.aluno_id = al.id
              WHERE ta.turma_id = ? AND al.id IN (?)`,
            [a.id, a.turma_id, filhos]
          )
        : [];
      if (!daTurma.length) throw AppError.naoEncontrado('Atividade não encontrada.');
      return res.json({
        dados: {
          ...formatar(a),
          alunos: daTurma.map((l) => ({ aluno_id: l.aluno_id, nome: l.nome, situacao_aluno: situacaoAluno(a, l.situacao) })),
        },
      });
    }

    if (u.perfil === 'professor' && a.professor_id !== u.professorId) throw AppError.naoEncontrado('Atividade não encontrada.');
    res.json({ dados: { ...formatar(a), entregas: await entregasDe(a) } });
  })
);

router.post(
  '/',
  autorizar('professor'),
  validar(schemas.atividade),
  asyncHandler(async (req, res) => {
    const { turma_id, disciplina_id, titulo, descricao, link_material, prazo, publicar } = req.body;
    if (!(await professorLeciona(req.usuario.professorId, turma_id, disciplina_id))) {
      throw AppError.semPermissao('Você não leciona esta disciplina nesta turma.');
    }
    const r = await db.query(
      `INSERT INTO atividade (turma_id, disciplina_id, professor_id, titulo, descricao, link_material, prazo, status, publicada_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ${publicar ? 'NOW()' : 'NULL'})`,
      [turma_id, disciplina_id, req.usuario.professorId, titulo, descricao, link_material, prazo, publicar ? 'PUBLICADA' : 'RASCUNHO']
    );
    res.status(201).json({ dados: formatar(await buscar(r.insertId)) });
  })
);

router.put(
  '/:id',
  autorizar('professor'),
  validar(schemas.paramId, 'params'),
  validar(schemas.atividade),
  asyncHandler(async (req, res) => {
    const a = await buscarDoProfessor(req.usuario, req.validado.params.id);
    if (!['RASCUNHO', 'PUBLICADA'].includes(a.status)) {
      throw AppError.conflito('Atividades encerradas ou canceladas não podem ser editadas.');
    }
    const { turma_id, disciplina_id, titulo, descricao, link_material, prazo, publicar } = req.body;
    if (a.status === 'PUBLICADA' && (turma_id !== a.turma_id || disciplina_id !== a.disciplina_id)) {
      throw AppError.conflito('Depois de publicada, a turma e a disciplina da atividade não podem mudar.');
    }
    if (!(await professorLeciona(req.usuario.professorId, turma_id, disciplina_id))) {
      throw AppError.semPermissao('Você não leciona esta disciplina nesta turma.');
    }
    const publicarAgora = a.status === 'RASCUNHO' && publicar;
    await db.query(
      `UPDATE atividade SET turma_id = ?, disciplina_id = ?, titulo = ?, descricao = ?, link_material = ?, prazo = ?,
              status = ?, publicada_em = ${publicarAgora ? 'NOW()' : 'publicada_em'}
        WHERE id = ?`,
      [turma_id, disciplina_id, titulo, descricao, link_material, prazo, publicarAgora ? 'PUBLICADA' : a.status, a.id]
    );
    res.json({ dados: formatar(await buscar(a.id)) });
  })
);

const TRANSICOES = {
  PUBLICADA: ['RASCUNHO'],
  ENCERRADA: ['PUBLICADA'],
  CANCELADA: ['RASCUNHO', 'PUBLICADA'],
};

router.patch(
  '/:id/status',
  autorizar('professor'),
  validar(schemas.paramId, 'params'),
  validar(schemas.statusAtividade),
  asyncHandler(async (req, res) => {
    const a = await buscarDoProfessor(req.usuario, req.validado.params.id);
    const novo = req.body.status;
    if (!TRANSICOES[novo].includes(a.status)) {
      throw AppError.conflito(`Não é possível passar de "${st(a.status)}" para "${st(novo)}".`);
    }
    await db.query(
      `UPDATE atividade SET status = ?, publicada_em = ${novo === 'PUBLICADA' ? 'NOW()' : 'publicada_em'} WHERE id = ?`,
      [novo, a.id]
    );
    res.json({ dados: formatar(await buscar(a.id)) });
  })
);

router.delete(
  '/:id',
  autorizar('professor'),
  validar(schemas.paramId, 'params'),
  asyncHandler(async (req, res) => {
    const a = await buscarDoProfessor(req.usuario, req.validado.params.id);
    if (a.status !== 'RASCUNHO') throw AppError.conflito('Só rascunhos podem ser excluídos. Para os demais, use "Cancelar".');
    await db.query('DELETE FROM atividade WHERE id = ?', [a.id]);
    res.status(204).end();
  })
);

router.put(
  '/:id/entregas',
  autorizar('professor'),
  validar(schemas.paramId, 'params'),
  validar(schemas.entregas),
  asyncHandler(async (req, res) => {
    const a = await buscarDoProfessor(req.usuario, req.validado.params.id);
    if (!['PUBLICADA', 'ENCERRADA'].includes(a.status)) {
      throw AppError.conflito('Publique a atividade antes de registrar as entregas.');
    }
    const daTurma = new Set((await entregasDe(a)).map((e) => e.aluno_id));
    if (req.body.entregas.some((e) => !daTurma.has(e.aluno_id))) {
      throw new AppError(422, 'DADOS_INVALIDOS', 'Verifique os dados enviados.', [
        { campo: 'entregas', mensagem: 'Há aluno que não pertence à turma desta atividade.' },
      ]);
    }
    await db.transacao(req.usuario.id, async (tx) => {
      for (const e of req.body.entregas) {
        await tx.query('DELETE FROM atividade_entrega WHERE atividade_id = ? AND aluno_id = ?', [a.id, e.aluno_id]);
        if (e.situacao !== 'PENDENTE') {
          await tx.query('INSERT INTO atividade_entrega (atividade_id, aluno_id, situacao) VALUES (?, ?, ?)', [
            a.id,
            e.aluno_id,
            e.situacao,
          ]);
        }
      }
    });
    res.json({ dados: { ...formatar(a), entregas: await entregasDe(a) } });
  })
);

module.exports = router;
