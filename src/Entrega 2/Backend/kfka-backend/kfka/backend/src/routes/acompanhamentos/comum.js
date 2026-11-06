// acompanhamentos/comum.js — regras compartilhadas do acompanhamento (tags, completude, travas, status).

const db = require('../../db');
const AppError = require('../../utils/AppError');

const status = (s) => (s ? String(s).toLowerCase() : null);

// Último motivo de devolução de cada registro (vem do histórico/auditoria)
async function motivosDevolucao(ids) {
  if (!ids.length) return {};
  const linhas = await db.query(
    `SELECT acompanhamento_id, observacao FROM historico_acompanhamento
      WHERE acompanhamento_id IN (?) AND acao = 'MUDANCA_STATUS' AND status_novo = 'DEVOLVIDO'
      ORDER BY data_hora, id`,
    [ids]
  );
  return Object.fromEntries(linhas.map((l) => [l.acompanhamento_id, l.observacao]));
}

async function tagsDe(ids, executor = db) {
  if (!ids.length) return {};
  const linhas = await executor.query(
    `SELECT at2.acompanhamento_id, t.id, t.nome
       FROM acompanhamento_tag at2 JOIN tag t ON t.id = at2.tag_id
      WHERE at2.acompanhamento_id IN (?) ORDER BY t.nome`,
    [ids]
  );
  const mapa = {};
  for (const l of linhas) (mapa[l.acompanhamento_id] ||= []).push({ id: l.id, nome: l.nome });
  return mapa;
}

// Troca as tags do registro. Fica DENTRO da transação: tag inexistente (FK) ou desativada
// desfaz também a gravação do registro — nada fica salvo pela metade.
async function gravarTags(tx, id, tags) {
  await tx.query('DELETE FROM acompanhamento_tag WHERE acompanhamento_id = ?', [id]);
  for (const tagId of tags) {
    await tx.query('INSERT INTO acompanhamento_tag (acompanhamento_id, tag_id) VALUES (?, ?)', [id, tagId]);
  }
  if (tags.length) {
    const [{ n }] = await tx.query('SELECT COUNT(*) AS n FROM tag WHERE id IN (?) AND ativo = TRUE', [tags]);
    if (Number(n) !== tags.length) {
      throw new AppError(422, 'DADOS_INVALIDOS', 'Verifique os dados enviados.', [
        { campo: 'tags', mensagem: 'Uma das tags escolhidas foi desativada pela coordenação. Atualize a página.' },
      ]);
    }
  }
}

// Um relatório só vai ao responsável completo: descrição com conteúdo e média lançada (RNF04)
const MIN_DESCRICAO = 5;
function conferirCompleto(registro) {
  const problemas = [];
  if (registro.media === null || registro.media === undefined) problemas.push({ campo: 'media', mensagem: 'A média não foi lançada.' });
  if (!registro.descricao || registro.descricao.trim().length < MIN_DESCRICAO) {
    problemas.push({ campo: 'descricao', mensagem: 'A descrição do acompanhamento está vazia ou incompleta.' });
  }
  if (problemas.length) {
    throw new AppError(422, 'RELATORIO_INCOMPLETO', 'O registro está incompleto e não pode ser publicado.', problemas);
  }
}

async function professorLeciona(professorId, turmaId, disciplinaId) {
  const r = await db.query(
    'SELECT turma_id FROM turma_disciplina_professor WHERE turma_id = ? AND disciplina_id = ? AND professor_id = ?',
    [turmaId, disciplinaId, professorId]
  );
  return r.length > 0;
}

// Lê o registro travado (FOR UPDATE) para mudar o status com segurança
async function travar(tx, id) {
  const [atual] = await tx.query(
    'SELECT id, status, media, faltas, descricao, versao, aluno_id, bimestre_id FROM acompanhamento WHERE id = ? FOR UPDATE',
    [id]
  );
  if (!atual) throw AppError.naoEncontrado('Registro não encontrado.');
  return atual;
}

async function estadoFinal(tx, id) {
  const [r] = await tx.query(
    'SELECT id, status, versao, publicado_em, revisor_id FROM acompanhamento WHERE id = ?',
    [id]
  );
  return { ...r, status: status(r.status) };
}

module.exports = { status, motivosDevolucao, tagsDe, gravarTags, MIN_DESCRICAO, conferirCompleto, professorLeciona, travar, estadoFinal };
