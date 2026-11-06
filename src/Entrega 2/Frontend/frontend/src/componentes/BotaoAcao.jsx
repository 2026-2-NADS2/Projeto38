// BotaoAcao.jsx — botão para ações assíncronas (salvar, publicar, enviar...).
//  - fica desabilitado e mostra "Salvando..." enquanto espera a API
//  - pode mostrar uma confirmação ("Salvo ✓") por um instante
//  - a troca de texto tem um leve blur (CSS .trocando) para não "piscar"
//
//   <BotaoAcao textoOcupado="Salvando..." onAcao={async () => api.put(...)}>Salvar</BotaoAcao>

import { useEffect, useRef, useState } from 'react';

export default function BotaoAcao({
  children,
  onAcao,
  textoOcupado = 'Aguarde...',
  textoSucesso,
  className = 'btn btn-primary',
  type = 'button',
  disabled,
  ...resto
}) {
  const [fase, setFase] = useState('normal'); // normal | ocupado | sucesso
  const [trocando, setTrocando] = useState(false);
  const montado = useRef(true);

  // Marca montado/desmontado. Em desenvolvimento o StrictMode monta, desmonta e monta de novo:
  // sem voltar o valor para true aqui, o botão ficaria preso em "Salvando...".
  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  // Blur rápido a cada troca de texto
  useEffect(() => {
    setTrocando(true);
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setTrocando(false)));
    return () => cancelAnimationFrame(id);
  }, [fase]);

  async function executar(e) {
    if (fase === 'ocupado') return;
    setFase('ocupado');
    try {
      await onAcao?.(e);
      if (!montado.current) return; // a tela trocou o botão enquanto esperava
      if (textoSucesso) {
        setFase('sucesso');
        setTimeout(() => montado.current && setFase('normal'), 1400);
      } else {
        setFase('normal');
      }
    } catch {
      if (montado.current) setFase('normal'); // quem chamou mostra o erro
    }
  }

  const rotulo = fase === 'ocupado' ? textoOcupado : fase === 'sucesso' ? textoSucesso : children;

  return (
    <button
      type={type}
      className={`${className}${trocando ? ' trocando' : ''}${fase === 'sucesso' ? ' sucesso' : ''}`}
      disabled={disabled || fase === 'ocupado'}
      aria-busy={fase === 'ocupado' || undefined}
      onClick={type === 'submit' ? undefined : executar}
      {...resto}
    >
      <span className="rotulo">{rotulo}</span>
    </button>
  );
}
