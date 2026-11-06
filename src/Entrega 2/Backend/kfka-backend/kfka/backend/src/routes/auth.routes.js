// auth.routes.js — cadastro, login e dados do usuário logado.
//
//   POST /api/auth/cadastro   (público)  cria conta de responsável (usuario + responsavel)
//   POST /api/auth/login      (público)  devolve um token JWT
//   GET  /api/auth/me         (logado)   dados do usuário do token
//   POST /api/auth/sair       (logado)   encerra a sessão deste aparelho (o token deixa de valer)
//   POST /api/auth/sair-de-todos (logado) encerra todas as sessões da conta
//   GET  /api/auth/redefinir-senha/:token  (público) confere o link de redefinição
//   POST /api/auth/redefinir-senha         (público) grava a nova senha { token, senha }
//
// Recuperação de senha: não há envio de e-mail. A coordenação gera um link de uso único
// (válido por 24 h) em Professores / Alunos e responsáveis e o entrega à pessoa.

const { Router } = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');

const db = require('../db');
const schemas = require('../schemas');
const validar = require('../middlewares/validar');
const { gerarToken, autenticar, perfilApi, revogarSessoes } = require('../middlewares/auth');
const { auditar, comAuditoria } = require('../utils/auditoria');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');

const router = Router();

// Limita tentativas para dificultar ataques de força bruta na senha
const limiteTentativas = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) =>
    res.status(429).json({
      erro: {
        codigo: 'MUITAS_TENTATIVAS',
        mensagem: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
      },
    }),
});

// Usuário + id de professor/responsável (cada perfil tem sua tabela 1:1 no banco)
const SQL_USUARIO = `
  SELECT u.id, u.nome, u.email, u.perfil, u.ativo, u.senha_hash, u.foto, u.sessao_versao,
         p.id AS professor_id, r.id AS responsavel_id, r.aceite_lgpd_em
    FROM usuario u
    LEFT JOIN professor   p ON p.usuario_id = u.id
    LEFT JOIN responsavel r ON r.usuario_id = u.id`;

const publico = (u) => ({
  id: u.id,
  nome: u.nome,
  email: u.email,
  perfil: perfilApi(u.perfil),
  foto: u.foto || null,
  // Conta de responsável criada pela coordenação: precisa aceitar o termo (LGPD) no 1º acesso
  aceite_pendente: perfilApi(u.perfil) === 'responsavel' && !u.aceite_lgpd_em,
});

// Hash de referência: quando o e-mail não existe, a senha é comparada com ele mesmo assim,
// para a resposta levar o mesmo tempo e não revelar quais e-mails estão cadastrados
const HASH_FICTICIO = bcrypt.hashSync(crypto.randomBytes(12).toString('hex'), 10);

// No banco fica só o hash do token: quem ler a tabela não consegue usar o link
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

async function senhaConfere(senha, hash) {
  try {
    return await bcrypt.compare(senha, hash);
  } catch {
    return false; // hash malformado
  }
}

// Cadastro público: cria sempre um RESPONSÁVEL, registrando o aceite da LGPD.
// Professores e administradores são criados pela coordenação (POST /api/usuarios).
router.post(
  '/cadastro',
  limiteTentativas,
  validar(schemas.cadastro),
  asyncHandler(async (req, res) => {
    const { nome, email, senha, telefone } = req.body;

    const existe = await db.query('SELECT id FROM usuario WHERE email = ?', [email]);
    if (existe.length) throw AppError.conflito('Este e-mail já está cadastrado.');

    const senhaHash = await bcrypt.hash(senha, 10);
    const usuario = await db.transacao(null, async (tx) => {
      const u = await tx.query(
        "INSERT INTO usuario (nome, email, senha_hash, perfil) VALUES (?, ?, ?, 'RESPONSAVEL')",
        [nome, email, senhaHash]
      );
      const r = await tx.query('INSERT INTO responsavel (usuario_id, telefone, aceite_lgpd_em) VALUES (?, ?, NOW())', [
        u.insertId,
        telefone,
      ]);
      return { id: u.insertId, nome, email, perfil: 'RESPONSAVEL', responsavel_id: r.insertId, aceite_lgpd_em: new Date() };
    });

    auditar(res, {
      acao: 'CADASTRO_RESPONSAVEL',
      entidade: 'usuario',
      entidade_id: usuario.id,
      usuario_id: usuario.id,
      usuario_nome: nome,
      perfil: 'responsavel',
      detalhes: { aceite_lgpd: true },
    });
    res.status(201).json({ dados: { token: gerarToken(usuario), usuario: publico(usuario) } });
  })
);

