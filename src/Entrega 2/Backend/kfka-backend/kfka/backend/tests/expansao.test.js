// tests/expansao.test.js — testes de integração dos módulos novos (perfil, mural, calendário,
// aulas, atividades, SAC, justificativas, documentos, ocorrências, pendências e gestão escolar).
//
// ATENÇÃO: como o api.test.js, roda "npm run db:setup" (APAGA e recria o banco kfka).
//   NODE_ENV=test npm test
// Os dados são os da carga do kfka_banco.sql + kfka_expansao.sql (datas relativas ao dia de hoje).

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
const { hoje, somarDias } = require('../src/utils/datas');

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
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const texto = await resp.text();
  return { status: resp.status, corpo: texto ? JSON.parse(texto) : null };
}

async function logar(email, senha = SENHA) {
  const r = await api('POST', '/api/auth/login', { corpo: { email, senha } });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  return r.corpo.dados.token;
}

const campos = (r) => (r.corpo?.erro?.detalhes || []).map((d) => d.campo);

before(async () => {
  await prepararBanco();
  servidor = app.listen(0);
  await new Promise((ok) => servidor.once('listening', ok));
  base = `http://127.0.0.1:${servidor.address().port}`;
  tk.admin = await logar('admin@kfka.edu.br');
  tk.carlos = await logar('carlos.menezes@kfka.edu.br'); // Port. e História (6º A), Port. (4º B)
  tk.fernanda = await logar('fernanda.lopes@kfka.edu.br'); // Matemática
  tk.ricardo = await logar('ricardo.tanaka@kfka.edu.br'); // Ciências (6º A), Inglês (4º B)
  tk.ana = await logar('ana.ribeiro@email.com'); // Lucas (6º A) e Beatriz (4º B)
  tk.luciana = await logar('luciana.andrade@email.com'); // Gabriel (6º A) e Laura (4º B)
  tk.marcos = await logar('marcos.oliveira@email.com'); // Sofia (6º A) e Pedro (4º B)
});

after(async () => {
  servidor?.close();
  await db.pool.end();
});

// ---------------------------------------------------------------------------
test('pendências: cada perfil vê as suas, com link para resolver', async () => {
  const admin = await api('GET', '/api/pendencias', { token: tk.admin });
  assert.equal(admin.status, 200, JSON.stringify(admin.corpo));
  const grupos = new Set(admin.corpo.dados.map((p) => p.grupo));
  for (const g of ['Relatórios aguardando revisão', 'Relatórios devolvidos para correção', 'Cadastros incompletos', 'Solicitações de suporte', 'Pendências administrativas']) {
    assert.ok(grupos.has(g), `faltou o grupo "${g}"`);
  }
  assert.ok(admin.corpo.dados.some((p) => p.titulo.startsWith('Rafael Souza')));
  assert.ok(admin.corpo.dados.every((p) => ['alta', 'media', 'baixa'].includes(p.prioridade) && p.link && p.status));

  const carlos = await api('GET', '/api/pendencias', { token: tk.carlos });
  const gc = new Set(carlos.corpo.dados.map((p) => p.grupo));
  assert.ok(gc.has('Aulas sem registro'));
  assert.ok(gc.has('Registros de frequência incompletos')); // aula de quarta em rascunho
  assert.ok(gc.has('Relatórios não enviados')); // rascunho do Lucas no 4º bimestre
  assert.ok(carlos.corpo.dados.every((p) => !p.grupo.startsWith('Cadastros')));

  const ana = await api('GET', '/api/pendencias', { token: tk.ana });
  const bolBeatriz = ana.corpo.dados.find((p) => p.id === 'bol-2-1');
  assert.ok(bolBeatriz, 'boletim da Beatriz deveria estar como não visualizado');
  assert.ok(!ana.corpo.dados.some((p) => p.id === 'bol-1-1'), 'boletim do Lucas já foi visto');
  assert.ok(ana.corpo.dados.some((p) => p.grupo === 'Solicitações que aguardam resposta'));

  // Abrir o boletim tira a pendência
  assert.equal((await api('POST', '/api/boletim/visualizacao', { token: tk.ana, corpo: { aluno_id: 2, bimestre: 1 } })).status, 204);
  const depois = await api('GET', '/api/pendencias', { token: tk.ana });
  assert.ok(!depois.corpo.dados.some((p) => p.id === 'bol-2-1'));
  // Aluno de outra família: 404
  assert.equal((await api('POST', '/api/boletim/visualizacao', { token: tk.ana, corpo: { aluno_id: 3, bimestre: 1 } })).status, 404);

  const luciana = await api('GET', '/api/pendencias', { token: tk.luciana });
  assert.ok(luciana.corpo.dados.some((p) => p.grupo === 'Justificativas de faltas pendentes' && p.titulo.includes('Gabriel')));
  assert.ok(luciana.corpo.dados.some((p) => p.id.startsWith('sac-') && p.prioridade === 'alta')); // escola aguarda retorno

  const resumo = await api('GET', '/api/pendencias/resumo', { token: tk.carlos });
  assert.equal(typeof resumo.corpo.dados.pendencias, 'number');
  assert.equal(typeof resumo.corpo.dados.mensagens_nao_lidas, 'number');
});

