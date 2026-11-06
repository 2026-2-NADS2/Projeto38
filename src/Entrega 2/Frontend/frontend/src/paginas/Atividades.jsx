// Atividades.jsx — atividades escolares.
//  Professor:   cadastra (rascunho ou publicada), edita, publica, encerra, cancela e registra entregas
//  Responsável: vê as atividades publicadas das turmas dos filhos, com a situação de cada filho
//               (pendente, concluída ou atrasada)

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/cliente';
import { useTitulo } from '../componentes/Basicos';
import { Carregando, ErroEstado, Vazio } from '../componentes/Estado';
import { Aviso, Campo, ErroFormulario } from '../componentes/Formulario';
import Icone from '../componentes/Icone';
import { BadgeDe, Topo } from '../componentes/Interface';
import Janela from '../componentes/Janela';
import { useAuth } from '../contexto/AuthContext';
import { useConfirmar } from '../contexto/ConfirmarContext';
import { useToast } from '../contexto/ToastContext';
import { useApi } from '../hooks/useApi';
import { useFormulario } from '../hooks/useFormulario';
import { diaLocalIso, formatarDataHora, paraDataHoraLocal, relativo, somarDiasIso } from '../util/formato';
import { STATUS } from '../util/status';

function Prazo({ a }) {
  return (
    <span className={`prazo${a.vencida ? ' vencido' : ''}`}>
      <Icone nome="relogio" tamanho={14} /> {formatarDataHora(a.prazo)} <span className="texto-secundario">({relativo(a.prazo)})</span>
    </span>
  );
}

function MaterialLink({ url }) {
  if (!url) return null;
  return (
    <a className="link material-link" href={url} target="_blank" rel="noopener noreferrer">
      <Icone nome="link" tamanho={14} /> Material de apoio
    </a>
  );
}

