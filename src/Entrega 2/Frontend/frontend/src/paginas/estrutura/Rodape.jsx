// Rodape.jsx — botões Cancelar/Salvar das janelas de cadastro em "Turmas e disciplinas".

export default function Rodape({ onFechar, enviando }) {
  return (
    <>
      <button type="button" className="btn btn-ghost" onClick={onFechar}>
        Cancelar
      </button>
      <button type="submit" className="btn btn-primary" disabled={enviando}>
        {enviando ? 'Salvando...' : 'Salvar'}
      </button>
    </>
  );
}
