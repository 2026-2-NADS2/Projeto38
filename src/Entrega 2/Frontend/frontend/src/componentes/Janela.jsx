// Janela.jsx — diálogo padrão com título, botão de fechar, conteúdo e rodapé.
// Usa o <dialog> nativo (foco preso, Esc fecha) através do componente Dialogo.
//
//   <Janela aberto={x} onFechar={...} titulo="Novo evento" rodape={<botões/>}>...</Janela>

import { useId } from 'react';
import Dialogo from './Dialogo';
import Icone from './Icone';

export default function Janela({ aberto, onFechar, titulo, subtitulo, largo, children, rodape, onSubmit }) {
  const idTitulo = useId();
  const corpo = (
    <>
      <header className="janela-topo">
        <div>
          <h2 id={idTitulo}>{titulo}</h2>
          {subtitulo && <p className="texto-secundario">{subtitulo}</p>}
        </div>
        <button type="button" className="btn btn-ghost btn-sm btn-icone" onClick={onFechar} aria-label="Fechar">
          <Icone nome="fechar" tamanho={16} />
        </button>
      </header>
      <div className="janela-corpo">{children}</div>
      {rodape && <footer className="janela-rodape">{rodape}</footer>}
    </>
  );
  return (
    <Dialogo aberto={aberto} onFechar={onFechar} className={`janela${largo ? ' dialogo-largo' : ''}`} rotuloId={idTitulo}>
      {onSubmit ? (
        <form onSubmit={onSubmit} noValidate className="janela-form">
          {corpo}
        </form>
      ) : (
        <div className="janela-form">{corpo}</div>
      )}
    </Dialogo>
  );
}
