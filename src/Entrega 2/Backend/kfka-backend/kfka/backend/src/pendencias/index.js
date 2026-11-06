// pendencias/index.js — regras de negócio do painel de pendências (calculadas dos dados reais).
// As rotas ficam em routes/pendencias.routes.js; aqui, só o cálculo por perfil.

const { ORDEM } = require('./comum');
const doAdmin = require('./coordenacao');
const doProfessor = require('./professor');
const doResponsavel = require('./responsavel');

async function calcular(usuario) {
  const fn = { admin: doAdmin, professor: doProfessor, responsavel: doResponsavel }[usuario.perfil];
  const itens = await fn(usuario);
  const tempo = (d) => (d ? new Date(d).getTime() || 0 : 0);
  return itens.sort((a, b) => ORDEM[a.prioridade] - ORDEM[b.prioridade] || tempo(a.data) - tempo(b.data));
}

module.exports = { calcular };
