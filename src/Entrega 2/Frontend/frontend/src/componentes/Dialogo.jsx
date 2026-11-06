// Dialogo.jsx — janela modal usando o <dialog> nativo do HTML.
// O navegador cuida do foco, do Esc e do fundo escuro; as animações estão no CSS.
//
//   <Dialogo aberto={aberto} onFechar={() => setAberto(false)} titulo="Devolver">...</Dialogo>

import { useEffect, useRef } from 'react';

export default function Dialogo({ aberto, onFechar, className = '', rotuloId, children }) {
  const ref = useRef(null);

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (aberto && !dlg.open) dlg.showModal();
    if (!aberto && dlg.open) dlg.close();
  }, [aberto]);

  return (
    <dialog
      ref={ref}
      className={`dialogo ${className}`.trim()}
      aria-labelledby={rotuloId}
      onClose={onFechar} // Esc ou dlg.close()
      onClick={(e) => {
        if (e.target === ref.current) onFechar(); // clique no fundo escuro
      }}
    >
      {children}
    </dialog>
  );
}
