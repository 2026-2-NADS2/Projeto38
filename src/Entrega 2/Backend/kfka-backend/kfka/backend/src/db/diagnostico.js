// db/diagnostico.js — confere, passo a passo, tudo de que o login depende.
//
//   npm run db:diagnostico
//
// Não altera nada no banco: só lê e mostra o que está faltando e como resolver.

const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const env = require('../config/env');
const { explicarErroBanco } = require('./explicarErro');

const OK = '  [ok]  ';
const ERRO = '  [ERRO]';
const AVISO = '  [!]   ';

// O que o login e a sessão leem do banco (auth.routes.js e middlewares/auth.js)
const TABELAS = {
  usuario: 'kfka_banco.sql',
  professor: 'kfka_banco.sql',
  responsavel: 'kfka_banco.sql',
  evento: 'kfka_expansao.sql',
  sessao_encerrada: 'kfka_adequacao.sql',
  auditoria: 'kfka_adequacao.sql',
};
const COLUNAS_USUARIO = {
  ativo: 'kfka_banco.sql',
  ultimo_login_em: 'kfka_banco.sql',
  token_recuperacao: 'kfka_banco.sql',
  foto: 'kfka_expansao.sql',
  sessao_versao: 'kfka_adequacao.sql',
};

const DEMO = [
  'admin@kfka.edu.br',
  'carlos.menezes@kfka.edu.br',
  'fernanda.lopes@kfka.edu.br',
  'ricardo.tanaka@kfka.edu.br',
  'ana.ribeiro@email.com',
  'luciana.andrade@email.com',
  'marcos.oliveira@email.com',
];

