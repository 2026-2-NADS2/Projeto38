// acesso.js — regras de "quem pode ver o quê", usadas por várias rotas.
//
//   admin       -> tudo
//   professor   -> turmas e disciplinas em que leciona (turma_disciplina_professor)
//   responsável -> só alunos vinculados a ele com autorizado = TRUE
//
// Centralizar aqui evita que cada rota repita (e esqueça) uma regra de privacidade.

const db = require('../db');
const env = require('../config/env');
const AppError = require('./AppError');

// Ids dos alunos vinculados (e autorizados) ao responsável
async function alunosDoResponsavel(responsavelId) {
  const linhas = await db.query(
    `SELECT ar.aluno_id FROM aluno_responsavel ar JOIN aluno a ON a.id = ar.aluno_id
      WHERE ar.responsavel_id = ? AND ar.autorizado = TRUE AND a.ativo = TRUE`,
    [responsavelId]
  );
  return linhas.map((l) => l.aluno_id);
}

// Ids das turmas em que o professor leciona (ano letivo atual)
async function turmasDoProfessor(professorId) {
  const linhas = await db.query(
    `SELECT DISTINCT tdp.turma_id FROM turma_disciplina_professor tdp JOIN turma t ON t.id = tdp.turma_id
      WHERE tdp.professor_id = ? AND t.ano_letivo = ?`,
    [professorId, env.ANO_LETIVO]
  );
  return linhas.map((l) => l.turma_id);
}

// Turma do aluno no ano letivo atual (ou null)
async function turmaDoAluno(alunoId) {
  const [linha] = await db.query('SELECT turma_id FROM turma_aluno WHERE aluno_id = ? AND ano_letivo = ?', [
    alunoId,
    env.ANO_LETIVO,
  ]);
  return linha ? linha.turma_id : null;
}

// O usuário pode ver os dados deste aluno?
async function podeVerAluno(usuario, alunoId) {
  if (usuario.perfil === 'admin') {
    const [a] = await db.query('SELECT id FROM aluno WHERE id = ?', [alunoId]);
    return Boolean(a);
  }
  if (usuario.perfil === 'responsavel') {
    return (await alunosDoResponsavel(usuario.responsavelId)).includes(alunoId);
  }
  const turma = await turmaDoAluno(alunoId);
  return turma !== null && (await turmasDoProfessor(usuario.professorId)).includes(turma);
}

// Lança 404 (não revela que o aluno existe) se o usuário não puder vê-lo
async function exigirAluno(usuario, alunoId) {
  if (!(await podeVerAluno(usuario, alunoId))) throw AppError.naoEncontrado('Aluno não encontrado.');
}

// O professor dá esta disciplina nesta turma?
async function professorLeciona(professorId, turmaId, disciplinaId) {
  const r = await db.query(
    'SELECT turma_id FROM turma_disciplina_professor WHERE turma_id = ? AND disciplina_id = ? AND professor_id = ?',
    [turmaId, disciplinaId, professorId]
  );
  return r.length > 0;
}

// ---------------------------------------------------------------------------
// Mural de conversas: com quem cada perfil pode falar
//   admin       -> todos os usuários ativos
//   professor   -> coordenação, outros professores e responsáveis de alunos das suas turmas
//   responsável -> coordenação e professores que dão aula para os seus filhos
// ---------------------------------------------------------------------------
function sqlContatos(usuario) {
  const ano = env.ANO_LETIVO;
  if (usuario.perfil === 'admin') return { sql: '', params: [] };
  if (usuario.perfil === 'professor') {
    return {
      sql: `AND (u.perfil IN ('ADMIN', 'PROFESSOR') OR u.id IN (
              SELECT r.usuario_id FROM responsavel r
                JOIN aluno_responsavel ar ON ar.responsavel_id = r.id AND ar.autorizado = TRUE
                JOIN turma_aluno ta ON ta.aluno_id = ar.aluno_id AND ta.ano_letivo = ?
                JOIN turma_disciplina_professor tdp ON tdp.turma_id = ta.turma_id
               WHERE tdp.professor_id = ?))`,
      params: [ano, usuario.professorId],
    };
  }
  return {
    sql: `AND (u.perfil = 'ADMIN' OR u.id IN (
            SELECT p.usuario_id FROM professor p
              JOIN turma_disciplina_professor tdp ON tdp.professor_id = p.id
              JOIN turma_aluno ta ON ta.turma_id = tdp.turma_id AND ta.ano_letivo = ?
              JOIN aluno_responsavel ar ON ar.aluno_id = ta.aluno_id AND ar.autorizado = TRUE
             WHERE ar.responsavel_id = ?))`,
    params: [ano, usuario.responsavelId],
  };
}

async function contatosPermitidos(usuario, somenteId = null) {
  const filtro = sqlContatos(usuario);
  return db.query(
    `SELECT u.id, u.nome, u.perfil FROM usuario u
      WHERE u.ativo = TRUE AND u.id <> ? AND (? IS NULL OR u.id = ?) ${filtro.sql}
      ORDER BY u.perfil, u.nome`,
    [usuario.id, somenteId, somenteId, ...filtro.params]
  );
}

module.exports = {
  alunosDoResponsavel,
  turmasDoProfessor,
  turmaDoAluno,
  podeVerAluno,
  exigirAluno,
  professorLeciona,
  contatosPermitidos,
};
