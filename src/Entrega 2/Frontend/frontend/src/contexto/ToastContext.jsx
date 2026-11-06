// ToastContext.jsx — avisos rápidos ("toasts") disponíveis em qualquer tela.
//   const toast = useToast();
//   toast('Salvo!');            toast('Algo deu errado', 'erro');
//
// O tempo de cada aviso PAUSA com o mouse em cima ou com a aba escondida,
// para ninguém perder uma mensagem.

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

const ToastContext = createContext(() => {});

let proximoId = 1;

function Toast({ aviso, onFechar }) {
  const [saindo, setSaindo] = useState(false);
  const restante = useRef(aviso.tipo === 'erro' ? 5000 : 3500);
  const inicio = useRef(0);
  const timer = useRef(null);

  const fechar = useCallback(() => {
    clearTimeout(timer.current);
    setSaindo(true);
    setTimeout(() => onFechar(aviso.id), 220); // tempo da transição de saída
  }, [aviso.id, onFechar]);

  const iniciar = useCallback(() => {
    inicio.current = Date.now();
    timer.current = setTimeout(fechar, restante.current);
  }, [fechar]);

  const pausar = useCallback(() => {
    clearTimeout(timer.current);
    restante.current -= Date.now() - inicio.current;
  }, []);

  useEffect(() => {
    if (!document.hidden) iniciar();
    const aoMudarAba = () => (document.hidden ? pausar() : iniciar());
    document.addEventListener('visibilitychange', aoMudarAba);
    return () => {
      clearTimeout(timer.current);
      document.removeEventListener('visibilitychange', aoMudarAba);
    };
  }, [iniciar, pausar]);

  return (
    <div
      className={`toast toast-${aviso.tipo}${saindo ? ' saindo' : ''}`}
      role={aviso.tipo === 'erro' ? 'alert' : 'status'}
      onMouseEnter={pausar}
      onMouseLeave={iniciar}
      onClick={fechar}
    >
      {aviso.mensagem}
    </div>
  );
}

export function ToastProvider({ children }) {
  const [avisos, setAvisos] = useState([]);

  const toast = useCallback((mensagem, tipo = 'ok') => {
    setAvisos((lista) => [...lista, { id: proximoId++, mensagem, tipo }]);
  }, []);

  const remover = useCallback((id) => setAvisos((lista) => lista.filter((a) => a.id !== id)), []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div id="toast-area" aria-live="polite">
        {avisos.map((a) => (
          <Toast key={a.id} aviso={a} onFechar={remover} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
