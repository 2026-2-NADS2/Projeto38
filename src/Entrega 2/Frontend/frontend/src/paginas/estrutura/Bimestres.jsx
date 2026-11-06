// Bimestres.jsx — os 4 bimestres de cada ano letivo, situação e período de digitação.

import { useState } from 'react';
import { api } from '../../api/cliente';
import { ErroEstado, LinhasEsqueleto } from '../../componentes/Estado';
import { Campo, ErroFormulario } from '../../componentes/Formulario';
import Icone from '../../componentes/Icone';
import { Badge, BadgeDe } from '../../componentes/Interface';
import Janela from '../../componentes/Janela';
import { useToast } from '../../contexto/ToastContext';
import { useApi } from '../../hooks/useApi';
import { useFormulario } from '../../hooks/useFormulario';
import { formatarDataHora, formatarDia, paraDataHoraLocal } from '../../util/formato';
import Rodape from './Rodape';
import NovoAnoLetivo from './NovoAnoLetivo';

export default function Bimestres() {
  const toast = useToast();
  const anos = useApi(() => api.get('/anos-letivos'), []);
  const [ano, setAno] = useState('');
  const lista = useApi(() => api.get(`/bimestres${ano ? `?ano_letivo=${ano}` : ''}`), [ano]);
  const [novoAno, setNovoAno] = useState(false);
  const [form, setForm] = useState(null);
  const f = useFormulario({ data_inicio: '', data_fim: '', digitacao_inicio: '', digitacao_fim: '' });
  const [enviando, setEnviando] = useState(false);

  function abrir(b) {
    f.reiniciar({
      data_inicio: b.data_inicio || '',
      data_fim: b.data_fim || '',
      digitacao_inicio: paraDataHoraLocal(b.digitacao_inicio),
      digitacao_fim: paraDataHoraLocal(b.digitacao_fim),
    });
    setForm(b);
  }

  async function salvar(e) {
    e.preventDefault();
    const ok = f.validar({
      data_inicio: (x) => (!x ? 'Informe o início.' : ''),
      data_fim: (x, t) => (!x ? 'Informe o fim.' : x < t.data_inicio ? 'O fim deve ser depois do início.' : ''),
      digitacao_inicio: (x) => (!x ? 'Informe o início da digitação.' : ''),
      digitacao_fim: (x, t) => (!x ? 'Informe o fim da digitação.' : x <= t.digitacao_inicio ? 'O fim deve ser depois do início.' : ''),
    });
    if (!ok) return;
    setEnviando(true);
    try {
      await api.put(`/bimestres/${form.id}`, f.valores);
      toast(`${form.numero}º bimestre atualizado.`);
      setForm(null);
      lista.recarregar({ silencioso: true });
    } catch (err) {
      f.errosDaApi(err);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <div className="linha-acao">
        <p className="texto-secundario">
          Cada ano letivo tem exatamente 4 bimestres. O período de digitação define quando os professores podem lançar e enviar notas
          (regra do banco de dados): antes dele a digitação está agendada; depois, encerrada.
        </p>
        <div className="topo-acoes">
          {anos.dados?.length > 0 && (
            <label className="campo-filtro">
              <span className="sr-only">Ano letivo</span>
              <select className="select" value={ano || anos.dados.find((a) => a.atual)?.ano_letivo || ''} onChange={(e) => setAno(e.target.value)}>
                {anos.dados.map((a) => (
                  <option key={a.ano_letivo} value={a.ano_letivo}>
                    {a.ano_letivo}
                    {a.atual ? ' (atual)' : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setNovoAno(true)} disabled={!lista.dados}>
            <Icone nome="mais" tamanho={14} /> Novo ano letivo
          </button>
        </div>
      </div>
      {lista.erro ? (
        <ErroEstado mensagem={lista.erro} onTentarNovamente={lista.recarregar} />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Bimestre</th>
                <th scope="col">Período letivo</th>
                <th scope="col">Digitação das notas</th>
                <th scope="col">Situação</th>
                <th scope="col">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {!lista.dados && <LinhasEsqueleto colunas={5} linhas={4} />}
              {lista.dados?.map((b) => (
                <tr key={b.id}>
                  <td data-rotulo="Bimestre">
                    <strong>{b.numero}º bimestre</strong>
                  </td>
                  <td data-rotulo="Período">{b.data_inicio ? `${formatarDia(b.data_inicio)} a ${formatarDia(b.data_fim)}` : <Badge tom="warn">Não definido</Badge>}</td>
                  <td data-rotulo="Digitação">
                    {formatarDataHora(b.digitacao_inicio)} a {formatarDataHora(b.digitacao_fim)}
                  </td>
                  <td data-rotulo="Situação">
                    <span className="pilha-badges">
                      {b.situacao && <BadgeDe tipo="bimestre" valor={b.situacao} />}
                      <BadgeDe tipo="digitacao" valor={b.digitacao} />
                    </span>
                  </td>
                  <td>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => abrir(b)}>
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {form && (
        <Janela aberto onFechar={() => setForm(null)} titulo={`${form.numero}º bimestre de ${form.ano_letivo}`} onSubmit={salvar} rodape={<Rodape onFechar={() => setForm(null)} enviando={enviando} />}>
          <div className="form-grid">
            <Campo nome="data_inicio" rotulo="Início do bimestre" erro={f.erros.data_inicio}>
              <input type="date" value={f.valores.data_inicio} onChange={f.campo('data_inicio')} />
            </Campo>
            <Campo nome="data_fim" rotulo="Fim do bimestre" erro={f.erros.data_fim}>
              <input type="date" value={f.valores.data_fim} onChange={f.campo('data_fim')} />
            </Campo>
            <Campo nome="digitacao_inicio" rotulo="Digitação: início" erro={f.erros.digitacao_inicio}>
              <input type="datetime-local" value={f.valores.digitacao_inicio} onChange={f.campo('digitacao_inicio')} />
            </Campo>
            <Campo nome="digitacao_fim" rotulo="Digitação: fim" erro={f.erros.digitacao_fim}>
              <input type="datetime-local" value={f.valores.digitacao_fim} onChange={f.campo('digitacao_fim')} />
            </Campo>
          </div>
          <ErroFormulario>{f.erroGeral}</ErroFormulario>
        </Janela>
      )}
      {novoAno && (
        <NovoAnoLetivo
          base={lista.dados}
          onFechar={() => setNovoAno(false)}
          onCriado={(criado) => {
            setNovoAno(false);
            toast(`Ano letivo ${criado} criado com 4 bimestres.`);
            anos.recarregar({ silencioso: true });
            setAno(String(criado));
          }}
        />
      )}
    </>
  );
}
