// usuarios.routes.js — contas de acesso (cadastro de professores e responsáveis pela coordenação).
//
//   GET   /api/usuarios                 (admin)   lista (filtro ?perfil=professor|responsavel|admin)
//   POST  /api/usuarios                 (admin)   cria professor, admin ou responsável
//   GET   /api/usuarios/contatos        (logado)  com quem o usuário pode conversar (mural)
//   GET   /api/usuarios/:id             (admin)   detalhe + vínculos e histórico (professor) ou filhos (responsável)
//   PUT   /api/usuarios/:id             (admin)   edita nome, e-mail, telefone, registro e documento
//   PATCH /api/usuarios/:id/ativo       (admin)   ativa / desativa a conta { ativo }
//   POST  /api/usuarios/:id/link-senha  (admin)   gera link de redefinição de senha (24 h, uso único)

const crypto = require('crypto');
const { Router } = require('express');
const bcrypt = require('bcryptjs');

const db = require('../db');
const schemas = require('../schemas');
const validar = require('../middlewares/validar');
const { autenticar, autorizar, perfilApi, revogarSessoes } = require('../middlewares/auth');
const { auditarNaTransacao, comAuditoria, diferenca } = require('../utils/auditoria');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { contatosPermitidos } = require('../utils/acesso');
const { hashToken } = require('./auth.routes');

const router = Router();
router.use(autenticar);

router.get(
  '/',
  autorizar('admin'),
  asyncHandler(async (req, res) => {
    const perfil = ['admin', 'professor', 'responsavel'].includes(req.query.perfil)
      ? req.query.perfil.toUpperCase()
      : null;
    const linhas = await db.query(
      `SELECT u.id, u.nome, u.email, u.perfil, u.ativo, u.ultimo_login_em, u.criado_em,
              p.id AS professor_id, p.registro, p.documento, r.id AS responsavel_id,
              COALESCE(p.telefone, r.telefone) AS telefone,
              (SELECT COUNT(*) FROM turma_disciplina_professor tdp WHERE tdp.professor_id = p.id) AS total_vinculos,
              (SELECT COUNT(*) FROM aluno_responsavel ar WHERE ar.responsavel_id = r.id) AS total_alunos
         FROM usuario u
         LEFT JOIN professor   p ON p.usuario_id = u.id
         LEFT JOIN responsavel r ON r.usuario_id = u.id
        WHERE (? IS NULL OR u.perfil = ?)
        ORDER BY u.nome`,
      [perfil, perfil]
    );
    res.json({
      dados: linhas.map((u) => ({
        ...u,
        perfil: perfilApi(u.perfil),
        ativo: Boolean(u.ativo),
        total_vinculos: Number(u.total_vinculos) || 0,
        total_alunos: Number(u.total_alunos) || 0,
      })),
    });
  })
);

router.post(
  '/',
  autorizar('admin'),
  validar(schemas.novoUsuario),
  asyncHandler(async (req, res) => {
    const { nome, email, senha, perfil, registro, telefone, documento } = req.body;

    const existe = await db.query('SELECT id FROM usuario WHERE email = ?', [email]);
    if (existe.length) throw AppError.conflito('Este e-mail já está cadastrado.');

    const senhaHash = await bcrypt.hash(senha, 10);
    const id = await db.transacao(req.usuario.id, async (tx) => {
      const u = await tx.query('INSERT INTO usuario (nome, email, senha_hash, perfil) VALUES (?, ?, ?, ?)', [
        nome,
        email,
        senhaHash,
        perfil.toUpperCase(),
      ]);
      if (perfil === 'professor') {
        await tx.query('INSERT INTO professor (usuario_id, registro, telefone, documento) VALUES (?, ?, ?, ?)', [
          u.insertId,
          registro,
          telefone,
          documento ?? null,
        ]);
      } else if (perfil === 'responsavel') {
        await tx.query('INSERT INTO responsavel (usuario_id, telefone) VALUES (?, ?)', [u.insertId, telefone]);
      }
      await auditarNaTransacao(tx, req, res, {
        acao: 'CRIAR_USUARIO',
        entidade: 'usuario',
        entidade_id: u.insertId,
        detalhes: { perfil, registro: registro ?? null },
      });
      return u.insertId;
    });

    res.status(201).json({ dados: { id, nome, email, perfil } });
  })
);

