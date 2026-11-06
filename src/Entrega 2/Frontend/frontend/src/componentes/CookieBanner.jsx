// CookieBanner.jsx — consentimento de armazenamento local (LGPD).
// Entra deslizando de baixo (CSS @starting-style) e sai mais rápido do que entrou.

import { useState } from 'react';
import { Link } from 'react-router-dom';

const CHAVE = 'kfka_cookie_consent';

export default function CookieBanner() {
  const [estado, setEstado] = useState(() => (localStorage.getItem(CHAVE) ? 'oculto' : 'visivel'));

  if (estado === 'oculto') return null;

  function responder(valor) {
    localStorage.setItem(CHAVE, valor);
    setEstado('saindo');
    setTimeout(() => setEstado('oculto'), 220);
  }

  return (
    <div className={`cookie-banner visivel${estado === 'saindo' ? ' saindo' : ''}`} role="region" aria-label="Aviso de cookies">
      <p>
        Usamos armazenamento local do navegador para manter sua sessão e lembrar suas preferências. Saiba mais na nossa{' '}
        <Link to="/privacidade">Política de Privacidade</Link>.
      </p>
      <div className="cookie-actions">
        <button type="button" className="btn btn-ghost" onClick={() => responder('recusado')}>
          Recusar
        </button>
        <button type="button" className="btn btn-primary" onClick={() => responder('aceito')}>
          Aceitar
        </button>
      </div>
    </div>
  );
}
