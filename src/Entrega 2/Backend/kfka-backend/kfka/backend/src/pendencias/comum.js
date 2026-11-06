// comum.js — utilitários de texto e tempo usados no cálculo das pendências.

const ORDEM = { alta: 0, media: 1, baixa: 2 };
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const dataBr = (iso) => (iso ? iso.split('-').reverse().join('/') : '');
const horasDesde = (d) => (d ? (Date.now() - new Date(d).getTime()) / 3600000 : 0);

module.exports = { ORDEM, plural, dataBr, horasDesde };