// Mural de conversas: só pessoas ligadas pelos vínculos (ver utils/acesso.js).
// Para contatos responsáveis, informa de quais alunos são (para associar a conversa ao aluno).
router.get(
  '/contatos',
  asyncHandler(async (req, res) => {
    const linhas = await contatosPermitidos(req.usuario);
    const idsResp = linhas.filter((u) => u.perfil === 'RESPONSAVEL').map((u) => u.id);
    const filhos = idsResp.length
      ? await db.query(
          `SELECT r.usuario_id, a.id, a.nome
             FROM responsavel r
             JOIN aluno_responsavel ar ON ar.responsavel_id = r.id AND ar.autorizado = TRUE
             JOIN aluno a ON a.id = ar.aluno_id AND a.ativo = TRUE
            WHERE r.usuario_id IN (?) ORDER BY a.nome`,
          [idsResp]
        )
      : [];
    res.json({
      dados: linhas.map((u) => ({
        id: u.id,
        nome: u.nome,
        perfil: perfilApi(u.perfil),
        alunos: filhos.filter((f) => f.usuario_id === u.id).map((f) => ({ id: f.id, nome: f.nome })),
      })),
    });
  })
);

async function buscarUsuario(id) {
  const [u] = await db.query(
    `SELECT u.id, u.nome, u.email, u.perfil, u.ativo, u.ultimo_login_em, u.criado_em,
            u.token_expira_em, p.id AS professor_id, p.registro, p.documento,
            r.id AS responsavel_id, r.aceite_lgpd_em, COALESCE(p.telefone, r.telefone) AS telefone
       FROM usuario u
       LEFT JOIN professor   p ON p.usuario_id = u.id
       LEFT JOIN responsavel r ON r.usuario_id = u.id
      WHERE u.id = ?`,
    [id]
  );
  if (!u) throw AppError.naoEncontrado('Usuário não encontrado.');
  return { ...u, perfil: perfilApi(u.perfil), ativo: Boolean(u.ativo) };
}

router.get(
  '/:id',
  autorizar('admin'),
  validar(schemas.paramId, 'params'),
  asyncHandler(async (req, res) => {
    const u = await buscarUsuario(req.validado.params.id);
    const { token_expira_em, ...dados } = u;
    dados.link_senha_ativo = Boolean(token_expira_em && new Date(token_expira_em) > new Date());

    if (u.professor_id) {
      dados.vinculos = await db.query(
        `SELECT tdp.turma_id, t.nome AS turma, tdp.disciplina_id, d.nome AS disciplina,
                (SELECT COUNT(*) FROM grade_aula g WHERE g.turma_id = tdp.turma_id AND g.disciplina_id = tdp.disciplina_id) AS aulas_semana
           FROM turma_disciplina_professor tdp
           JOIN turma t ON t.id = tdp.turma_id
           JOIN disciplina d ON d.id = tdp.disciplina_id
          WHERE tdp.professor_id = ?
          ORDER BY t.serie, t.nome, d.nome`,
        [u.professor_id]
      );
      dados.historico_vinculos = await db.query(
        `SELECT h.id, h.acao, h.data_hora, t.nome AS turma, d.nome AS disciplina, us.nome AS usuario
           FROM historico_vinculo h
           JOIN turma t ON t.id = h.turma_id
           JOIN disciplina d ON d.id = h.disciplina_id
           JOIN usuario us ON us.id = h.usuario_id
          WHERE h.professor_id = ?
          ORDER BY h.data_hora DESC, h.id DESC`,
        [u.professor_id]
      );
    }
    if (u.responsavel_id) {
      dados.alunos = await db.query(
        `SELECT a.id, a.nome, a.matricula, ar.parentesco, ar.autorizado
           FROM aluno_responsavel ar JOIN aluno a ON a.id = ar.aluno_id
          WHERE ar.responsavel_id = ? ORDER BY a.nome`,
        [u.responsavel_id]
      );
      dados.alunos = dados.alunos.map((a) => ({ ...a, autorizado: Boolean(a.autorizado) }));
    }
    res.json({ dados });
  })
);