router.post(
  '/login',
  limiteTentativas,
  validar(schemas.login),
  asyncHandler(async (req, res) => {
    const { email, senha } = req.body;
    const [usuario] = await db.query(`${SQL_USUARIO} WHERE u.email = ?`, [email]);

    // Ajuda no primeiro uso: o script SQL vem com um marcador no lugar do hash
    if (usuario && usuario.senha_hash.startsWith('$2a$10$TROCAR')) {
      throw new AppError(
        503,
        'SENHA_DEMO_NAO_CONFIGURADA',
        'As senhas de demonstração ainda não foram geradas. Rode "npm run db:senhas" no servidor.'
      );
    }

    // Compara sempre (com o hash fictício se o e-mail não existe): mesmo tempo de resposta
    const confere = await senhaConfere(senha, usuario ? usuario.senha_hash : HASH_FICTICIO);

    // Mesma mensagem para e-mail inexistente e senha errada (não revela quais e-mails existem)
    if (!usuario || !confere) {
      // Auditoria: só identifica a conta quando ela existe (o e-mail digitado não é guardado)
      auditar(res, {
        acao: 'LOGIN',
        entidade: 'sessao',
        resultado: 'FALHA',
        usuario_id: usuario?.id ?? null,
        usuario_nome: usuario?.nome ?? null,
        perfil: usuario ? perfilApi(usuario.perfil) : null,
        detalhes: { motivo: usuario ? 'senha incorreta' : 'conta inexistente' },
      });
      throw AppError.naoAutenticado('E-mail ou senha incorretos.');
    }
    if (!usuario.ativo) {
      auditar(res, {
        acao: 'LOGIN',
        entidade: 'sessao',
        resultado: 'NEGADO',
        usuario_id: usuario.id,
        usuario_nome: usuario.nome,
        perfil: perfilApi(usuario.perfil),
        detalhes: { motivo: 'conta desativada' },
      });
      throw new AppError(403, 'CONTA_DESATIVADA', 'Sua conta está desativada. Procure a coordenação da escola.');
    }

    await db.query('UPDATE usuario SET ultimo_login_em = NOW() WHERE id = ?', [usuario.id]);
    // Limpeza: marcas de "sair" de tokens que já expiraram não servem mais
    await db.query('DELETE FROM sessao_encerrada WHERE expira_em < NOW()');
    auditar(res, {
      acao: 'LOGIN',
      entidade: 'sessao',
      usuario_id: usuario.id,
      usuario_nome: usuario.nome,
      perfil: perfilApi(usuario.perfil),
      detalhes: null,
    });
    res.json({ dados: { token: gerarToken(usuario), usuario: publico(usuario) } });
  })
);

router.get(
  '/me',
  autenticar,
  asyncHandler(async (req, res) => {
    const [usuario] = await db.query(`${SQL_USUARIO} WHERE u.id = ?`, [req.usuario.id]);
    if (!usuario || !usuario.ativo) throw AppError.naoAutenticado('Usuário não encontrado. Faça login novamente.');
    res.json({ dados: publico(usuario) });
  })
);

// "Sair": o token deste aparelho entra na lista de encerrados até a data em que expiraria
router.post(
  '/sair',
  autenticar,
  asyncHandler(async (req, res) => {
    if (req.usuario.jti) {
      await db.query('INSERT INTO sessao_encerrada (jti, usuario_id, expira_em) VALUES (?, ?, ?)', [
        req.usuario.jti,
        req.usuario.id,
        req.usuario.expiraEm || new Date(Date.now() + 24 * 3600 * 1000),
      ]);
    }
    auditar(res, { acao: 'LOGOUT', entidade: 'sessao', entidade_id: req.usuario.id, detalhes: null });
    res.status(204).end();
  })
);

// "Encerrar todas as sessões" (ex.: esqueceu a conta aberta em outro computador)
router.post(
  '/sair-de-todos',
  autenticar,
  asyncHandler(async (req, res) => {
    await revogarSessoes(db, req.usuario.id);
    auditar(res, { acao: 'ENCERRAR_SESSOES', entidade: 'sessao', entidade_id: req.usuario.id, detalhes: null });
    res.status(204).end();
  })
);

async function usuarioDoToken(token) {
  const [u] = await db.query(
    `SELECT id, nome, email FROM usuario
      WHERE token_recuperacao = ? AND token_expira_em > NOW() AND ativo = TRUE`,
    [hashToken(token)]
  );
  if (!u) throw new AppError(410, 'LINK_EXPIRADO', 'Este link de redefinição é inválido, já foi usado ou expirou. Peça um novo à coordenação.');
  return u;
}

router.get(
  '/redefinir-senha/:token',
  limiteTentativas,
  asyncHandler(async (req, res) => {
    if (!/^[a-f0-9]{48}$/.test(req.params.token)) throw AppError.requisicaoInvalida('Link inválido ou incompleto.');
    const u = await usuarioDoToken(req.params.token);
    // Mostra só o primeiro nome e o e-mail parcialmente (o link pode ter sido repassado)
    const [usuarioEmail, dominio] = u.email.split('@');
    res.json({ dados: { nome: u.nome.split(' ')[0], email: `${usuarioEmail.slice(0, 2)}***@${dominio}` } });
  })
);

router.post(
  '/redefinir-senha',
  limiteTentativas,
  validar(schemas.redefinirSenha),
  asyncHandler(async (req, res) => {
    const u = await usuarioDoToken(req.body.token);
    const hash = await bcrypt.hash(req.body.senha, 10);
    // Uso único: o token é apagado junto com a troca da senha; sessões abertas são encerradas.
    // A troca e o registro de auditoria vão na mesma transação.
    await comAuditoria(
      req,
      res,
      (tx) =>
        tx.query(
          `UPDATE usuario SET senha_hash = ?, token_recuperacao = NULL, token_expira_em = NULL,
                  sessao_versao = sessao_versao + 1 WHERE id = ?`,
          [hash, u.id]
        ),
      { acao: 'REDEFINIR_SENHA', entidade: 'usuario', entidade_id: u.id, usuario_id: u.id, usuario_nome: u.nome, detalhes: null }
    );
    res.status(204).end();
  })
);

module.exports = router;
module.exports.hashToken = hashToken;
