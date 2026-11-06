// db/setup.js — instala o banco a partir do script da equipe (database/kfka_banco.sql).
//
//   npm run db:setup     -> APAGA e recria o banco "kfka" (kfka_banco.sql + kfka_expansao.sql + kfka_adequacao.sql:
//                           tabelas, triggers, views e dados) e grava a senha real dos usuários de demonstração
//   npm run db:senhas    -> só grava a senha dos usuários de demonstração
//
// A senha vem de SEED_SENHA no .env (ex.: Senha@123). O script SQL traz um
// marcador no lugar do hash bcrypt; este comando substitui pelo hash verdadeiro.
//
// Por que não rodar o .sql direto pelo Node? O comando DELIMITER (usado nos
// triggers) é do cliente MySQL (Workbench/terminal), não do servidor. Aqui o
// arquivo é dividido em comandos respeitando o DELIMITER, e cada um é enviado.
// Rodar o script pelo Workbench também funciona — depois use npm run db:senhas.

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const env = require('../config/env');
const { explicarErroBanco } = require('./explicarErro');

const PASTA_SQL = path.join(__dirname, '..', '..', 'database');
const ARQUIVO_SQL = path.join(PASTA_SQL, 'kfka_banco.sql');
// Expansão da plataforma (perfil, calendário, aulas, atividades, SAC, documentos...): roda depois
const ARQUIVO_EXPANSAO = path.join(PASTA_SQL, 'kfka_expansao.sql');
// Adequação aos requisitos (sessões revogáveis, auditoria imutável, índices dos relatórios): roda por último
const ARQUIVO_ADEQUACAO = path.join(PASTA_SQL, 'kfka_adequacao.sql');
const MARCADOR_SENHA = '$2a$10$TROCAR%';
// Mensagens de andamento só no terminal (npm run db:setup / db:senhas)
const mostrarProgresso = require.main === module;

// Remove comentário "-- ..." do fim da linha, ignorando "--" dentro de textos entre aspas
function removerComentario(linha) {
  let aspas = null;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (aspas) {
      if (c === aspas) aspas = null;
      continue;
    }
    if (c === "'" || c === '"') aspas = c;
    else if (c === '-' && linha[i + 1] === '-' && (i + 2 >= linha.length || /\s/.test(linha[i + 2]))) {
      return linha.slice(0, i);
    }
  }
  return linha;
}

// Divide o script em comandos, respeitando "DELIMITER $$" ... "DELIMITER ;"
function dividirScript(texto) {
  const comandos = [];
  let delimitador = ';';
  let atual = [];

  for (const original of texto.split(/\r?\n/)) {
    const linha = removerComentario(original);
    const t = linha.trim();
    if (!t) continue;

    const troca = t.match(/^DELIMITER\s+(\S+)$/i);
    if (troca) {
      delimitador = troca[1];
      continue;
    }

    atual.push(linha);
    if (t.endsWith(delimitador)) {
      const comando = atual.join('\n').trim().slice(0, -delimitador.length).trim();
      if (comando) comandos.push(comando);
      atual = [];
    }
  }
  const resto = atual.join('\n').trim();
  if (resto) comandos.push(resto);
  return comandos;
}

async function executarScript(arquivo = ARQUIVO_SQL, { texto } = {}) {
  const comandos = dividirScript(texto ?? fs.readFileSync(arquivo, 'utf8'));
  // Conecta SEM escolher banco: o próprio script faz DROP/CREATE/USE kfka
  if (env.DB.database !== 'kfka') {
    console.warn(`[KFKA] Atenção: o script cria o banco "kfka", mas o .env aponta para "${env.DB.database}". Use DB_NAME=kfka.`);
  }
  const conexao = await mysql.createConnection({
    host: env.DB.host,
    port: env.DB.port,
    user: env.DB.user,
    password: env.DB.password,
    ssl: env.DATABASE_SSL ? { rejectUnauthorized: false } : undefined,
    timezone: env.DB_TIMEZONE,
    connectTimeout: 10000,
  });
  const nome = arquivo ? path.basename(arquivo) : 'script';
  if (mostrarProgresso) console.log(`[KFKA] Executando ${nome} (${comandos.length} comandos)...`);
  try {
    await conexao.query(`SET time_zone = '${env.DB_TIMEZONE}'`);
    // Se outra conexão estiver segurando o banco (servidor "npm run dev" ou Workbench abertos),
    // o DROP/ALTER espera: em vez de travar para sempre, desiste em 20 s com mensagem clara.
    await conexao.query('SET SESSION lock_wait_timeout = 20');
    for (const [i, comando] of comandos.entries()) {
      try {
        await conexao.query(comando);
      } catch (err) {
        err.message = `Comando ${i + 1} de ${comandos.length} falhou: ${err.message}\n---\n${comando.slice(0, 300)}`;
        throw err;
      }
    }
  } finally {
    // conexão quebrada pode não responder ao end(): destroy() fecha na hora
    await Promise.race([conexao.end(), new Promise((ok) => setTimeout(ok, 3000))]).catch(() => {});
    conexao.destroy();
  }
  if (mostrarProgresso) console.log(`[KFKA]   ok: ${nome}`);
  return comandos.length;
}