router.put(
  '/:id',
  autorizar('admin'),
  validar(schemas.paramId, 'params'),
  validar(schemas.edicaoUsuario),
  asyncHandler(async (req, res) => {
    const id = req.validado.params.id;
    const u = await buscarUsuario(id);
    const { nome, email, telefone, registro, documento } = req.body;

    if (u.perfil === 'professor' && !registro) {
      throw new AppError(422, 'DADOS_INVALIDOS', 'Verifique os dados enviados.', [
        { campo: 'registro', mensagem: 'Registro funcional é obrigatório para professor.' },
      ]);
    }
    const outro = await db.query('SELECT id FROM usuario WHERE email = ? AND id <> ?', [email, id]);
    if (outro.length) throw AppError.conflito('Este e-mail já está cadastrado.');

    await db.transacao(req.usuario.id, async (tx) => {
      await tx.query('UPDATE usuario SET nome = ?, email = ? WHERE id = ?', [nome, email, id]);
      if (u.professor_id) {
        await tx.query('UPDATE professor SET registro = ?, telefone = ?, documento = ? WHERE id = ?', [
          registro,
          telefone,
          documento,
          u.professor_id,
        ]);
      }
      if (u.responsavel_id) {
        await tx.query('UPDATE responsavel SET telefone = ? WHERE id = ?', [telefone, u.responsavel_id]);
      }
      const depois = { nome, email, telefone, registro: u.professor_id ? registro : u.registro, documento: u.professor_id ? documento : u.documento };
      await auditarNaTransacao(tx, req, res, {
        acao: 'EDITAR_USUARIO',
        entidade: 'usuario',
        entidade_id: id,
        // Documento só registra que mudou (dado pessoal); nome/e-mail/registro com antes e depois
        detalhes: {
          ...diferenca(u, depois, ['nome', 'email', 'registro', 'telefone']),
          ...(String(u.documento ?? '') !== String(depois.documento ?? '') ? { documento: 'alterado' } : {}),
        },
      });
    });
    const { token_expira_em, ...dados } = await buscarUsuario(id);
    res.json({ dados });
  })
);

router.patch(
  '/:id/ativo',
  autorizar('admin'),
  validar(schemas.paramId, 'params'),
  validar(schemas.ativacao),
  asyncHandler(async (req, res) => {
    const id = req.validado.params.id;
    if (id === req.usuario.id && !req.body.ativo) {
      throw AppError.conflito('Você não pode desativar a sua própria conta.');
    }
    const u = await buscarUsuario(id);
    await db.transacao(req.usuario.id, async (tx) => {
      await tx.query('UPDATE usuario SET ativo = ? WHERE id = ?', [req.body.ativo, id]);
      // Desativar encerra na hora as sessões abertas da pessoa (o token deixa de valer)
      if (!req.body.ativo) await revogarSessoes(tx, id);
      await auditarNaTransacao(tx, req, res, {
        acao: req.body.ativo ? 'ATIVAR_USUARIO' : 'DESATIVAR_USUARIO',
        entidade: 'usuario',
        entidade_id: id,
        detalhes: { perfil: u.perfil, ativo: { de: u.ativo, para: req.body.ativo } },
      });
    });
    res.json({ dados: { id, ativo: req.body.ativo } });
  })
);

// Recuperação de senha sem e-mail: a coordenação gera o link e entrega à pessoa
// (pessoalmente, por mensagem ou telefone). O banco guarda só o hash do token.
router.post(
  '/:id/link-senha',
  autorizar('admin'),
  validar(schemas.paramId, 'params'),
  asyncHandler(async (req, res) => {
    const u = await buscarUsuario(req.validado.params.id);
    if (!u.ativo) throw AppError.conflito('Ative a conta antes de gerar o link de redefinição.');

    const token = crypto.randomBytes(24).toString('hex');
    const expira = new Date(Date.now() + 24 * 3600 * 1000);
    await comAuditoria(
      req,
      res,
      (tx) => tx.query('UPDATE usuario SET token_recuperacao = ?, token_expira_em = ? WHERE id = ?', [hashToken(token), expira, u.id]),
      { acao: 'GERAR_LINK_SENHA', entidade: 'usuario', entidade_id: u.id, detalhes: { expira_em: expira.toISOString() } }
    );
    res.status(201).json({ dados: { caminho: `/redefinir-senha?token=${token}`, expira_em: expira.toISOString() } });
  })
);

module.exports = router;