test('perfil: dados por perfil, edição permitida e troca de senha', async () => {
  const prof = await api('GET', '/api/perfil', { token: tk.carlos });
  assert.equal(prof.status, 200);
  assert.equal(prof.corpo.dados.registro, 'P-1001');
  assert.ok(prof.corpo.dados.documento.endsWith('3-01') && prof.corpo.dados.documento.startsWith('*'), 'documento mascarado');
  assert.ok(prof.corpo.dados.vinculos.length >= 3);
  assert.equal(prof.corpo.dados.editavel.nome, false);

  const resp = await api('GET', '/api/perfil', { token: tk.ana });
  assert.deepEqual(resp.corpo.dados.filhos.map((f) => f.nome), ['Beatriz Ribeiro', 'Lucas Ribeiro']);
  assert.ok(resp.corpo.dados.aceite_lgpd_em);

  // Professor não muda o próprio nome; telefone sim
  const ed = await api('PUT', '/api/perfil', { token: tk.carlos, corpo: { nome: 'Outro Nome', telefone: '(11) 95555-0000' } });
  assert.equal(ed.status, 200);
  assert.equal(ed.corpo.dados.nome, 'Carlos Menezes');
  assert.equal(ed.corpo.dados.telefone, '(11) 95555-0000');

  // Foto: formato validado
  assert.equal((await api('PUT', '/api/perfil', { token: tk.ana, corpo: { foto: 'javascript:alert(1)' } })).status, 422);
  const foto = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJ';
  const comFoto = await api('PUT', '/api/perfil', { token: tk.ana, corpo: { foto, telefone: '(11) 91111-0001' } });
  assert.equal(comFoto.corpo.dados.foto, foto);
  assert.equal((await api('GET', '/api/auth/me', { token: tk.ana })).corpo.dados.foto, foto);

  // Troca de senha
  const errada = await api('PUT', '/api/perfil/senha', { token: tk.ricardo, corpo: { senha_atual: 'xxx', nova_senha: 'NovaSenha1' } });
  assert.equal(errada.status, 422);
  assert.deepEqual(campos(errada), ['senha_atual']);
  const fraca = await api('PUT', '/api/perfil/senha', { token: tk.ricardo, corpo: { senha_atual: SENHA, nova_senha: 'abc' } });
  assert.deepEqual([...new Set(campos(fraca))], ['nova_senha']);
  const trocou = await api('PUT', '/api/perfil/senha', { token: tk.ricardo, corpo: { senha_atual: SENHA, nova_senha: 'NovaSenha1' } });
  assert.equal(trocou.status, 200);
  // A troca encerra as sessões antigas (RNF02); esta sessão recebe um token novo
  assert.equal((await api('GET', '/api/auth/me', { token: tk.ricardo })).status, 401);
  assert.equal((await api('GET', '/api/auth/me', { token: trocou.corpo.dados.token })).status, 200);
  tk.ricardo = await logar('ricardo.tanaka@kfka.edu.br', 'NovaSenha1');
});

test('redefinição de senha por link gerado pela coordenação (uso único, 24 h)', async () => {
  assert.equal((await api('POST', '/api/usuarios/8/link-senha', { token: tk.carlos })).status, 403);
  const link = await api('POST', '/api/usuarios/8/link-senha', { token: tk.admin });
  assert.equal(link.status, 201);
  const token = new URLSearchParams(link.corpo.dados.caminho.split('?')[1]).get('token');
  assert.match(token, /^[a-f0-9]{48}$/);

  const confere = await api('GET', `/api/auth/redefinir-senha/${token}`);
  assert.equal(confere.status, 200);
  assert.equal(confere.corpo.dados.nome, 'Marcos');
  assert.ok(confere.corpo.dados.email.includes('***'));

  assert.equal((await api('POST', '/api/auth/redefinir-senha', { corpo: { token, senha: '123' } })).status, 422);
  assert.equal((await api('POST', '/api/auth/redefinir-senha', { corpo: { token, senha: 'Recuperada9' } })).status, 204);
  // Uso único
  assert.equal((await api('POST', '/api/auth/redefinir-senha', { corpo: { token, senha: 'Outra12345' } })).status, 410);
  assert.equal((await api('GET', `/api/auth/redefinir-senha/${'a'.repeat(48)}`)).status, 410);
  tk.marcos = await logar('marcos.oliveira@email.com', 'Recuperada9');
});

