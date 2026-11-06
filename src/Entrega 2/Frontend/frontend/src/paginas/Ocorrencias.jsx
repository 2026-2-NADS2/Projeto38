// Ocorrencias.jsx — registro e acompanhamento de ocorrências escolares (coordenação e professores).
// Acesso restrito: o professor vê as que registrou e as não restritas das suas turmas.
// "Saúde ou bem-estar" é sempre restrita. Responsáveis não acessam esta tela.

import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/cliente';
import { useTitulo } from '../componentes/Basicos';
import { Carregando, ErroEstado, LinhaEstado, LinhasEsqueleto, Vazio } from '../componentes/Estado';
import { Aviso, Campo, ErroFormulario } from '../componentes/Formulario';
import Icone from '../componentes/Icone';
import { Badge, BadgeDe, Detalhe, Paginacao, Topo } from '../componentes/Interface';
import Janela from '../componentes/Janela';
import { useAuth } from '../contexto/AuthContext';
import { useConfirmar } from '../contexto/ConfirmarContext';
import { useToast } from '../contexto/ToastContext';
import { useApi } from '../hooks/useApi';
import { useListaPaginada } from '../hooks/useListaPaginada';
import { useFormulario } from '../hooks/useFormulario';
import { ROTULO_PERFIL, diaLocalIso, formatarDataHora, paraDataHoraLocal } from '../util/formato';
import { CATEGORIAS_OCORRENCIA, STATUS, rotuloStatus } from '../util/status';

function FormOcorrencia({ onFechar, onSalvo }) {
  const toast = useToast();
  const alunos = useApi(() => api.get('/alunos'), []);
  const f = useFormulario({
    aluno_id: '',
    data_hora: paraDataHoraLocal(new Date().toISOString()),
    categoria: '',
    descricao: '',
    providencias: '',
    restrita: false,
  });
  const [enviando, setEnviando] = useState(false);
  const v = f.valores;
  const saude = v.categoria === 'SAUDE';

  async function salvar(e) {
    e.preventDefault();
    const ok = f.validar({
      aluno_id: (x) => (!x ? 'Escolha o aluno.' : ''),
      data_hora: (x) => (!x ? 'Informe data e horário.' : x.slice(0, 10) > diaLocalIso() ? 'A data não pode estar no futuro.' : ''),
      categoria: (x) => (!x ? 'Escolha a categoria.' : ''),
      descricao: (x) => (x.trim().length < 10 ? 'Descreva o ocorrido (mínimo 10 caracteres).' : ''),
    });
    if (!ok) return;
    setEnviando(true);
    try {
      await api.post('/ocorrencias', {
        aluno_id: Number(v.aluno_id),
        data_hora: v.data_hora,
        categoria: v.categoria,
        descricao: v.descricao.trim(),
        providencias: v.providencias.trim() || null,
        restrita: saude || v.restrita,
      });
      toast('Ocorrência registrada.');
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
      largo
      onFechar={onFechar}
      titulo="Registrar ocorrência"
      onSubmit={salvar}
      rodape={
        <>
          <button type="button" className="btn btn-ghost" onClick={onFechar}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={enviando}>
            {enviando ? 'Salvando...' : 'Registrar'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Campo nome="aluno_id" rotulo="Aluno envolvido" erro={f.erros.aluno_id}>
          <select value={v.aluno_id} onChange={f.campo('aluno_id')} disabled={!alunos.dados}>
            <option value="">{alunos.dados ? 'Escolha...' : 'Carregando...'}</option>
            {(alunos.dados || [])
              .filter((a) => a.turma)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome} ({a.turma})
                </option>
              ))}
          </select>
        </Campo>
        <Campo nome="data_hora" rotulo="Data e horário" erro={f.erros.data_hora}>
          <input type="datetime-local" value={v.data_hora} onChange={f.campo('data_hora')} />
        </Campo>
        <Campo nome="categoria" rotulo="Categoria" erro={f.erros.categoria} className="col-2">
          <select value={v.categoria} onChange={f.campo('categoria')}>
            <option value="">Escolha...</option>
            {Object.entries(CATEGORIAS_OCORRENCIA).map(([k, r]) => (
              <option key={k} value={k.toUpperCase()}>
                {r}
              </option>
            ))}
          </select>
        </Campo>
        <Campo nome="descricao" rotulo="Descrição detalhada" erro={f.erros.descricao} className="col-2" dica="Descreva fatos, sem julgamentos. Evite expor outros alunos.">
          <textarea rows={4} value={v.descricao} onChange={f.campo('descricao')} maxLength={5000} />
        </Campo>
        <Campo nome="providencias" rotulo="Providências adotadas" opcional className="col-2">
          <textarea rows={2} value={v.providencias} onChange={f.campo('providencias')} maxLength={5000} />
        </Campo>
      </div>
      <label className="aceite">
        <input type="checkbox" checked={saude || v.restrita} disabled={saude} onChange={f.campo('restrita')} /> Restrita: visível só para a coordenação e para
        quem registrou{saude && ' (obrigatório em saúde ou bem-estar)'}
      </label>
      <ErroFormulario>{f.erroGeral}</ErroFormulario>
    </Janela>
  );
}