async function diagnosticar() {
  const problemas = [];
  console.log('\n=== KFKA — diagnóstico do login ===\n');

  // 1. .env
  console.log('1) Arquivo .env');
  console.log(`${OK} ${env.ARQUIVO_ENV || '(variáveis vindas do sistema, sem arquivo .env)'}`);
  console.log(`${OK} banco: ${env.DB.user}@${env.DB.host}:${env.DB.port}/${env.DB.database} (via ${env.DB.origem})`);
  if (!env.SEED_SENHA) {
    console.log(`${AVISO} SEED_SENHA não definida: as senhas de demonstração não podem ser conferidas.`);
  }

  // 2. Conexão
  console.log('\n2) Conexão com o MySQL');
  let conexao;
  try {
    conexao = await mysql.createConnection({
      host: env.DB.host,
      port: env.DB.port,
      user: env.DB.user,
      password: env.DB.password,
      ssl: env.DATABASE_SSL ? { rejectUnauthorized: false } : undefined,
    });
    console.log(`${OK} conectou`);
  } catch (err) {
    console.log(`${ERRO} ${explicarErroBanco(err)}`);
    console.log('\nResolva a conexão primeiro (MySQL ligado? DB_USER/DB_PASSWORD iguais aos do Workbench?).\n');
    return 1;
  }

  try {
    const [[banco]] = await conexao.query('SELECT COUNT(*) AS n FROM information_schema.schemata WHERE schema_name = ?', [
      env.DB.database,
    ]);
    if (!banco.n) {
      console.log(`${ERRO} o banco "${env.DB.database}" não existe`);
      console.log('\n→ Rode:  npm run db:setup\n');
      return 1;
    }
    console.log(`${OK} banco "${env.DB.database}" existe`);

    // 3. Estrutura
    console.log('\n3) Tabelas e colunas usadas pelo login');
    const [tabelas] = await conexao.query('SELECT table_name AS t FROM information_schema.tables WHERE table_schema = ?', [
      env.DB.database,
    ]);
    const existentes = new Set(tabelas.map((r) => String(r.t).toLowerCase()));
    for (const [t, script] of Object.entries(TABELAS)) {
      if (existentes.has(t)) console.log(`${OK} tabela ${t}`);
      else {
        console.log(`${ERRO} falta a tabela ${t} (vem do ${script})`);
        problemas.push('estrutura');
      }
    }
    if (existentes.has('usuario')) {
      const [cols] = await conexao.query(
        "SELECT column_name AS c FROM information_schema.columns WHERE table_schema = ? AND table_name = 'usuario'",
        [env.DB.database]
      );
      const temCol = new Set(cols.map((r) => String(r.c).toLowerCase()));
      for (const [c, script] of Object.entries(COLUNAS_USUARIO)) {
        if (temCol.has(c)) console.log(`${OK} coluna usuario.${c}`);
        else {
          console.log(`${ERRO} falta a coluna usuario.${c} (vem do ${script})`);
          problemas.push('estrutura');
        }
      }
    }

    // 4. Usuários e senhas
    if (existentes.has('usuario')) {
      console.log('\n4) Usuários de demonstração');
      const [usuarios] = await conexao.query(
        `SELECT email, perfil, ativo, senha_hash FROM \`${env.DB.database}\`.usuario WHERE email IN (?)`,
        [DEMO]
      );
      const porEmail = new Map(usuarios.map((u) => [u.email, u]));
      for (const email of DEMO) {
        const u = porEmail.get(email);
        if (!u) {
          console.log(`${AVISO} ${email}: não existe no banco`);
          continue;
        }
        let situacao;
        if (u.senha_hash.startsWith('$2a$10$TROCAR')) {
          situacao = `${ERRO} senha ainda não gerada`;
          problemas.push('senhas');
        } else if (!u.ativo) {
          situacao = `${ERRO} conta DESATIVADA`;
          problemas.push('inativo');
        } else if (env.SEED_SENHA) {
          let confere = false;
          try {
            confere = await bcrypt.compare(env.SEED_SENHA, u.senha_hash);
          } catch {
            /* hash malformado */
          }
          if (confere) situacao = `${OK} entra com a senha "${env.SEED_SENHA}"`;
          else {
            situacao = `${ERRO} a senha NÃO é "${env.SEED_SENHA}" (SEED_SENHA mudou ou a senha foi trocada)`;
            problemas.push('senha-diferente');
          }
        } else situacao = `${AVISO} senha não conferida (sem SEED_SENHA)`;
        console.log(`${situacao}  — ${email} (${String(u.perfil).toLowerCase()})`);
      }
    }
  } finally {
    await conexao.end();
  }

  // 5. Conclusão
  console.log('\n=== Resultado ===');
  if (!problemas.length) {
    console.log('Banco OK para o login. Se ainda não entrar:');
    console.log('  - reinicie o servidor (Ctrl+C e npm run dev) e confira a mensagem no terminal;');
    console.log('  - abra http://localhost:5173 (Vite) com o npm run dev:web rodando em outro terminal;');
    console.log('  - mais de 20 tentativas em 15 min bloqueiam o login: reinicie o servidor para liberar.\n');
    return 0;
  }
  if (problemas.includes('estrutura')) {
    console.log('→ O banco está desatualizado em relação ao código. Escolha UMA opção:');
    console.log('    a) npm run db:setup   (recria tudo do zero com os 3 scripts e grava as senhas) — recomendado');
    console.log('    b) reinicie o servidor (npm run dev): ele aplica sozinho o que falta, sem apagar dados');
    console.log('  Pelo Workbench: rode, nesta ordem, kfka_banco.sql, kfka_expansao.sql, kfka_adequacao.sql e depois npm run db:senhas.');
  }
  if (problemas.includes('senhas') || problemas.includes('senha-diferente')) {
    console.log('→ Grave as senhas de demonstração:  npm run db:senhas');
  }
  if (problemas.includes('inativo')) {
    console.log(`→ Reative a conta: UPDATE ${env.DB.database}.usuario SET ativo = TRUE WHERE email = '...';`);
  }
  console.log('');
  return 1;
}

diagnosticar()
  .then((codigo) => process.exit(codigo))
  .catch((err) => {
    console.error('[KFKA] Falha no diagnóstico:', explicarErroBanco(err));
    process.exit(1);
  });
