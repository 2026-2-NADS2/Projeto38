// Basicos.jsx — peças pequenas usadas em várias telas.

import { useEffect } from 'react';
import { CLASSE_STATUS, ROTULO_STATUS } from '../util/formato';
import { Badge } from './Interface';

// Status do fluxo editorial (texto + ícone; a cor não é a única pista)
export function BadgeStatus({ status, className = '' }) {
  const tom = (CLASSE_STATUS[status] || 'badge-neutral').replace('badge-', '');
  return (
    <Badge tom={tom} className={className}>
      {ROTULO_STATUS[status] || status}
    </Badge>
  );
}

// Lista de tags somente leitura
export function ChipsTags({ nomes }) {
  if (!nomes?.length) return null;
  return (
    <ul className="chips" aria-label="Tags">
      {nomes.map((n) => (
        <li key={n} className="chip chip-estatico">
          {n}
        </li>
      ))}
    </ul>
  );
}

// Marca do logo
export function Logo({ className = '', children }) {
  return (
    <div className={`logo ${className}`.trim()}>
      <span className="logo-mark">[K]</span> KFKA{children}
    </div>
  );
}

// Define o título da aba do navegador
export function useTitulo(titulo) {
  useEffect(() => {
    document.title = titulo ? `${titulo} — KFKA` : 'KFKA — Acompanhamento escolar';
  }, [titulo]);
}

// Páginas públicas (início, login, cadastro) têm o brilho de fundo animado;
// as telas de trabalho não — movimento constante atrás de tabelas distrai.
export function usePaginaPublica() {
  useEffect(() => {
    document.body.classList.add('pagina-publica');
    return () => document.body.classList.remove('pagina-publica');
  }, []);
}
