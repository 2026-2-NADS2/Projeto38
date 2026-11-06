// auditoria.js — trilha de auditoria geral (tabela auditoria, imutável por trigger).
//
// Como funciona:
//   - o middleware registrarAuditoria (montado em app.js) observa o fim de cada requisição;
//   - toda alteração (POST/PUT/PATCH/DELETE) bem-sucedida gera um registro: quem, quando,
//     ação, entidade, id e os NOMES dos campos enviados (nunca os valores do formulário);
//   - acessos negados (401/403) de quem está logado também são registrados;
//   - a rota pode detalhar o registro com auditar(res, { acao, entidade, entidade_id, detalhes }),
//     por exemplo com valores anterior/novo de campos não sensíveis, ou marcar uma leitura
//     sensível (exportação, PDF, "meus dados") — leituras só são registradas assim.
//
// Nada de senha, hash, token, foto ou texto pedagógico: a função limpar() remove essas chaves.
//
// Ações administrativas importantes gravam o registro JUNTO com a operação:
//   await auditarNaTransacao(tx, req, res, {...})  -> mesma transação: ou grava os dois, ou nenhum
//   await auditarAntes(req, res, {...})            -> leituras sensíveis (exportação, PDF, meus dados):
//                                                    o arquivo só é enviado depois que o registro foi gravado

const db = require('../db');

const SENSIVEL = /senha|hash|token|jti|foto|secret|authorization/i;
const METODOS_ALTERACAO = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Remove chaves sensíveis (em qualquer nível) e corta textos longos
function limpar(valor, nivel = 0) {
  if (valor === null || valor === undefined) return null;
  if (Array.isArray(valor)) return valor.slice(0, 50).map((v) => limpar(v, nivel + 1));
  if (typeof valor === 'object') {
    if (valor instanceof Date) return valor.toISOString();
    if (nivel > 3) return '[...]';
    const saida = {};
    for (const [k, v] of Object.entries(valor)) {
      if (!SENSIVEL.test(k)) saida[k] = limpar(v, nivel + 1);
    }
    return saida;
  }
  if (typeof valor === 'string' && valor.length > 200) return `${valor.slice(0, 200)}…`;
  return valor;
}

// Diferença entre dois objetos: { campo: { de, para } } só do que mudou
function diferenca(antes = {}, depois = {}, campos = Object.keys(depois)) {
  const saida = {};
  for (const c of campos) {
    const a = antes?.[c] ?? null;
    const d = depois?.[c] ?? null;
    if (String(a) !== String(d)) saida[c] = { de: a, para: d };
  }
  return saida;
}

// A rota descreve melhor o que fez (sobrescreve o padrão do middleware)
function auditar(res, info) {
  res.locals.auditoria = { ...(res.locals.auditoria || {}), ...info };
}

