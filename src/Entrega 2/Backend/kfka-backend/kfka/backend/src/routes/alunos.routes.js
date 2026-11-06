// alunos.routes.js
//
//   GET    /api/alunos                         (logado)  lista (+ ?turma_id= ?busca=)
//   GET    /api/alunos/:id                     (logado)  detalhe (+ responsáveis para a equipe)
//   POST   /api/alunos                         (admin)   cria aluno e matricula na turma
//   PUT    /api/alunos/:id                     (admin)   atualiza dados e turma
//   DELETE /api/alunos/:id                     (admin)   desativa (o histórico escolar é mantido)
//   PATCH  /api/alunos/:id/ativo               (admin)   ativa / desativa { ativo }
//   POST   /api/alunos/:id/responsaveis        (admin)   vincula responsável pelo e-mail
//   DELETE /api/alunos/:id/responsaveis/:rid   (admin)   remove o vínculo
//
// Quem vê o quê:
//   admin       -> todos os alunos ativos
//   professor   -> alunos das turmas em que leciona
//   responsável -> só os alunos vinculados a ele com autorizado = TRUE,
//                  e no resumo só entram registros PUBLICADOS

const { Router } = require('express');

const db = require('../db');
const env = require('../config/env');
const schemas = require('../schemas');
const validar = require('../middlewares/validar');
const { autenticar, autorizar } = require('../middlewares/auth');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { auditarNaTransacao, comAuditoria, diferenca } = require('../utils/auditoria');

const router = Router();
router.use(autenticar);

// Monta o filtro de visibilidade conforme o perfil (SQL + parâmetros)
function filtroPerfil(usuario) {
  if (usuario.perfil === 'professor') {
    return {
      sql: 'AND ta.turma_id IN (SELECT turma_id FROM turma_disciplina_professor WHERE professor_id = ?)',
      params: [usuario.professorId],
    };
  }
  if (usuario.perfil === 'responsavel') {
    return {
      sql: 'AND a.id IN (SELECT aluno_id FROM aluno_responsavel WHERE responsavel_id = ? AND autorizado = TRUE)',
      params: [usuario.responsavelId],
    };
  }
  return { sql: '', params: [] };
}

// Situação geral a partir dos status dos lançamentos (o mais urgente vence)
const PRIORIDADE = ['devolvido', 'pendente', 'rascunho', 'publicado'];
function situacaoDe(statuses) {
  const mapa = { DEVOLVIDO: 'devolvido', ENVIADO: 'pendente', EM_REVISAO: 'pendente', RASCUNHO: 'rascunho', PUBLICADO: 'publicado' };
  const presentes = new Set(statuses.map((s) => mapa[s]).filter(Boolean));
  return PRIORIDADE.find((p) => presentes.has(p)) || 'sem_lancamento';
}

