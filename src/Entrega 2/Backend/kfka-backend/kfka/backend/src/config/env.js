// env.js — lê e valida as variáveis de ambiente em um único lugar.
// Nenhuma credencial fica escrita no código: tudo vem do arquivo .env
// (local) ou das "Environment Variables" do serviço de hospedagem.
//
// Conexão com o MySQL — DUAS formas aceitas (use UMA delas no .env):
//
//   1) Variáveis separadas (padrão da Aula 12 — recomendado no computador):
//        DB_HOST=localhost
//        DB_PORT=3306
//        DB_USER=root
//        DB_PASSWORD=sua_senha
//        DB_NAME=kfka
//
//   2) URL única (prático no Railway/Render):
//        DATABASE_URL=mysql://root:senha@host:3306/kfka
//
// Se as duas existirem, DATABASE_URL tem prioridade.

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Procura o .env na pasta backend/ (backend/.env) e, se não achar, na raiz do
// projeto (kfka/.env, versão anterior), independente da pasta onde o comando rodou.
const RAIZ = path.join(__dirname, '..', '..'); // pasta backend/
const candidatos = [path.join(RAIZ, '.env'), path.join(RAIZ, '..', '.env'), path.join(process.cwd(), '.env')];
const arquivoEnv = candidatos.find((c) => fs.existsSync(c));
if (arquivoEnv) dotenv.config({ path: arquivoEnv });

const NODE_ENV = process.env.NODE_ENV || 'development';

function falhar(mensagem) {
  console.error(`\n[KFKA] ${mensagem}\n`);
  process.exit(1);
}

// Monta { host, port, user, password, database } a partir de DATABASE_URL
// ou das variáveis DB_*. Retorna null se nada foi configurado.
function lerConfigBanco() {
  const url = (process.env.DATABASE_URL || '').trim();

  if (url) {
    if (!/^mysql:\/\//.test(url)) {
      falhar('DATABASE_URL deve começar com mysql://  (ex.: mysql://root:senha@localhost:3306/kfka)');
    }
    let u;
    try {
      // Senha com @ ou # sem codificar "quebra" a URL sem dar erro (o host vira parte da senha)
      if ((url.match(/@/g) || []).length > 1 || url.includes('#')) throw new Error('caractere especial');
      u = new URL(url);
    } catch {
      falhar(
        'DATABASE_URL inválida. Se a senha tiver caracteres especiais (@ # / : ?), codifique-os\n' +
          '        (ex.: @ vira %40) — ou use as variáveis DB_HOST, DB_USER, DB_PASSWORD... no lugar da URL.'
      );
    }
    return {
      origem: 'DATABASE_URL',
      host: u.hostname,
      port: Number(u.port) || 3306,
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      database: decodeURIComponent(u.pathname.replace(/^\//, '')) || 'kfka',
    };
  }

  if (process.env.DB_USER || process.env.DB_HOST || process.env.DB_NAME) {
    return {
      origem: 'DB_*',
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'kfka',
    };
  }

  return null;
}

const DB = lerConfigBanco();

const env = {
  NODE_ENV,
  isProducao: NODE_ENV === 'production',
  ARQUIVO_ENV: arquivoEnv || null,
  PORT: Number(process.env.PORT) || 3000,
  DB, // { origem, host, port, user, password, database }
  DATABASE_SSL: process.env.DATABASE_SSL === 'true',
  // Fuso usado pelo MySQL (NOW() dos triggers) e na leitura das datas.
  // Brasília = -03:00 (sem horário de verão desde 2019).
  DB_TIMEZONE: process.env.DB_TIMEZONE || '-03:00',
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '8h',
  ANO_LETIVO: Number(process.env.ANO_LETIVO) || new Date().getFullYear(),
  CORS_ORIGIN: (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  SEED_SENHA: process.env.SEED_SENHA,
};

// Falha logo na inicialização se algo essencial estiver faltando —
// é melhor do que descobrir o erro só quando alguém tentar fazer login.
if (!arquivoEnv && !process.env.JWT_SECRET && !DB) {
  falhar(
    'Arquivo .env não encontrado.\n' +
      `        Copie .env.example para .env na pasta ${RAIZ} e preencha os dados do seu MySQL.`
  );
}

if (!DB) {
  falhar(
    'Conexão com o banco não configurada no .env.\n' +
      '        Preencha DB_HOST, DB_PORT, DB_USER, DB_PASSWORD e DB_NAME (ou DATABASE_URL).'
  );
}

if (!env.JWT_SECRET) {
  falhar('JWT_SECRET não definida no .env.');
}

if (!/^[+-]\d{2}:\d{2}$/.test(env.DB_TIMEZONE)) {
  falhar('DB_TIMEZONE deve estar no formato +HH:MM ou -HH:MM (ex.: -03:00).');
}

if (env.isProducao && env.JWT_SECRET.length < 32) {
  falhar('Em produção, JWT_SECRET deve ter pelo menos 32 caracteres.');
}

module.exports = env;
