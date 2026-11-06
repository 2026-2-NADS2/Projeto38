// formato.js — rótulos e formatação usados em várias telas.

export const ROTULO_PERFIL = { admin: 'Coordenação', professor: 'Professor(a)', responsavel: 'Responsável' };

// Status do fluxo editorial (banco) + situações calculadas (pendente, sem_lancamento)
export const ROTULO_STATUS = {
  rascunho: 'Rascunho',
  enviado: 'Enviado',
  em_revisao: 'Em revisão',
  devolvido: 'Devolvido',
  publicado: 'Publicado',
  cancelado: 'Cancelado',
  pendente: 'Aguardando revisão',
  sem_lancamento: 'Sem lançamento',
};

export const CLASSE_STATUS = {
  rascunho: 'badge-neutral',
  enviado: 'badge-pending',
  em_revisao: 'badge-pending',
  pendente: 'badge-pending',
  devolvido: 'badge-warn',
  publicado: 'badge-ok',
  cancelado: 'badge-neutral',
  sem_lancamento: 'badge-neutral',
};

export const formatarNota = (n) =>
  n === null || n === undefined || n === '' ? '—' : Number(n).toFixed(1).replace('.', ',');

export const formatarDataHora = (iso) =>
  iso
    ? new Date(iso).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

export const formatarDataCurta = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '');

// Hoje: só a hora; outros dias: dia/mês
export function formatarData(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export const primeiroNome = (nome) => String(nome || '').split(' ')[0];

// Respeita a preferência "reduzir movimento" do sistema
export const reduzirMovimento = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------------------
// Datas sem hora ('AAAA-MM-DD'): NÃO usar new Date('2026-11-04') — o navegador lê
// como meia-noite UTC e, no Brasil, mostra o dia anterior.
// ---------------------------------------------------------------------------
export const formatarDia = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '');

export function diaLocalIso(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function somarDiasIso(iso, dias) {
  const [a, m, d] = iso.split('-').map(Number);
  return diaLocalIso(new Date(a, m - 1, d + dias));
}

// Data/hora vinda da API (ISO completo ou 'AAAA-MM-DD') para exibição
export function formatarQuando(valor) {
  if (!valor) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) return formatarDia(valor);
  return formatarDataHora(valor);
}

// "há 3 dias", "em 2 horas"
export function relativo(valor) {
  if (!valor) return '';
  const alvo = /^\d{4}-\d{2}-\d{2}$/.test(valor) ? new Date(`${valor}T12:00:00`) : new Date(valor);
  const dif = alvo.getTime() - Date.now();
  const abs = Math.abs(dif);
  const fmt = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });
  if (abs < 3600000) return fmt.format(Math.round(dif / 60000), 'minute');
  if (abs < 86400000) return fmt.format(Math.round(dif / 3600000), 'hour');
  return fmt.format(Math.round(dif / 86400000), 'day');
}

// Valor para <input type="datetime-local"> a partir de um ISO da API
export function paraDataHoraLocal(valor) {
  if (!valor) return '';
  const d = new Date(valor);
  const p = (n) => String(n).padStart(2, '0');
  return `${diaLocalIso(d)}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export const iniciais = (nome) =>
  String(nome || '?')
    .split(' ')
    .filter(Boolean)
    .filter((_, i, l) => i === 0 || i === l.length - 1)
    .map((p) => p[0].toUpperCase())
    .join('');
