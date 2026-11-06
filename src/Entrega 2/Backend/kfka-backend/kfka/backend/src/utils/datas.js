// datas.js — datas no fuso da escola (DB_TIMEZONE, Brasília por padrão).
// O servidor pode rodar em UTC (Railway/Render); "hoje" precisa ser o dia da escola.

const env = require('../config/env');

function deslocamentoMs() {
  const [, sinal, h, m] = env.DB_TIMEZONE.match(/^([+-])(\d{2}):(\d{2})$/);
  return (sinal === '-' ? -1 : 1) * (Number(h) * 60 + Number(m)) * 60000;
}

// Date "deslocado": os getters UTC (getUTCDate...) devolvem o horário local da escola
const agoraLocal = () => new Date(Date.now() + deslocamentoMs());

// 'AAAA-MM-DD' de hoje na escola
const hoje = () => agoraLocal().toISOString().slice(0, 10);

// Soma dias a uma data 'AAAA-MM-DD'
function somarDias(iso, dias) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

// 1 = segunda ... 7 = domingo
function diaSemana(iso) {
  const d = new Date(`${iso}T12:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

// Date do MySQL (DATETIME) -> 'AAAA-MM-DD' no fuso da escola
function paraIsoLocal(valor) {
  if (!valor) return null;
  if (typeof valor === 'string') return valor.slice(0, 10);
  return new Date(valor.getTime() + deslocamentoMs()).toISOString().slice(0, 10);
}

module.exports = { hoje, somarDias, diaSemana, paraIsoLocal, agoraLocal };