async function definirSenhasDemo() {
  if (!env.SEED_SENHA) {
    console.warn('[KFKA] SEED_SENHA não definida no .env — senhas de demonstração não foram gravadas.');
    return 0;
  }
  const db = require('./index');
  if (mostrarProgresso) console.log('[KFKA] Gravando a senha dos usuários de demonstração...');
  const hash = await bcrypt.hash(env.SEED_SENHA, 10);
  const r = await db.query('UPDATE usuario SET senha_hash = ? WHERE senha_hash LIKE ?', [hash, MARCADOR_SENHA]);
  return r.affectedRows;
}

async function prepararBanco({ somenteSenhas = false } = {}) {
  let comandos = 0;
  if (!somenteSenhas) {
    comandos += await executarScript(ARQUIVO_SQL);
    comandos += await executarScript(ARQUIVO_EXPANSAO);
    comandos += await executarScript(ARQUIVO_ADEQUACAO);
  }
  const senhas = await definirSenhasDemo();
  return { comandos, senhas };
}

// Banco de uma versão anterior (sem as tabelas da expansão): aplica o kfka_expansao.sql.
// Não apaga nada. A estrutura (tabelas, colunas, datas dos bimestres) é obrigatória;
// a carga de demonstração é opcional — se os ids já estiverem ocupados, ela é ignorada.
const MARCA_CARGA = '-- >>> CARGA DE DEMONSTRAÇÃO';

async function aplicarExpansao() {
  const texto = fs.readFileSync(ARQUIVO_EXPANSAO, 'utf8');
  const [estrutura, carga] = texto.split(MARCA_CARGA);
  let n = await executarScript(null, { texto: estrutura });
  try {
    n += await executarScript(null, { texto: `USE kfka;\nSET @carga_inicial = 1;\n${carga}\nSET @carga_inicial = NULL;` });
  } catch (err) {
    console.warn(`[KFKA] Dados de demonstração da expansão não foram inseridos (${err.sqlMessage || err.message.split('\n')[0]}).`);
  }
  return n;
}

// Banco sem a adequação (sem a tabela auditoria): aplica o kfka_adequacao.sql. Não apaga nada.
const aplicarAdequacao = () => executarScript(ARQUIVO_ADEQUACAO);

module.exports = { prepararBanco, aplicarExpansao, aplicarAdequacao, dividirScript };

// Executado pelo terminal (npm run db:setup / db:senhas)
if (require.main === module) {
  const somenteSenhas = process.argv.includes('--somente-senhas');

  if (!somenteSenhas && env.isProducao && !process.argv.includes('--forcar')) {
    console.error('[KFKA] db:setup APAGA o banco. Em produção, rode: cd backend && node src/db/setup.js --forcar');
    process.exit(1);
  }

  prepararBanco({ somenteSenhas })
    .then(({ comandos, senhas }) => {
      if (comandos) console.log(`[KFKA] Script executado (${comandos} comandos).`);
      console.log(`[KFKA] Senha de demonstração gravada em ${senhas} usuário(s).`);
      return require('./index').pool.end();
    })
    .then(() => {
      console.log('[KFKA] Pronto! Agora rode: npm run dev');
      process.exit(0); // garante que o terminal é liberado
    })
    .catch((err) => {
      console.error('[KFKA] Falha ao preparar o banco:', explicarErroBanco(err));
      // Mostra para onde tentou conectar (sem a senha), para facilitar a conferência
      console.error(`        Tentou conectar em: ${env.DB.host}:${env.DB.port} (usuário ${env.DB.user}, via ${env.DB.origem})`);
      process.exit(1);
    });
}
