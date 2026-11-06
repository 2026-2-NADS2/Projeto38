// auth.js — autenticação (JWT) e autorização por perfil.
//
// O token sozinho não basta: a cada requisição o banco é consultado para saber se
//   - a conta continua ativa,
//   - a "versão da sessão" é a mesma do token (troca/redefinição de senha, desativação
//     ou "encerrar todas as sessões" incrementam usuario.sessao_versao),
//   - aquele token não foi encerrado pelo botão "Sair" (tabela sessao_encerrada),
//   - o perfil não mudou.
// Assim um token roubado ou de uma conta desativada para de funcionar na hora,
// e não só quando expirar (JWT_EXPIRES_IN). É uma consulta por chave primária.

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const db = require('../db');
const AppError = require('../utils/AppError');

// No banco o perfil é 'ADMIN' | 'PROFESSOR' | 'RESPONSAVEL'; na API usamos minúsculas.
const perfilApi = (perfilBanco) => String(perfilBanco).toLowerCase();

// O token guarda também o id de professor/responsável (diferente do id de usuário),
// para as rotas não precisarem consultar isso a cada requisição.
function gerarToken(usuario) {
  return jwt.sign(
    {
      sub: usuario.id,
      nome: usuario.nome,
      perfil: perfilApi(usuario.perfil),
      pid: usuario.professor_id ?? null,
      rid: usuario.responsavel_id ?? null,
      sv: Number(usuario.sessao_versao) || 0,
    },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN, jwtid: crypto.randomBytes(16).toString('hex') }
  );
}

const SESSAO_ENCERRADA = 'Sua sessão foi encerrada. Faça login novamente.';

// Rotas que o responsável ainda sem aceite LGPD pode usar (para ler os termos e aceitar)
const LIVRES_SEM_ACEITE = [/^\/api\/auth\//, /^\/api\/perfil\/?$/, /^\/api\/perfil\/aceite$/];

// Exige o cabeçalho  Authorization: Bearer <token>
async function autenticar(req, res, next) {
  const [tipo, token] = (req.headers.authorization || '').split(' ');
  if (tipo !== 'Bearer' || !token) return next(AppError.naoAutenticado());

  let dados;
  try {
    dados = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch (err) {
    const msg =
      err.name === 'TokenExpiredError' ? 'Sua sessão expirou. Faça login novamente.' : 'Token inválido. Faça login novamente.';
    return next(AppError.naoAutenticado(msg));
  }

  try {
    const [u] = await db.query(
      `SELECT u.ativo, u.perfil, u.sessao_versao, r.aceite_lgpd_em,
              (SELECT COUNT(*) FROM sessao_encerrada s WHERE s.jti = ?) AS encerrada
         FROM usuario u LEFT JOIN responsavel r ON r.usuario_id = u.id
        WHERE u.id = ?`,
      [String(dados.jti || ''), Number(dados.sub)]
    );
    if (
      !u ||
      !u.ativo ||
      Number(u.encerrada) > 0 ||
      Number(u.sessao_versao) !== Number(dados.sv ?? 0) ||
      perfilApi(u.perfil) !== dados.perfil
    ) {
      return next(AppError.naoAutenticado(SESSAO_ENCERRADA));
    }

    req.usuario = {
      id: Number(dados.sub),
      nome: dados.nome,
      perfil: dados.perfil,
      professorId: dados.pid ?? null,
      responsavelId: dados.rid ?? null,
      jti: dados.jti || null,
      expiraEm: dados.exp ? new Date(dados.exp * 1000) : null,
      aceitePendente: dados.perfil === 'responsavel' && !u.aceite_lgpd_em,
    };

    // LGPD: conta de responsável criada pela coordenação só acessa dados dos alunos
    // depois que a própria pessoa aceita o termo de uso dos dados (RNF03)
    const caminho = req.originalUrl.split('?')[0].replace(/\/+$/, '') || '/';
    if (req.usuario.aceitePendente && !LIVRES_SEM_ACEITE.some((r) => r.test(caminho))) {
      return next(
        new AppError(403, 'ACEITE_PENDENTE', 'Antes de continuar, leia e aceite o termo de uso dos dados (LGPD).')
      );
    }
    return next();
  } catch (err) {
    return next(err);
  }
}

// Uso: autorizar('admin', 'professor')
function autorizar(...perfisPermitidos) {
  return (req, res, next) => {
    if (!req.usuario || !perfisPermitidos.includes(req.usuario.perfil)) {
      return next(AppError.semPermissao());
    }
    return next();
  };
}

// Invalida todos os tokens já emitidos para o usuário (dentro ou fora de transação)
async function revogarSessoes(executor, usuarioId) {
  await executor.query('UPDATE usuario SET sessao_versao = sessao_versao + 1 WHERE id = ?', [usuarioId]);
}

module.exports = { gerarToken, autenticar, autorizar, perfilApi, revogarSessoes };
