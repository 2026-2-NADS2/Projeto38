// responsavel.js — pendências do responsável (boletins novos, faltas, atividades, solicitações).
// Cada item: { id, grupo, titulo, descricao, data, prioridade: alta|media|baixa, status, link }

const db = require('../db');
const env = require('../config/env');
const { alunosDoResponsavel } = require('../utils/acesso');
const { hoje, somarDias } = require('../utils/datas');
const { plural, dataBr } = require('./comum');

async function doResponsavel(usuario) {
  const itens = [];
  const rid = usuario.responsavelId;
  const filhos = await alunosDoResponsavel(rid);
  if (!filhos.length) return itens;
  const ano = env.ANO_LETIVO;

  // Boletins novos (publicados e não abertos)
  const publicados = await db.query(
    `SELECT v.aluno_id, v.aluno, v.bimestre, MAX(v.publicado_em) AS publicado_em,
            SUM(CASE WHEN v.data_ciencia IS NULL THEN 1 ELSE 0 END) AS sem_ciencia
       FROM vw_relatorio_responsavel v
      WHERE v.responsavel_id = ? AND v.ano_letivo = ?
      GROUP BY v.aluno_id, v.aluno, v.bimestre`,
    [rid, ano]
  );
  const vistos = await db.query(
    `SELECT v.aluno_id, b.numero, v.visualizado_em FROM boletim_visualizacao v JOIN bimestre b ON b.id = v.bimestre_id
      WHERE v.responsavel_id = ? AND b.ano_letivo = ?`,
    [rid, ano]
  );
  for (const p of publicados) {
    const visto = vistos.find((v) => v.aluno_id === p.aluno_id && v.numero === p.bimestre);
    const novo = !visto || new Date(visto.visualizado_em) < new Date(p.publicado_em);
    if (novo) {
      itens.push({
        id: `bol-${p.aluno_id}-${p.bimestre}`,
        grupo: 'Boletins ainda não visualizados',
        titulo: `Boletim do ${p.bimestre}º bimestre de ${p.aluno}`,
        descricao: 'Há notas e pareceres publicados que você ainda não abriu.',
        data: p.publicado_em,
        prioridade: 'media',
        status: 'Novo',
        link: `/boletim?aluno=${p.aluno_id}&bimestre=${p.bimestre}`,
      });
    } else if (Number(p.sem_ciencia) > 0) {
      itens.push({
        id: `cie-${p.aluno_id}-${p.bimestre}`,
        grupo: 'Boletins ainda não visualizados',
        titulo: `Confirme a ciência: ${p.aluno} (${p.bimestre}º bimestre)`,
        descricao: `${plural(Number(p.sem_ciencia), 'disciplina aguarda', 'disciplinas aguardam')} a sua confirmação.`,
        data: p.publicado_em,
        prioridade: 'baixa',
        status: 'Aguardando ciência',
        link: `/boletim?aluno=${p.aluno_id}&bimestre=${p.bimestre}`,
      });
    }
  }

  // Faltas sem justificativa (últimos 30 dias) e justificativas que pedem informação
  const faltas = await db.query(
    `SELECT DISTINCT p.aluno_id, al.nome, a.data
       FROM aula_presenca p JOIN aula a ON a.id = p.aula_id JOIN aluno al ON al.id = p.aluno_id
      WHERE p.presente = FALSE AND p.aluno_id IN (?) AND a.data >= ?
        AND NOT EXISTS (SELECT 1 FROM justificativa_falta j WHERE j.aluno_id = p.aluno_id
                         AND j.status <> 'RECUSADA' AND a.data BETWEEN j.data_inicio AND j.data_fim)`,
    [filhos, somarDias(hoje(), -30)]
  );
  for (const f of faltas) {
    itens.push({
      id: `falta-${f.aluno_id}-${f.data}`,
      grupo: 'Justificativas de faltas pendentes',
      titulo: `Falta de ${f.nome} em ${dataBr(f.data)}`,
      descricao: 'Se a ausência teve motivo, envie a justificativa para a escola.',
      data: f.data,
      prioridade: 'media',
      status: 'Sem justificativa',
      link: `/justificativas?nova=${f.aluno_id}&data=${f.data}`,
    });
  }
  const pedemInfo = await db.query(
    `SELECT j.id, j.parecer, j.analisado_em, a.nome, j.data_inicio FROM justificativa_falta j JOIN aluno a ON a.id = j.aluno_id
      WHERE j.responsavel_id = ? AND j.status = 'NECESSITA_INFO'`,
    [rid]
  );
  for (const j of pedemInfo) {
    itens.push({
      id: `jfinfo-${j.id}`,
      grupo: 'Justificativas de faltas pendentes',
      titulo: `A escola pediu mais informações: ${j.nome} (${dataBr(j.data_inicio)})`,
      descricao: j.parecer,
      data: j.analisado_em,
      prioridade: 'alta',
      status: 'Necessita de informações',
      link: `/justificativas?abrir=${j.id}`,
    });
  }

  // Atividades dos filhos: atrasadas e com prazo nos próximos 3 dias
  const atividades = await db.query(
    `SELECT x.id, x.titulo, x.prazo, x.vencida, d.nome AS disciplina, al.id AS aluno_id, al.nome AS aluno
       FROM (SELECT a.*, (a.prazo < NOW()) AS vencida FROM atividade a) x
       JOIN disciplina d ON d.id = x.disciplina_id
       JOIN turma_aluno ta ON ta.turma_id = x.turma_id AND ta.ano_letivo = ?
       JOIN aluno al ON al.id = ta.aluno_id
       LEFT JOIN atividade_entrega e ON e.atividade_id = x.id AND e.aluno_id = al.id
      WHERE al.id IN (?) AND x.status = 'PUBLICADA'
        AND (e.situacao IS NULL OR e.situacao = 'NAO_ENTREGUE')
        AND x.prazo BETWEEN ? AND ?`,
    [ano, filhos, `${somarDias(hoje(), -14)} 00:00:00`, `${somarDias(hoje(), 3)} 23:59:59`]
  );
  for (const a of atividades) {
    itens.push({
      id: `atv-${a.id}-${a.aluno_id}`,
      grupo: 'Atividades e comunicados importantes',
      titulo: `${a.aluno}: ${a.titulo} (${a.disciplina})`,
      descricao: a.vencida
        ? 'O prazo terminou e a entrega não foi registrada pelo professor.'
        : `Entrega até ${new Date(a.prazo).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}.`,
      data: a.prazo,
      prioridade: a.vencida ? 'alta' : 'media',
      status: a.vencida ? 'Atrasada' : 'Pendente',
      link: `/atividades?abrir=${a.id}`,
    });
  }

  // Provas e reuniões nos próximos 7 dias (escola toda ou turmas dos filhos)
  const eventos = await db.query(
    `SELECT e.id, e.titulo, e.tipo, e.data_inicio, t.nome AS turma
       FROM evento e LEFT JOIN turma t ON t.id = e.turma_id
      WHERE e.tipo IN ('PROVA', 'REUNIAO') AND e.publico = 'TODOS' AND e.data_inicio BETWEEN ? AND ?
        AND (e.turma_id IS NULL OR e.turma_id IN (SELECT turma_id FROM turma_aluno WHERE aluno_id IN (?) AND ano_letivo = ?))`,
    [hoje(), somarDias(hoje(), 7), filhos, ano]
  );
  for (const e of eventos) {
    itens.push({
      id: `ev-${e.id}`,
      grupo: 'Atividades e comunicados importantes',
      titulo: `${e.tipo === 'PROVA' ? 'Prova' : 'Reunião'}: ${e.titulo}${e.turma ? ` (${e.turma})` : ''}`,
      descricao: `Em ${dataBr(e.data_inicio)}. Veja os detalhes no calendário.`,
      data: e.data_inicio,
      prioridade: 'baixa',
      status: 'Agendado',
      link: `/calendario?data=${e.data_inicio}`,
    });
  }

  const [msgs] = await db.query('SELECT COUNT(*) AS n FROM mensagem WHERE destinatario_id = ? AND lida = FALSE', [usuario.id]);
  if (Number(msgs.n) > 0) {
    itens.push({
      id: 'msgs',
      grupo: 'Atividades e comunicados importantes',
      titulo: `${plural(Number(msgs.n), 'mensagem não lida', 'mensagens não lidas')} no mural`,
      descricao: 'A escola enviou mensagens para você.',
      data: null,
      prioridade: 'media',
      status: 'Não lida',
      link: '/comunicacao',
    });
  }

  // Solicitações aguardando resposta
  const chamados = await db.query(
    `SELECT id, assunto, status, atualizado_em FROM chamado
      WHERE usuario_id = ? AND status IN ('ABERTO', 'EM_ATENDIMENTO', 'AGUARDANDO_USUARIO')`,
    [usuario.id]
  );
  for (const c of chamados) {
    const comVoce = c.status === 'AGUARDANDO_USUARIO';
    itens.push({
      id: `sac-${c.id}`,
      grupo: 'Solicitações que aguardam resposta',
      titulo: `Chamado #${c.id}: ${c.assunto}`,
      descricao: comVoce ? 'A escola respondeu e aguarda o seu retorno.' : 'Aguardando a resposta da escola.',
      data: c.atualizado_em,
      prioridade: comVoce ? 'alta' : 'baixa',
      status: comVoce ? 'Aguardando você' : 'Com a escola',
      link: `/ajuda?chamado=${c.id}`,
    });
  }
  const documentos = await db.query(
    `SELECT ds.id, ds.tipo, ds.status, ds.criado_em, ds.atendido_em, a.nome FROM documento_solicitacao ds
       JOIN aluno a ON a.id = ds.aluno_id
      WHERE ds.aluno_id IN (?) AND (ds.status IN ('SOLICITADO', 'EM_ANALISE')
            OR (ds.status = 'DISPONIVEL' AND ds.atendido_em >= ?))`,
    [filhos, `${somarDias(hoje(), -7)} 00:00:00`]
  );
  for (const d of documentos) {
    const pronto = d.status === 'DISPONIVEL';
    itens.push({
      id: `doc-${d.id}`,
      grupo: 'Solicitações que aguardam resposta',
      titulo: `${pronto ? 'Documento disponível' : 'Documento em andamento'}: ${d.nome}`,
      descricao: pronto ? 'Abra para ver, imprimir ou salvar em PDF.' : 'A secretaria está preparando o documento.',
      data: pronto ? d.atendido_em : d.criado_em,
      prioridade: pronto ? 'media' : 'baixa',
      status: pronto ? 'Disponível' : d.status === 'SOLICITADO' ? 'Solicitado' : 'Em análise',
      link: `/documentos?abrir=${d.id}`,
    });
  }

  return itens;
}

module.exports = doResponsavel;
