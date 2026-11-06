// Justificativas.jsx — justificativa de faltas.
//  Responsável: vê as faltas registradas nas aulas, envia e complementa justificativas.
//  Coordenação: analisa e aprova, recusa ou pede mais informações.
// Comprovantes: o envio de arquivos ainda não é suportado (orientamos a entrega na secretaria).

import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/cliente';
import { useTitulo } from '../componentes/Basicos';
import { Carregando, ErroEstado, LinhaEstado, LinhasEsqueleto, Vazio } from '../componentes/Estado';
import { Aviso, Campo, ErroFormulario } from '../componentes/Formulario';
import Icone from '../componentes/Icone';
import { BadgeDe, Detalhe, Topo, Paginacao } from '../componentes/Interface';
import Janela from '../componentes/Janela';
import { useAuth } from '../contexto/AuthContext';
import { useToast } from '../contexto/ToastContext';
import { useApi } from '../hooks/useApi';
import { useListaPaginada, useItemAberto } from '../hooks/useListaPaginada';
import { useFormulario } from '../hooks/useFormulario';
import { diaLocalIso, formatarDataHora, formatarDia } from '../util/formato';
import { MOTIVOS_FALTA, STATUS } from '../util/status';

const periodo = (j) => (j.data_fim && j.data_fim !== j.data_inicio ? `${formatarDia(j.data_inicio)} a ${formatarDia(j.data_fim)}` : formatarDia(j.data_inicio));

function FormJustificativa({ inicial, filhos, onFechar, onSalvo }) {
  const toast = useToast();
  const editando = Boolean(inicial?.id);
  const f = useFormulario({
    aluno_id: String(inicial?.aluno_id || filhos[0]?.id || ''),
    data_inicio: inicial?.data_inicio || '',
    data_fim: inicial?.data_fim && inicial.data_fim !== inicial.data_inicio ? inicial.data_fim : '',
    motivo: inicial?.motivo ? inicial.motivo.toUpperCase() : '',
    descricao: inicial?.descricao || '',
  });
  const [enviando, setEnviando] = useState(false);
  const v = f.valores;
  const hoje = diaLocalIso();

  async function salvar(e) {
    e.preventDefault();
    const ok = f.validar({
      aluno_id: (x) => (!x ? 'Escolha o aluno.' : ''),
      data_inicio: (x) => (!x ? 'Informe a data da falta.' : x > hoje ? 'A data não pode estar no futuro.' : ''),
      data_fim: (x, t) => (x && x < t.data_inicio ? 'A data final deve ser igual ou depois da inicial.' : x > hoje ? 'A data não pode estar no futuro.' : ''),
      motivo: (x) => (!x ? 'Escolha o motivo.' : ''),
      descricao: (x) => (x.trim().length < 5 ? 'Explique a ausência (mínimo 5 caracteres).' : ''),
    });
    if (!ok) return;
    setEnviando(true);
    const corpo = { aluno_id: Number(v.aluno_id), data_inicio: v.data_inicio, data_fim: v.data_fim || null, motivo: v.motivo, descricao: v.descricao.trim() };
    try {
      if (editando) await api.put(`/justificativas/${inicial.id}`, corpo);
      else await api.post('/justificativas', corpo);
      toast(editando ? 'Justificativa atualizada e reenviada para análise.' : 'Justificativa enviada. A escola vai analisar.');
      window.dispatchEvent(new CustomEvent('kfka:atualizar-contadores'));
      onSalvo();
    } catch (err) {
      f.errosDaApi(err);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Janela
      aberto
      onFechar={onFechar}
      titulo={editando ? 'Complementar justificativa' : 'Justificar falta'}
      onSubmit={salvar}
      rodape={
        <>
          <button type="button" className="btn btn-ghost" onClick={onFechar}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={enviando}>
            {enviando ? 'Enviando...' : 'Enviar justificativa'}
          </button>
        </>
      }
    >
      {inicial?.status === 'necessita_info' && inicial.parecer && (
        <Aviso tom="warn" titulo="A escola pediu mais informações">
          {inicial.parecer}
        </Aviso>
      )}
      <div className="form-grid">
        <Campo nome="aluno_id" rotulo="Aluno" erro={f.erros.aluno_id} className="col-2">
          <select value={v.aluno_id} onChange={f.campo('aluno_id')} disabled={editando}>
            {filhos.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome}
              </option>
            ))}
          </select>
        </Campo>
        <Campo nome="data_inicio" rotulo="Data da falta" erro={f.erros.data_inicio}>
          <input type="date" value={v.data_inicio} max={hoje} onChange={f.campo('data_inicio')} />
        </Campo>
        <Campo nome="data_fim" rotulo="Até (se mais de um dia)" erro={f.erros.data_fim} opcional>
          <input type="date" value={v.data_fim} min={v.data_inicio} max={hoje} onChange={f.campo('data_fim')} />
        </Campo>
        <Campo nome="motivo" rotulo="Motivo da ausência" erro={f.erros.motivo} className="col-2">
          <select value={v.motivo} onChange={f.campo('motivo')}>
            <option value="">Escolha...</option>
            {Object.entries(MOTIVOS_FALTA).map(([k, r]) => (
              <option key={k} value={k.toUpperCase()}>
                {r}
              </option>
            ))}
          </select>
        </Campo>
        <Campo nome="descricao" rotulo="Descrição" erro={f.erros.descricao} className="col-2" dica="Os detalhes ficam visíveis só para a coordenação. O professor vê apenas a situação.">
          <textarea rows={3} value={v.descricao} onChange={f.campo('descricao')} maxLength={1000} />
        </Campo>
      </div>
      <Aviso tom="info">Atestados e comprovantes: o envio de arquivos ainda não é suportado. Entregue o documento na secretaria e mencione aqui.</Aviso>
      <ErroFormulario>{f.erroGeral}</ErroFormulario>
    </Janela>
  );
}

