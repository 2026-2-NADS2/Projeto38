// professor.js — pendências do professor (lançamentos, aulas sem registro, prazos, devoluções).
// Cada item: { id, grupo, titulo, descricao, data, prioridade: alta|media|baixa, status, link }

const db = require('../db');
const env = require('../config/env');
const { hoje, somarDias } = require('../utils/datas');
const { aulasSemRegistro } = require('../routes/aulas.routes');
const { plural, dataBr } = require('./comum');

async function doProfessor(usuario) {
  const itens = [];
  const pid = usuario.professorId;
  const ano = env.ANO_LETIVO;

  const rascunhos = await db.query(
    `SELECT v.turma, v.disciplina, v.bimestre, COUNT(*) AS n, b.digitacao_fim,
            (NOW() BETWEEN b.digitacao_inicio AND b.digitacao_fim) AS aberto
       FROM vw_acompanhamento_completo v
       JOIN bimestre b ON b.ano_letivo = v.ano_letivo AND b.numero = v.bimestre
      WHERE v.professor_id = ? AND v.status = 'RASCUNHO' AND v.ano_letivo = ?
      GROUP BY v.turma, v.disciplina, v.bimestre, b.digitacao_fim, b.digitacao_inicio`,
    [pid, ano]
  );
  for (const r of rascunhos) {
    const diasRestantes = (new Date(r.digitacao_fim).getTime() - Date.now()) / 86400000;
    itens.push({
      id: `rasc-${r.turma}-${r.disciplina}-${r.bimestre}`,
      grupo: 'Relatórios não enviados',
      titulo: `${plural(Number(r.n), 'rascunho', 'rascunhos')} de ${r.disciplina} · ${r.turma} (${r.bimestre}º bim.)`,
      descricao: r.aberto
        ? `Envie para a revisão até ${new Date(r.digitacao_fim).toLocaleDateString('pt-BR')}.`
        : 'A digitação deste bimestre está fechada. Fale com a coordenação.',
      data: r.digitacao_fim,
      prioridade: r.aberto && diasRestantes <= 7 ? 'alta' : 'media',
      status: 'Rascunho',
      link: '/notas',
    });
  }

  const devolvidos = await db.query(
    `SELECT v.acompanhamento_id AS id, v.aluno, v.turma, v.disciplina, v.bimestre,
            (SELECT h.observacao FROM historico_acompanhamento h
              WHERE h.acompanhamento_id = v.acompanhamento_id AND h.status_novo = 'DEVOLVIDO'
              ORDER BY h.data_hora DESC, h.id DESC LIMIT 1) AS motivo,
            (SELECT MAX(h.data_hora) FROM historico_acompanhamento h
              WHERE h.acompanhamento_id = v.acompanhamento_id AND h.status_novo = 'DEVOLVIDO') AS quando
       FROM vw_acompanhamento_completo v
      WHERE v.professor_id = ? AND v.status = 'DEVOLVIDO'`,
    [pid]
  );
  for (const d of devolvidos) {
    itens.push({
      id: `corr-${d.id}`,
      grupo: 'Correções solicitadas pela coordenação',
      titulo: `${d.aluno} · ${d.disciplina} (${d.turma}, ${d.bimestre}º bim.)`,
      descricao: d.motivo ? `Motivo: ${d.motivo}` : 'Lançamento devolvido para ajuste.',
      data: d.quando,
      prioridade: 'alta',
      status: 'Devolvido',
      link: '/notas',
    });
  }

  for (const a of await aulasSemRegistro(pid)) {
    itens.push({
      id: `aula-${a.turma_id}-${a.disciplina_id}-${a.data}`,
      grupo: 'Aulas sem registro',
      titulo: `${a.disciplina} · ${a.turma} — ${dataBr(a.data)}`,
      descricao: 'Registre o conteúdo e a frequência desta aula.',
      data: a.data,
      prioridade: a.data < somarDias(hoje(), -6) ? 'alta' : 'media',
      status: 'Sem registro',
      link: `/aulas?turma=${a.turma_id}&disciplina=${a.disciplina_id}&data=${a.data}`,
    });
  }

  const incompletas = await db.query(
    `SELECT a.id, a.data, a.turma_id, a.disciplina_id, t.nome AS turma, d.nome AS disciplina,
            (SELECT COUNT(*) FROM aula_presenca p WHERE p.aula_id = a.id) AS marcados,
            (SELECT COUNT(*) FROM turma_aluno ta JOIN aluno al ON al.id = ta.aluno_id
              WHERE ta.turma_id = a.turma_id AND al.ativo = TRUE) AS total
       FROM aula a JOIN turma t ON t.id = a.turma_id JOIN disciplina d ON d.id = a.disciplina_id
      WHERE a.professor_id = ? AND a.status = 'RASCUNHO'`,
    [pid]
  );
  for (const a of incompletas) {
    const faltam = Number(a.total) - Number(a.marcados);
    itens.push({
      id: `freq-${a.id}`,
      grupo: 'Registros de frequência incompletos',
      titulo: `${a.disciplina} · ${a.turma} — ${dataBr(a.data)}`,
      descricao: faltam > 0 ? `${plural(faltam, 'aluno', 'alunos')} sem presença marcada; aula em rascunho.` : 'Aula em rascunho: revise e finalize.',
      data: a.data,
      prioridade: 'media',
      status: 'Rascunho',
      link: `/aulas?turma=${a.turma_id}&disciplina=${a.disciplina_id}&data=${a.data}`,
    });
  }

  const atividades = await db.query(
    `SELECT x.id, x.titulo, x.prazo, x.vencida, t.nome AS turma,
            (SELECT COUNT(*) FROM turma_aluno ta JOIN aluno al ON al.id = ta.aluno_id
              WHERE ta.turma_id = x.turma_id AND al.ativo = TRUE) AS total,
            (SELECT COUNT(*) FROM atividade_entrega e WHERE e.atividade_id = x.id) AS registradas
       FROM (SELECT a.*, (a.prazo < NOW()) AS vencida FROM atividade a) x
       JOIN turma t ON t.id = x.turma_id
      WHERE x.professor_id = ? AND x.status = 'PUBLICADA'
        AND x.prazo BETWEEN ? AND ?`,
    [pid, `${somarDias(hoje(), -7)} 00:00:00`, `${somarDias(hoje(), 3)} 23:59:59`]
  );
  for (const a of atividades) {
    const faltam = Number(a.total) - Number(a.registradas);
    if (a.vencida && faltam <= 0) continue;
    itens.push({
      id: `atv-${a.id}`,
      grupo: 'Atividades próximas do prazo',
      titulo: `${a.titulo} · ${a.turma}`,
      descricao: a.vencida
        ? `Prazo encerrado: registre a entrega de ${plural(faltam, 'aluno', 'alunos')}.`
        : `Prazo: ${new Date(a.prazo).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}.`,
      data: a.prazo,
      prioridade: a.vencida ? 'media' : 'baixa',
      status: a.vencida ? 'Prazo encerrado' : 'No prazo',
      link: `/atividades?abrir=${a.id}`,
    });
  }

  return itens;
}

module.exports = doProfessor;