test('mural: contatos respeitam os vínculos e a conversa pode citar um aluno em comum', async () => {
  const daAna = await api('GET', '/api/usuarios/contatos', { token: tk.ana });
  assert.ok(daAna.corpo.dados.every((c) => c.perfil !== 'responsavel'));
  assert.ok(daAna.corpo.dados.some((c) => c.nome === 'Carlos Menezes'));

  const doCarlos = await api('GET', '/api/usuarios/contatos', { token: tk.carlos });
  const ana = doCarlos.corpo.dados.find((c) => c.nome === 'Ana Paula Ribeiro');
  assert.deepEqual(ana.alunos.map((a) => a.nome), ['Beatriz Ribeiro', 'Lucas Ribeiro']);

  // Aluno em comum: ok; aluno de outra família: 422
  const ok = await api('POST', '/api/mensagens', { token: tk.ana, corpo: { destinatario_id: 2, texto: 'Sobre a redação', aluno_id: 1 } });
  assert.equal(ok.status, 201);
  assert.equal(ok.corpo.dados.aluno, 'Lucas Ribeiro');
  const outro = await api('POST', '/api/mensagens', { token: tk.ana, corpo: { destinatario_id: 2, texto: 'Oi', aluno_id: 3 } });
  assert.equal(outro.status, 422);

  // Professor novo, sem turma: não fala com responsáveis
  const novo = await api('POST', '/api/usuarios', {
    token: tk.admin,
    corpo: { nome: 'Paula Artes', email: 'paula.artes@kfka.edu.br', senha: 'Artes12345', perfil: 'professor', registro: 'P-3000' },
  });
  assert.equal(novo.status, 201);
  tk.paula = await logar('paula.artes@kfka.edu.br', 'Artes12345');
  const contatosPaula = await api('GET', '/api/usuarios/contatos', { token: tk.paula });
  assert.ok(contatosPaula.corpo.dados.every((c) => c.perfil !== 'responsavel'));
  assert.equal((await api('POST', '/api/mensagens', { token: tk.paula, corpo: { destinatario_id: 5, texto: 'Olá' } })).status, 403);
  // ... e a Ana não vê a Paula como contato
  const daAna2 = await api('GET', '/api/usuarios/contatos', { token: tk.ana });
  assert.ok(!daAna2.corpo.dados.some((c) => c.nome === 'Paula Artes'));
});

test('calendário: eventos por perfil, bimestres, prazos de atividades e cadastro pela coordenação', async () => {
  const ini = somarDias(hoje(), -20);
  const fim = somarDias(hoje(), 30);
  const q = `/api/eventos?inicio=${ini}&fim=${fim}`;

  const ana = await api('GET', q, { token: tk.ana });
  assert.equal(ana.status, 200, JSON.stringify(ana.corpo));
  const titulosAna = ana.corpo.dados.map((e) => e.titulo);
  assert.ok(titulosAna.includes('Reunião de pais e mestres'));
  assert.ok(titulosAna.includes('Prova de Matemática'));
  assert.ok(!titulosAna.some((t) => t.startsWith('Último dia para lançar')), 'prazo de digitação é só da equipe');
  assert.ok(ana.corpo.dados.some((e) => e.tipo === 'ENTREGA' && e.titulo.includes('Crônica')));
  assert.ok(ana.corpo.dados.every((e) => !e.editavel));

  const admin = await api('GET', `/api/eventos?inicio=2026-12-01&fim=2026-12-31`, { token: tk.admin });
  assert.ok(admin.corpo.dados.some((e) => e.titulo === 'Conselho de classe'));
  assert.ok(admin.corpo.dados.some((e) => e.tipo === 'BIMESTRE' && e.titulo === 'Fim do 4º bimestre'));
  const anaDez = await api('GET', `/api/eventos?inicio=2026-12-01&fim=2026-12-31`, { token: tk.ana });
  assert.ok(!anaDez.corpo.dados.some((e) => e.titulo === 'Conselho de classe'), 'evento só da equipe');

  const provas = await api('GET', `${q}&tipo=PROVA`, { token: tk.carlos });
  assert.ok(provas.corpo.dados.length >= 1 && provas.corpo.dados.every((e) => e.tipo === 'PROVA'));
  assert.equal((await api('GET', `${q}&aluno_id=3`, { token: tk.ana })).status, 404);
  assert.equal((await api('GET', `/api/eventos?inicio=2026-01-01&fim=2026-12-31`, { token: tk.ana })).status, 422);

  const evento = { titulo: 'Passeio ao museu', tipo: 'EVENTO', data_inicio: somarDias(hoje(), 5), hora_inicio: '09:00', hora_fim: '12:00', turma_id: 2 };
  assert.equal((await api('POST', '/api/eventos', { token: tk.ana, corpo: evento })).status, 403);
  const invalido = await api('POST', '/api/eventos', { token: tk.admin, corpo: { ...evento, hora_fim: '08:00' } });
  assert.deepEqual(campos(invalido), ['hora_fim']);
  const criado = await api('POST', '/api/eventos', { token: tk.admin, corpo: evento });
  assert.equal(criado.status, 201);
  // 4º B: Ana (Beatriz) vê; Luciana (Laura, 4º B) vê; filtrando pelo Lucas (6º A), não aparece
  assert.ok((await api('GET', q, { token: tk.ana })).corpo.dados.some((e) => e.titulo === 'Passeio ao museu'));
  assert.ok(!(await api('GET', `${q}&aluno_id=1`, { token: tk.ana })).corpo.dados.some((e) => e.titulo === 'Passeio ao museu'));
  assert.equal((await api('PUT', `/api/eventos/${criado.corpo.dados.id}`, { token: tk.admin, corpo: { ...evento, titulo: 'Passeio ao Museu do Ipiranga' } })).status, 200);
  assert.equal((await api('DELETE', `/api/eventos/${criado.corpo.dados.id}`, { token: tk.admin })).status, 204);
});

