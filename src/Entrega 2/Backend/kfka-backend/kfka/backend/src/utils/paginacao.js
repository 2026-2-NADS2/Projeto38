// paginacao.js — paginação opcional e padronizada das listas (RNF05).
//
//   const { linhas, meta } = await consultaPaginada(req, sql, params);
//   res.json({ dados: linhas.map(formatar), ...(meta ? { meta } : {}) });
//
// Sem ?pagina= a lista vem inteira (quem já usava a rota continua funcionando).
// Com ?pagina=N&por_pagina=M (M até 100), a consulta vira LIMIT/OFFSET no banco e
// o total vem de um COUNT(*) da mesma consulta. Valores inválidos -> 422.

const db = require('../db');
const AppError = require('./AppError');

const MAX_POR_PAGINA = 100;

function lerPaginacao(query = {}) {
  if (query.pagina === undefined || query.pagina === '') return null;
  const pagina = Number(query.pagina);
  const porPagina = query.por_pagina === undefined || query.por_pagina === '' ? 25 : Number(query.por_pagina);
  const erros = [];
  if (!Number.isInteger(pagina) || pagina < 1) erros.push({ campo: 'pagina', mensagem: 'Página deve ser um número inteiro a partir de 1.' });
  if (!Number.isInteger(porPagina) || porPagina < 1 || porPagina > MAX_POR_PAGINA) {
    erros.push({ campo: 'por_pagina', mensagem: `Use de 1 a ${MAX_POR_PAGINA} itens por página.` });
  }
  if (erros.length) throw new AppError(422, 'DADOS_INVALIDOS', 'Verifique os dados enviados.', erros);
  return { pagina, porPagina };
}

const montarMeta = (total, pagina, porPagina) => ({
  total,
  pagina,
  por_pagina: porPagina,
  paginas: Math.max(1, Math.ceil(total / porPagina)),
});

async function consultaPaginada(req, sql, params = []) {
  const p = lerPaginacao(req.query);
  if (!p) return { linhas: await db.query(sql, params), meta: null };
  const [{ n }] = await db.query(`SELECT COUNT(*) AS n FROM (${sql}) AS lista`, params);
  const linhas = await db.query(`${sql} LIMIT ? OFFSET ?`, [...params, p.porPagina, (p.pagina - 1) * p.porPagina]);
  return { linhas, meta: montarMeta(Number(n), p.pagina, p.porPagina) };
}

module.exports = { consultaPaginada, lerPaginacao, montarMeta, MAX_POR_PAGINA };
