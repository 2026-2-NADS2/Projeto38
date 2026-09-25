// login.js — validação simples + redirecionamento simulado

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('login-form');
  const usuario = document.getElementById('usuario');
  const senha = document.getElementById('senha');
  const errorMsg = document.getElementById('error-msg');
  const toggleSenha = document.getElementById('toggle-senha');

  // Mostrar/ocultar senha
  toggleSenha.addEventListener('click', () => {
    const isPassword = senha.type === 'password';
    senha.type = isPassword ? 'text' : 'password';
    toggleSenha.textContent = isPassword ? '🙈' : '👁️';
  });

  // Validação simples (sem back-end real)
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    errorMsg.textContent = '';

    if (!usuario.value.trim() || !senha.value.trim()) {
      errorMsg.textContent = 'Preencha usuário/e-mail e senha para continuar.';
      return;
    }

    if (senha.value.trim().length < 4) {
      errorMsg.textContent = 'A senha deve ter pelo menos 4 caracteres.';
      return;
    }

    // Simula sessão do usuário logado
    localStorage.setItem('kfka_usuario', usuario.value.trim());

    window.location.href = 'dashboard.html';
  });
});
