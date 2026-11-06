// NovoAnoLetivo.jsx — cria um ano letivo com os 4 bimestres de uma vez (RF04).
// As datas vêm sugeridas a partir do ano anterior (+1 ano) e podem ser ajustadas.
// A API confere: exatamente 4, em ordem, sem sobreposição e dentro do ano.

import { useMemo, useState } from 'react';
import { api } from '../../api/cliente';
import BotaoAcao from '../../componentes/BotaoAcao';
import { Aviso, ErroFormulario } from '../../componentes/Formulario';
import Janela from '../../componentes/Janela';
import { paraDataHoraLocal } from '../../util/formato';

const maisUmAno = (iso) => (iso ? `${Number(iso.slice(0, 4)) + 1}${iso.slice(4)}` : '');

export default function NovoAnoLetivo({ base, onFechar, onCriado }) {
  const anoBase = base?.[0]?.ano_letivo;
  const inicial = useMemo(
    () =>
      [1, 2, 3, 4].map((n) => {
        const b = base?.find((x) => x.numero === n);
        return {
          numero: n,
          data_inicio: maisUmAno(b?.data_inicio),
          data_fim: maisUmAno(b?.data_fim),
          digitacao_inicio: maisUmAno(paraDataHoraLocal(b?.digitacao_inicio)),
          digitacao_fim: maisUmAno(paraDataHoraLocal(b?.digitacao_fim)),
        };
      }),
    [base]
  );
  const [ano, setAno] = useState(anoBase ? anoBase + 1 : new Date().getFullYear() + 1);
  const [linhas, setLinhas] = useState(inicial);
  const [erros, setErros] = useState([]);

  const definir = (i, campo) => (e) => {
    const v = e.target.value;
    setLinhas((ls) => ls.map((l, j) => (j === i ? { ...l, [campo]: v } : l)));
    setErros([]);
  };

  async function criar() {
    const faltando = linhas.some((l) => !l.data_inicio || !l.data_fim || !l.digitacao_inicio || !l.digitacao_fim);
    if (faltando) {
      setErros(['Preencha todas as datas dos 4 bimestres.']);
      throw new Error('incompleto');
    }
    try {
      const criados = await api.post('/anos-letivos', { ano_letivo: Number(ano), bimestres: linhas });
      onCriado(Number(ano), criados);
    } catch (err) {
      setErros(err.detalhes?.length ? err.detalhes.map((d) => d.mensagem) : [err.message]);
      throw err;
    }
  }

  return (
    <Janela
      aberto
      largo
      onFechar={onFechar}
      titulo="Novo ano letivo"
      subtitulo="Os 4 bimestres são criados juntos. Depois, cada um pode ser ajustado em “Editar”."
      rodape={
        <>
          <button type="button" className="btn btn-ghost" onClick={onFechar}>
            Cancelar
          </button>
          <BotaoAcao textoOcupado="Criando..." onAcao={criar}>
            Criar ano letivo
          </BotaoAcao>
        </>
      }
    >
      <div className="campo">
        <label htmlFor="novo-ano">
          Ano letivo
          <span className="obrigatorio" title="Campo obrigatório">
            <span aria-hidden="true"> *</span>
            <span className="sr-only"> (obrigatório)</span>
          </span>
        </label>
        <input id="novo-ano" className="input input-curto" type="number" min={2000} max={2100} value={ano} onChange={(e) => setAno(e.target.value)} />
      </div>
      {anoBase && (
        <Aviso tom="info">
          Datas sugeridas a partir de {anoBase}. Confira feriados e o calendário da rede antes de criar.
        </Aviso>
      )}
      <div className="table-wrap">
        <table className="tabela-form">
          <caption className="sr-only">Datas dos quatro bimestres</caption>
          <thead>
            <tr>
              <th scope="col">Bimestre</th>
              <th scope="col">Início</th>
              <th scope="col">Fim</th>
              <th scope="col">Digitação: início</th>
              <th scope="col">Digitação: fim</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, i) => (
              <tr key={l.numero}>
                <th scope="row">{l.numero}º</th>
                {['data_inicio', 'data_fim', 'digitacao_inicio', 'digitacao_fim'].map((c) => (
                  <td key={c} data-rotulo={c.replace('_', ' ')}>
                    <input
                      className="input"
                      type={c.startsWith('data') ? 'date' : 'datetime-local'}
                      value={l[c]}
                      onChange={definir(i, c)}
                      aria-label={`${l.numero}º bimestre: ${{ data_inicio: 'início', data_fim: 'fim', digitacao_inicio: 'início da digitação', digitacao_fim: 'fim da digitação' }[c]}`}
                      aria-required="true"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ErroFormulario>{erros.length ? erros.join(' ') : ''}</ErroFormulario>
    </Janela>
  );
}
