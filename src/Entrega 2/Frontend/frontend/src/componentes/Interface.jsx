// Interface.jsx — componentes visuais pequenos e reutilizáveis.

import { useId, useRef } from 'react';
import { iniciais } from '../util/formato';
import { rotuloStatus, tomStatus } from '../util/status';
import Icone from './Icone';

const ICONE_TOM = { ok: 'check', pending: 'relogio', warn: 'alerta', danger: 'x', info: 'info', neutral: 'ponto' };

// Badge com texto + ícone (a cor nunca é a única informação)
export function Badge({ tom = 'neutral', children, className = '' }) {
  return (
    <span className={`badge badge-${tom} ${className}`.trim()}>
      <Icone nome={ICONE_TOM[tom] || 'ponto'} tamanho={12} />
      {children}
    </span>
  );
}

// <BadgeDe tipo="documento" valor="disponivel" />
export function BadgeDe({ tipo, valor, className }) {
  return (
    <Badge tom={tomStatus(tipo, valor)} className={className}>
      {rotuloStatus(tipo, valor)}
    </Badge>
  );
}

// Cabeçalho padrão das telas
export function Topo({ titulo, descricao, children }) {
  return (
    <div className="app-topbar">
      <div>
        <h1>{titulo}</h1>
        {descricao && <p>{descricao}</p>}
      </div>
      {children && <div className="topo-acoes">{children}</div>}
    </div>
  );
}

// Foto do usuário ou iniciais com cor estável
const CORES = ['#3b6fd6', '#0e9fb5', '#6d5bd0', '#c2410c', '#15803d', '#b45309', '#be185d', '#0f766e'];
export function Avatar({ nome, foto, tamanho = 40, className = '' }) {
  const cor = CORES[[...String(nome || '')].reduce((s, c) => s + c.charCodeAt(0), 0) % CORES.length];
  const estilo = { width: tamanho, height: tamanho, fontSize: tamanho * 0.38 };
  if (foto) return <img className={`avatar ${className}`.trim()} src={foto} alt="" style={estilo} />;
  return (
    <span className={`avatar avatar-iniciais ${className}`.trim()} style={{ ...estilo, background: cor }} aria-hidden="true">
      {iniciais(nome)}
    </span>
  );
}

// Abas acessíveis (setas do teclado trocam de aba)
export function Abas({ abas, ativa, onTrocar, rotulo }) {
  const ref = useRef(null);
  const base = useId();
  function teclado(e) {
    const i = abas.findIndex((a) => a.id === ativa);
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const prox = abas[(i + dir + abas.length) % abas.length];
    onTrocar(prox.id);
    ref.current?.querySelector(`[data-aba="${prox.id}"]`)?.focus();
  }
  return (
    <div className="abas" role="tablist" aria-label={rotulo} ref={ref} onKeyDown={teclado}>
      {abas.map((a) => (
        <button
          key={a.id}
          type="button"
          role="tab"
          id={`${base}-${a.id}`}
          data-aba={a.id}
          aria-selected={a.id === ativa}
          tabIndex={a.id === ativa ? 0 : -1}
          className={`aba${a.id === ativa ? ' ativa' : ''}`}
          onClick={() => onTrocar(a.id)}
        >
          {a.rotulo}
          {a.contador > 0 && <span className="aba-contador">{a.contador}</span>}
        </button>
      ))}
    </div>
  );
}

// Linha de definição (rótulo: valor) para telas de detalhe
export function Detalhe({ rotulo, children }) {
  return (
    <div className="detalhe">
      <dt>{rotulo}</dt>
      <dd>{children || '—'}</dd>
    </div>
  );
}

// Botão só com ícone, sempre com nome acessível
export function BotaoIcone({ icone, rotulo, onClick, className = 'btn btn-ghost btn-sm', ...resto }) {
  return (
    <button type="button" className={`${className} btn-icone`} onClick={onClick} aria-label={rotulo} title={rotulo} {...resto}>
      <Icone nome={icone} tamanho={16} />
    </button>
  );
}

// Navegação entre páginas de uma lista (meta vem da API: { total, pagina, paginas })
export function Paginacao({ meta, onPagina, rotulo = 'registro(s)' }) {
  if (!meta) return null;
  const { total, pagina, paginas } = meta;
  return (
    <nav className="paginacao" aria-label="Paginação">
      <span className="texto-secundario" aria-live="polite">
        {total} {rotulo} · página {pagina} de {paginas}
      </span>
      {paginas > 1 && (
        <span className="paginacao-botoes">
          <button type="button" className="btn btn-ghost btn-sm" disabled={pagina <= 1} onClick={() => onPagina(pagina - 1)}>
            <Icone nome="esquerda" tamanho={14} /> Anterior
          </button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={pagina >= paginas} onClick={() => onPagina(pagina + 1)}>
            Próxima <Icone nome="direita" tamanho={14} />
          </button>
        </span>
      )}
    </nav>
  );
}