test('relatório por aula: chamada, rascunho, finalização e permissões', async () => {
  const lista = await api('GET', '/api/aulas', { token: tk.carlos });
  assert.equal(lista.status, 200);
  const rascunho = lista.corpo.dados.find((a) => a.status === 'rascunho');
  assert.ok(rascunho);
  assert.equal(rascunho.marcados, 2);
  assert.equal(rascunho.total_alunos, 3);

  const q = `/api/aulas/chamada?turma_id=1&disciplina_id=1&data=${rascunho.data}`;
  const chamada = await api('GET', q, { token: tk.carlos });
  assert.equal(chamada.status, 200, JSON.stringify(chamada.corpo));
  const lucas = chamada.corpo.dados.alunos.find((a) => a.nome === 'Lucas Ribeiro');
  assert.equal(lucas.presente, false);
  assert.equal(lucas.justificativa, 'pendente'); // a Ana justificou terça e quarta
  assert.equal(chamada.corpo.dados.alunos.find((a) => a.nome === 'Sofia Oliveira').presente, null);

  assert.equal((await api('GET', q, { token: tk.fernanda })).status, 403);
  assert.equal((await api('GET', q, { token: tk.ana })).status, 403);

  const corpo = {
    turma_id: 1,
    disciplina_id: 1,
    data: rascunho.data,
    conteudo: 'Produção de texto: crônica',
    descricao: 'Produção individual e revisão em duplas.',
    presencas: [
      { aluno_id: 1, presente: false },
      { aluno_id: 3, presente: true },
    ],
    finalizar: true,
  };
  const incompleta = await api('PUT', '/api/aulas', { token: tk.carlos, corpo });
  assert.equal(incompleta.status, 422);
  assert.match(incompleta.corpo.erro.detalhes[0].mensagem, /Sofia/);
  const fora = await api('PUT', '/api/aulas', { token: tk.carlos, corpo: { ...corpo, presencas: [...corpo.presencas, { aluno_id: 2, presente: true }] } });
  assert.equal(fora.status, 422); // Beatriz é do 4º B

  const ok = await api('PUT', '/api/aulas', { token: tk.carlos, corpo: { ...corpo, presencas: [...corpo.presencas, { aluno_id: 4, presente: true }] } });
  assert.equal(ok.status, 200, JSON.stringify(ok.corpo));
  assert.equal(ok.corpo.dados.aula.status, 'finalizada');
  assert.equal((await api('PUT', '/api/aulas', { token: tk.carlos, corpo: { ...corpo, finalizar: false } })).status, 409);

  const futura = await api('PUT', '/api/aulas', { token: tk.carlos, corpo: { ...corpo, data: somarDias(hoje(), 2) } });
  assert.deepEqual(campos(futura), ['data']);

  // Nova aula em rascunho e exclusão
  const nova = await api('PUT', '/api/aulas', {
    token: tk.carlos,
    corpo: { turma_id: 2, disciplina_id: 1, data: somarDias(hoje(), -1), conteudo: 'Leitura compartilhada', presencas: [] },
  });
  assert.equal(nova.status, 201);
  assert.equal(nova.corpo.dados.aula.status, 'rascunho');
  assert.equal((await api('DELETE', `/api/aulas/${nova.corpo.dados.aula.id}`, { token: tk.fernanda })).status, 404);
  assert.equal((await api('DELETE', `/api/aulas/${nova.corpo.dados.aula.id}`, { token: tk.carlos })).status, 204);

  const sem = await api('GET', '/api/aulas/sem-registro', { token: tk.carlos });
  assert.ok(Array.isArray(sem.corpo.dados));
  assert.ok(sem.corpo.dados.every((a) => a.data <= hoje()));
});

