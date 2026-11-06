// explicarErro.js — transforma erros de conexão do MySQL em mensagens claras.
// (No Node 20+, "conexão recusada" chega como AggregateError com a mensagem vazia.)

function explicarErroBanco(err) {
  const codigo = err.code || err.errors?.[0]?.code || '';
  const detalhe = err.message || err.errors?.map((e) => e.message).join('; ') || codigo || String(err);
  const dicas = {
    ECONNREFUSED: 'O MySQL recusou a conexão: confira se o MySQL está ligado (Workbench/XAMPP/serviço do Windows) e se DB_HOST/DB_PORT no .env estão certos (com o Railway, use a MYSQL_PUBLIC_URL).',
    ENOTFOUND: 'Endereço do banco não encontrado: confira DB_HOST (ou o host da DATABASE_URL) no .env.',
    ETIMEDOUT: 'O banco não respondeu a tempo: confira DB_HOST/DB_PORT no .env e sua conexão com a internet.',
    ER_ACCESS_DENIED_ERROR: 'Usuário ou senha do MySQL incorretos: confira DB_USER e DB_PASSWORD no .env (a mesma senha que você usa no Workbench).',
    ER_BAD_DB_ERROR: 'O banco "kfka" ainda não existe. Rode: npm run db:setup',
    ER_LOCK_WAIT_TIMEOUT: 'O banco está em uso por outro programa. Pare o servidor (Ctrl+C no terminal do npm run dev), feche as abas do banco kfka no Workbench e rode de novo.',
    HANDSHAKE_SSL_ERROR: 'O provedor exige SSL: coloque DATABASE_SSL=true no .env.',
  };
  return `${detalhe}${codigo && !detalhe.includes(codigo) ? ` (${codigo})` : ''}${dicas[codigo] ? `\n        → ${dicas[codigo]}` : ''}`;
}

module.exports = { explicarErroBanco };
