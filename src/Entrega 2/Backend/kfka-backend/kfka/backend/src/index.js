// index.js — ponto de entrada: confere o banco e inicia o servidor.
//
// Banco vazio (primeira vez, ex.: Railway): cria tudo sozinho com os scripts da pasta database/.
// Banco de versão anterior: aplica só o que falta (kfka_expansao.sql / kfka_adequacao.sql), sem apagar dados.
// Banco que já tem dados nunca é apagado. Para recriar do zero no computador: npm run db:setup

const env = require('./config/env');
const app = require('./app');
const db = require('./db');
const { explicarErroBanco } = require('./db/explicarErro');
const { prepararBanco, aplicarExpansao, aplicarAdequacao } = require('./db/setup');

const tabelaExiste = async (nome) =>
  (await db.query('SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?', [nome]))[0]
    .n > 0;

async function conferirBanco() {
  try {
    await db.query('SELECT COUNT(*) AS n FROM usuario');
  } catch (err) {
    if (err.errno === 1146 || err.errno === 1049) {
      // Banco ainda não existe (ou está vazio): cria a partir dos scripts da equipe
      console.log('[KFKA] Banco "kfka" vazio: criando tabelas...');
      try {
        const { comandos, senhas } = await prepararBanco();
        console.log(`[KFKA] Banco criado (${comandos} comandos); senha de demonstração gravada em ${senhas} usuário(s).`);
        return;
      } catch (erroSetup) {
        console.error('\n[KFKA] Não foi possível criar o banco:', explicarErroBanco(erroSetup));
        console.error('        Rode manualmente:  npm run db:setup\n');
        process.exit(1);
      }
    } else {
      console.error('\n[KFKA] Não foi possível conectar ao MySQL:', explicarErroBanco(err));
      console.error(`        Tentou conectar em: ${env.DB.host}:${env.DB.port} (usuário ${env.DB.user}, banco ${env.DB.database}, via ${env.DB.origem})`);
      console.error('        Confira os dados do banco no .env (DB_HOST, DB_USER, DB_PASSWORD...) e se o MySQL está rodando.\n');
    }
    process.exit(1);
  }

  // Banco criado por uma versão anterior do projeto: acrescenta os módulos novos
  if (!(await tabelaExiste('evento'))) {
    console.log('[KFKA] Atualizando o banco com os módulos novos (kfka_expansao.sql)...');
    try {
      const n = await aplicarExpansao();
      console.log(`[KFKA] Banco atualizado (${n} comandos).`);
    } catch (erroExp) {
      console.error('\n[KFKA] Falha ao atualizar o banco:', explicarErroBanco(erroExp));
      console.error('        Para recriar do zero (apaga os dados): npm run db:setup\n');
      process.exit(1);
    }
  }

  // Sessões revogáveis, auditoria e índices dos relatórios (kfka_adequacao.sql)
  if (!(await tabelaExiste('auditoria'))) {
    console.log('[KFKA] Atualizando o banco (kfka_adequacao.sql: sessões, auditoria, índices)...');
    try {
      const n = await aplicarAdequacao();
      console.log(`[KFKA] Banco atualizado (${n} comandos).`);
    } catch (erroAdq) {
      console.error('\n[KFKA] Falha ao atualizar o banco:', explicarErroBanco(erroAdq));
      process.exit(1);
    }
  }

  // O login lê estas colunas/tabelas: se faltar alguma, o banco ficou pela metade
  // (script rodado só em parte no Workbench). Melhor avisar agora do que dar "erro inesperado" no login.
  const [{ n: colunas }] = await db.query(
    `SELECT COUNT(*) AS n FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = 'usuario' AND column_name IN ('foto', 'sessao_versao')`
  );
  if (Number(colunas) < 2 || !(await tabelaExiste('sessao_encerrada'))) {
    console.error('\n[KFKA] O banco está incompleto (faltam colunas/tabelas usadas pelo login).');
    console.error('        Veja o que falta:  npm run db:diagnostico');
    console.error('        Para recriar do zero (apaga os dados):  npm run db:setup\n');
    process.exit(1);
  }

  const [pendentes] = await db.query("SELECT COUNT(*) AS n FROM usuario WHERE senha_hash LIKE '$2a$10$TROCAR%'");
  if (Number(pendentes.n) > 0) {
    console.warn(`[KFKA] ${pendentes.n} usuário(s) de demonstração ainda sem senha. Rode:  npm run db:senhas`);
  }
}

async function iniciar() {
  await conferirBanco();

  const servidor = app.listen(env.PORT, () => {
    console.log(`[KFKA] Servidor rodando em http://localhost:${env.PORT} (${env.NODE_ENV})`);
  });

  // Encerramento limpo (Render/Railway/Docker enviam SIGTERM ao reiniciar)
  const encerrar = () => {
    servidor.close(() => db.pool.end().then(() => process.exit(0)));
  };
  process.on('SIGTERM', encerrar);
  process.on('SIGINT', encerrar);
}

iniciar();
