document.addEventListener('DOMContentLoaded', () => {
  const usuario = localStorage.getItem('kfka_usuario');
  if (usuario) document.getElementById('nome-usuario').textContent = usuario;

  const tabela = document.getElementById('tabela-notas');
  const filtro = document.getElementById('filtro-turma');

  function renderTabela(turmaFiltro) {
    const lista = turmaFiltro === 'todas'
      ? alunos
      : alunos.filter(a => a.turma === turmaFiltro);

    tabela.innerHTML = lista.map(aluno => `
      <tr>
        <td>${aluno.nome}</td>
        <td>${aluno.turma}</td>
        <td>
          <input type="number" min="0" max="10" step="0.1"
                 value="${aluno.notas['1º Bim'] ?? ''}"
                 data-id="${aluno.id}" data-bim="1º Bim"
                 style="width:60px; background:var(--bg-panel-alt); border:1px solid var(--border-subtle); border-radius:6px; color:var(--text-primary); padding:0.3rem;">
        </td>
        <td>
          <input type="number" min="0" max="10" step="0.1"
                 value="${aluno.notas['2º Bim'] ?? ''}"
                 data-id="${aluno.id}" data-bim="2º Bim"
                 style="width:60px; background:var(--bg-panel-alt); border:1px solid var(--border-subtle); border-radius:6px; color:var(--text-primary); padding:0.3rem;">
        </td>
        <td>${aluno.faltas}</td>
        <td>
          <span class="badge ${aluno.status === 'Validado' ? 'badge-ok' : 'badge-pending'}">
            ${aluno.status}
          </span>
        </td>
      </tr>
    `).join('');

    tabela.querySelectorAll('input[type="number"]').forEach(input => {
      input.addEventListener('change', (e) => {
        const id = Number(e.target.dataset.id);
        const bim = e.target.dataset.bim;
        const aluno = alunos.find(a => a.id === id);
        aluno.notas[bim] = e.target.value ? Number(e.target.value) : null;
        aluno.status = 'Pendente'; // toda edição volta pra pendente até nova validação
        renderTabela(filtro.value);
      });
    });
  }

  filtro.addEventListener('change', () => renderTabela(filtro.value));
  renderTabela('todas');
});
