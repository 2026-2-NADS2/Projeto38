// Estado.jsx — estados visuais padronizados: carregando, erro, vazio e esqueletos.

// "Carregando..." só aparece se a resposta demorar mais de 150 ms (animação no CSS),
// para não piscar em respostas rápidas.
export function Carregando({ texto = 'Carregando...' }) {
  return (
    <div className="estado" role="status">
      <span className="spinner" aria-hidden="true" />
      {texto}
    </div>
  );
}

export function ErroEstado({ mensagem, onTentarNovamente }) {
  return (
    <div className="estado estado-erro" role="alert">
      <p>⚠️ {mensagem}</p>
      {onTentarNovamente && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={onTentarNovamente}>
          Tentar novamente
        </button>
      )}
    </div>
  );
}

export function Vazio({ children }) {
  return <div className="estado">{children}</div>;
}

// Linha de tabela ocupando todas as colunas (para carregando/erro/vazio dentro de <tbody>)
export function LinhaEstado({ colunas, children }) {
  return (
    <tr>
      <td colSpan={colunas} className="td-estado">
        {children}
      </td>
    </tr>
  );
}

// Esqueleto: a forma do conteúdo aparece antes dos dados — sem pulo de layout
const LARGURAS = ['70%', '40%', '55%', '30%', '80%', '45%', '60%', '35%', '50%'];

export function LinhasEsqueleto({ colunas, linhas = 4 }) {
  return Array.from({ length: linhas }, (_, l) => (
    <tr className="esqueleto" aria-hidden="true" key={l}>
      {Array.from({ length: colunas }, (_, c) => (
        <td key={c}>
          <span className="osso" style={{ width: LARGURAS[c % LARGURAS.length] }} />
        </td>
      ))}
    </tr>
  ));
}

export function CartoesEsqueleto({ quantidade = 4 }) {
  return Array.from({ length: quantidade }, (_, i) => (
    <div className="stat-card esqueleto" aria-hidden="true" key={i}>
      <span className="osso" />
      <span className="osso" />
    </div>
  ));
}