function DetalheOcorrencia({ id, ehAdmin, onFechar, onMudou }) {
  const toast = useToast();
  const confirmar = useConfirmar();
  const { dados: o, erro, recarregar } = useApi(() => api.get(`/ocorrencias/${id}`), [id]);
  const f = useFormulario({ texto: '', status: '', providencias: '' });
  const [enviando, setEnviando] = useState(false);
  const podeAtualizar = o && (ehAdmin || o.minha);

  async function atualizar(e) {
    e.preventDefault();
    if (!f.validar({ texto: (x) => (x.trim().length < 3 ? 'Escreva a atualização.' : '') })) return;
    setEnviando(true);
    const corpo = { texto: f.valores.texto.trim() };
    if (ehAdmin && f.valores.status) corpo.status = f.valores.status;
    if (f.valores.providencias.trim()) corpo.providencias = f.valores.providencias.trim();
    try {
      await api.post(`/ocorrencias/${id}/atualizacoes`, corpo);
      toast('Atualização registrada.');
      f.reiniciar({ texto: '', status: '', providencias: '' });
      recarregar({ silencioso: true });
      onMudou();
    } catch (err) {
      f.errosDaApi(err);
    } finally {
      setEnviando(false);
    }
  }

  async function alternarRestricao() {
    const ok = await confirmar(
      o.restrita
        ? { titulo: 'Liberar para os professores da turma?', mensagem: 'Os professores que lecionam na turma poderão ver esta ocorrência.', confirmar: 'Liberar' }
        : { titulo: 'Tornar restrita?', mensagem: 'Só a coordenação e quem registrou poderão ver.', confirmar: 'Tornar restrita' }
    );
    if (!ok) return;
    try {
      await api.patch(`/ocorrencias/${id}/restricao`, { restrita: !o.restrita });
      toast('Acesso atualizado.');
      recarregar({ silencioso: true });
      onMudou();
    } catch (err) {
      toast(err.message, 'erro');
    }
  }

  return (
    <Janela aberto largo onFechar={onFechar} titulo={o ? `Ocorrência — ${o.aluno}` : 'Ocorrência'} subtitulo={o && <BadgeDe tipo="ocorrencia" valor={o.status} />}>
      {erro && <ErroEstado mensagem={erro} onTentarNovamente={recarregar} />}
      {!erro && !o && <Carregando />}
      {o && (
        <>
          <dl className="detalhes">
            <Detalhe rotulo="Turma">{o.turma}</Detalhe>
            <Detalhe rotulo="Data e horário">{formatarDataHora(o.data_hora)}</Detalhe>
            <Detalhe rotulo="Categoria">{CATEGORIAS_OCORRENCIA[o.categoria]}</Detalhe>
            <Detalhe rotulo="Registrada por">
              {o.registrado_por} ({ROTULO_PERFIL[o.registrado_perfil]})
            </Detalhe>
            <Detalhe rotulo="Acesso">
              {o.restrita ? (
                <Badge tom="warn">Restrita</Badge>
              ) : (
                <Badge tom="neutral">Coordenação e professores da turma</Badge>
              )}
              {ehAdmin && o.categoria !== 'saude' && (
                <button type="button" className="link-botao" onClick={alternarRestricao} style={{ marginLeft: '0.5rem' }}>
                  {o.restrita ? 'Liberar' : 'Restringir'}
                </button>
              )}
            </Detalhe>
          </dl>
          <h3 className="subtitulo">Descrição</h3>
          <p className="parecer">{o.descricao}</p>
          <h3 className="subtitulo">Providências adotadas</h3>
          <p className="parecer">{o.providencias || <span className="texto-secundario">Nenhuma registrada.</span>}</p>

          <h3 className="subtitulo">Histórico de atualizações</h3>
          <ol className="linha-tempo">
            {o.atualizacoes.map((a) => (
              <li key={a.id} className={`evento ${a.status_novo === 'resolvida' ? 'evento-publicado' : ''}`}>
                <p className="evento-titulo">
                  {a.status_anterior && a.status_anterior !== a.status_novo ? (
                    <>
                      <strong>{rotuloStatus('ocorrencia', a.status_anterior)}</strong> → <strong>{rotuloStatus('ocorrencia', a.status_novo)}</strong>
                    </>
                  ) : (
                    a.texto
                  )}
                </p>
                {a.status_anterior && a.status_anterior !== a.status_novo && <p className="evento-mudancas">{a.texto}</p>}
                <p className="evento-autor">
                  {a.usuario} ({ROTULO_PERFIL[a.perfil]}) · {formatarDataHora(a.data_hora)}
                </p>
              </li>
            ))}
          </ol>

          {podeAtualizar ? (
            <form onSubmit={atualizar} noValidate className="sub-form">
              <h3 className="subtitulo">Nova atualização</h3>
              <div className="form-grid">
                <Campo nome="texto" rotulo="O que aconteceu desde o registro" erro={f.erros.texto} className="col-2">
                  <textarea rows={2} value={f.valores.texto} onChange={f.campo('texto')} maxLength={2000} />
                </Campo>
                <Campo nome="providencias" rotulo="Atualizar providências" opcional className="col-2" dica="Se preenchido, substitui o texto de providências.">
                  <textarea rows={2} value={f.valores.providencias} onChange={f.campo('providencias')} maxLength={5000} />
                </Campo>
                {ehAdmin && (
                  <Campo nome="status" rotulo="Mudar situação" opcional>
                    <select value={f.valores.status} onChange={f.campo('status')}>
                      <option value="">Manter ({rotuloStatus('ocorrencia', o.status)})</option>
                      {Object.entries(STATUS.ocorrencia)
                        .filter(([k]) => k !== o.status)
                        .map(([k, [r]]) => (
                          <option key={k} value={k.toUpperCase()}>
                            {r}
                          </option>
                        ))}
                    </select>
                  </Campo>
                )}
              </div>
              <ErroFormulario>{f.erroGeral}</ErroFormulario>
              <div className="cartao-acoes">
                <button type="submit" className="btn btn-primary btn-sm" disabled={enviando}>
                  {enviando ? 'Salvando...' : 'Registrar atualização'}
                </button>
              </div>
            </form>
          ) : (
            <Aviso tom="info">Somente a coordenação e quem registrou podem atualizar esta ocorrência.</Aviso>
          )}
        </>
      )}
    </Janela>
  );
}

