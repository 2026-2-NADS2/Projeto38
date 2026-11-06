// useApi.js — carrega dados da API com os estados padrão de carregando / erro / sucesso.
//
//   const { dados, erro, carregando, recarregar, setDados } = useApi(() => api.get('/eventos'), []);
//
// Respostas antigas são descartadas (ex.: o usuário trocou o filtro antes da primeira chegar).

import { useCallback, useEffect, useRef, useState } from 'react';

export function useApi(carregar, deps = [], { ativo = true } = {}) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [carregando, setCarregando] = useState(ativo);
  const pedido = useRef(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const recarregar = useCallback(
    async ({ silencioso = false } = {}) => {
      const id = ++pedido.current;
      if (!silencioso) {
        setCarregando(true);
        setErro(null);
      }
      try {
        const resultado = await carregar();
        if (id === pedido.current) setDados(resultado);
        return resultado;
      } catch (err) {
        if (id === pedido.current && !silencioso) setErro(err.message);
        return null;
      } finally {
        if (id === pedido.current) setCarregando(false);
      }
    },
    deps
  );

  useEffect(() => {
    if (ativo) recarregar();
  }, [recarregar, ativo]);

  return { dados, erro, carregando, recarregar, setDados };
}
