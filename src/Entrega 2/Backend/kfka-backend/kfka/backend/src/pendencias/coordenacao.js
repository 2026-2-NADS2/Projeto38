// coordenacao.js — pendências da coordenação (revisões, cadastros, chamados, solicitações).
// Cada item: { id, grupo, titulo, descricao, data, prioridade: alta|media|baixa, status, link }

const db = require('../db');
const env = require('../config/env');
const { plural, dataBr, horasDesde } = require('./comum');

async function doAdmin() {
  const itens = [];
  const ano = env.ANO_LETIVO;

  const aguardando = await db.query(
    `SELECT turma, disciplina, professor, COUNT(*) AS n, MIN(enviado_em) AS desde
       FROM vw_acompanhamento_completo WHERE status IN ('ENVIADO', 'EM_REVISAO') AND ano_letivo = ?
      GROUP BY turma, disciplina, professor ORDER BY MIN(enviado_em)`,
    [ano]
  );
  for (const g of aguardando) {
    itens.push({
      id: `rev-${g.turma}-${g.disciplina}`,
      grupo: 'Relatórios aguardando revisão',
      titulo: `${plural(Number(g.n), 'lançamento', 'lançamentos')} de ${g.disciplina} · ${g.turma}`,
      descricao: `Enviado(s) por ${g.professor}.`,
      data: g.desde,
      prioridade: horasDesde(g.desde) > 48 ? 'alta' : 'media',
      status: 'Aguardando revisão',
      link: '/revisao',
    });
  }

  const devolvidos = await db.query(
    `SELECT professor, COUNT(*) AS n, MAX(enviado_em) AS desde
       FROM vw_acompanhamento_completo WHERE status = 'DEVOLVIDO' AND ano_letivo = ?
      GROUP BY professor`,
    [ano]
  );
  for (const g of devolvidos) {
    itens.push({
      id: `dev-${g.professor}`,
      grupo: 'Relatórios devolvidos para correção',
      titulo: `${plural(Number(g.n), 'lançamento devolvido', 'lançamentos devolvidos')} a ${g.professor}`,
      descricao: 'Aguardando a correção do professor e o reenvio.',
      data: g.desde,
      prioridade: 'baixa',
      status: 'Devolvido',
      link: '/revisao?filtro=devolvidos',
    });
  }

  const semTurma = await db.query(
    `SELECT a.id, a.nome, a.criado_em FROM aluno a
      WHERE a.ativo = TRUE AND NOT EXISTS (SELECT 1 FROM turma_aluno ta WHERE ta.aluno_id = a.id AND ta.ano_letivo = ?)`,
    [ano]
  );
  const semResp = await db.query(
    `SELECT a.id, a.nome, a.criado_em FROM aluno a
      WHERE a.ativo = TRUE AND NOT EXISTS (SELECT 1 FROM aluno_responsavel ar WHERE ar.aluno_id = a.id)`
  );
  const alunosIncompletos = new Map();
  for (const a of semTurma) alunosIncompletos.set(a.id, { ...a, faltas: ['turma'] });
  for (const a of semResp) {
    if (alunosIncompletos.has(a.id)) alunosIncompletos.get(a.id).faltas.push('responsável');
    else alunosIncompletos.set(a.id, { ...a, faltas: ['responsável'] });
  }
  // Lista até 10 alunos; o restante vira um item só (não sobrecarrega a tela nem a resposta)
  const LIMITE_INDIVIDUAL = 10;
  const incompletos = [...alunosIncompletos.values()].sort((x, y) => new Date(y.criado_em) - new Date(x.criado_em));
  if (incompletos.length > LIMITE_INDIVIDUAL) {
    const resto = incompletos.length - LIMITE_INDIVIDUAL;
    itens.push({
      id: 'cad-aluno-resto',
      grupo: 'Cadastros incompletos',
      titulo: `Mais ${plural(resto, 'aluno', 'alunos')} com cadastro incompleto`,
      descricao: `Ao todo, ${incompletos.length} alunos estão sem turma ou sem responsável. Confira a lista de alunos.`,
      data: null,
      prioridade: 'media',
      status: 'Incompleto',
      link: '/alunos',
    });
  }
  for (const a of incompletos.slice(0, LIMITE_INDIVIDUAL)) {
    itens.push({
      id: `cad-aluno-${a.id}`,
      grupo: 'Cadastros incompletos',
      titulo: `${a.nome}: falta ${a.faltas.join(' e ')}`,
      descricao: 'Sem turma o aluno não aparece para os professores; sem responsável, a família não acompanha.',
      data: a.criado_em,
      prioridade: 'media',
      status: 'Incompleto',
      link: `/alunos?abrir=${a.id}`,
    });
  }
  const profSemVinculo = await db.query(
    `SELECT u.id, u.nome, u.criado_em FROM professor p JOIN usuario u ON u.id = p.usuario_id
      WHERE u.ativo = TRUE AND NOT EXISTS (SELECT 1 FROM turma_disciplina_professor tdp WHERE tdp.professor_id = p.id)`
  );
  for (const p of profSemVinculo) {
    itens.push({
      id: `cad-prof-${p.id}`,
      grupo: 'Cadastros incompletos',
      titulo: `${p.nome}: professor sem turma ou disciplina`,
      descricao: 'Vincule o professor às disciplinas e turmas em que leciona.',
      data: p.criado_em,
      prioridade: 'baixa',
      status: 'Incompleto',
      link: `/professores?abrir=${p.id}`,
    });
  }

  const chamados = await db.query(
    `SELECT c.id, c.assunto, c.status, c.criado_em, c.atualizado_em, u.nome
       FROM chamado c JOIN usuario u ON u.id = c.usuario_id
      WHERE c.status IN ('ABERTO', 'EM_ATENDIMENTO') ORDER BY c.atualizado_em`
  );
  for (const c of chamados) {
    itens.push({
      id: `sac-${c.id}`,
      grupo: 'Solicitações de suporte',
      titulo: `Chamado #${c.id}: ${c.assunto}`,
      descricao: `Aberto por ${c.nome}.`,
      data: c.atualizado_em,
      prioridade: c.status === 'ABERTO' && horasDesde(c.criado_em) > 24 ? 'alta' : 'media',
      status: c.status === 'ABERTO' ? 'Aberto' : 'Em atendimento',
      link: `/ajuda?chamado=${c.id}`,
    });
  }

  const justificativas = await db.query(
    `SELECT j.id, j.status, j.criado_em, j.atualizado_em, j.data_inicio, a.nome
       FROM justificativa_falta j JOIN aluno a ON a.id = j.aluno_id
      WHERE j.status IN ('PENDENTE', 'EM_ANALISE') ORDER BY j.criado_em`
  );
  for (const j of justificativas) {
    itens.push({
      id: `jf-${j.id}`,
      grupo: 'Pendências administrativas',
      titulo: `Justificativa de falta: ${j.nome} (${dataBr(j.data_inicio)})`,
      descricao: 'Analise e aprove, recuse ou peça mais informações à família.',
      data: j.atualizado_em,
      prioridade: horasDesde(j.criado_em) > 72 ? 'alta' : 'media',
      status: j.status === 'PENDENTE' ? 'Pendente' : 'Em análise',
      link: `/justificativas?abrir=${j.id}`,
    });
  }

  const documentos = await db.query(
    `SELECT ds.id, ds.tipo, ds.status, ds.criado_em, a.nome
       FROM documento_solicitacao ds JOIN aluno a ON a.id = ds.aluno_id
      WHERE ds.status IN ('SOLICITADO', 'EM_ANALISE') ORDER BY ds.criado_em`
  );
  const nomesDoc = {
    DECLARACAO_MATRICULA: 'Declaração de matrícula',
    DECLARACAO_FREQUENCIA: 'Declaração de frequência',
    HISTORICO_ESCOLAR: 'Histórico escolar',
    BOLETIM: 'Boletim escolar',
    OUTRO: 'Outro documento',
  };
  for (const d of documentos) {
    itens.push({
      id: `doc-${d.id}`,
      grupo: 'Pendências administrativas',
      titulo: `${nomesDoc[d.tipo]} solicitado(a): ${d.nome}`,
      descricao: 'Emita o documento ou informe o motivo da recusa.',
      data: d.criado_em,
      prioridade: horasDesde(d.criado_em) > 72 ? 'alta' : 'baixa',
      status: d.status === 'SOLICITADO' ? 'Solicitado' : 'Em análise',
      link: `/documentos?abrir=${d.id}`,
    });
  }

  const ocorrencias = await db.query(
    `SELECT o.id, o.data_hora, a.nome FROM ocorrencia o JOIN aluno a ON a.id = o.aluno_id
      WHERE o.status = 'ABERTA' ORDER BY o.data_hora`
  );
  for (const o of ocorrencias) {
    itens.push({
      id: `oc-${o.id}`,
      grupo: 'Pendências administrativas',
      titulo: `Ocorrência aberta: ${o.nome}`,
      descricao: 'Registre as providências e acompanhe o caso.',
      data: o.data_hora,
      prioridade: 'media',
      status: 'Aberta',
      link: `/ocorrencias?abrir=${o.id}`,
    });
  }

  return itens;
}

module.exports = doAdmin;