// situacao: 'ativos' (padrão), 'inativos' ou 'todos' — só a coordenação vê inativos
async function buscarAlunos(usuario, { id = null, turmaId = null, busca = null, situacao = 'ativos', pagina = null, porPagina = 25 } = {}) {
  const filtro = filtroPerfil(usuario);
  const termo = busca ? `%${busca.toLowerCase()}%` : null;
  const ehAdmin = usuario.perfil === 'admin';
  const sit = ehAdmin ? situacao : 'ativos';
  const condAtivo = sit === 'todos' ? '' : sit === 'inativos' ? 'AND a.ativo = FALSE' : 'AND a.ativo = TRUE';

  // Dados de contato e documento só para a coordenação (LGPD: exposição mínima)
  const extras = ehAdmin
    ? `, a.documento, a.email, a.telefone, a.endereco, a.ativo, a.criado_em,
         (SELECT COUNT(*) FROM aluno_responsavel ar WHERE ar.aluno_id = a.id) AS total_responsaveis`
    : '';

  const deOnde = `
       FROM aluno a
       LEFT JOIN turma_aluno ta ON ta.aluno_id = a.id AND ta.ano_letivo = ?
       LEFT JOIN turma t        ON t.id = ta.turma_id
      WHERE 1 = 1 ${condAtivo}
        AND (? IS NULL OR a.id = ?)
        AND (? IS NULL OR ta.turma_id = ?)
        AND (? IS NULL OR LOWER(a.nome) LIKE ? OR a.matricula LIKE ?)
        ${filtro.sql}`;
  const params0 = [env.ANO_LETIVO, id, id, turmaId, turmaId, termo, termo, termo, ...filtro.params];

  // Paginação no banco (LIMIT/OFFSET) quando pedida: total separado para a navegação
  let total = null;
  let limite = '';
  if (pagina) {
    total = Number((await db.query(`SELECT COUNT(*) AS n ${deOnde}`, params0))[0].n);
    limite = ` LIMIT ${Number(porPagina)} OFFSET ${(Number(pagina) - 1) * Number(porPagina)}`;
  }
  const alunos = await db.query(
    `SELECT a.id, a.nome, a.matricula, a.data_nascimento, t.id AS turma_id, t.nome AS turma, t.serie${extras}
     ${deOnde}
      ORDER BY a.nome, a.id${limite}`,
    params0
  );
  if (pagina) alunos.total = total;
  if (!alunos.length) return alunos;
  if (ehAdmin) {
    for (const a of alunos) {
      a.ativo = Boolean(a.ativo);
      a.total_responsaveis = Number(a.total_responsaveis) || 0;
      a.ano_letivo = a.turma_id ? env.ANO_LETIVO : null;
    }
  }

  // Resumo dos lançamentos (uma consulta só para todos os alunos da lista)
  const ids = alunos.map((a) => a.id);
  const condicoes = ["status <> 'CANCELADO'"];
  const params = [ids];
  if (usuario.perfil === 'responsavel') condicoes.push("status = 'PUBLICADO'");
  if (usuario.perfil === 'professor') {
    condicoes.push('professor_id = ?');
    params.push(usuario.professorId);
  }
  const lancamentos = await db.query(
    `SELECT aluno_id, status, media, faltas FROM acompanhamento
      WHERE aluno_id IN (?) AND ${condicoes.join(' AND ')}`,
    params
  );

  const resultado = alunos.map((a) => {
    const meus = lancamentos.filter((l) => l.aluno_id === a.id);
    const medias = meus.map((l) => Number(l.media));
    return {
      ...a,
      resumo: {
        lancamentos: meus.length,
        media: medias.length ? Number((medias.reduce((s, n) => s + n, 0) / medias.length).toFixed(2)) : null,
        faltas_total: meus.reduce((s, l) => s + Number(l.faltas), 0),
        situacao: situacaoDe(meus.map((l) => l.status)),
      },
    };
  });
  resultado.total = alunos.total ?? resultado.length;
  return resultado;
}

// ---------------------------------------------------------------------------
router.get(
  '/',
  validar(schemas.filtroAlunos, 'query'),
  asyncHandler(async (req, res) => {
    const { turma_id, busca, situacao, pagina, por_pagina } = req.validado.query;
    const alunos = await buscarAlunos(req.usuario, {
      turmaId: turma_id ?? null,
      busca: busca || null,
      situacao,
      pagina: pagina ?? null,
      porPagina: por_pagina,
    });
    const total = alunos.total ?? alunos.length;
    res.json({
      dados: [...alunos],
      meta: pagina
        ? { total, pagina, por_pagina, paginas: Math.max(1, Math.ceil(total / por_pagina)) }
        : { total },
    });
  })
);

router.get(
  '/:id',
  validar(schemas.paramId, 'params'),
  asyncHandler(async (req, res) => {
    const [aluno] = await buscarAlunos(req.usuario, { id: req.validado.params.id, situacao: 'todos' });
    // Para quem não pode ver, responde 404 (não revela que o aluno existe)
    if (!aluno) throw AppError.naoEncontrado('Aluno não encontrado.');

    if (req.usuario.perfil !== 'responsavel') {
      aluno.responsaveis = await db.query(
        `SELECT r.id, u.id AS usuario_id, u.nome, u.email, r.telefone, ar.parentesco, ar.autorizado
           FROM aluno_responsavel ar
           JOIN responsavel r ON r.id = ar.responsavel_id
           JOIN usuario u     ON u.id = r.usuario_id
          WHERE ar.aluno_id = ? ORDER BY u.nome`,
        [aluno.id]
      );
      aluno.responsaveis = aluno.responsaveis.map((r) => ({ ...r, autorizado: Boolean(r.autorizado) }));
    }
    res.json({ dados: aluno });
  })
);

