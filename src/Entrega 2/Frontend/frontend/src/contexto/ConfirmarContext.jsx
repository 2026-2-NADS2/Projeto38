// ConfirmarContext.jsx — confirmação antes de ações importantes (desativar, excluir, publicar...).
//
//   const confirmar = useConfirmar();
//   if (!(await confirmar({ titulo: 'Desativar aluno?', mensagem: '...', confirmar: 'Desativar', perigo: true }))) return;

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import Dialogo from '../componentes/Dialogo';
import Icone from '../componentes/Icone';

const ConfirmarContext = createContext(async () => true);

export function ConfirmarProvider({ children }) {
  const [pedido, setPedido] = useState(null);
  const resolver = useRef(null);

  const confirmar = useCallback(
    (opcoes) =>
      new Promise((ok) => {
        resolver.current = ok;
        setPedido(opcoes);
      }),
    []
  );

  function responder(valor) {
    resolver.current?.(valor);
    resolver.current = null;
    setPedido(null);
  }

  return (
    <ConfirmarContext.Provider value={confirmar}>
      {children}
      <Dialogo aberto={Boolean(pedido)} onFechar={() => responder(false)} rotuloId="confirmar-titulo" className="dialogo-confirmar">
        {pedido && (
          <div className="janela-form">
            <div className="confirmar-corpo">
              <span className={`confirmar-icone${pedido.perigo ? ' perigo' : ''}`}>
                <Icone nome={pedido.perigo ? 'alerta' : 'info'} tamanho={22} />
              </span>
              <div>
                <h2 id="confirmar-titulo">{pedido.titulo}</h2>
                {pedido.mensagem && <p className="texto-secundario">{pedido.mensagem}</p>}
              </div>
            </div>
            <footer className="janela-rodape">
              <button type="button" className="btn btn-ghost" onClick={() => responder(false)}>
                {pedido.cancelar || 'Cancelar'}
              </button>
              <button
                type="button"
                className={`btn ${pedido.perigo ? 'btn-perigo' : 'btn-primary'}`}
                onClick={() => responder(true)}
                autoFocus
              >
                {pedido.confirmar || 'Confirmar'}
              </button>
            </footer>
          </div>
        )}
      </Dialogo>
    </ConfirmarContext.Provider>
  );
}

export const useConfirmar = () => useContext(ConfirmarContext);
