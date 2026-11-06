// useListaPaginada.js — lista paginada no servidor (?pagina=&por_pagina=), com os mesmos estados do useApi.
//
//   const lista = useListaPaginada(`/chamados?status=abertos`, 25);
//   lista.dados (itens da página) · lista.meta { total, pagina, paginas } · lista.setPagina(n)
//   <Paginacao meta={lista.meta} onPagina={lista.setPagina} />
//
// Trocar a rota (filtro novo) volta para a página 1.

import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/cliente';
import { useApi } from './useApi';

export function useListaPaginada(rota, porPagina = 25) {
  const [pagina, setPagina] = useState(1);
  useEffect(() => setPagina(1), [rota]);
  const sep = rota.includes('?') ? '&' : '?';
  const r = useApi(() => api.pagina(`${rota}${sep}pagina=${pagina}&por_pagina=${porPagina}`), [rota, pagina, porPagina]);
  const { setDados: definirResposta } = r;

  // Atualiza itens da página atual sem recarregar (ex.: depois de salvar um item)
  const setDados = useCallback(
    (valor) => definirResposta((d) => ({ ...d, dados: typeof valor === 'function' ? valor(d?.dados) : valor })),
    [definirResposta]
  );

  return { ...r, dados: r.dados?.dados ?? null, meta: r.dados?.meta ?? null, pagina, setPagina, setDados };
}

// Item aberto por ?abrir=<id>: usa o da página atual ou, se não estiver nela
// (ex.: link de uma pendência), busca o detalhe na API.
export function useItemAberto(itens, id, rotaDetalhe) {
  const daPagina = id && itens ? itens.find((i) => i.id === id) : null;
  const [buscado, setBuscado] = useState(null);
  useEffect(() => {
    if (!id || !itens || daPagina) return undefined;
    let ativo = true;
    api
      .get(`${rotaDetalhe}/${id}`)
      .then((d) => ativo && setBuscado(d))
      .catch(() => ativo && setBuscado(null));
    return () => {
      ativo = false;
    };
  }, [id, itens, daPagina, rotaDetalhe]);
  if (!id) return null;
  return daPagina || (buscado?.id === id ? buscado : null);
}