export default function Ocorrencias() {
  useTitulo('Ocorrências');
  const { usuario } = useAuth();
  const ehAdmin = usuario.perfil === 'admin';
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState('');
  const [categoria, setCategoria] = useState('');
  const [novo, setNovo] = useState(false);
  const filtro = new URLSearchParams();
  if (status) filtro.set('status', status);
  if (categoria) filtro.set('categoria', categoria);
  const lista = useListaPaginada(`/ocorrencias?${filtro}`);
  const abrir = Number(params.get('abrir')) || null;

  return (
    <>
      <Topo
        titulo="Ocorrências"
        descricao={ehAdmin ? 'Registro e acompanhamento das ocorrências escolares.' : 'Ocorrências que você registrou e as compartilhadas das suas turmas.'}
      >
        <button type="button" className="btn btn-primary" onClick={() => setNovo(true)}>
          <Icone nome="mais" tamanho={16} /> Registrar ocorrência
        </button>
      </Topo>
      <Aviso tom="info">
        Informações sensíveis de crianças e adolescentes (LGPD, art. 14): registre apenas o necessário. Ocorrências restritas ficam visíveis só para a
        coordenação e para quem registrou.
      </Aviso>
      <div className="filtros barra-filtros">
        <label className="campo-filtro">
          <span>Situação</span>
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todas</option>
            {Object.entries(STATUS.ocorrencia).map(([k, [r]]) => (
              <option key={k} value={k.toUpperCase()}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="campo-filtro">
          <span>Categoria</span>
          <select className="select" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            <option value="">Todas</option>
            {Object.entries(CATEGORIAS_OCORRENCIA).map(([k, r]) => (
              <option key={k} value={k.toUpperCase()}>
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
                <th scope="col">Data</th>
                <th scope="col">Categoria</th>
                <th scope="col">Registrada por</th>
                <th scope="col">Situação</th>
                <th scope="col">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {!lista.dados && <LinhasEsqueleto colunas={6} linhas={3} />}
              {lista.dados && !lista.dados.length && (
                <LinhaEstado colunas={6}>
                  <Vazio>Nenhuma ocorrência encontrada.</Vazio>
                </LinhaEstado>
              )}
              {lista.dados?.map((o) => (
                <tr key={o.id}>
                  <td data-rotulo="Aluno">
                    <strong>{o.aluno}</strong>
                    <br />
                    <small className="texto-secundario">{o.turma}</small>
                  </td>
                  <td data-rotulo="Data">{formatarDataHora(o.data_hora)}</td>
                  <td data-rotulo="Categoria">
                    {CATEGORIAS_OCORRENCIA[o.categoria]}
                    {o.restrita && (
                      <>
                        {' '}
                        <Badge tom="warn">Restrita</Badge>
                      </>
                    )}
                  </td>
                  <td data-rotulo="Registrada por">{o.minha ? 'Você' : o.registrado_por}</td>
                  <td data-rotulo="Situação">
                    <BadgeDe tipo="ocorrencia" valor={o.status} />
                  </td>
                  <td>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setParams({ abrir: o.id })}>
                      Abrir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Paginacao meta={lista.meta} onPagina={lista.setPagina} rotulo="ocorrência(s)" />

      {novo && (
        <FormOcorrencia
          onFechar={() => setNovo(false)}
          onSalvo={() => {
            setNovo(false);
            lista.recarregar({ silencioso: true });
          }}
        />
      )}
      {abrir && (
        <DetalheOcorrencia
          key={abrir}
          id={abrir}
          ehAdmin={ehAdmin}
          onFechar={() => setParams({})}
          onMudou={() => {
            lista.recarregar({ silencioso: true });
            window.dispatchEvent(new CustomEvent('kfka:atualizar-contadores'));
          }}
        />
      )}
    </>
  );
}
