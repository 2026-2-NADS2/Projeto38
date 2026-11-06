// tests/limite.test.js — limite de tentativas de login (RNF02). Arquivo separado: o contador
// do limitador fica na memória do processo, e cada arquivo de teste roda em um processo próprio.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

if (process.env.NODE_ENV !== 'test') {
  console.error('Rode os testes com NODE_ENV=test (o banco kfka é apagado e recriado).');
  process.exit(1);
}
process.env.SEED_SENHA = process.env.SEED_SENHA || 'Senha@123';

const app = require('../src/app');
const db = require('../src/db');
const { prepararBanco } = require('../src/db/setup');

let servidor;
let base;

before(async () => {
  await prepararBanco();
  servidor = app.listen(0);
  await new Promise((ok) => servidor.once('listening', ok));
  base = `http://127.0.0.1:${servidor.address().port}`;
});

after(async () => {
  servidor?.close();
  await db.pool.end();
});

const login = (senha) =>
  fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@kfka.edu.br', senha }),
  });

test('T-20 RNF02: depois de 20 tentativas em 15 minutos o login responde 429, mesmo com a senha certa', async () => {
  for (let i = 0; i < 20; i++) assert.equal((await login(`Errada${i}x`)).status, 401);
  const bloqueado = await login(process.env.SEED_SENHA);
  assert.equal(bloqueado.status, 429);
  assert.equal((await bloqueado.json()).erro.codigo, 'MUITAS_TENTATIVAS');
  // Cadastro e redefinição de senha usam o mesmo limitador
  const cadastro = await fetch(`${base}/api/auth/cadastro`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nome: 'Teste', email: 'novo@email.com', senha: 'Senha@123', aceite_lgpd: true }),
  });
  assert.equal(cadastro.status, 429);
});
