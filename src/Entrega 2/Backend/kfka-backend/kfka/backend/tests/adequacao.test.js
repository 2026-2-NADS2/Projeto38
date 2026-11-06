// tests/adequacao.test.js — testes da adequação aos requisitos (RF01–RF12 / RNF01–RNF07).
// Cada teste traz no nome o ID usado no relatório de auditoria (T-xx).
//
//   NODE_ENV=test npm test      (APAGA e recria o banco kfka)

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
const tokensEmitidos = [];

async function bruto(metodo, rota, { token, corpo } = {}) {
  return fetch(base + rota, {
    method: metodo,
    headers: {
      ...(corpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
}

async function api(metodo, rota, opcoes = {}) {
  const resp = await bruto(metodo, rota, opcoes);
  const texto = await resp.text();
  let corpo = null;
  try {
    corpo = texto ? JSON.parse(texto) : null;
  } catch {
    corpo = texto;
  }
  return { status: resp.status, corpo, headers: resp.headers };
}

async function logar(email, senha = SENHA) {
  const r = await api('POST', '/api/auth/login', { corpo: { email, senha } });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  tokensEmitidos.push(r.corpo.dados.token);
  return r.corpo.dados.token;
}

// A auditoria é gravada logo depois da resposta: espera um instante antes de consultar
const esperarAuditoria = () => new Promise((ok) => setTimeout(ok, 150));

before(async () => {
  await prepararBanco();
  servidor = app.listen(0);
  await new Promise((ok) => servidor.once('listening', ok));
  base = `http://127.0.0.1:${servidor.address().port}`;
  tk.admin = await logar('admin@kfka.edu.br');
  tk.carlos = await logar('carlos.menezes@kfka.edu.br'); // professor 1: Português (6º A e 4º B), História (6º A)
  tk.fernanda = await logar('fernanda.lopes@kfka.edu.br'); // professor 2: Matemática
  tk.ricardo = await logar('ricardo.tanaka@kfka.edu.br'); // professor 3: Ciências (6º A), Inglês (4º B)
  tk.ana = await logar('ana.ribeiro@email.com'); // Lucas (1) e Beatriz (2)
  tk.luciana = await logar('luciana.andrade@email.com'); // Gabriel (3) e Laura (6)
});

after(async () => {
  servidor?.close();
  await db.pool.end();
});

// ---------------------------------------------------------------------------
// RNF02 / RF01 — sessões
// ---------------------------------------------------------------------------
test('T-01 RNF02: desativar a conta encerra a sessão na hora; reativar não ressuscita o token antigo', async () => {
  const marcos = await logar('marcos.oliveira@email.com');
  assert.equal((await api('GET', '/api/auth/me', { token: marcos })).status, 200);
  const usuarios = await api('GET', '/api/usuarios?perfil=responsavel', { token: tk.admin });
  const id = (usuarios.corpo.dados.find?.((u) => u.email === 'marcos.oliveira@email.com') || { id: 8 }).id;

  assert.equal((await api('PATCH', `/api/usuarios/${id}/ativo`, { token: tk.admin, corpo: { ativo: false } })).status, 200);
  const depois = await api('GET', '/api/auth/me', { token: marcos });
  assert.equal(depois.status, 401);
  assert.match(depois.corpo.erro.mensagem, /encerrada/);
  assert.equal((await api('GET', '/api/boletim', { token: marcos })).status, 401);

  assert.equal((await api('PATCH', `/api/usuarios/${id}/ativo`, { token: tk.admin, corpo: { ativo: true } })).status, 200);
  assert.equal((await api('GET', '/api/auth/me', { token: marcos })).status, 401);
  const novo = await logar('marcos.oliveira@email.com');
  assert.equal((await api('GET', '/api/auth/me', { token: novo })).status, 200);
});

test('T-02 RF01: "Sair" invalida só o token do aparelho; "encerrar todas" invalida os demais', async () => {
  const a = await logar('jose.ribeiro@email.com');
  const b = await logar('jose.ribeiro@email.com');
  assert.equal((await api('POST', '/api/auth/sair', { token: a })).status, 204);
  assert.equal((await api('GET', '/api/auth/me', { token: a })).status, 401);
  assert.equal((await api('GET', '/api/auth/me', { token: b })).status, 200);
  assert.equal((await api('POST', '/api/auth/sair-de-todos', { token: b })).status, 204);
  assert.equal((await api('GET', '/api/auth/me', { token: b })).status, 401);
  // Token adulterado (assinatura inválida) e token sem Bearer
  const adulterado = `${b.slice(0, -3)}abc`;
  assert.equal((await api('GET', '/api/auth/me', { token: adulterado })).status, 401);
});

test('T-03 RNF02: login com e-mail inexistente leva o mesmo tempo que senha errada (não revela contas)', async () => {
  const medir = async (email) => {
    const t0 = process.hrtime.bigint();
    const r = await api('POST', '/api/auth/login', { corpo: { email, senha: 'SenhaErrada1' } });
    assert.equal(r.status, 401);
    assert.equal(r.corpo.erro.mensagem, 'E-mail ou senha incorretos.');
    return Number(process.hrtime.bigint() - t0) / 1e6;
  };
  const existentes = [];
  const inexistentes = [];
  // 2 rodadas: o limitador de tentativas (20 por 15 min) é compartilhado com os outros logins deste arquivo
  for (let i = 0; i < 2; i++) {
    existentes.push(await medir('admin@kfka.edu.br'));
    inexistentes.push(await medir(`ninguem${i}@kfka.edu.br`));
  }
  const media = (l) => l.reduce((s, n) => s + n, 0) / l.length;
  // Sem o hash fictício, o e-mail inexistente respondia em ~1 ms (sem bcrypt) contra ~60 ms
  assert.ok(media(inexistentes) > media(existentes) * 0.5, `inexistente ${media(inexistentes)} ms x existente ${media(existentes)} ms`);
});

// ---------------------------------------------------------------------------
// RF08 / RNF02 — acesso por identificador de outra pessoa (IDOR)
// ---------------------------------------------------------------------------
test('T-04 RF08: responsável e professor não acessam registros de outros por id', async () => {
  assert.equal((await api('GET', '/api/alunos/3', { token: tk.ana })).status, 404); // Gabriel não é filho da Ana
  assert.equal((await api('GET', '/api/alunos/1', { token: tk.ana })).status, 200);
  assert.equal((await api('GET', '/api/boletim/pdf?aluno_id=3', { token: tk.ana })).status, 404);
  assert.equal((await api('GET', '/api/acompanhamentos/10/historico', { token: tk.carlos })).status, 404); // é da Fernanda
  assert.equal((await api('POST', '/api/acompanhamentos/2/ciencia', { token: tk.ana, corpo: {} })).status, 404); // Gabriel
  // Professor não lança para turma/disciplina que não leciona
  const r = await api('PUT', '/api/acompanhamentos', {
    token: tk.fernanda,
    corpo: { aluno_id: 4, disciplina_id: 1, bimestre_id: 4, media: 7, faltas: 0, descricao: 'Não leciono Português.' },
  });
  assert.equal(r.status, 403);
});

test('T-05 RNF02: páginas/operações administrativas recusadas para outros perfis (no servidor)', async () => {
  for (const rota of ['/api/auditoria', '/api/usuarios', '/api/vinculos', '/api/anos-letivos', '/api/relatorios/exportar?formato=csv']) {
    assert.equal((await api('GET', rota, { token: tk.carlos })).status, 403, rota);
    assert.equal((await api('GET', rota, { token: tk.ana })).status, 403, rota);
  }
  assert.equal((await api('GET', '/api/relatorios/indicadores', { token: tk.ana })).status, 403);
  assert.equal((await api('PATCH', '/api/acompanhamentos/10/editar', { token: tk.fernanda, corpo: {} })).status, 403);
  assert.equal((await api('POST', '/api/tags', { token: tk.carlos, corpo: { nome: 'Hack' } })).status, 403);
});

test('T-06 RNF02: conteúdo malicioso é guardado como texto e a busca não aceita SQL', async () => {
  const contatos = await api('GET', '/api/usuarios/contatos', { token: tk.carlos });
  const ana = contatos.corpo.dados.find((c) => c.nome.startsWith('Ana'));
  const payload = '<img src=x onerror=alert(1)><script>alert("x")</script>';
  const r = await api('POST', '/api/mensagens', { token: tk.carlos, corpo: { destinatario_id: ana.id, texto: payload } });
  assert.equal(r.status, 201, JSON.stringify(r.corpo));
  assert.equal(r.corpo.dados.texto, payload); // devolvido como dado JSON; o React mostra como texto
  assert.match(r.headers.get('content-type'), /application\/json/);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');

  // SQL injection na busca: parâmetros (?) tratam o texto como valor
  for (const busca of ["' OR '1'='1", "%' OR 1=1 -- ", "x'); DROP TABLE aluno; --"]) {
    const s = await api('GET', `/api/alunos?busca=${encodeURIComponent(busca)}`, { token: tk.admin });
    assert.equal(s.status, 200);
    assert.equal(s.corpo.dados.length, 0, busca);
  }
  assert.equal((await api('GET', '/api/alunos', { token: tk.admin })).corpo.dados.length, 7);
});

// ---------------------------------------------------------------------------
// RNF04 — integridade em operações com várias alterações
// ---------------------------------------------------------------------------
test('T-07 RNF04: tag inexistente ou desativada desfaz o lançamento inteiro (transação)', async () => {
  const corpo = { aluno_id: 4, disciplina_id: 1, bimestre_id: 4, media: 8, faltas: 1, descricao: 'Sofia participou bem do bimestre.' };
  const planilha = async () =>
    (await api('GET', '/api/acompanhamentos?turma_id=1&disciplina_id=1&bimestre_id=4', { token: tk.carlos })).corpo.dados.alunos.find(
      (a) => a.aluno_id === 4
    ).acompanhamento;

  const inexistente = await api('PUT', '/api/acompanhamentos', { token: tk.carlos, corpo: { ...corpo, tags: [1, 99999] } });
  assert.equal(inexistente.status, 422);
  assert.equal(await planilha(), null); // o INSERT feito antes da tag foi desfeito

  assert.equal((await api('PUT', '/api/tags/6', { token: tk.admin, corpo: { nome: 'Trabalho em equipe', ativo: false } })).status, 200);
  const desativada = await api('PUT', '/api/acompanhamentos', { token: tk.carlos, corpo: { ...corpo, tags: [6] } });
  assert.equal(desativada.status, 422);
  assert.match(JSON.stringify(desativada.corpo), /desativada/);
  assert.equal(await planilha(), null);
  assert.ok(!(await api('GET', '/api/tags', { token: tk.carlos })).corpo.dados.some((t) => t.id === 6));

  const ok = await api('PUT', '/api/acompanhamentos', { token: tk.carlos, corpo: { ...corpo, tags: [1] } });
  assert.equal(ok.status, 201);
  assert.equal((await planilha()).status, 'rascunho');
  // Duplicidade: o mesmo aluno/disciplina/bimestre atualiza o registro, não cria outro
  const denovo = await api('PUT', '/api/acompanhamentos', { token: tk.carlos, corpo: { ...corpo, media: 8.5, tags: [1] } });
  assert.equal(denovo.status, 200);
  assert.equal(denovo.corpo.dados.id, ok.corpo.dados.id);
  const [{ n }] = await db.query('SELECT COUNT(*) AS n FROM acompanhamento WHERE aluno_id = 4 AND disciplina_id = 1 AND bimestre_id = 4');
  assert.equal(Number(n), 1);
});

// ---------------------------------------------------------------------------
// RF06 / RF07 — revisão, alteração, cancelamento e publicação pela coordenação
// ---------------------------------------------------------------------------
test('T-08 RF06/RF07: coordenação altera antes de publicar (versão, motivo, histórico e proteção de concorrência)', async () => {
  const fila = await api('GET', '/api/acompanhamentos/fila?status=pendentes', { token: tk.admin });
  const reg = fila.corpo.dados.find((x) => x.id === 10); // Pedro, Matemática, enviado
  assert.equal(reg.status, 'enviado');

  const faltas = reg.faltas + 1;
  const corpo = { media: 6.5, faltas, descricao: 'Pedro faz as tarefas e melhorou na resolução de problemas.', tags: [2, 3], motivo: 'Ajuste de faltas conforme a chamada.' };
  const conflito = await api('PATCH', '/api/acompanhamentos/10/editar', { token: tk.admin, corpo: { ...corpo, versao: reg.versao + 5 } });
  assert.equal(conflito.status, 409);
  const semMotivo = await api('PATCH', '/api/acompanhamentos/10/editar', { token: tk.admin, corpo: { ...corpo, motivo: '' } });
  assert.equal(semMotivo.status, 422);

  const r = await api('PATCH', '/api/acompanhamentos/10/editar', { token: tk.admin, corpo: { ...corpo, versao: reg.versao } });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.equal(r.corpo.dados.status, 'em_revisao');
  assert.equal(r.corpo.dados.versao, reg.versao + 1);
  assert.equal(r.corpo.dados.faltas, faltas);
  assert.deepEqual(r.corpo.dados.tags.map((t) => t.id).sort(), [2, 3]);

  const hist = await api('GET', '/api/acompanhamentos/10/historico', { token: tk.admin });
  const edicao = hist.corpo.dados.eventos.find((e) => e.acao === 'EDICAO' && e.perfil === 'admin');
  assert.ok(edicao, JSON.stringify(hist.corpo.dados.eventos));
  assert.match(edicao.observacao, /Ajuste de faltas/);
  assert.equal(Number(edicao.faltas_nova), faltas);
  // O professor autor vê o histórico com a alteração da coordenação
  assert.equal((await api('GET', '/api/acompanhamentos/10/historico', { token: tk.fernanda })).status, 200);

  await esperarAuditoria();
  const aud = await api('GET', '/api/auditoria?entidade=acompanhamento&acao=EDITAR_RELATORIO', { token: tk.admin });
  const linha = aud.corpo.dados.find((a) => a.entidade_id === '10');
  assert.ok(linha);
  assert.deepEqual(linha.detalhes.faltas, { de: reg.faltas, para: faltas });
  assert.equal(linha.detalhes.descricao_alterada, true);
  assert.equal(linha.usuario_nome.length > 0, true);
});

test('T-09 RNF04: relatório incompleto não é publicado', async () => {
  // Simula registro legado/corrompido (descrição em branco), direto no banco
  await db.transacao(1, (tx) => tx.query("UPDATE acompanhamento SET descricao = '   ' WHERE id = 10"));
  const r = await api('PATCH', '/api/acompanhamentos/10/publicar', { token: tk.admin });
  assert.equal(r.status, 422);
  assert.equal(r.corpo.erro.codigo, 'RELATORIO_INCOMPLETO');
  const fix = await api('PATCH', '/api/acompanhamentos/10/editar', {
    token: tk.admin,
    corpo: { media: 6.5, faltas: 3, descricao: 'Pedro faz as tarefas e melhorou bastante.', tags: [3], motivo: 'Descrição restaurada.' },
  });
  assert.equal(fix.status, 200);
  const pub = await api('PATCH', '/api/acompanhamentos/10/publicar', { token: tk.admin });
  assert.equal(pub.status, 200);
  assert.equal(pub.corpo.dados.status, 'publicado');
  // Publicado não pode ser editado nem cancelado direto
  assert.equal((await api('PATCH', '/api/acompanhamentos/10/editar', { token: tk.admin, corpo: { media: 1, faltas: 0, descricao: 'xxxxxx', motivo: 'teste teste' } })).status, 409);
  assert.equal((await api('PATCH', '/api/acompanhamentos/10/cancelar', { token: tk.admin, corpo: { motivo: 'teste teste' } })).status, 409);
});

test('T-10 RF06: cancelamento (estado final) bloqueia edição do professor e sai dos indicadores', async () => {
  const antes = await api('GET', '/api/relatorios/indicadores', { token: tk.admin });
  const r = await api('PATCH', '/api/acompanhamentos/13/cancelar', { token: tk.admin, corpo: { motivo: 'Lançamento em duplicidade.' } });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.equal(r.corpo.dados.status, 'cancelado');
  assert.equal((await api('PATCH', '/api/acompanhamentos/13/cancelar', { token: tk.admin, corpo: { motivo: 'De novo, de novo.' } })).status, 409);
  const prof = await api('PUT', '/api/acompanhamentos', {
    token: tk.ricardo,
    corpo: { aluno_id: 2, disciplina_id: 2, bimestre_id: 1, media: 7, faltas: 0, descricao: 'Tentando editar cancelado.' },
  });
  assert.equal(prof.status, 409);
  assert.equal((await api('PATCH', '/api/acompanhamentos/13/publicar', { token: tk.admin })).status, 409);
  // O banco também recusa mexer em cancelado (trigger)
  await assert.rejects(
    db.transacao(1, (tx) => tx.query("UPDATE acompanhamento SET status = 'ENVIADO' WHERE id = 13")),
    (e) => e.sqlState === '45000'
  );
  const depois = await api('GET', '/api/relatorios/indicadores', { token: tk.admin });
  assert.equal(depois.corpo.dados.por_status.cancelado, antes.corpo.dados.por_status.cancelado + 1);
  assert.equal(depois.corpo.dados.totais.registros, antes.corpo.dados.totais.registros - 1);
  const cancelados = await api('GET', '/api/acompanhamentos/fila?status=cancelados', { token: tk.admin });
  assert.ok(cancelados.corpo.dados.some((x) => x.id === 13));
});

// ---------------------------------------------------------------------------
// RF09 — PDF
// ---------------------------------------------------------------------------
test('T-11 RF09: PDF do boletim gerado no servidor só com relatórios publicados', async () => {
  const resp = await bruto('GET', '/api/boletim/pdf?aluno_id=1', { token: tk.ana });
  assert.equal(resp.status, 200);
  assert.equal(resp.headers.get('content-type'), 'application/pdf');
  assert.match(resp.headers.get('content-disposition'), /attachment; filename="boletim-.*\.pdf"/);
  const pdf = Buffer.from(await resp.arrayBuffer());
  const texto = pdf.toString('latin1');
  assert.ok(texto.startsWith('%PDF-1.4'));
  assert.ok(texto.trimEnd().endsWith('%%EOF'));
  assert.ok(texto.includes('Lucas Ribeiro'));
  assert.ok(texto.includes('Lucas lê com fluência'.slice(0, 18).normalize('NFC'))); // publicado (id 1)
  assert.ok(!texto.includes('Lucas manteve o bom desempenho')); // rascunho do 4º bimestre (id 6)

  assert.equal((await api('GET', '/api/boletim/pdf?aluno_id=1&bimestre=4', { token: tk.ana })).status, 404);
  assert.equal((await api('GET', '/api/boletim/pdf?aluno_id=1', { token: tk.carlos })).status, 403);
  assert.equal((await api('GET', '/api/boletim/pdf?aluno_id=abc', { token: tk.ana })).status, 422);
  assert.equal((await bruto('GET', '/api/boletim/pdf?aluno_id=1', { token: tk.admin })).status, 200);

  await esperarAuditoria();
  const aud = await api('GET', '/api/auditoria?acao=GERAR_PDF_BOLETIM', { token: tk.admin });
  assert.ok(aud.corpo.dados.length >= 2);
});

// ---------------------------------------------------------------------------
// RF10 / RF12 — relatórios gerenciais e retornos
// ---------------------------------------------------------------------------
test('T-12 RF10: indicadores consistentes com os registros e professor limitado aos próprios', async () => {
  const ind = (await api('GET', '/api/relatorios/indicadores', { token: tk.admin })).corpo.dados;
  const soma = (lista) => lista.reduce((s, l) => s + l.registros, 0);
  assert.equal(soma(ind.por_turma), ind.totais.registros);
  assert.equal(soma(ind.por_disciplina), ind.totais.registros);
  assert.equal(soma(ind.por_professor), ind.totais.registros);
  const [{ n }] = await db.query(
    "SELECT COUNT(*) AS n FROM acompanhamento a JOIN bimestre b ON b.id = a.bimestre_id WHERE b.ano_letivo = 2026 AND a.status <> 'CANCELADO'"
  );
  assert.equal(ind.totais.registros, Number(n));
  const [{ m }] = await db.query("SELECT AVG(media) AS m FROM acompanhamento WHERE status = 'PUBLICADO'");
  assert.equal(ind.totais.media, Number(Number(m).toFixed(2)));

  // Filtros combinados (turma + tag) e paginação dos registros
  const filtrado = await api('GET', '/api/relatorios/registros?turma_id=1&tag_id=1&por_pagina=2', { token: tk.admin });
  assert.equal(filtrado.status, 200);
  assert.ok(filtrado.corpo.dados.length <= 2);
  filtrado.corpo.dados.forEach((r) => {
    assert.equal(r.turma, '6º A');
    assert.ok(r.tags.includes('Participativo'));
  });

  // Professor: mesmo pedindo outro professor, só vê os seus
  const fer = await api('GET', '/api/relatorios/registros?professor_id=1&por_pagina=100', { token: tk.fernanda });
  assert.ok(fer.corpo.dados.length > 0);
  assert.ok(fer.corpo.dados.every((r) => r.professor === 'Fernanda Lopes'), JSON.stringify(fer.corpo.dados.map((r) => r.professor)));
  const indFer = (await api('GET', '/api/relatorios/indicadores', { token: tk.fernanda })).corpo.dados;
  assert.deepEqual(indFer.por_professor.map((p) => p.professor), ['Fernanda Lopes']);
  assert.equal((await api('GET', '/api/relatorios/registros?status=xyz', { token: tk.admin })).status, 422);
});

test('T-13 RF12: observação do responsável chega ao professor e à coordenação com autor e data', async () => {
  const obs = 'Obrigada! Vamos reforçar a leitura em casa.';
  // Registro 5: Lucas, História (Prof. Carlos), publicado e ainda sem ciência
  const c = await api('POST', '/api/acompanhamentos/5/ciencia', { token: tk.ana, corpo: { observacao: obs } });
  assert.equal(c.status, 201);

  const carlos = await api('GET', '/api/relatorios/retornos?com_observacao=1', { token: tk.carlos });
  const ret = carlos.corpo.dados.find((r) => r.acompanhamento_id === 5);
  assert.ok(ret, JSON.stringify(carlos.corpo));
  assert.equal(ret.observacao, obs);
  assert.match(ret.responsavel, /^Ana/);
  assert.ok(ret.data_ciencia);
  assert.equal(ret.parentesco.length > 0, true);
  // Outro professor não vê o retorno de uma disciplina que não é dele
  const fer = await api('GET', '/api/relatorios/retornos', { token: tk.fernanda });
  assert.ok(!fer.corpo.dados.some((r) => r.acompanhamento_id === 5));

  const hist = await api('GET', '/api/acompanhamentos/5/historico', { token: tk.admin });
  assert.equal(hist.corpo.dados.ciencias[0].observacao, obs);
  assert.match(hist.corpo.dados.ciencias[0].responsavel, /^Ana/);
});

// ---------------------------------------------------------------------------
// RF11 — exportação
// ---------------------------------------------------------------------------
test('T-14 RF11: exportação CSV/XLSX respeita filtros e permissões e fica na auditoria', async () => {
  const total = (await api('GET', '/api/relatorios/registros?turma_id=1&por_pagina=1', { token: tk.admin })).corpo.meta.total;
  const resp = await bruto('GET', '/api/relatorios/exportar?formato=csv&conteudo=registros&turma_id=1', { token: tk.admin });
  assert.equal(resp.status, 200);
  assert.match(resp.headers.get('content-type'), /text\/csv/);
  const csvTexto = Buffer.from(await resp.arrayBuffer()).toString('utf8');
  assert.equal(csvTexto.charCodeAt(0), 0xfeff); // BOM: acentos certos no Excel
  const linhas = csvTexto.slice(1).trim().split('\r\n');
  assert.equal(linhas.length, total + 1);
  assert.match(linhas[0], /^ID;Ano;Bimestre;Turma;/);
  assert.ok(linhas.slice(1).every((l) => l.split(';')[3] === '6º A'));

  const x = await bruto('GET', '/api/relatorios/exportar?formato=xlsx&conteudo=indicadores', { token: tk.admin });
  assert.equal(x.status, 200);
  assert.match(x.headers.get('content-type'), /spreadsheetml/);
  const zip = Buffer.from(await x.arrayBuffer());
  assert.equal(zip.readUInt32LE(0), 0x04034b50); // assinatura ZIP (PK)
  assert.ok(zip.includes(Buffer.from('xl/worksheets/sheet7.xml'))); // 7 abas de indicadores

  const r = await bruto('GET', '/api/relatorios/exportar?formato=xlsx&conteudo=retornos', { token: tk.admin });
  assert.equal(r.status, 200);

  assert.equal((await api('GET', '/api/relatorios/exportar?formato=csv', { token: tk.fernanda })).status, 403);
  assert.equal((await api('GET', '/api/relatorios/exportar?formato=pdf', { token: tk.admin })).status, 422);

  await esperarAuditoria();
  const aud = await api('GET', '/api/auditoria?acao=EXPORTAR_RELATORIO', { token: tk.admin });
  const csvAud = aud.corpo.dados.find((a) => a.detalhes.formato === 'csv');
  assert.equal(csvAud.detalhes.filtros.turma_id, 1);
  assert.equal(csvAud.detalhes.linhas, total);
  const negado = await api('GET', '/api/auditoria?resultado=NEGADO&entidade=relatorios', { token: tk.admin });
  assert.ok(negado.corpo.dados.some((a) => a.perfil === 'professor'));
});

// ---------------------------------------------------------------------------
// RF04 — ano letivo e bimestres
// ---------------------------------------------------------------------------
const periodo = (ano, n, ini, fim) => ({
  numero: n,
  data_inicio: `${ano}-${ini}`,
  data_fim: `${ano}-${fim}`,
  digitacao_inicio: `${ano}-${fim}T00:00`,
  digitacao_fim: `${ano}-${fim}T23:59`,
});

test('T-15 RF04: exatamente 4 bimestres por ano, sem sobreposição, com situação calculada', async () => {
  const bims = (await api('GET', '/api/bimestres', { token: tk.carlos })).corpo.dados;
  assert.deepEqual(bims.map((b) => b.numero), [1, 2, 3, 4]);
  assert.equal(bims[0].situacao, 'encerrado');
  assert.equal(bims[0].digitacao, 'encerrada');
  const b4 = bims[3];
  assert.equal(b4.digitacao, b4.aberto ? 'aberta' : b4.digitacao); // coerente com "aberto"
  assert.ok(['futuro', 'em_andamento', 'encerrado'].includes(b4.situacao));

  const quatro = [periodo(2027, 1, '02-01', '04-16'), periodo(2027, 2, '04-26', '07-02'), periodo(2027, 3, '07-26', '09-30'), periodo(2027, 4, '10-04', '12-10')];
  const tres = await api('POST', '/api/anos-letivos', { token: tk.admin, corpo: { ano_letivo: 2027, bimestres: quatro.slice(0, 3) } });
  assert.equal(tres.status, 422);
  const sobrepostos = await api('POST', '/api/anos-letivos', {
    token: tk.admin,
    corpo: { ano_letivo: 2027, bimestres: [quatro[0], { ...quatro[1], data_inicio: '2027-04-10' }, quatro[2], quatro[3]] },
  });
  assert.equal(sobrepostos.status, 422);
  const outroAno = await api('POST', '/api/anos-letivos', { token: tk.admin, corpo: { ano_letivo: 2028, bimestres: quatro } });
  assert.equal(outroAno.status, 422);

  const ok = await api('POST', '/api/anos-letivos', { token: tk.admin, corpo: { ano_letivo: 2027, bimestres: quatro } });
  assert.equal(ok.status, 201, JSON.stringify(ok.corpo));
  assert.equal(ok.corpo.dados.length, 4);
  assert.ok(ok.corpo.dados.every((b) => b.situacao === 'futuro' && b.digitacao === 'agendada'));
  assert.equal((await api('POST', '/api/anos-letivos', { token: tk.admin, corpo: { ano_letivo: 2027, bimestres: quatro } })).status, 409);

  // O banco recusa um 5º bimestre (CHECK numero 1..4) e o 1º repetido (UNIQUE)
  await assert.rejects(
    db.query("INSERT INTO bimestre (ano_letivo, numero, digitacao_inicio, digitacao_fim) VALUES (2027, 5, '2027-12-01', '2027-12-02')")
  );
  await assert.rejects(
    db.query("INSERT INTO bimestre (ano_letivo, numero, digitacao_inicio, digitacao_fim) VALUES (2027, 1, '2027-12-01', '2027-12-02')")
  );

  // Edição que invade o bimestre vizinho é recusada
  const b2 = bims[1];
  const invade = await api('PUT', `/api/bimestres/${b2.id}`, {
    token: tk.admin,
    corpo: { data_inicio: '2026-04-01', data_fim: b2.data_fim, digitacao_inicio: '2026-06-29T00:00', digitacao_fim: '2026-07-10T23:59' },
  });
  assert.equal(invade.status, 422);
  assert.match(JSON.stringify(invade.corpo), /depois do fim do 1º/);
});

// ---------------------------------------------------------------------------
// RF02 / RF03 — áreas, tags e vínculos
// ---------------------------------------------------------------------------
test('T-16 RF02: áreas e tags com cadastro, edição, desativação e exclusão protegida', async () => {
  const area = await api('POST', '/api/areas', { token: tk.admin, corpo: { nome: 'Artes' } });
  assert.equal(area.status, 201);
  assert.equal((await api('POST', '/api/areas', { token: tk.admin, corpo: { nome: 'Artes' } })).status, 409);
  assert.equal((await api('PUT', `/api/areas/${area.corpo.dados.id}`, { token: tk.admin, corpo: { nome: 'Artes e Música' } })).status, 200);
  const disc = await api('POST', '/api/disciplinas', { token: tk.admin, corpo: { nome: 'Música', area_id: area.corpo.dados.id, ativo: false } });
  assert.equal(disc.status, 201);
  assert.equal((await api('DELETE', `/api/areas/${area.corpo.dados.id}`, { token: tk.admin })).status, 409);
  const vazia = await api('POST', '/api/areas', { token: tk.admin, corpo: { nome: 'Área temporária' } });
  assert.equal((await api('DELETE', `/api/areas/${vazia.corpo.dados.id}`, { token: tk.admin })).status, 204);

  const tag = await api('POST', '/api/tags', { token: tk.admin, corpo: { nome: 'Criativo', descricao: 'Propõe soluções novas' } });
  assert.equal(tag.status, 201);
  assert.ok((await api('GET', '/api/tags', { token: tk.carlos })).corpo.dados.some((t) => t.nome === 'Criativo'));
  assert.equal((await api('DELETE', `/api/tags/${tag.corpo.dados.id}`, { token: tk.admin })).status, 204);
  assert.equal((await api('DELETE', '/api/tags/1', { token: tk.admin })).status, 409); // usada em registros
  const todas = await api('GET', '/api/tags?todas=1', { token: tk.admin });
  assert.ok(todas.corpo.dados.some((t) => t.id === 6 && t.ativo === false));

  // Vínculo incompatível: disciplina desativada; vínculo repetido não duplica
  const incompat = await api('PUT', '/api/vinculos', {
    token: tk.admin,
    corpo: { turma_id: 1, disciplina_id: disc.corpo.dados.id, professor_id: 1, dias: [1] },
  });
  assert.equal(incompat.status, 422);
  const antes = (await api('GET', '/api/vinculos?turma_id=1', { token: tk.admin })).corpo.dados.length;
  const repetido = await api('PUT', '/api/vinculos', { token: tk.admin, corpo: { turma_id: 1, disciplina_id: 1, professor_id: 1, dias: [1, 3] } });
  assert.equal(repetido.status, 200);
  assert.equal((await api('GET', '/api/vinculos?turma_id=1', { token: tk.admin })).corpo.dados.length, antes);
});

// ---------------------------------------------------------------------------
// RNF03 — LGPD
// ---------------------------------------------------------------------------
test('T-17 RNF03: conta criada pela coordenação só acessa dados após o aceite; "meus dados" sem segredos', async () => {
  const novo = await api('POST', '/api/usuarios', {
    token: tk.admin,
    corpo: { nome: 'Responsável Teste', email: 'resp.teste@email.com', senha: 'Senha@123', perfil: 'responsavel' },
  });
  assert.equal(novo.status, 201);
  const login = await api('POST', '/api/auth/login', { corpo: { email: 'resp.teste@email.com', senha: 'Senha@123' } });
  assert.equal(login.corpo.dados.usuario.aceite_pendente, true);
  const t = login.corpo.dados.token;
  const bloqueado = await api('GET', '/api/alunos', { token: t });
  assert.equal(bloqueado.status, 403);
  assert.equal(bloqueado.corpo.erro.codigo, 'ACEITE_PENDENTE');
  assert.equal((await api('GET', '/api/perfil', { token: t })).status, 200);
  assert.equal((await api('POST', '/api/perfil/aceite', { token: t, corpo: { aceite: false } })).status, 422);
  const aceite = await api('POST', '/api/perfil/aceite', { token: t, corpo: { aceite: true } });
  assert.equal(aceite.status, 200);
  assert.ok(aceite.corpo.dados.aceite_lgpd_em);
  assert.equal((await api('GET', '/api/alunos', { token: t })).status, 200);
  assert.equal((await api('GET', '/api/auth/me', { token: t })).corpo.dados.aceite_pendente, false);

  const meus = await api('GET', '/api/perfil/meus-dados', { token: tk.ana });
  assert.equal(meus.status, 200);
  assert.match(meus.headers.get('content-disposition'), /meus-dados/);
  assert.equal(meus.corpo.dados.alunos.length, 2);
  assert.ok(meus.corpo.dados.relatorios_publicados.length > 0);
  const json = JSON.stringify(meus.corpo);
  assert.ok(!/senha|\$2[aby]\$|token/i.test(json));
});

// ---------------------------------------------------------------------------
// RNF06 — auditoria
// ---------------------------------------------------------------------------
test('T-18 RNF06: auditoria registra ações e falhas, é imutável e não guarda segredos', async () => {
  await api('POST', '/api/auth/login', { corpo: { email: 'admin@kfka.edu.br', senha: 'SenhaErrada9' } });
  await api('GET', '/api/auditoria', { token: tk.fernanda }); // negado
  await esperarAuditoria();

  const acoes = new Set();
  let pagina = 1;
  let paginas = 1;
  const todas = [];
  do {
    const r = await api('GET', `/api/auditoria?pagina=${pagina}&por_pagina=100`, { token: tk.admin });
    assert.equal(r.status, 200);
    r.corpo.dados.forEach((a) => acoes.add(a.acao) && todas.push(a));
    paginas = r.corpo.meta.paginas;
    pagina += 1;
  } while (pagina <= paginas);

  for (const esperado of [
    'LOGIN',
    'DESATIVAR_USUARIO',
    'ATIVAR_USUARIO',
    'EDITAR_RELATORIO',
    'PUBLICAR_RELATORIO',
    'CANCELAR_RELATORIO',
    'CRIAR_ANO_LETIVO',
    'CRIAR_AREA',
    'DESATIVAR_TAG',
    'ALTERAR_VINCULO',
    'EXPORTAR_RELATORIO',
    'EXPORTAR_MEUS_DADOS',
    'ACEITE_LGPD',
    'CRIAR_USUARIO',
    'LOGOUT',
  ]) {
    assert.ok(acoes.has(esperado), `faltou ${esperado}`);
  }
  assert.ok(todas.some((a) => a.acao === 'LOGIN' && a.resultado === 'FALHA' && a.detalhes.motivo === 'senha incorreta'));
  assert.ok(todas.some((a) => a.resultado === 'NEGADO' && a.entidade === 'auditoria' && a.perfil === 'professor'));
  assert.ok(todas.every((a) => a.data_hora && a.acao && a.entidade));

  // Nada de senha, hash ou token nos registros
  const texto = JSON.stringify(todas);
  assert.ok(!texto.includes(SENHA) && !texto.includes('SenhaErrada9') && !/\$2[aby]\$/.test(texto));
  tokensEmitidos.forEach((t) => assert.ok(!texto.includes(t.split('.')[2])));

  // Imutável: o banco recusa UPDATE e DELETE
  await assert.rejects(db.query("UPDATE auditoria SET acao = 'X' WHERE id = 1"), (e) => e.sqlState === '45000');
  await assert.rejects(db.query('DELETE FROM auditoria WHERE id = 1'), (e) => e.sqlState === '45000');
  // E não existe rota para isso
  assert.equal((await api('DELETE', '/api/auditoria/1', { token: tk.admin })).status, 404);
});

// ---------------------------------------------------------------------------
// RNF05 — paginação
// ---------------------------------------------------------------------------
test('T-19 RNF05: listas extensas paginadas no banco', async () => {
  const p1 = await api('GET', '/api/alunos?pagina=1&por_pagina=3&situacao=todos', { token: tk.admin });
  assert.equal(p1.corpo.dados.length, 3);
  assert.equal(p1.corpo.meta.total, 7);
  assert.equal(p1.corpo.meta.paginas, 3);
  const p3 = await api('GET', '/api/alunos?pagina=3&por_pagina=3&situacao=todos', { token: tk.admin });
  assert.equal(p3.corpo.dados.length, 1);
  const ids = new Set([...p1.corpo.dados, ...p3.corpo.dados].map((a) => a.id));
  assert.equal(ids.size, 4);
  assert.equal((await api('GET', '/api/alunos?pagina=1&por_pagina=500', { token: tk.admin })).status, 422);
  const aud = await api('GET', '/api/auditoria?por_pagina=5', { token: tk.admin });
  assert.equal(aud.corpo.dados.length, 5);
  assert.ok(aud.corpo.meta.total > 5);
});

// ---------------------------------------------------------------------------
// RNF02 — cabeçalhos de segurança (helmet)
// ---------------------------------------------------------------------------
test('T-21 RNF02: cabeçalhos de segurança (CSP, quadro, MIME, HSTS) e sem X-Powered-By', async () => {
  for (const rota of ['/api/saude', '/api/rota-que-nao-existe', '/login']) {
    const r = await bruto('GET', rota);
    const csp = r.headers.get('content-security-policy') || '';
    assert.match(csp, /default-src 'self'/, rota);
    assert.match(csp, /script-src 'self'(;|$)/, rota); // sem 'unsafe-inline' nem 'unsafe-eval' em script
    assert.match(csp, /object-src 'none'/, rota);
    assert.match(csp, /frame-ancestors 'self'/, rota);
    assert.doesNotMatch(csp, /script-src[^;]*unsafe/, rota);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(r.headers.get('x-frame-options'), 'SAMEORIGIN');
    assert.match(r.headers.get('strict-transport-security') || '', /max-age=\d+/);
    assert.equal(r.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(r.headers.get('x-powered-by'), null);
  }
});

// ---------------------------------------------------------------------------
// RNF05 — paginação das demais listas e histórico de mensagens por partes
// ---------------------------------------------------------------------------
test('T-22 RNF05: chamados, ocorrências, justificativas, documentos e fila de revisão paginados', async () => {
  const rotas = [
    ['/api/chamados', tk.admin],
    ['/api/ocorrencias', tk.admin],
    ['/api/justificativas', tk.admin],
    ['/api/documentos', tk.admin],
    ['/api/acompanhamentos/fila?status=publicados', tk.admin],
  ];
  for (const [rota, token] of rotas) {
    const sep = rota.includes('?') ? '&' : '?';
    const todos = (await api('GET', rota, { token })).corpo.dados;
    assert.ok(todos.length >= 1, rota);
    const p1 = await api('GET', `${rota}${sep}pagina=1&por_pagina=1`, { token });
    assert.equal(p1.status, 200, rota);
    assert.equal(p1.corpo.dados.length, 1, rota);
    assert.equal(p1.corpo.meta.total, todos.length, rota);
    assert.equal(p1.corpo.meta.paginas, todos.length, rota);
    assert.equal(p1.corpo.dados[0].id, todos[0].id, rota); // mesma ordem da lista completa
    if (todos.length > 1) {
      const p2 = await api('GET', `${rota}${sep}pagina=2&por_pagina=1`, { token });
      assert.equal(p2.corpo.dados[0].id, todos[1].id, rota);
    }
    assert.equal((await api('GET', `${rota}${sep}pagina=1&por_pagina=0`, { token })).status, 422, rota);
    assert.equal((await api('GET', `${rota}${sep}pagina=abc`, { token })).status, 422, rota);
  }
  // Detalhe por id (para links de pendência fora da página) com a mesma regra de acesso da lista
  const minhas = (await api('GET', '/api/justificativas', { token: tk.ana })).corpo.dados;
  assert.ok(minhas.length > 0);
  assert.equal((await api('GET', `/api/justificativas/${minhas[0].id}`, { token: tk.ana })).status, 200);
  assert.equal((await api('GET', `/api/justificativas/${minhas[0].id}`, { token: tk.luciana })).status, 404);
  const docs = (await api('GET', '/api/documentos', { token: tk.ana })).corpo.dados;
  if (docs.length) {
    assert.equal((await api('GET', `/api/documentos/${docs[0].id}`, { token: tk.ana })).status, 200);
    assert.equal((await api('GET', `/api/documentos/${docs[0].id}`, { token: tk.luciana })).status, 404);
  }
});

test('T-23 RNF05: mural carrega 50 mensagens por vez e as anteriores sob demanda', async () => {
  const contatos = (await api('GET', '/api/usuarios/contatos', { token: tk.carlos })).corpo.dados;
  const ana = contatos.find((c) => c.nome.startsWith('Ana'));
  for (let i = 1; i <= 60; i++) {
    const r = await api('POST', '/api/mensagens', { token: tk.carlos, corpo: { destinatario_id: ana.id, texto: `Mensagem de teste ${i}` } });
    assert.equal(r.status, 201);
  }
  const eu = (await api('GET', '/api/auth/me', { token: tk.carlos })).corpo.dados.id;
  const primeira = await api('GET', `/api/mensagens/${ana.id}`, { token: tk.carlos });
  const m1 = primeira.corpo.dados.mensagens;
  assert.equal(m1.length, 50);
  assert.equal(primeira.corpo.dados.tem_mais, true);
  assert.equal(m1.at(-1).texto, 'Mensagem de teste 60'); // a mais recente por último
  assert.ok(m1.every((m, i) => i === 0 || m.id > m1[i - 1].id)); // ordem cronológica
  const anteriores = await api('GET', `/api/mensagens/${ana.id}?antes_de=${m1[0].id}&limite=50`, { token: tk.carlos });
  const m2 = anteriores.corpo.dados.mensagens;
  assert.ok(m2.length > 0 && m2.every((m) => m.id < m1[0].id));
  const [{ n }] = await db.query(
    'SELECT COUNT(*) AS n FROM mensagem WHERE (remetente_id = ? AND destinatario_id = ?) OR (remetente_id = ? AND destinatario_id = ?)',
    [eu, ana.id, ana.id, eu]
  );
  assert.equal(m1.length + m2.length, Math.min(Number(n), 100));
  assert.equal(anteriores.corpo.dados.tem_mais, Number(n) > 100);
  // A lista de conversas é calculada no banco: última mensagem e não lidas corretas
  const conversas = (await api('GET', '/api/mensagens/conversas', { token: tk.ana })).corpo.dados;
  const comCarlos = conversas.find((c) => c.contato_id === eu);
  assert.equal(comCarlos.ultima_mensagem, 'Mensagem de teste 60');
  assert.ok(comCarlos.nao_lidas >= 60);
  assert.equal(conversas[0].contato_id, eu); // a conversa mais recente primeiro
});

// ---------------------------------------------------------------------------
// RNF06 — auditoria gravada junto com a operação
// ---------------------------------------------------------------------------
test('T-24 RNF06: sem registro de auditoria a operação administrativa não acontece (mesma transação)', async () => {
  const [{ v }] = await db.query('SELECT VERSION() AS v');
  const ehPostgres = /PostgreSQL/i.test(String(v));
  // Simula falha ao gravar a auditoria: um trigger que recusa qualquer INSERT na tabela
  if (ehPostgres) {
    await db.query(`CREATE OR REPLACE FUNCTION falha_auditoria() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'auditoria indisponível' USING ERRCODE = '45000'; END $$`);
    await db.query('CREATE TRIGGER trg_teste_falha BEFORE INSERT ON auditoria FOR EACH ROW EXECUTE FUNCTION falha_auditoria()');
  } else {
    await db.query(
      "CREATE TRIGGER trg_teste_falha BEFORE INSERT ON auditoria FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'auditoria indisponível'; END"
    );
  }
  try {
    const [antes] = await db.query('SELECT nome, ativo FROM tag WHERE id = 2');
    const r = await api('PUT', '/api/tags/2', { token: tk.admin, corpo: { nome: 'Nome que não pode ficar', ativo: false } });
    assert.ok(r.status >= 400, `status ${r.status}`);
    const [depois] = await db.query('SELECT nome, ativo FROM tag WHERE id = 2');
    assert.deepEqual(depois, antes); // a alteração foi desfeita junto

    const pub = await api('PATCH', '/api/acompanhamentos/11/revisar', { token: tk.admin });
    assert.ok(pub.status >= 400);
    const [{ status }] = await db.query('SELECT status FROM acompanhamento WHERE id = 11');
    assert.notEqual(status, 'EM_REVISAO');

    // Exportação e PDF não são entregues se o acesso não puder ser registrado
    const exp = await bruto('GET', '/api/relatorios/exportar?formato=csv', { token: tk.admin });
    assert.ok(exp.status >= 400);
    assert.match(exp.headers.get('content-type'), /json/);
    const pdf = await bruto('GET', '/api/boletim/pdf?aluno_id=1', { token: tk.ana });
    assert.ok(pdf.status >= 400);
  } finally {
    await db.query(ehPostgres ? 'DROP TRIGGER trg_teste_falha ON auditoria' : 'DROP TRIGGER trg_teste_falha');
  }
  // Operação que falha (409) não deixa registro de sucesso
  const [{ n: antesN }] = await db.query("SELECT COUNT(*) AS n FROM auditoria WHERE acao = 'CANCELAR_RELATORIO'");
  assert.equal((await api('PATCH', '/api/acompanhamentos/13/cancelar', { token: tk.admin, corpo: { motivo: 'Tentativa repetida.' } })).status, 409);
  await esperarAuditoria();
  const [{ n: depoisN }] = await db.query("SELECT COUNT(*) AS n FROM auditoria WHERE acao = 'CANCELAR_RELATORIO'");
  assert.equal(Number(depoisN), Number(antesN));
});
