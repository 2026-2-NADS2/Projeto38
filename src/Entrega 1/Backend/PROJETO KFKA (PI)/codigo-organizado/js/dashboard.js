// dashboard.js — monta o painel a partir de dados-mock.js

document.addEventListener('DOMContentLoaded', () => {
  // Nome do usuário logado (salvo no login.js)
  const usuario = localStorage.getItem('kfka_usuario');
  if (usuario) {
    document.getElementById('nome-usuario').textContent = usuario;
  }

  // Cards de resumo
  const resumo = getResumoTurmas();
  const statsRow = document.getElementById('stats-row');
  statsRow.innerHTML = `
    <div class="stat-card">
      <div class="value">${resumo.totalAlunos}</div>
      <div class="label">Alunos acompanhados</div>
    </div>
    <div class="stat-card">
      <div class="value">${resumo.pendentes}</div>
      <div class="label">Notas pendentes de validação</div>
    </div>
    <div class="stat-card">
      <div class="value">${resumo.mediaFaltas}</div>
      <div class="label">Média de faltas por aluno</div>
    </div>
  `;

  // Tabela de alunos
  const tabela = document.getElementById('tabela-alunos');
  tabela.innerHTML = alunos.map(aluno => `
    <tr>
      <td>${aluno.nome}</td>
      <td>${aluno.turma}</td>
      <td>${aluno.faltas}</td>
      <td>
        <span class="badge ${aluno.status === 'Validado' ? 'badge-ok' : 'badge-pending'}">
          ${aluno.status}
        </span>
      </td>
    </tr>
  `).join('');
});
