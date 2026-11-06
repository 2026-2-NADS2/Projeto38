// tema.js — tema claro / escuro guardado neste navegador.
// Padrão: escuro (identidade visual da Entrega 1). O tema claro segue a direção
// "predominância de branco e cinza-claro" e é escolhido em Meu perfil ou no menu.

const CHAVE = 'kfka_tema';

export function temaAtual() {
  try {
    return localStorage.getItem(CHAVE) === 'claro' ? 'claro' : 'escuro';
  } catch {
    return 'escuro';
  }
}

export function aplicarTema(tema = temaAtual()) {
  document.documentElement.dataset.tema = tema;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', tema === 'claro' ? '#f4f6fa' : '#05070d');
}

export function definirTema(tema) {
  try {
    localStorage.setItem(CHAVE, tema);
  } catch {
    /* navegador sem armazenamento: vale só para esta visita */
  }
  aplicarTema(tema);
  window.dispatchEvent(new CustomEvent('kfka:tema', { detail: tema }));
}