test('atividades: situação por aluno para a família, entregas e fluxo do professor', async () => {
  const daAna = await api('GET', '/api/atividades?aluno_id=1', { token: tk.ana });
  assert.equal(daAna.status, 200, JSON.stringify(daAna.corpo));
  const porTitulo = Object.fromEntries(daAna.corpo.dados.map((a) => [a.titulo, a.situacao_aluno]));
  assert.equal(porTitulo['Crônica: um dia na minha cidade'], 'pendente');
  assert.equal(porTitulo['Lista de frações'], 'concluida');

  const daLuciana = await api('GET', '/api/atividades?situacao=atrasadas', { token: tk.luciana });
  assert.ok(daLuciana.corpo.dados.some((a) => a.titulo === 'Lista de frações' && a.aluno === 'Gabriel Andrade'));
  // Rascunho do professor não aparece para as famílias
  assert.equal((await api('GET', '/api/atividades/4', { token: tk.ana })).status, 404);
  assert.equal((await api('GET', '/api/atividades?aluno_id=3', { token: tk.ana })).status, 404);

  const nova = {
    turma_id: 1,
    disciplina_id: 5,
    titulo: 'Linha do tempo',
    descricao: 'Monte uma linha do tempo com 5 fatos do Brasil Colônia.',
    prazo: `${somarDias(hoje(), 4)}T18:00`,
    link_material: 'ftp://errado',
  };
  assert.deepEqual(campos(await api('POST', '/api/atividades', { token: tk.carlos, corpo: nova })), ['link_material']);
  assert.equal((await api('POST', '/api/atividades', { token: tk.fernanda, corpo: { ...nova, link_material: null } })).status, 403);
  const criada = await api('POST', '/api/atividades', { token: tk.carlos, corpo: { ...nova, link_material: null } });
  assert.equal(criada.status, 201);
  assert.equal(criada.corpo.dados.status, 'rascunho');
  const id = criada.corpo.dados.id;
  assert.equal((await api('PUT', `/api/atividades/${id}/entregas`, { token: tk.carlos, corpo: { entregas: [{ aluno_id: 1, situacao: 'ENTREGUE' }] } })).status, 409);

  const pub = await api('PATCH', `/api/atividades/${id}/status`, { token: tk.carlos, corpo: { status: 'PUBLICADA' } });
  assert.equal(pub.corpo.dados.status, 'publicada');
  assert.ok((await api('GET', '/api/atividades', { token: tk.ana })).corpo.dados.some((a) => a.id === id && a.aluno === 'Lucas Ribeiro'));

  const ent = await api('PUT', `/api/atividades/${id}/entregas`, {
    token: tk.carlos,
    corpo: { entregas: [{ aluno_id: 1, situacao: 'ENTREGUE' }, { aluno_id: 3, situacao: 'NAO_ENTREGUE' }] },
  });
  assert.equal(ent.status, 200);
  assert.equal(ent.corpo.dados.entregas.find((e) => e.aluno_id === 3).situacao_aluno, 'atrasada');
  assert.equal(ent.corpo.dados.entregas.find((e) => e.aluno_id === 4).situacao, 'pendente');
  const daLuciana2 = await api('GET', `/api/atividades/${id}`, { token: tk.luciana });
  assert.equal(daLuciana2.corpo.dados.alunos[0].situacao_aluno, 'atrasada');
  assert.equal(daLuciana2.corpo.dados.entregas, undefined); // família não vê a lista da turma

  assert.equal((await api('PATCH', `/api/atividades/${id}/status`, { token: tk.carlos, corpo: { status: 'PUBLICADA' } })).status, 409);
  assert.equal((await api('DELETE', `/api/atividades/${id}`, { token: tk.carlos })).status, 409);
  assert.equal((await api('PATCH', `/api/atividades/${id}/status`, { token: tk.carlos, corpo: { status: 'ENCERRADA' } })).status, 200);
});

test('SAC: chamado, conversa com a coordenação e situação do atendimento', async () => {
  const curto = await api('POST', '/api/chamados', { token: tk.ana, corpo: { categoria: 'ACESSO', assunto: 'Oi', descricao: 'curto' } });
  assert.deepEqual(campos(curto).sort(), ['assunto', 'descricao']);
  const novo = await api('POST', '/api/chamados', {
    token: tk.ana,
    corpo: { categoria: 'ACESSO', assunto: 'Esqueci minha senha', descricao: 'Não consigo entrar pelo celular do meu marido.' },
  });
  assert.equal(novo.status, 201);
  const id = novo.corpo.dados.id;

  assert.equal((await api('GET', `/api/chamados/${id}`, { token: tk.luciana })).status, 404);
  assert.ok((await api('GET', '/api/chamados?status=abertos', { token: tk.admin })).corpo.dados.some((c) => c.id === id));

  const resp = await api('POST', `/api/chamados/${id}/interacoes`, {
    token: tk.admin,
    corpo: { texto: 'Geramos um link de redefinição. Conseguiu entrar?', status: 'AGUARDANDO_USUARIO' },
  });
  assert.equal(resp.corpo.dados.status, 'aguardando_usuario');
  const volta = await api('POST', `/api/chamados/${id}/interacoes`, { token: tk.ana, corpo: { texto: 'Consegui, obrigada!' } });
  assert.equal(volta.corpo.dados.status, 'em_atendimento');
  assert.equal((await api('PATCH', `/api/chamados/${id}/status`, { token: tk.ana, corpo: { status: 'RESOLVIDO' } })).status, 403);
  assert.equal((await api('PATCH', `/api/chamados/${id}/status`, { token: tk.admin, corpo: { status: 'RESOLVIDO' } })).status, 200);
  assert.equal((await api('POST', `/api/chamados/${id}/interacoes`, { token: tk.ana, corpo: { texto: 'Mais uma coisa' } })).status, 409);
  const detalhe = await api('GET', `/api/chamados/${id}`, { token: tk.ana });
  assert.equal(detalhe.corpo.dados.conversa.length, 2);
});