async function gravar(registro, executor = db) {
  await executor.query(
    `INSERT INTO auditoria (usuario_id, usuario_nome, perfil, acao, entidade, entidade_id, resultado, detalhes, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      registro.usuario_id ?? null,
      registro.usuario_nome ? String(registro.usuario_nome).slice(0, 120) : null,
      registro.perfil ?? null,
      String(registro.acao).slice(0, 60),
      String(registro.entidade).slice(0, 60),
      registro.entidade_id === undefined || registro.entidade_id === null ? null : String(registro.entidade_id).slice(0, 40),
      registro.resultado || 'SUCESSO',
      registro.detalhes ? JSON.stringify(limpar(registro.detalhes)) : null,
      registro.ip ? String(registro.ip).slice(0, 45) : null,
    ]
  );
}

// Monta o registro a partir da requisição (quem, de onde) e do que a rota informou
function montarRegistro(req, info) {
  return {
    usuario_id: info.usuario_id ?? req.usuario?.id ?? null,
    usuario_nome: info.usuario_nome ?? req.usuario?.nome ?? null,
    perfil: info.perfil ?? req.usuario?.perfil ?? null,
    acao: info.acao,
    entidade: info.entidade,
    entidade_id: info.entidade_id ?? null,
    resultado: info.resultado || 'SUCESSO',
    detalhes: info.detalhes ?? null,
    ip: req.ip,
  };
}

// Grava dentro da transação da operação (rollback da operação desfaz também o registro)
async function auditarNaTransacao(tx, req, res, info) {
  await gravar(montarRegistro(req, info), tx);
  res.locals.auditoria = { ignorar: true }; // o middleware não grava de novo
}

// Grava antes de responder; se falhar, a rota não entrega o dado (o erro segue para o tratador)
async function auditarAntes(req, res, info) {
  await gravar(montarRegistro(req, info));
  res.locals.auditoria = { ignorar: true };
}

// Executa a operação e grava a auditoria na MESMA transação:
//   const r = await comAuditoria(req, res, (tx) => tx.query('INSERT ...'), (r) => ({ acao, entidade, entidade_id: r.insertId }));
// "info" pode ser objeto ou função do resultado; devolver null em info = não auditar (ex.: nada mudou).
async function comAuditoria(req, res, operacao, info) {
  return db.transacao(req.usuario?.id ?? null, async (tx) => {
    const resultado = await operacao(tx);
    const registro = typeof info === 'function' ? info(resultado) : info;
    if (registro) await auditarNaTransacao(tx, req, res, registro);
    return resultado;
  });
}

const ouvintes = new Set(); // ex.: cache de pendências, que se invalida após qualquer alteração
const aoAlterar = (fn) => ouvintes.add(fn);

function registrarAuditoria(req, res, next) {
  res.on('finish', () => {
    const info = res.locals.auditoria;
    const alteracao = METODOS_ALTERACAO.has(req.method);
    const status = res.statusCode;

    if (alteracao && status < 400) ouvintes.forEach((fn) => fn());

    let resultado;
    if (status < 400) resultado = 'SUCESSO';
    else if (status === 401 || status === 403) resultado = 'NEGADO';
    else resultado = 'FALHA';

    // O que registrar: alterações bem-sucedidas, negações de quem está logado
    // e tudo o que a rota marcou explicitamente (ex.: login com falha, exportação)
    const registrar =
      Boolean(info) || (alteracao && resultado === 'SUCESSO') || (resultado === 'NEGADO' && Boolean(req.usuario));
    if (!registrar) return;
    if (info?.ignorar) return;

    // Quando a rota termina em erro, o Express já saiu do router: usa a URL original
    const url = req.originalUrl.split('?')[0].replace(/\/+$/, '');
    const caminho = req.route ? `${req.baseUrl}${req.route.path}`.replace(/\/+$/, '') : url;
    const partes = url.replace(/^\/api\//, '').split('/');
    const entidadePadrao = partes[0] || 'api';
    const idDaUrl = /^\d+$/.test(partes[1] || '') ? partes[1] : null;
    const campos = req.body && typeof req.body === 'object' ? Object.keys(req.body).filter((k) => !SENSIVEL.test(k)) : [];

    gravar({
      usuario_id: info?.usuario_id ?? req.usuario?.id ?? null,
      usuario_nome: info?.usuario_nome ?? req.usuario?.nome ?? null,
      perfil: info?.perfil ?? req.usuario?.perfil ?? null,
      acao: info?.acao || `${req.method} ${caminho}`,
      entidade: info?.entidade || entidadePadrao,
      entidade_id: info?.entidade_id ?? req.params?.id ?? idDaUrl,
      resultado: info?.resultado || resultado,
      detalhes: info?.detalhes ?? (campos.length ? { campos } : null),
      ip: req.ip,
    }).catch((err) => console.error('[KFKA] Falha ao gravar auditoria:', err.message));
  });
  next();
}

module.exports = { registrarAuditoria, auditar, auditarNaTransacao, auditarAntes, comAuditoria, diferenca, limpar, gravar, aoAlterar };
