document.addEventListener('DOMContentLoaded', () => {
  const usuario = localStorage.getItem('kfka_usuario');
  if (usuario) document.getElementById('nome-usuario').textContent = usuario;

  const chatList = document.getElementById('chat-list');
  const chatWindow = document.getElementById('chat-window');

  function renderLista() {
    chatList.innerHTML = mensagens.map(m => `
      <div class="chat-item" data-id="${m.id}">
        <div class="nome">${m.contato} ${m.naoLida ? '🔵' : ''}</div>
        <div class="preview">${m.ultimaMensagem}</div>
      </div>
    `).join('');

    chatList.querySelectorAll('.chat-item').forEach(item => {
      item.addEventListener('click', () => {
        chatList.querySelectorAll('.chat-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        const id = Number(item.dataset.id);
        const contato = mensagens.find(m => m.id === id);
        contato.naoLida = false;
        abrirConversa(contato);
        renderLista();
      });
    });
  }

  function abrirConversa(contato) {
    chatWindow.innerHTML = `
      <div style="margin-bottom:var(--space-sm); font-weight:600;">${contato.contato}</div>
      <div class="msg">${contato.ultimaMensagem}</div>
      <div class="msg mine">Obrigado pelo contato, já vou verificar e retorno em breve.</div>
      <div style="margin-top:auto; display:flex; gap:0.5rem;">
        <input type="text" placeholder="Escreva uma mensagem..."
               style="flex:1; background:var(--bg-panel-alt); border:1px solid var(--border-subtle); border-radius:8px; padding:0.6rem 0.9rem; color:var(--text-primary);">
        <button class="btn btn-primary">Enviar</button>
      </div>
    `;
  }

  renderLista();
});