test('justificativa de faltas: envio, análise e privacidade do motivo', async () => {
  const faltas = await api('GET', '/api/justificativas/faltas', { token: tk.luciana });
  const doGabriel = faltas.corpo.dados.find((f) => f.aluno === 'Gabriel Andrade');
  assert.ok(doGabriel && doGabriel.justificativa === null);

  const corpo = { aluno_id: 3, data_inicio: doGabriel.data, motivo: 'SAUDE', descricao: 'Gabriel estava com febre.' };
  assert.equal((await api('POST', '/api/justificativas', { token: tk.ana, corpo })).status, 404); // não é filho da Ana
  assert.deepEqual(campos(await api('POST', '/api/justificativas', { token: tk.luciana, corpo: { ...corpo, data_inicio: somarDias(hoje(), 3) } })), ['data_inicio']);
  const criada = await api('POST', '/api/justificativas', { token: tk.luciana, corpo });
  assert.equal(criada.status, 201, JSON.stringify(criada.corpo));
  assert.equal(criada.corpo.dados.data_fim, doGabriel.data);
  assert.equal((await api('POST', '/api/justificativas', { token: tk.luciana, corpo })).status, 409);
  const id = criada.corpo.dados.id;

  // Professor vê a situação, não o motivo
  const doProf = await api('GET', '/api/justificativas', { token: tk.carlos });
  const item = doProf.corpo.dados.find((j) => j.id === id);
  assert.equal(item.status, 'pendente');
  assert.equal(item.motivo, undefined);
  assert.equal(item.descricao, undefined);

  assert.deepEqual(campos(await api('PATCH', `/api/justificativas/${id}/analise`, { token: tk.admin, corpo: { status: 'NECESSITA_INFO' } })), ['parecer']);
  assert.equal((await api('PATCH', `/api/justificativas/${id}/analise`, { token: tk.luciana, corpo: { status: 'APROVADA' } })).status, 403);
  const pede = await api('PATCH', `/api/justificativas/${id}/analise`, { token: tk.admin, corpo: { status: 'NECESSITA_INFO', parecer: 'Envie o atestado na secretaria.' } });
  assert.equal(pede.corpo.dados.status, 'necessita_info');
  const compl = await api('PUT', `/api/justificativas/${id}`, { token: tk.luciana, corpo: { ...corpo, descricao: 'Febre; atestado entregue na secretaria.' } });
  assert.equal(compl.corpo.dados.status, 'pendente');
  assert.equal((await api('PATCH', `/api/justificativas/${id}/analise`, { token: tk.admin, corpo: { status: 'APROVADA' } })).corpo.dados.status, 'aprovada');
  assert.equal((await api('PUT', `/api/justificativas/${id}`, { token: tk.luciana, corpo })).status, 409);

  const chamada = await api('GET', `/api/aulas/chamada?turma_id=1&disciplina_id=1&data=${doGabriel.data}`, { token: tk.carlos });
  assert.equal(chamada.corpo.dados.alunos.find((a) => a.aluno_id === 3).justificativa, 'aprovada');
});

test('documentos: solicitação, emissão com código e conteúdo gerado do banco', async () => {
  const tipos = await api('GET', '/api/documentos/tipos', { token: tk.ana });
  assert.equal(tipos.corpo.dados.length, 5);
  assert.equal((await api('GET', '/api/documentos', { token: tk.carlos })).status, 403);

  const lista = await api('GET', '/api/documentos', { token: tk.ana });
  assert.ok(lista.corpo.dados.every((d) => [1, 2].includes(d.aluno_id)));
  const pronta = lista.corpo.dados.find((d) => d.status === 'disponivel');
  const conteudo = await api('GET', `/api/documentos/${pronta.id}/conteudo`, { token: tk.ana });
  assert.equal(conteudo.status, 200);
  assert.equal(conteudo.corpo.dados.aluno.nome, 'Lucas Ribeiro');
  assert.equal(conteudo.corpo.dados.solicitacao.codigo_validacao, 'KF26A1B2C3D4');

  assert.equal((await api('POST', '/api/documentos', { token: tk.luciana, corpo: { aluno_id: 1, tipo: 'BOLETIM' } })).status, 404);
  assert.deepEqual(campos(await api('POST', '/api/documentos', { token: tk.ana, corpo: { aluno_id: 1, tipo: 'OUTRO' } })), ['finalidade']);
  const pedido = await api('POST', '/api/documentos', { token: tk.ana, corpo: { aluno_id: 1, tipo: 'HISTORICO_ESCOLAR', finalidade: 'Matrícula em outra escola' } });
  assert.equal(pedido.status, 201);
  assert.equal((await api('POST', '/api/documentos', { token: tk.ana, corpo: { aluno_id: 1, tipo: 'HISTORICO_ESCOLAR' } })).status, 409);
  assert.equal((await api('GET', `/api/documentos/${pedido.corpo.dados.id}/conteudo`, { token: tk.ana })).status, 409);

  assert.deepEqual(campos(await api('PATCH', `/api/documentos/${pedido.corpo.dados.id}`, { token: tk.admin, corpo: { status: 'RECUSADO' } })), ['justificativa']);
  const emitido = await api('PATCH', `/api/documentos/${pedido.corpo.dados.id}`, { token: tk.admin, corpo: { status: 'DISPONIVEL' } });
  assert.match(emitido.corpo.dados.codigo_validacao, /^KF[A-Z2-9]{10}$/);
  const hist = await api('GET', `/api/documentos/${pedido.corpo.dados.id}/conteudo`, { token: tk.ana });
  const port = hist.corpo.dados.disciplinas.find((d) => d.disciplina === 'Língua Portuguesa');
  assert.equal(port.bimestres['1'], 8.5);
  assert.equal((await api('PATCH', `/api/documentos/${pedido.corpo.dados.id}`, { token: tk.admin, corpo: { status: 'RECUSADO', justificativa: 'Tarde demais' } })).status, 409);

  const freq = await api('POST', '/api/documentos', { token: tk.ana, corpo: { aluno_id: 1, tipo: 'DECLARACAO_FREQUENCIA' } });
  await api('PATCH', `/api/documentos/${freq.corpo.dados.id}`, { token: tk.admin, corpo: { status: 'DISPONIVEL' } });
  const f = await api('GET', `/api/documentos/${freq.corpo.dados.id}/conteudo`, { token: tk.ana });
  assert.ok(f.corpo.dados.frequencia.aulas >= 2);
  assert.ok(f.corpo.dados.frequencia.faltas >= 1);
});