// ---------------------------------------------------------------- professor
function FormAtividade({ inicial, turmas, onFechar, onSalvo }) {
  const toast = useToast();
  const editando = Boolean(inicial?.id);
  const publicada = inicial?.status === 'publicada';
  const f = useFormulario({
    turma_id: String(inicial?.turma_id || turmas[0]?.id || ''),
    disciplina_id: String(inicial?.disciplina_id || ''),
    titulo: inicial?.titulo || '',
    descricao: inicial?.descricao || '',
    prazo: inicial?.prazo ? paraDataHoraLocal(inicial.prazo) : `${somarDiasIso(diaLocalIso(), 7)}T23:59`,
    link_material: inicial?.link_material || '',
    publicar: publicada,
  });
  const [disciplinas, setDisciplinas] = useState([]);
  const [enviando, setEnviando] = useState(false);
  const v = f.valores;

  useEffect(() => {
    let ativo = true;
    api.get(`/disciplinas?turma_id=${v.turma_id}`).then((l) => {
      if (!ativo) return;
      setDisciplinas(l);
      if (!l.some((d) => String(d.id) === v.disciplina_id)) f.definir('disciplina_id', String(l[0]?.id || ''));
    });
    return () => {
      ativo = false;
    };
  }, [v.turma_id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function salvar(e) {
    e.preventDefault();
    const ok = f.validar({
      titulo: (x) => (x.trim().length < 3 ? 'Informe um título (mínimo 3 caracteres).' : ''),
      descricao: (x) => (x.trim().length < 5 ? 'Descreva a atividade (mínimo 5 caracteres).' : ''),
      disciplina_id: (x) => (!x ? 'Escolha a disciplina.' : ''),
      prazo: (x) => (!x ? 'Informe o prazo de entrega.' : ''),
      link_material: (x) => (x && !/^https?:\/\/\S+$/i.test(x.trim()) ? 'O link deve começar com http:// ou https://.' : ''),
    });
    if (!ok) return;
    setEnviando(true);
    const corpo = {
      turma_id: Number(v.turma_id),
      disciplina_id: Number(v.disciplina_id),
      titulo: v.titulo.trim(),
      descricao: v.descricao.trim(),
      prazo: v.prazo,
      link_material: v.link_material.trim() || null,
      publicar: v.publicar,
    };
    try {
      if (editando) await api.put(`/atividades/${inicial.id}`, corpo);
      else await api.post('/atividades', corpo);
      toast(v.publicar ? 'Atividade publicada para as famílias.' : 'Atividade salva como rascunho.');
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
      titulo={editando ? 'Editar atividade' : 'Nova atividade'}
      onSubmit={salvar}
      rodape={
        <>
          <button type="button" className="btn btn-ghost" onClick={onFechar}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={enviando}>
            {enviando ? 'Salvando...' : 'Salvar'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Campo nome="turma_id" rotulo="Turma" dica={publicada ? 'Depois de publicada, a turma não muda.' : null}>
          <select value={v.turma_id} onChange={f.campo('turma_id')} disabled={publicada}>
            {turmas.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </select>
        </Campo>
        <Campo nome="disciplina_id" rotulo="Disciplina" erro={f.erros.disciplina_id}>
          <select value={v.disciplina_id} onChange={f.campo('disciplina_id')} disabled={publicada}>
            {disciplinas.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nome}
              </option>
            ))}
          </select>
        </Campo>
        <Campo nome="titulo" rotulo="Título" erro={f.erros.titulo} className="col-2">
          <input value={v.titulo} onChange={f.campo('titulo')} maxLength={150} />
        </Campo>
        <Campo nome="descricao" rotulo="Descrição e orientações" erro={f.erros.descricao} className="col-2">
          <textarea rows={4} value={v.descricao} onChange={f.campo('descricao')} maxLength={5000} />
        </Campo>
        <Campo nome="prazo" rotulo="Prazo de entrega" erro={f.erros.prazo}>
          <input type="datetime-local" value={v.prazo} onChange={f.campo('prazo')} />
        </Campo>
        <Campo nome="link_material" rotulo="Link do material" erro={f.erros.link_material} opcional dica="Anexos: o envio de arquivos ainda não é suportado; use um link (Drive, site...).">
          <input type="url" value={v.link_material} onChange={f.campo('link_material')} placeholder="https://..." />
        </Campo>
      </div>
      {!publicada && (
        <label className="aceite">
          <input type="checkbox" checked={v.publicar} onChange={f.campo('publicar')} /> Publicar agora (as famílias passam a ver a atividade)
        </label>
      )}
      <ErroFormulario>{f.erroGeral}</ErroFormulario>
    </Janela>
  );
}

function JanelaEntregas({ id, onFechar, onSalvo }) {
  const toast = useToast();
  const { dados, erro, recarregar, setDados } = useApi(() => api.get(`/atividades/${id}`), [id]);
  const [mudancas, setMudancas] = useState({});
  const [enviando, setEnviando] = useState(false);

  async function salvar() {
    const entregas = Object.entries(mudancas).map(([aluno_id, situacao]) => ({ aluno_id: Number(aluno_id), situacao }));
    if (!entregas.length) return onFechar();
    setEnviando(true);
    try {
      setDados(await api.put(`/atividades/${id}/entregas`, { entregas }));
      setMudancas({});
      toast('Entregas registradas.');
      onSalvo();
    } catch (err) {
      toast(err.message, 'erro');
    } finally {
      setEnviando(false);
    }
  }

  const podeRegistrar = dados && ['publicada', 'encerrada'].includes(dados.status);
  return (
    <Janela
      aberto
      largo
      onFechar={onFechar}
      titulo={dados ? dados.titulo : 'Atividade'}
      subtitulo={dados && `${dados.disciplina} · ${dados.turma}`}
      rodape={
        podeRegistrar && (
          <>
            <button type="button" className="btn btn-ghost" onClick={onFechar}>
              Fechar
            </button>
            <button type="button" className="btn btn-primary" onClick={salvar} disabled={enviando || !Object.keys(mudancas).length}>
              {enviando ? 'Salvando...' : 'Salvar entregas'}
            </button>
          </>
        )
      }
    >
      {erro && <ErroEstado mensagem={erro} onTentarNovamente={recarregar} />}
      {!erro && !dados && <Carregando />}
      {dados && (
        <>
          <p className="parecer">{dados.descricao}</p>
          <p>
            <Prazo a={dados} />
          </p>
          <MaterialLink url={dados.link_material} />
          {!podeRegistrar && <Aviso tom="info">Publique a atividade para registrar as entregas.</Aviso>}
          {podeRegistrar && (
            <ul className="lista-presenca">
              {dados.entregas.map((e) => {
                const atual = (mudancas[e.aluno_id] || e.situacao.toUpperCase()).toLowerCase();
                return (
                  <li key={e.aluno_id} className="presenca">
                    <span className="presenca-nome">
                      <strong>{e.nome}</strong>
                      <BadgeDe tipo="entrega" valor={atual} />
                    </span>
                    <label>
                      <span className="sr-only">Entrega de {e.nome}</span>
                      <select className="select" value={atual.toUpperCase()} onChange={(ev) => setMudancas((m) => ({ ...m, [e.aluno_id]: ev.target.value }))}>
                        {Object.entries(STATUS.entrega).map(([valor, [rotulo]]) => (
                          <option key={valor} value={valor.toUpperCase()}>
                            {rotulo}
                          </option>
                        ))}
                      </select>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </Janela>
  );
}

function VisaoProfessor() {
  const toast = useToast();
  const confirmar = useConfirmar();
  const [params, setParams] = useSearchParams();
  const [turma, setTurma] = useState('');
  const [situacao, setSituacao] = useState('todas');
  const [form, setForm] = useState(null);
  const turmas = useApi(() => api.get('/turmas'), []);
  const lista = useApi(() => api.get(`/atividades?situacao=${situacao}${turma ? `&turma_id=${turma}` : ''}`), [turma, situacao]);
  const abrir = Number(params.get('abrir')) || null;

  async function mudarStatus(a, status, texto) {
    if (!(await confirmar(texto))) return;
    try {
      await api.patch(`/atividades/${a.id}/status`, { status });
      toast({ PUBLICADA: 'Atividade publicada.', ENCERRADA: 'Atividade encerrada.', CANCELADA: 'Atividade cancelada.' }[status]);
      lista.recarregar({ silencioso: true });
    } catch (err) {
      toast(err.message, 'erro');
    }
  }

  async function excluir(a) {
    if (!(await confirmar({ titulo: 'Excluir este rascunho?', mensagem: `“${a.titulo}” será apagada.`, confirmar: 'Excluir', perigo: true }))) return;
    try {
      await api.del(`/atividades/${a.id}`);
      toast('Rascunho excluído.');
      lista.recarregar({ silencioso: true });
    } catch (err) {
      toast(err.message, 'erro');
    }
  }

  if (turmas.erro) return <ErroEstado mensagem={turmas.erro} onTentarNovamente={turmas.recarregar} />;

  return (
    <>
      <Topo titulo="Atividades" descricao="Cadastre atividades, defina o prazo e registre as entregas dos alunos.">
        <button type="button" className="btn btn-primary" onClick={() => setForm({})} disabled={!turmas.dados?.length}>
          <Icone nome="mais" tamanho={16} /> Nova atividade
        </button>
      </Topo>
      <div className="filtros" style={{ marginBottom: 'var(--space-md)' }}>
        <label className="campo-filtro">
          <span>Turma</span>
          <select className="select" value={turma} onChange={(e) => setTurma(e.target.value)}>
            <option value="">Todas</option>
            {(turmas.dados || []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="campo-filtro">
          <span>Mostrar</span>
          <select className="select" value={situacao} onChange={(e) => setSituacao(e.target.value)}>
            <option value="todas">Todas</option>
            <option value="pendentes">No prazo</option>
            <option value="encerradas">Prazo encerrado</option>
            <option value="rascunhos">Rascunhos</option>
          </select>
        </label>
      </div>

      {lista.erro && <ErroEstado mensagem={lista.erro} onTentarNovamente={lista.recarregar} />}
      {!lista.erro && !lista.dados && <Carregando texto="Carregando atividades..." />}
      {lista.dados && !lista.dados.length && <Vazio>Nenhuma atividade por aqui. Use “Nova atividade” para começar.</Vazio>}
      <div className="lista-cartoes">
        {lista.dados?.map((a) => (
          <article key={a.id} className="cartao">
            <header className="cartao-topo">
              <div>
                <h2 className="cartao-titulo">{a.titulo}</h2>
                <p className="texto-secundario">
                  {a.disciplina} · {a.turma}
                </p>
              </div>
              <BadgeDe tipo="atividade" valor={a.status} />
            </header>
            <Prazo a={a} />
            {['publicada', 'encerrada'].includes(a.status) && (
              <div className="progresso" aria-label={`${a.entregues} de ${a.total_alunos} entregas`}>
                <span className="progresso-trilho">
                  <span className="progresso-barra" style={{ width: `${a.total_alunos ? Math.round((a.entregues / a.total_alunos) * 100) : 0}%` }} />
                </span>
                <small className="texto-secundario">
                  {a.entregues} de {a.total_alunos} entregas
                </small>
              </div>
            )}
            <footer className="cartao-acoes">
              {['rascunho', 'publicada'].includes(a.status) && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setForm(a)}>
                  <Icone nome="editar" tamanho={14} /> Editar
                </button>
              )}
              {a.status === 'rascunho' && (
                <>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => excluir(a)}>
                    Excluir
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => mudarStatus(a, 'PUBLICADA', { titulo: 'Publicar a atividade?', mensagem: 'As famílias da turma passam a ver a atividade e o prazo.', confirmar: 'Publicar' })}
                  >
                    Publicar
                  </button>
                </>
              )}
              {a.status === 'publicada' && (
                <>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => mudarStatus(a, 'CANCELADA', { titulo: 'Cancelar a atividade?', mensagem: 'Ela some da lista das famílias.', confirmar: 'Cancelar atividade', cancelar: 'Voltar', perigo: true })}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => mudarStatus(a, 'ENCERRADA', { titulo: 'Encerrar a atividade?', mensagem: 'Quem não tiver entrega registrada aparece como atrasado.', confirmar: 'Encerrar' })}
                  >
                    Encerrar
                  </button>
                </>
              )}
              {['publicada', 'encerrada'].includes(a.status) && (
                <button type="button" className="btn btn-primary btn-sm" onClick={() => setParams({ abrir: a.id })}>
                  Entregas
                </button>
              )}
            </footer>
          </article>
        ))}
      </div>

      {form && turmas.dados && (
        <FormAtividade
          inicial={form}
          turmas={turmas.dados}
          onFechar={() => setForm(null)}
          onSalvo={() => {
            setForm(null);
            lista.recarregar({ silencioso: true });
          }}
        />
      )}
      {abrir && <JanelaEntregas id={abrir} onFechar={() => setParams({})} onSalvo={() => lista.recarregar({ silencioso: true })} />}
    </>
  );
}

// ---------------------------------------------------------------- responsável
function VisaoResponsavel() {
  const [params, setParams] = useSearchParams();
  const [aluno, setAluno] = useState('');
  const [situacao, setSituacao] = useState('todas');
  const filhos = useApi(() => api.get('/alunos'), []);
  const lista = useApi(() => api.get(`/atividades${aluno ? `?aluno_id=${aluno}` : ''}`), [aluno]);
  const abrir = Number(params.get('abrir')) || null;

  const contagem = useMemo(() => {
    const c = { pendente: 0, concluida: 0, atrasada: 0 };
    for (const a of lista.dados || []) c[a.situacao_aluno] += 1;
    return c;
  }, [lista.dados]);
  const visiveis = (lista.dados || []).filter((a) => situacao === 'todas' || a.situacao_aluno === situacao);
  const aberta = abrir ? (lista.dados || []).filter((a) => a.id === abrir) : [];

  return (
    <>
      <Topo titulo="Atividades" descricao="Atividades publicadas pelos professores, com o prazo e a situação de entrega de cada filho." />
      <div className="filtros" style={{ marginBottom: 'var(--space-sm)' }}>
        {filhos.dados?.length > 1 && (
          <label className="campo-filtro">
            <span>Aluno</span>
            <select className="select" value={aluno} onChange={(e) => setAluno(e.target.value)}>
              <option value="">Todos os filhos</option>
              {filhos.dados.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="filtro-chips" role="group" aria-label="Filtrar por situação">
        {[
          ['todas', `Todas (${lista.dados?.length || 0})`],
          ['pendente', `Pendentes (${contagem.pendente})`],
          ['atrasada', `Atrasadas (${contagem.atrasada})`],
          ['concluida', `Concluídas (${contagem.concluida})`],
        ].map(([v, r]) => (
          <button key={v} type="button" className="chip" aria-pressed={situacao === v} onClick={() => setSituacao(v)}>
            {r}
          </button>
        ))}
      </div>

      {lista.erro && <ErroEstado mensagem={lista.erro} onTentarNovamente={lista.recarregar} />}
      {!lista.erro && !lista.dados && <Carregando texto="Carregando atividades..." />}
      {lista.dados && !visiveis.length && <Vazio>Nenhuma atividade {situacao === 'todas' ? 'publicada ainda' : 'nesta situação'}.</Vazio>}
      <div className="lista-cartoes">
        {visiveis.map((a) => (
          <article key={`${a.id}-${a.aluno_id}`} className={`cartao${a.situacao_aluno === 'atrasada' ? ' cartao-alerta' : ''}`}>
            <header className="cartao-topo">
              <div>
                <h2 className="cartao-titulo">{a.titulo}</h2>
                <p className="texto-secundario">
                  {a.aluno} · {a.disciplina} · Prof. {a.professor}
                </p>
              </div>
              <BadgeDe tipo="situacaoAluno" valor={a.situacao_aluno} />
            </header>
            <Prazo a={a} />
            <p className="parecer resumo-linhas">{a.descricao}</p>
            <footer className="cartao-acoes">
              <MaterialLink url={a.link_material} />
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setParams({ abrir: a.id })}>
                Ver detalhes
              </button>
            </footer>
          </article>
        ))}
      </div>

      {abrir && (
        <Janela aberto onFechar={() => setParams({})} titulo={aberta[0]?.titulo || 'Atividade'} subtitulo={aberta[0] && `${aberta[0].disciplina} · ${aberta[0].turma}`}>
          {!lista.dados && <Carregando />}
          {lista.dados && !aberta.length && <Vazio>Atividade não encontrada ou não publicada para as turmas dos seus filhos.</Vazio>}
          {aberta[0] && (
            <>
              <Prazo a={aberta[0]} />
              <p className="parecer">{aberta[0].descricao}</p>
              <MaterialLink url={aberta[0].link_material} />
              <ul className="lista-simples">
                {aberta.map((a) => (
                  <li key={a.aluno_id} className="linha-acao">
                    <strong>{a.aluno}</strong>
                    <BadgeDe tipo="situacaoAluno" valor={a.situacao_aluno} />
                  </li>
                ))}
              </ul>
              <p className="texto-secundario">A entrega é registrada pelo professor. Dúvidas? Fale com ele pelo Mural de conversas.</p>
            </>
          )}
        </Janela>
      )}
    </>
  );
}

export default function Atividades() {
  useTitulo('Atividades');
  const { usuario } = useAuth();
  return usuario.perfil === 'responsavel' ? <VisaoResponsavel /> : <VisaoProfessor />;
}
