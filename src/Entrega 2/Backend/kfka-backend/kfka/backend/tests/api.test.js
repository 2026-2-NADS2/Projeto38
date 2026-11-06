// tests/api.test.js — testes de integração da API (node:test, nativo do Node).
//
// ATENÇÃO: os testes rodam "npm run db:setup", que APAGA e recria o banco kfka.
// Use um MySQL de desenvolvimento (ex.: docker compose up -d):
//   NODE_ENV=test npm test
//
// Os dados usados aqui são os da carga do kfka_banco.sql (Lucas, Gabriel, Prof. Carlos...).
// A data de hoje precisa estar dentro do período de digitação do 4º bimestre (01/11 a 15/12/2026);
// fora dele, ajuste as datas da tabela bimestre no script.

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

const SENHA = process.env.SEED_SENHA;
let servidor;
let base;
const tk = {};

async function api(metodo, rota, { token, corpo } = {}) {
  const resp = await fetch(base + rota, {
    method: metodo,
    headers: {
      ...(corpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: corpo === undefined ? undefined : typeof corpo === 'string' ? corpo : JSON.stringify(corpo),
  });
  const texto = await resp.text();
  return { status: resp.status, corpo: texto ? JSON.parse(texto) : null };
}

async function logar(email) {
  const r = await api('POST', '/api/auth/login', { corpo: { email, senha: SENHA } });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  return r.corpo.dados.token;
}

before(async () => {
  await prepararBanco();
  servidor = app.listen(0);
  await new Promise((ok) => servidor.once('listening', ok));
  base = `http://127.0.0.1:${servidor.address().port}`;
  tk.admin = await logar('admin@kfka.edu.br');
  tk.carlos = await logar('carlos.menezes@kfka.edu.br'); // Língua Portuguesa e História
  tk.fernanda = await logar('fernanda.lopes@kfka.edu.br'); // Matemática
  tk.ana = await logar('ana.ribeiro@email.com'); // mãe de Lucas e Beatriz
  tk.luciana = await logar('luciana.andrade@email.com'); // mãe de Gabriel, tia de Laura
});

after(async () => {
  servidor?.close();
  await db.pool.end();
});

// ---------------------------------------------------------------------------
test('saúde e rota inexistente', async () => {
  assert.equal((await api('GET', '/api/saude')).status, 200);
  const r = await api('GET', '/api/nao-existe');
  assert.equal(r.status, 404);
  assert.equal(r.corpo.erro.codigo, 'ROTA_NAO_ENCONTRADA');
});

test('login: senha errada, dados inválidos e JSON malformado', async () => {
  const errada = await api('POST', '/api/auth/login', { corpo: { email: 'admin@kfka.edu.br', senha: 'xxx' } });
  assert.equal(errada.status, 401);
  const invalida = await api('POST', '/api/auth/login', { corpo: { email: 'nao-e-email' } });
  assert.equal(invalida.status, 422);
  assert.ok(invalida.corpo.erro.detalhes.some((d) => d.campo === 'senha'));
  assert.equal((await api('POST', '/api/auth/login', { corpo: '{"email": ' })).status, 400);
});

test('cadastro: exige aceite LGPD, cria usuario + responsavel, recusa e-mail repetido', async () => {
  const semAceite = await api('POST', '/api/auth/cadastro', {
    corpo: { nome: 'Teste Silva', email: 'teste@email.com', senha: 'senha1234' },
  });
  assert.equal(semAceite.status, 422);
  assert.ok(semAceite.corpo.erro.detalhes.some((d) => d.campo === 'aceite_lgpd'));

  const novo = { nome: 'Teste Silva', email: 'Teste@Email.com', senha: 'senha1234', telefone: '(11) 98888-0000', aceite_lgpd: true };
  const r = await api('POST', '/api/auth/cadastro', { corpo: novo });
  assert.equal(r.status, 201, JSON.stringify(r.corpo));
  assert.equal(r.corpo.dados.usuario.perfil, 'responsavel');

  const [resp] = await db.query(
    'SELECT r.telefone, r.aceite_lgpd_em FROM responsavel r JOIN usuario u ON u.id = r.usuario_id WHERE u.email = ?',
    ['teste@email.com']
  );
  assert.equal(resp.telefone, '(11) 98888-0000');
  assert.ok(resp.aceite_lgpd_em);

  assert.equal((await api('POST', '/api/auth/cadastro', { corpo: novo })).status, 409);

  // Conta nova sem filhos vinculados: lista vazia, não erro
  const vazia = await api('GET', '/api/boletim', { token: r.corpo.dados.token });
  assert.deepEqual(vazia.corpo.dados, []);
});

test('rotas protegidas exigem token', async () => {
  assert.equal((await api('GET', '/api/alunos')).status, 401);
  assert.equal((await api('GET', '/api/alunos', { token: 'x.y.z' })).status, 401);
  const me = await api('GET', '/api/auth/me', { token: tk.carlos });
  assert.equal(me.corpo.dados.perfil, 'professor');
});

// ---------------------------------------------------------------------------
test('escola: disciplinas por professor, bimestres com janela de digitação, tags', async () => {
  const doCarlos = await api('GET', '/api/disciplinas?turma_id=1', { token: tk.carlos });
  assert.deepEqual(doCarlos.corpo.dados.map((d) => d.nome).sort(), ['História', 'Língua Portuguesa']);

  const todas = await api('GET', '/api/disciplinas?turma_id=1', { token: tk.admin });
  assert.equal(todas.corpo.dados.length, 4);

  const bim = await api('GET', '/api/bimestres', { token: tk.carlos });
  assert.equal(bim.corpo.dados.length, 4);
  assert.equal(bim.corpo.dados.find((b) => b.numero === 4).aberto, true);
  assert.equal(bim.corpo.dados.find((b) => b.numero === 1).aberto, false);

  const tags = await api('GET', '/api/tags', { token: tk.carlos });
  assert.equal(tags.corpo.dados.length, 6);
});

test('alunos: visibilidade por perfil', async () => {
  const daAna = await api('GET', '/api/alunos', { token: tk.ana });
  assert.deepEqual(daAna.corpo.dados.map((a) => a.nome), ['Beatriz Ribeiro', 'Lucas Ribeiro']);

  const todos = await api('GET', '/api/alunos', { token: tk.admin });
  assert.equal(todos.corpo.meta.total, 7); // 6 da carga original + Rafael (cadastro incompleto, da expansão)

  const gabriel = todos.corpo.dados.find((a) => a.nome === 'Gabriel Andrade');
  assert.equal((await api('GET', `/api/alunos/${gabriel.id}`, { token: tk.ana })).status, 404);

  const detalhe = await api('GET', `/api/alunos/${gabriel.id}`, { token: tk.admin });
  assert.equal(detalhe.corpo.dados.responsaveis[0].parentesco, 'Mãe');

  const busca = await api('GET', '/api/alunos?busca=SOF', { token: tk.admin });
  assert.deepEqual(busca.corpo.dados.map((a) => a.nome), ['Sofia Oliveira']);
});

test('alunos: CRUD e vínculo de responsável (coordenação)', async () => {
  const dados = { nome: 'Teste Aluno', matricula: '2026099', data_nascimento: '2015-02-10', turma_id: 1 };
  assert.equal((await api('POST', '/api/alunos', { token: tk.carlos, corpo: dados })).status, 403);

  const criado = await api('POST', '/api/alunos', { token: tk.admin, corpo: dados });
  assert.equal(criado.status, 201, JSON.stringify(criado.corpo));
  assert.equal(criado.corpo.dados.turma, '6º A');
  const id = criado.corpo.dados.id;

  const repetido = await api('POST', '/api/alunos', { token: tk.admin, corpo: { ...dados, nome: 'Outro Aluno' } });
  assert.equal(repetido.status, 409);

  const editado = await api('PUT', `/api/alunos/${id}`, { token: tk.admin, corpo: { ...dados, turma_id: 2 } });
  assert.equal(editado.status, 200, JSON.stringify(editado.corpo));
  assert.equal(editado.corpo.dados.turma, '4º B');

  const vinculo = await api('POST', `/api/alunos/${id}/responsaveis`, {
    token: tk.admin,
    corpo: { email: 'ana.ribeiro@email.com', parentesco: 'Tia' },
  });
  assert.equal(vinculo.status, 201);
  const daAna = await api('GET', '/api/alunos', { token: tk.ana });
  assert.ok(daAna.corpo.dados.some((a) => a.id === id));

  assert.equal((await api('DELETE', `/api/alunos/${id}`, { token: tk.admin })).status, 204);
  // Desativado: some das listas e dos professores, mas a coordenação ainda consulta (para reativar)
  const inativo = await api('GET', `/api/alunos/${id}`, { token: tk.admin });
  assert.equal(inativo.status, 200);
  assert.equal(inativo.corpo.dados.ativo, false);
  const ativos = await api('GET', '/api/alunos', { token: tk.admin });
  assert.ok(!ativos.corpo.dados.some((a) => a.id === id));
  const inativos = await api('GET', '/api/alunos?situacao=inativos', { token: tk.admin });
  assert.ok(inativos.corpo.dados.some((a) => a.id === id));
  assert.equal((await api('PATCH', `/api/alunos/${id}/ativo`, { token: tk.admin, corpo: { ativo: true } })).status, 200);
  assert.equal((await api('GET', `/api/alunos/${id}`, { token: tk.admin })).corpo.dados.ativo, true);
  assert.equal((await api('DELETE', `/api/alunos/${id}`, { token: tk.admin })).status, 204); // volta a ficar desativado
});

// ---------------------------------------------------------------------------
test('planilha de lançamento: só quem leciona', async () => {
  const proibido = await api('GET', '/api/acompanhamentos?turma_id=1&disciplina_id=3&bimestre_id=4', { token: tk.carlos });
  assert.equal(proibido.status, 403);

  const r = await api('GET', '/api/acompanhamentos?turma_id=1&disciplina_id=1&bimestre_id=4', { token: tk.carlos });
  assert.equal(r.status, 200);
  assert.equal(r.corpo.dados.bimestre.aberto, true);
  assert.equal(r.corpo.dados.alunos.length, 3);
  const lucas = r.corpo.dados.alunos.find((a) => a.nome === 'Lucas Ribeiro');
  assert.equal(lucas.acompanhamento.status, 'rascunho');
  assert.deepEqual(lucas.acompanhamento.tags.map((t) => t.nome), ['Entrega em dia']);
});

test('trigger: fora do período de digitação o banco recusa (409)', async () => {
  const r = await api('PUT', '/api/acompanhamentos', {
    token: tk.carlos,
    corpo: { aluno_id: 6, disciplina_id: 1, bimestre_id: 1, media: 7, faltas: 0, descricao: 'Tentativa fora do prazo.' },
  });
  assert.equal(r.status, 409);
  assert.equal(r.corpo.erro.codigo, 'REGRA_DO_BANCO');
  assert.match(r.corpo.erro.mensagem, /período de digitação/);
});

test('fluxo completo: rascunho -> envio -> devolução -> correção -> publicação -> ciência -> retificação', async () => {
  const base4 = { aluno_id: 3, disciplina_id: 1, bimestre_id: 4 }; // Gabriel, Língua Portuguesa, 4º bim

  // Validação
  const invalido = await api('PUT', '/api/acompanhamentos', {
    token: tk.carlos,
    corpo: { ...base4, media: 11, faltas: -1, descricao: 'abc' },
  });
  assert.equal(invalido.status, 422);
  assert.equal(invalido.corpo.erro.detalhes.length, 3);

  // Professor de outra disciplina não pode lançar
  const outro = await api('PUT', '/api/acompanhamentos', {
    token: tk.fernanda,
    corpo: { ...base4, media: 7, faltas: 0, descricao: 'Não sou desta disciplina.' },
  });
  assert.equal(outro.status, 403);

  // 1) Rascunho com tags
  const rascunho = await api('PUT', '/api/acompanhamentos', {
    token: tk.carlos,
    corpo: { ...base4, media: 6.5, faltas: 2, descricao: 'Gabriel melhorou a produção de textos.', tags: [1, 3] },
  });
  assert.equal(rascunho.status, 201, JSON.stringify(rascunho.corpo));
  assert.equal(rascunho.corpo.dados.status, 'rascunho');
  assert.deepEqual(rascunho.corpo.dados.tags.map((t) => t.id).sort(), [1, 3]);
  const id = rascunho.corpo.dados.id;

  // 2) Envia
  const enviado = await api('POST', `/api/acompanhamentos/${id}/enviar`, { token: tk.carlos });
  assert.equal(enviado.corpo.dados.status, 'enviado');

  // Depois de enviado, o professor não edita mais
  const bloqueado = await api('PUT', '/api/acompanhamentos', {
    token: tk.carlos,
    corpo: { ...base4, media: 9, faltas: 2, descricao: 'Tentando mudar depois de enviar.' },
  });
  assert.equal(bloqueado.status, 409);

  // Aparece na fila da coordenação
  const fila = await api('GET', '/api/acompanhamentos/fila?status=pendentes', { token: tk.admin });
  assert.ok(fila.corpo.dados.some((x) => x.id === id && x.faltas === 2));

  // 3) Coordenação devolve com motivo
  assert.equal((await api('PATCH', `/api/acompanhamentos/${id}/devolver`, { token: tk.admin, corpo: { motivo: 'x' } })).status, 422);
  const devolvido = await api('PATCH', `/api/acompanhamentos/${id}/devolver`, {
    token: tk.admin,
    corpo: { motivo: 'Conferir o número de faltas.' },
  });
  assert.equal(devolvido.corpo.dados.status, 'devolvido');

  const planilha = await api('GET', '/api/acompanhamentos?turma_id=1&disciplina_id=1&bimestre_id=4', { token: tk.carlos });
  const doGabriel = planilha.corpo.dados.alunos.find((a) => a.aluno_id === 3).acompanhamento;
  assert.equal(doGabriel.motivo_devolucao, 'Conferir o número de faltas.');

  // 4) Professor corrige e reenvia de uma vez
  const corrigido = await api('PUT', '/api/acompanhamentos', {
    token: tk.carlos,
    corpo: { ...base4, media: 6.5, faltas: 1, descricao: 'Gabriel melhorou a produção de textos.', tags: [1], enviar: true },
  });
  assert.equal(corrigido.status, 200, JSON.stringify(corrigido.corpo));
  assert.equal(corrigido.corpo.dados.status, 'enviado');

  // Antes de publicar, a família não vê
  let boletim = await api('GET', '/api/boletim', { token: tk.luciana });
  const gabrielAntes = boletim.corpo.dados.find((f) => f.nome === 'Gabriel Andrade');
  assert.ok(!gabrielAntes.bimestres.some((b) => b.numero === 4));

  // 5) Publica (ENVIADO -> EM_REVISAO -> PUBLICADO numa transação)
  assert.equal((await api('PATCH', `/api/acompanhamentos/${id}/publicar`, { token: tk.carlos })).status, 403);
  const publicado = await api('PATCH', `/api/acompanhamentos/${id}/publicar`, { token: tk.admin });
  assert.equal(publicado.status, 200, JSON.stringify(publicado.corpo));
  assert.equal(publicado.corpo.dados.status, 'publicado');
  assert.equal((await api('PATCH', `/api/acompanhamentos/${id}/publicar`, { token: tk.admin })).status, 409);

  // Histórico (triggers): quem fez cada etapa, com o motivo da devolução
  const hist = await api('GET', `/api/acompanhamentos/${id}/historico`, { token: tk.admin });
  const etapas = hist.corpo.dados.eventos.map((e) => `${e.status_anterior || '-'}>${e.status_novo}:${e.perfil}`);
  assert.deepEqual(etapas, [
    '->rascunho:professor',
    'rascunho>enviado:professor',
    'enviado>devolvido:admin',
    'devolvido>enviado:professor',
    'enviado>em_revisao:admin',
    'em_revisao>publicado:admin',
  ]);
  assert.equal(hist.corpo.dados.eventos[2].observacao, 'Conferir o número de faltas.');
  assert.equal(hist.corpo.dados.eventos[3].faltas_anterior, 2);
  assert.equal(hist.corpo.dados.eventos[3].faltas_nova, 1);
  // Outro professor não vê o histórico
  assert.equal((await api('GET', `/api/acompanhamentos/${id}/historico`, { token: tk.fernanda })).status, 404);

  // 6) Família vê e confirma ciência com retorno; outra família não consegue
  boletim = await api('GET', '/api/boletim', { token: tk.luciana });
  const gabriel = boletim.corpo.dados.find((f) => f.nome === 'Gabriel Andrade');
  const lp4 = gabriel.bimestres.find((b) => b.numero === 4).disciplinas.find((d) => d.disciplina === 'Língua Portuguesa');
  assert.equal(lp4.faltas, 1);
  assert.deepEqual(lp4.tags, ['Participativo']);
  assert.equal(lp4.data_ciencia, null);

  assert.equal((await api('POST', `/api/acompanhamentos/${id}/ciencia`, { token: tk.ana, corpo: {} })).status, 404);
  const ciencia = await api('POST', `/api/acompanhamentos/${id}/ciencia`, {
    token: tk.luciana,
    corpo: { observacao: 'Obrigada pelo acompanhamento!' },
  });
  assert.equal(ciencia.status, 201, JSON.stringify(ciencia.corpo));
  assert.equal((await api('POST', `/api/acompanhamentos/${id}/ciencia`, { token: tk.luciana, corpo: {} })).status, 409);

  // 7) Retificação: volta para revisão e some do boletim
  const retificado = await api('PATCH', `/api/acompanhamentos/${id}/retificar`, {
    token: tk.admin,
    corpo: { motivo: 'Corrigir a média informada.' },
  });
  assert.equal(retificado.corpo.dados.status, 'em_revisao');
  boletim = await api('GET', '/api/boletim', { token: tk.luciana });
  assert.ok(!boletim.corpo.dados.find((f) => f.nome === 'Gabriel Andrade').bimestres.some((b) => b.numero === 4));
});

// ---------------------------------------------------------------------------
test('mensagens: conversas, envio, leitura e permissões', async () => {
  const conversas = await api('GET', '/api/mensagens/conversas', { token: tk.carlos });
  assert.equal(conversas.status, 200);
  const ana = conversas.corpo.dados.find((c) => c.nome === 'Ana Paula Ribeiro');
  assert.equal(ana.alunos, 'Beatriz Ribeiro, Lucas Ribeiro');
  assert.equal(ana.nao_lidas, 1);

  assert.equal((await api('POST', '/api/mensagens', { token: tk.carlos, corpo: { destinatario_id: ana.contato_id, texto: '  ' } })).status, 422);
  const enviada = await api('POST', '/api/mensagens', {
    token: tk.carlos,
    corpo: { destinatario_id: ana.contato_id, texto: 'Combinado, obrigado!' },
  });
  assert.equal(enviada.status, 201);
  assert.equal(enviada.corpo.dados.minha, true);

  const thread = await api('GET', `/api/mensagens/${ana.contato_id}`, { token: tk.carlos });
  assert.equal(thread.corpo.dados.mensagens.length, 3);
  const depois = await api('GET', '/api/mensagens/conversas', { token: tk.carlos });
  assert.equal(depois.corpo.dados.find((c) => c.contato_id === ana.contato_id).nao_lidas, 0);

  // responsável -> responsável: proibido
  const proibida = await api('POST', '/api/mensagens', { token: tk.ana, corpo: { destinatario_id: 7, texto: 'Oi' } });
  assert.equal(proibida.status, 403);
  const contatos = await api('GET', '/api/usuarios/contatos', { token: tk.ana });
  assert.ok(contatos.corpo.dados.every((c) => c.perfil !== 'responsavel'));
});

test('dashboard: indicadores e tags (views) para a equipe; resumo para a família', async () => {
  const admin = await api('GET', '/api/dashboard/resumo', { token: tk.admin });
  assert.equal(admin.status, 200, JSON.stringify(admin.corpo));
  assert.ok(admin.corpo.dados.indicadores.length > 0);
  assert.ok(admin.corpo.dados.tags.length > 0);
  assert.equal(typeof admin.corpo.dados.pendentes, 'number');

  const fernanda = await api('GET', '/api/dashboard/resumo', { token: tk.fernanda });
  assert.ok(fernanda.corpo.dados.indicadores.every((i) => i.professor === 'Fernanda Lopes'));

  const familia = await api('GET', '/api/dashboard/resumo', { token: tk.ana });
  assert.equal(familia.corpo.dados.filhos, 2);
  assert.equal(familia.corpo.dados.indicadores, undefined);
});

test('usuários: coordenação cria professor (registro obrigatório)', async () => {
  const semRegistro = { nome: 'Prof. Novo', email: 'novo@kfka.edu.br', senha: 'prof12345', perfil: 'professor' };
  const r1 = await api('POST', '/api/usuarios', { token: tk.admin, corpo: semRegistro });
  assert.equal(r1.status, 422);
  assert.equal(r1.corpo.erro.detalhes[0].campo, 'registro');
  assert.equal((await api('POST', '/api/usuarios', { token: tk.carlos, corpo: semRegistro })).status, 403);

  const ok = await api('POST', '/api/usuarios', { token: tk.admin, corpo: { ...semRegistro, registro: 'P-2000' } });
  assert.equal(ok.status, 201, JSON.stringify(ok.corpo));
  const login = await api('POST', '/api/auth/login', { corpo: { email: 'novo@kfka.edu.br', senha: 'prof12345' } });
  assert.equal(login.status, 200);
});