test('ocorrências: acesso restrito, saúde sempre restrita, situação só pela coordenação', async () => {
  assert.equal((await api('GET', '/api/ocorrencias', { token: tk.ana })).status, 403);

  const doCarlos = await api('GET', '/api/ocorrencias', { token: tk.carlos });
  assert.deepEqual(doCarlos.corpo.dados.map((o) => o.id), [1]); // a #2 é de saúde (restrita)
  const doRicardo = await api('GET', '/api/ocorrencias', { token: tk.ricardo });
  assert.ok(doRicardo.corpo.dados.some((o) => o.id === 1) && !doRicardo.corpo.dados.some((o) => o.id === 2));
  assert.equal((await api('GET', '/api/ocorrencias/2', { token: tk.carlos })).status, 404);
  assert.equal((await api('GET', '/api/ocorrencias', { token: tk.admin })).corpo.dados.length, 2);

  assert.equal((await api('POST', '/api/ocorrencias/1/atualizacoes', { token: tk.ricardo, corpo: { texto: 'Vi também.' } })).status, 403);
  assert.equal((await api('POST', '/api/ocorrencias/1/atualizacoes', { token: tk.carlos, corpo: { texto: 'Melhorou', status: 'RESOLVIDA' } })).status, 403);
  assert.equal((await api('POST', '/api/ocorrencias/1/atualizacoes', { token: tk.carlos, corpo: { texto: 'Hoje participou bem da aula.' } })).status, 201);
  const res = await api('POST', '/api/ocorrencias/1/atualizacoes', { token: tk.admin, corpo: { texto: 'Caso encerrado.', status: 'RESOLVIDA' } });
  assert.equal(res.corpo.dados.status, 'resolvida');
  const det = await api('GET', '/api/ocorrencias/1', { token: tk.carlos });
  assert.equal(det.corpo.dados.atualizacoes.length, 4);

  const nova = {
    aluno_id: 1,
    data_hora: `${hoje()}T08:30`,
    categoria: 'SAUDE',
    descricao: 'Aluno se machucou levemente no recreio.',
    restrita: false,
  };
  assert.equal((await api('POST', '/api/ocorrencias', { token: tk.carlos, corpo: { ...nova, aluno_id: 7 } })).status, 404); // sem turma
  const criada = await api('POST', '/api/ocorrencias', { token: tk.carlos, corpo: nova });
  assert.equal(criada.status, 201, JSON.stringify(criada.corpo));
  assert.equal(criada.corpo.dados.restrita, true);
  assert.equal((await api('GET', `/api/ocorrencias/${criada.corpo.dados.id}`, { token: tk.ricardo })).status, 404);
  assert.equal((await api('PATCH', `/api/ocorrencias/${criada.corpo.dados.id}/restricao`, { token: tk.admin, corpo: { restrita: false } })).status, 409);
});