function AnaliseJustificativa({ j, onFechar, onSalvo }) {
  const toast = useToast();
  const f = useFormulario({ status: j.status === 'pendente' ? 'APROVADA' : j.status.toUpperCase(), parecer: j.parecer || '' });
  const [enviando, setEnviando] = useState(false);
  const concluida = ['aprovada', 'recusada'].includes(j.status);

  async function salvar(e) {
    e.preventDefault();
    const precisa = ['RECUSADA', 'NECESSITA_INFO'].includes(f.valores.status);
    if (!f.validar({ parecer: (x) => (precisa && x.trim().length < 5 ? 'Explique para a família (mínimo 5 caracteres).' : '') })) return;
    setEnviando(true);
    try {
      await api.patch(`/justificativas/${j.id}/analise`, { status: f.valores.status, parecer: f.valores.parecer.trim() || null });
      toast('Análise registrada.');
      window.dispatchEvent(new CustomEvent('kfka:atualizar-contadores'));
      onSalvo();
    } catch (err) {
      f.errosDaApi(err);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Janela
      aberto
      onFechar={onFechar}
      titulo={`Justificativa — ${j.aluno}`}
      subtitulo={<BadgeDe tipo="justificativa" valor={j.status} />}
      onSubmit={concluida ? undefined : salvar}
      rodape={
        !concluida && (
          <>
            <button type="button" className="btn btn-ghost" onClick={onFechar}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={enviando}>
              {enviando ? 'Salvando...' : 'Registrar decisão'}
            </button>
          </>
        )
      }
    >
      <dl className="detalhes">
        <Detalhe rotulo="Período">{periodo(j)}</Detalhe>
        <Detalhe rotulo="Turma">{j.turma}</Detalhe>
        <Detalhe rotulo="Motivo">{MOTIVOS_FALTA[j.motivo]}</Detalhe>
        <Detalhe rotulo="Enviada por">
          {j.responsavel} em {formatarDataHora(j.criado_em)}
        </Detalhe>
      </dl>
      <p className="parecer">{j.descricao}</p>
      {concluida ? (
        <Aviso tom={j.status === 'aprovada' ? 'ok' : 'danger'} titulo={`Analisada por ${j.analisado_por} em ${formatarDataHora(j.analisado_em)}`}>
          {j.parecer || 'Sem observações.'}
        </Aviso>
      ) : (
        <div className="form-grid">
          <Campo nome="status" rotulo="Decisão">
            <select value={f.valores.status} onChange={f.campo('status')}>
              <option value="APROVADA">Aprovar</option>
              <option value="RECUSADA">Recusar</option>
              <option value="NECESSITA_INFO">Pedir mais informações</option>
              <option value="EM_ANALISE">Marcar como em análise</option>
            </select>
          </Campo>
          <Campo nome="parecer" rotulo="Mensagem para a família" erro={f.erros.parecer} opcional={!['RECUSADA', 'NECESSITA_INFO'].includes(f.valores.status)} className="col-2">
            <textarea rows={3} value={f.valores.parecer} onChange={f.campo('parecer')} maxLength={500} />
          </Campo>
        </div>
      )}
      <ErroFormulario>{f.erroGeral}</ErroFormulario>
    </Janela>
  );
}

function VisaoResponsavel() {
  const [params, setParams] = useSearchParams();
  const filhos = useApi(() => api.get('/alunos'), []);
  const lista = useListaPaginada('/justificativas', 20);
  const faltas = useApi(() => api.get('/justificativas/faltas'), []);
  const [form, setForm] = useState(() =>
    params.get('nova') ? { aluno_id: Number(params.get('nova')), data_inicio: params.get('data') || '' } : null
  );
  const abrir = Number(params.get('abrir')) || null;
  const aberta = useItemAberto(lista.dados, abrir, '/justificativas');
  const semJustificativa = (faltas.dados || []).filter((x) => !x.justificativa);

  function atualizar() {
    setForm(null);
    setParams({});
    lista.recarregar({ silencioso: true });
    faltas.recarregar({ silencioso: true });
  }

  return (
    <>
      <Topo titulo="Justificativas de faltas" descricao="Justifique ausências dos seus filhos e acompanhe a análise da escola.">
        <button type="button" className="btn btn-primary" onClick={() => setForm({})} disabled={!filhos.dados?.length}>
          <Icone nome="mais" tamanho={16} /> Justificar falta
        </button>
      </Topo>

      {semJustificativa.length > 0 && (
        <section className="cartao destaque-pendente">
          <h2 className="cartao-titulo">
            <Icone nome="alerta" /> Faltas registradas sem justificativa
          </h2>
          <ul className="lista-simples">
            {semJustificativa.map((x) => (
              <li key={`${x.aluno_id}-${x.data}`} className="linha-acao">
                <span>
                  <strong>
                    {x.aluno} · {formatarDia(x.data)}
                  </strong>
                  <span className="texto-secundario">{x.disciplinas.join(', ')}</span>
                </span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setForm({ aluno_id: x.aluno_id, data_inicio: x.data })}>
                  Justificar
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <h2 className="secao-titulo">Minhas justificativas</h2>
      {lista.erro && <ErroEstado mensagem={lista.erro} onTentarNovamente={lista.recarregar} />}
      {!lista.erro && !lista.dados && <Carregando />}
      {lista.dados && !lista.dados.length && <Vazio>Nenhuma justificativa enviada ainda.</Vazio>}
      <div className="lista-cartoes">
        {lista.dados?.map((j) => (
          <article key={j.id} className={`cartao${j.status === 'necessita_info' ? ' cartao-alerta' : ''}`}>
            <header className="cartao-topo">
              <div>
                <h3 className="cartao-titulo">{j.aluno}</h3>
                <p className="texto-secundario">
                  {periodo(j)} · {MOTIVOS_FALTA[j.motivo]}
                </p>
              </div>
              <BadgeDe tipo="justificativa" valor={j.status} />
            </header>
            <p className="parecer">{j.descricao}</p>
            {j.parecer && (
              <p className="motivo-box">
                <strong>Escola:</strong> {j.parecer}
              </p>
            )}
            <footer className="cartao-acoes">
              <small className="texto-secundario">Enviada em {formatarDataHora(j.criado_em)}</small>
              {['pendente', 'necessita_info'].includes(j.status) && (
                <button type="button" className={`btn btn-sm ${j.status === 'necessita_info' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setForm(j)}>
                  {j.status === 'necessita_info' ? 'Complementar' : 'Editar'}
                </button>
              )}
            </footer>
          </article>
        ))}
      </div>
      <Paginacao meta={lista.meta} onPagina={lista.setPagina} rotulo="justificativa(s)" />

      {(form || aberta) && filhos.dados && (
        <FormJustificativa inicial={form || aberta} filhos={filhos.dados} onFechar={() => { setForm(null); setParams({}); }} onSalvo={atualizar} />
      )}
    </>
  );
}

function VisaoCoordenacao() {
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState('');
  const lista = useListaPaginada(`/justificativas${status ? `?status=${status}` : ''}`);
  const abrir = Number(params.get('abrir')) || null;
  const aberta = useItemAberto(lista.dados, abrir, '/justificativas');

  return (
    <>
      <Topo titulo="Justificativas de faltas" descricao="Analise as justificativas enviadas pelas famílias. Os detalhes ficam visíveis só para a coordenação." />
      <div className="filtros barra-filtros">
        <label className="campo-filtro">
          <span>Situação</span>
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todas</option>
            {Object.entries(STATUS.justificativa).map(([v, [r]]) => (
              <option key={v} value={v.toUpperCase()}>
                {r}
              </option>
            ))}
          </select>
        </label>
      </div>
      {lista.erro ? (
        <ErroEstado mensagem={lista.erro} onTentarNovamente={lista.recarregar} />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Aluno</th>
                <th scope="col">Período</th>
                <th scope="col">Motivo</th>
                <th scope="col">Responsável</th>
                <th scope="col">Enviada</th>
                <th scope="col">Situação</th>
                <th scope="col">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {!lista.dados && <LinhasEsqueleto colunas={7} linhas={3} />}
              {lista.dados && !lista.dados.length && (
                <LinhaEstado colunas={7}>
                  <Vazio>Nenhuma justificativa {status ? 'nesta situação' : 'recebida'}.</Vazio>
                </LinhaEstado>
              )}
              {lista.dados?.map((j) => (
                <tr key={j.id}>
                  <td data-rotulo="Aluno">
                    <strong>{j.aluno}</strong>
                    <br />
                    <small className="texto-secundario">{j.turma}</small>
                  </td>
                  <td data-rotulo="Período">{periodo(j)}</td>
                  <td data-rotulo="Motivo">{MOTIVOS_FALTA[j.motivo]}</td>
                  <td data-rotulo="Responsável">{j.responsavel}</td>
                  <td data-rotulo="Enviada">{formatarDataHora(j.criado_em)}</td>
                  <td data-rotulo="Situação">
                    <BadgeDe tipo="justificativa" valor={j.status} />
                  </td>
                  <td>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setParams({ abrir: j.id })}>
                      {['pendente', 'em_analise'].includes(j.status) ? 'Analisar' : 'Ver'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Paginacao meta={lista.meta} onPagina={lista.setPagina} rotulo="justificativa(s)" />
      {aberta && (
        <AnaliseJustificativa
          key={aberta.id}
          j={aberta}
          onFechar={() => setParams({})}
          onSalvo={() => {
            setParams({});
            lista.recarregar({ silencioso: true });
          }}
        />
      )}
    </>
  );
}

export default function Justificativas() {
  useTitulo('Justificativas de faltas');
  const { usuario } = useAuth();
  return usuario.perfil === 'admin' ? <VisaoCoordenacao /> : <VisaoResponsavel />;
}