async function turmaDoAno(turmaId) {
  const [turma] = await db.query('SELECT id, ano_letivo FROM turma WHERE id = ? AND ativo = TRUE', [turmaId]);
  if (!turma) {
    throw new AppError(422, 'DADOS_INVALIDOS', 'Verifique os dados enviados.', [
      { campo: 'turma_id', mensagem: 'Turma não encontrada.' },
    ]);
  }
  return turma;
}

router.post(
  '/',
  autorizar('admin'),
  validar(schemas.aluno),
  asyncHandler(async (req, res) => {
    const { nome, matricula, data_nascimento, turma_id, documento, email, telefone, endereco } = req.body;
    const turma = await turmaDoAno(turma_id);

    const id = await db.transacao(req.usuario.id, async (tx) => {
      const r = await tx.query(
        `INSERT INTO aluno (nome, matricula, data_nascimento, documento, email, telefone, endereco)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [nome, matricula, data_nascimento, documento, email, telefone, endereco]
      );
      await tx.query('INSERT INTO turma_aluno (turma_id, aluno_id, ano_letivo) VALUES (?, ?, ?)', [
        turma.id,
        r.insertId,
        turma.ano_letivo,
      ]);
      await auditarNaTransacao(tx, req, res, { acao: 'CRIAR_ALUNO', entidade: 'aluno', entidade_id: r.insertId, detalhes: { matricula, turma_id } });
      return r.insertId;
    });

    const [aluno] = await buscarAlunos(req.usuario, { id });
    res.status(201).json({ dados: aluno });
  })
);

router.put(
  '/:id',
  autorizar('admin'),
  validar(schemas.paramId, 'params'),
  validar(schemas.aluno),
  asyncHandler(async (req, res) => {
    const id = req.validado.params.id;
    const { nome, matricula, data_nascimento, turma_id, documento, email, telefone, endereco } = req.body;
    const turma = await turmaDoAno(turma_id);
    const [antes] = await buscarAlunos(req.usuario, { id, situacao: 'todos' });

    await db.transacao(req.usuario.id, async (tx) => {
      const r = await tx.query(
        `UPDATE aluno SET nome = ?, matricula = ?, data_nascimento = ?, documento = ?, email = ?, telefone = ?, endereco = ?
          WHERE id = ?`,
        [nome, matricula, data_nascimento, documento, email, telefone, endereco, id]
      );
      if (!r.affectedRows) {
        const existe = await tx.query('SELECT id FROM aluno WHERE id = ?', [id]);
        if (!existe.length) throw AppError.naoEncontrado('Aluno não encontrado.');
      }

      const [atual] = await tx.query('SELECT turma_id FROM turma_aluno WHERE aluno_id = ? AND ano_letivo = ?', [
        id,
        turma.ano_letivo,
      ]);
      if (!atual) {
        await tx.query('INSERT INTO turma_aluno (turma_id, aluno_id, ano_letivo) VALUES (?, ?, ?)', [
          turma.id,
          id,
          turma.ano_letivo,
        ]);
      } else if (atual.turma_id !== turma.id) {
        const lancados = await tx.query('SELECT id FROM acompanhamento WHERE aluno_id = ? AND turma_id = ?', [
          id,
          atual.turma_id,
        ]);
        if (lancados.length) {
          throw AppError.conflito('O aluno já tem lançamentos na turma atual; não é possível trocá-lo de turma.');
        }
        await tx.query('UPDATE turma_aluno SET turma_id = ? WHERE aluno_id = ? AND ano_letivo = ?', [
          turma.id,
          id,
          turma.ano_letivo,
        ]);
      }
      // Nome, matrícula e turma com antes/depois; contatos e documento só "alterado" (dados pessoais do menor)
      const pessoais = ['data_nascimento', 'documento', 'email', 'telefone', 'endereco'].filter(
        (c) => String(antes?.[c] ?? '') !== String(req.body[c] ?? '')
      );
      await auditarNaTransacao(tx, req, res, {
        acao: 'EDITAR_ALUNO',
        entidade: 'aluno',
        entidade_id: id,
        detalhes: {
          ...diferenca(antes, { nome, matricula, turma_id: turma.id }, ['nome', 'matricula', 'turma_id']),
          ...(pessoais.length ? { dados_pessoais_alterados: pessoais } : {}),
        },
      });
    });

    const [aluno] = await buscarAlunos(req.usuario, { id, situacao: 'todos' });
    res.json({ dados: aluno });
  })
);

router.patch(
  '/:id/ativo',
  autorizar('admin'),
  validar(schemas.paramId, 'params'),
  validar(schemas.ativacao),
  asyncHandler(async (req, res) => {
    await comAuditoria(
      req,
      res,
      async (tx) => {
        const r = await tx.query('UPDATE aluno SET ativo = ? WHERE id = ?', [req.body.ativo, req.validado.params.id]);
        if (!r.affectedRows) throw AppError.naoEncontrado('Aluno não encontrado.');
      },
      { acao: req.body.ativo ? 'ATIVAR_ALUNO' : 'DESATIVAR_ALUNO', entidade: 'aluno', entidade_id: req.validado.params.id, detalhes: { ativo: req.body.ativo } }
    );
    res.json({ dados: { id: req.validado.params.id, ativo: req.body.ativo } });
  })
);

// Desativação (exclusão lógica): o histórico escolar e a auditoria continuam no banco
router.delete(
  '/:id',
  autorizar('admin'),
  validar(schemas.paramId, 'params'),
  asyncHandler(async (req, res) => {
    await comAuditoria(
      req,
      res,
      async (tx) => {
        const r = await tx.query('UPDATE aluno SET ativo = FALSE WHERE id = ? AND ativo = TRUE', [req.validado.params.id]);
        if (!r.affectedRows) throw AppError.naoEncontrado('Aluno não encontrado.');
      },
      { acao: 'DESATIVAR_ALUNO', entidade: 'aluno', entidade_id: req.validado.params.id, detalhes: { ativo: false } }
    );
    res.status(204).end();
  })
);

router.post(
  '/:id/responsaveis',
  autorizar('admin'),
  validar(schemas.paramId, 'params'),
  validar(schemas.vinculoResponsavel),
  asyncHandler(async (req, res) => {
    const alunoId = req.validado.params.id;
    const { email, parentesco, autorizado } = req.body;

    const aluno = await db.query('SELECT id FROM aluno WHERE id = ? AND ativo = TRUE', [alunoId]);
    if (!aluno.length) throw AppError.naoEncontrado('Aluno não encontrado.');

    const [resp] = await db.query(
      `SELECT r.id, u.nome FROM responsavel r JOIN usuario u ON u.id = r.usuario_id
        WHERE u.email = ? AND u.perfil = 'RESPONSAVEL'`,
      [email]
    );
    if (!resp) {
      throw new AppError(422, 'DADOS_INVALIDOS', 'Verifique os dados enviados.', [
        { campo: 'email', mensagem: 'Nenhum responsável cadastrado com este e-mail.' },
      ]);
    }

    const ja = await db.query('SELECT aluno_id FROM aluno_responsavel WHERE aluno_id = ? AND responsavel_id = ?', [
      alunoId,
      resp.id,
    ]);
    if (ja.length) throw AppError.conflito('Este responsável já está vinculado ao aluno.');

    await comAuditoria(
      req,
      res,
      (tx) =>
        tx.query('INSERT INTO aluno_responsavel (aluno_id, responsavel_id, parentesco, autorizado) VALUES (?, ?, ?, ?)', [
          alunoId,
          resp.id,
          parentesco,
          autorizado,
        ]),
      { acao: 'VINCULAR_RESPONSAVEL', entidade: 'aluno', entidade_id: alunoId, detalhes: { responsavel_id: resp.id, parentesco, autorizado } }
    );
    res.status(201).json({ dados: { aluno_id: alunoId, responsavel_id: resp.id, nome: resp.nome, parentesco, autorizado } });
  })
);

router.delete(
  '/:id/responsaveis/:rid',
  autorizar('admin'),
  asyncHandler(async (req, res) => {
    await comAuditoria(
      req,
      res,
      async (tx) => {
        const r = await tx.query('DELETE FROM aluno_responsavel WHERE aluno_id = ? AND responsavel_id = ?', [
          Number(req.params.id) || 0,
          Number(req.params.rid) || 0,
        ]);
        if (!r.affectedRows) throw AppError.naoEncontrado('Vínculo não encontrado.');
      },
      { acao: 'DESVINCULAR_RESPONSAVEL', entidade: 'aluno', entidade_id: Number(req.params.id), detalhes: { responsavel_id: Number(req.params.rid) } }
    );
    res.status(204).end();
  })
);

module.exports = router;