test('gestão escolar: vínculos com histórico, troca protegida, bimestres e cadastros', async () => {
  // Turma nova + vínculo da professora Paula, com dias da grade
  const turma = await api('POST', '/api/turmas', { token: tk.admin, corpo: { nome: '5º C', serie: 5, ano_letivo: 2026, turno: 'MANHA' } });
  assert.equal(turma.status, 201);
  const [{ id: paulaUsuario }] = (await api('GET', '/api/usuarios?perfil=professor', { token: tk.admin })).corpo.dados.filter((u) => u.nome === 'Paula Artes');
  const paula = await api('GET', `/api/usuarios/${paulaUsuario}`, { token: tk.admin });
  const vinc = await api('PUT', '/api/vinculos', {
    token: tk.admin,
    corpo: { turma_id: turma.corpo.dados.id, disciplina_id: 2, professor_id: paula.corpo.dados.professor_id, dias: [2, 4, 2] },
  });
  assert.equal(vinc.status, 201, JSON.stringify(vinc.corpo));
  assert.deepEqual(vinc.corpo.dados.dias, [2, 4]);
  const detalhe = await api('GET', `/api/usuarios/${paulaUsuario}`, { token: tk.admin });
  assert.equal(detalhe.corpo.dados.vinculos.length, 1);
  assert.equal(detalhe.corpo.dados.historico_vinculos[0].acao, 'VINCULADO');

  // Trocar o professor de uma disciplina com lançamentos: recusado com mensagem clara
  const troca = await api('PUT', '/api/vinculos', { token: tk.admin, corpo: { turma_id: 1, disciplina_id: 1, professor_id: 2, dias: [1] } });
  assert.equal(troca.status, 409);
  // Sem registros: troca e remoção ficam no histórico
  const trocaOk = await api('PUT', '/api/vinculos', { token: tk.admin, corpo: { turma_id: turma.corpo.dados.id, disciplina_id: 2, professor_id: 3, dias: [] } });
  assert.equal(trocaOk.status, 200);
  assert.equal((await api('DELETE', `/api/vinculos/${turma.corpo.dados.id}/2`, { token: tk.admin })).status, 204);
  const hist = await api('GET', `/api/usuarios/${paulaUsuario}`, { token: tk.admin });
  assert.deepEqual(hist.corpo.dados.historico_vinculos.map((h) => h.acao).sort(), ['DESVINCULADO', 'VINCULADO']);
  assert.equal((await api('GET', '/api/vinculos', { token: tk.carlos })).status, 403);

  // Bimestres
  const b = { data_inicio: '2026-10-05', data_fim: '2026-12-11', digitacao_inicio: '2026-11-01T00:00', digitacao_fim: '2026-10-30T23:59' };
  assert.deepEqual(campos(await api('PUT', '/api/bimestres/4', { token: tk.admin, corpo: b })), ['digitacao_fim']);
  const bim = await api('PUT', '/api/bimestres/4', { token: tk.admin, corpo: { ...b, digitacao_fim: '2026-12-18T23:59' } });
  assert.equal(bim.status, 200);
  assert.equal(bim.corpo.dados.data_fim, '2026-12-11');

  // Disciplinas e turmas
  const disc = await api('POST', '/api/disciplinas', { token: tk.admin, corpo: { nome: 'Artes', area_id: 1 } });
  assert.equal(disc.status, 201);
  assert.equal((await api('POST', '/api/disciplinas', { token: tk.admin, corpo: { nome: 'Artes', area_id: 1 } })).status, 409);
  assert.equal((await api('PUT', `/api/turmas/${turma.corpo.dados.id}`, { token: tk.admin, corpo: { nome: '5º C', serie: 5, turno: 'TARDE', ativo: false } })).status, 200);
  assert.ok((await api('GET', '/api/turmas?todas=1', { token: tk.admin })).corpo.dados.some((t) => t.nome === '5º C' && !t.ativo));
  assert.ok(!(await api('GET', '/api/turmas', { token: tk.admin })).corpo.dados.some((t) => t.nome === '5º C'));

  // Aluno com dados completos: só a coordenação vê documento e contato
  const aluno = await api('POST', '/api/alunos', {
    token: tk.admin,
    corpo: { nome: 'Helena Costa', matricula: '2026050', data_nascimento: '2015-04-04', turma_id: 1, documento: '123.456.789-00', email: 'HELENA@exemplo.com', endereco: 'Rua A, 1' },
  });
  assert.equal(aluno.status, 201, JSON.stringify(aluno.corpo));
  assert.equal(aluno.corpo.dados.email, 'helena@exemplo.com');
  assert.equal((await api('POST', '/api/alunos', { token: tk.admin, corpo: { nome: 'Outra', matricula: '2026051', data_nascimento: '2015-04-04', turma_id: 1, documento: '123.456.789-00' } })).status, 409);
  const visto = await api('GET', `/api/alunos/${aluno.corpo.dados.id}`, { token: tk.carlos });
  assert.equal(visto.status, 200);
  assert.equal(visto.corpo.dados.documento, undefined);

  // Conta de professor: editar, desativar (não entra) e não pode desativar a si mesmo
  const ed = await api('PUT', `/api/usuarios/${paulaUsuario}`, { token: tk.admin, corpo: { nome: 'Paula Artes Souza', email: 'paula.artes@kfka.edu.br', registro: 'P-3000', telefone: '(11) 93333-0000' } });
  assert.equal(ed.status, 200);
  assert.deepEqual(campos(await api('PUT', `/api/usuarios/${paulaUsuario}`, { token: tk.admin, corpo: { nome: 'Paula', email: 'paula.artes@kfka.edu.br', registro: '' } })), ['registro']);
  assert.equal((await api('PATCH', '/api/usuarios/1/ativo', { token: tk.admin, corpo: { ativo: false } })).status, 409);
  assert.equal((await api('PATCH', `/api/usuarios/${paulaUsuario}/ativo`, { token: tk.admin, corpo: { ativo: false } })).status, 200);
  const bloqueado = await api('POST', '/api/auth/login', { corpo: { email: 'paula.artes@kfka.edu.br', senha: 'Artes12345' } });
  assert.equal(bloqueado.status, 403);
});
