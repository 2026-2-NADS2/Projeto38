// Aulas.jsx — relatório por aula (professor): conteúdo ministrado, descrição, atividades,
// observações e registro de presença/faltas. Rascunho ou finalizado; histórico de aulas.
// Os dias da grade sem registro aparecem no topo (e também em Pendências).

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/cliente';
import { useTitulo } from '../componentes/Basicos';
import { Carregando, ErroEstado, LinhaEstado, LinhasEsqueleto, Vazio } from '../componentes/Estado';
import { Aviso, Campo, ErroFormulario } from '../componentes/Formulario';
import Icone from '../componentes/Icone';
import { Badge, BadgeDe, Topo } from '../componentes/Interface';
import { useConfirmar } from '../contexto/ConfirmarContext';
import { useToast } from '../contexto/ToastContext';
import { useApi } from '../hooks/useApi';
import { useFormulario } from '../hooks/useFormulario';
import { diaLocalIso, formatarDataHora, formatarDia } from '../util/formato';
import { rotuloStatus, tomStatus } from '../util/status';

const SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const diaSemana = (iso) => SEMANA[new Date(`${iso}T12:00:00`).getDay()];

function EditorAula({ alvo, turmas, onFechar, onSalvo }) {
  const toast = useToast();
  const confirmar = useConfirmar();
  const [sel, setSel] = useState(alvo); // { turma, disciplina, data }
  const [disciplinas, setDisciplinas] = useState(null);
  const chamada = useApi(
    () => api.get(`/aulas/chamada?turma_id=${sel.turma}&disciplina_id=${sel.disciplina}&data=${sel.data}`),
    [sel.turma, sel.disciplina, sel.data],
    { ativo: Boolean(sel.turma && sel.disciplina && sel.data) }
  );
  const f = useFormulario({ conteudo: '', descricao: '', atividades: '', observacoes: '' });
  const [presencas, setPresencas] = useState({});
  const [salvando, setSalvando] = useState(null);

  useEffect(() => {
    let ativo = true;
    setDisciplinas(null);
    if (!sel.turma) return undefined;
    api.get(`/disciplinas?turma_id=${sel.turma}`).then((l) => {
      if (!ativo) return;
      setDisciplinas(l);
      if (!l.some((d) => String(d.id) === String(sel.disciplina))) setSel((s) => ({ ...s, disciplina: l[0]?.id ?? '' }));
    });
    return () => {
      ativo = false;
    };
  }, [sel.turma]); // eslint-disable-line react-hooks/exhaustive-deps

  // Quando a chamada chega, preenche o formulário com o que já foi salvo
  useEffect(() => {
    const d = chamada.dados;
    if (!d) return;
    f.reiniciar({
      conteudo: d.aula?.conteudo || '',
      descricao: d.aula?.descricao || '',
      atividades: d.aula?.atividades || '',
      observacoes: d.aula?.observacoes || '',
    });
    setPresencas(Object.fromEntries(d.alunos.filter((a) => a.presente !== null).map((a) => [a.aluno_id, a.presente])));
  }, [chamada.dados]); // eslint-disable-line react-hooks/exhaustive-deps

  const aula = chamada.dados?.aula;
  const alunos = chamada.dados?.alunos || [];
  const finalizada = aula?.status === 'finalizada';
  const marcados = alunos.filter((a) => presencas[a.aluno_id] !== undefined).length;
  const faltas = alunos.filter((a) => presencas[a.aluno_id] === false).length;

  function marcar(id, presente) {
    setPresencas((p) => ({ ...p, [id]: presente }));
  }

  async function salvar(finalizar) {
    const ok = f.validar({ conteudo: (v) => (v.trim().length < 3 ? 'Informe o conteúdo ministrado (mínimo 3 caracteres).' : '') });
    if (!ok) return;
    if (finalizar && marcados < alunos.length) {
      f.setErroGeral(`Marque a presença de todos os alunos para finalizar (faltam ${alunos.length - marcados}).`);
      return;
    }
    if (
      finalizar &&
      !(await confirmar({
        titulo: 'Finalizar o registro desta aula?',
        mensagem: `Depois de finalizada, a aula não pode mais ser alterada. ${faltas} falta(s) serão registradas.`,
        confirmar: 'Finalizar',
      }))
    ) {
      return;
    }
    setSalvando(finalizar ? 'finalizar' : 'rascunho');
    try {
      const v = f.valores;
      const r = await api.put('/aulas', {
        turma_id: Number(sel.turma),
        disciplina_id: Number(sel.disciplina),
        data: sel.data,
        conteudo: v.conteudo.trim(),
        descricao: v.descricao.trim() || null,
        atividades: v.atividades.trim() || null,
        observacoes: v.observacoes.trim() || null,
        presencas: Object.entries(presencas).map(([aluno_id, presente]) => ({ aluno_id: Number(aluno_id), presente })),
        finalizar,
      });
      chamada.setDados(r);
      toast(finalizar ? 'Aula finalizada e frequência registrada.' : 'Rascunho salvo.');
      window.dispatchEvent(new CustomEvent('kfka:atualizar-contadores'));
      onSalvo();
    } catch (err) {
      f.errosDaApi(err);
    } finally {
      setSalvando(null);
    }
  }

  async function excluir() {
    if (!(await confirmar({ titulo: 'Excluir este rascunho?', mensagem: 'O conteúdo e as presenças marcadas serão apagados.', confirmar: 'Excluir', perigo: true }))) return;
    try {
      await api.del(`/aulas/${aula.id}`);
      toast('Rascunho excluído.');
      onSalvo();
      onFechar();
    } catch (err) {
      toast(err.message, 'erro');
    }
  }

  return (
    <section className="cartao editor-aula" aria-labelledby="editor-aula-titulo">
      <header className="cartao-topo">
        <div>
          <button type="button" className="link-botao voltar-link" onClick={onFechar}>
            <Icone nome="esquerda" tamanho={14} /> Voltar ao histórico
          </button>
          <h2 id="editor-aula-titulo" className="cartao-titulo">
            {aula ? 'Relatório da aula' : 'Registrar aula'}
          </h2>
        </div>
        {aula && <BadgeDe tipo="aula" valor={aula.status} />}
      </header>

      <div className="filtros filtros-lancamento">
        <label className="campo-filtro">
          <span>Turma</span>
          <select className="select" value={sel.turma} onChange={(e) => setSel((s) => ({ ...s, turma: e.target.value }))}>
            {turmas.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="campo-filtro">
          <span>Disciplina</span>
          <select className="select" value={sel.disciplina} disabled={!disciplinas} onChange={(e) => setSel((s) => ({ ...s, disciplina: e.target.value }))}>
            {(disciplinas || []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="campo-filtro">
          <span>Data da aula</span>
          <input type="date" className="select" value={sel.data} max={diaLocalIso()} onChange={(e) => e.target.value && setSel((s) => ({ ...s, data: e.target.value }))} />
        </label>
      </div>

      {chamada.erro && <ErroEstado mensagem={chamada.erro} onTentarNovamente={chamada.recarregar} />}
      {!chamada.erro && chamada.carregando && <Carregando texto="Carregando a turma..." />}

      {chamada.dados && !chamada.carregando && (
        <>
          <p className="texto-secundario">
            {formatarDia(sel.data)} ({diaSemana(sel.data)})
            {aula && ` · registrado por ${aula.professor}`}
            {aula?.finalizado_em && ` · finalizado em ${formatarDataHora(aula.finalizado_em)}`}
          </p>
          {finalizada && <Aviso tom="ok">Aula finalizada: o registro e a frequência estão salvos e não podem mais ser alterados.</Aviso>}

          <div className="form-grid">
            <Campo nome="conteudo" rotulo="Conteúdo ministrado" erro={f.erros.conteudo} className="col-2">
              <input value={f.valores.conteudo} onChange={f.campo('conteudo')} maxLength={300} disabled={finalizada} placeholder="Ex.: Frações equivalentes" />
            </Campo>
            <Campo nome="descricao" rotulo="Descrição da aula" opcional className="col-2">
              <textarea rows={3} value={f.valores.descricao} onChange={f.campo('descricao')} disabled={finalizada} placeholder="Como a aula foi conduzida?" />
            </Campo>
            <Campo nome="atividades" rotulo="Atividades realizadas" opcional>
              <textarea rows={3} value={f.valores.atividades} onChange={f.campo('atividades')} disabled={finalizada} />
            </Campo>
            <Campo nome="observacoes" rotulo="Observações sobre a turma" opcional>
              <textarea rows={3} value={f.valores.observacoes} onChange={f.campo('observacoes')} disabled={finalizada} />
            </Campo>
          </div>

          <div className="presenca-topo">
            <h3 className="subtitulo">
              Frequência <span className="texto-secundario">({marcados} de {alunos.length} marcados · {faltas} falta(s))</span>
            </h3>
            {!finalizada && alunos.length > 0 && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPresencas(Object.fromEntries(alunos.map((a) => [a.aluno_id, true])))}>
                <Icone nome="check" tamanho={14} /> Todos presentes
              </button>
            )}
          </div>
          {!alunos.length && <Vazio>Nenhum aluno ativo nesta turma.</Vazio>}
          <ul className="lista-presenca">
            {alunos.map((a) => {
              const p = presencas[a.aluno_id];
              return (
                <li key={a.aluno_id} className={`presenca${p === false ? ' ausente' : ''}`}>
                  <span className="presenca-nome">
                    <strong>{a.nome}</strong>
                    <small className="texto-secundario">Matrícula {a.matricula}</small>
                    {a.justificativa && (
                      <Badge tom={tomStatus('justificativa', a.justificativa)}>Justificativa: {rotuloStatus('justificativa', a.justificativa).toLowerCase()}</Badge>
                    )}
                  </span>
                  <span className="segmentado" role="group" aria-label={`Presença de ${a.nome}`}>
                    <button type="button" aria-pressed={p === true} disabled={finalizada} onClick={() => marcar(a.aluno_id, true)}>
                      <Icone nome="check" tamanho={14} /> Presente
                    </button>
                    <button type="button" aria-pressed={p === false} disabled={finalizada} onClick={() => marcar(a.aluno_id, false)} className="opcao-falta">
                      <Icone nome="fechar" tamanho={14} /> Falta
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>

          <ErroFormulario>{f.erroGeral}</ErroFormulario>
          {!finalizada && (
            <footer className="cartao-acoes">
              {aula && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={excluir}>
                  <Icone nome="lixo" tamanho={14} /> Excluir rascunho
                </button>
              )}
              <button type="button" className="btn btn-ghost btn-sm" disabled={Boolean(salvando)} onClick={() => salvar(false)}>
                {salvando === 'rascunho' ? 'Salvando...' : 'Salvar rascunho'}
              </button>
              <button type="button" className="btn btn-primary btn-sm" disabled={Boolean(salvando)} onClick={() => salvar(true)}>
                {salvando === 'finalizar' ? 'Finalizando...' : 'Finalizar registro'}
              </button>
            </footer>
          )}
        </>
      )}
    </section>
  );
}

export default function Aulas() {
  useTitulo('Aulas e frequência');
  const [params, setParams] = useSearchParams();
  const [filtroTurma, setFiltroTurma] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');
  const turmas = useApi(() => api.get('/turmas'), []);
  const semRegistro = useApi(() => api.get('/aulas/sem-registro'), []);
  const historico = useApi(() => {
    const q = new URLSearchParams();
    if (filtroTurma) q.set('turma_id', filtroTurma);
    if (filtroStatus) q.set('status', filtroStatus);
    return api.get(`/aulas?${q}`);
  }, [filtroTurma, filtroStatus]);

  const alvo = useMemo(() => {
    if (!params.get('data')) return null;
    return { turma: params.get('turma') || '', disciplina: params.get('disciplina') || '', data: params.get('data') };
  }, [params]);

  function abrir(a) {
    setParams({ turma: a.turma, disciplina: a.disciplina, data: a.data });
    window.scrollTo({ top: 0 });
  }

  function novo() {
    const t = turmas.dados?.[0];
    abrir({ turma: t?.id ?? '', disciplina: '', data: diaLocalIso() });
  }

  function atualizar() {
    historico.recarregar({ silencioso: true });
    semRegistro.recarregar({ silencioso: true });
  }

  if (turmas.erro) return <ErroEstado mensagem={turmas.erro} onTentarNovamente={turmas.recarregar} />;
  if (!turmas.dados) return <Carregando texto="Carregando suas turmas..." />;
  if (!turmas.dados.length) {
    return (
      <>
        <Topo titulo="Aulas e frequência" />
        <Vazio>Você ainda não tem turmas e disciplinas vinculadas. Fale com a coordenação.</Vazio>
      </>
    );
  }

  return (
    <>
      <Topo titulo="Aulas e frequência" descricao="Registre o conteúdo de cada aula e a presença dos alunos. Salve como rascunho e finalize quando terminar.">
        {!alvo && (
          <button type="button" className="btn btn-primary" onClick={novo}>
            <Icone nome="mais" tamanho={16} /> Registrar aula
          </button>
        )}
      </Topo>

      {alvo && (
        <EditorAula
          key={`${alvo.turma}|${alvo.disciplina}|${alvo.data}`}
          alvo={alvo}
          turmas={turmas.dados}
          onFechar={() => setParams({})}
          onSalvo={atualizar}
        />
      )}

      {!alvo && (
        <>
          {semRegistro.dados?.length > 0 && (
            <section className="cartao destaque-pendente">
              <h2 className="cartao-titulo">
                <Icone nome="alerta" /> Aulas da grade sem registro (últimas 2 semanas)
              </h2>
              <ul className="lista-simples">
                {semRegistro.dados.slice(0, 8).map((a) => (
                  <li key={`${a.turma_id}-${a.disciplina_id}-${a.data}`} className="linha-acao">
                    <span>
                      <strong>
                        {a.disciplina} · {a.turma}
                      </strong>
                      <span className="texto-secundario">
                        {formatarDia(a.data)} ({diaSemana(a.data)})
                      </span>
                    </span>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => abrir({ turma: a.turma_id, disciplina: a.disciplina_id, data: a.data })}>
                      Registrar
                    </button>
                  </li>
                ))}
              </ul>
              {semRegistro.dados.length > 8 && <p className="texto-secundario">E mais {semRegistro.dados.length - 8} aula(s).</p>}
            </section>
          )}

          <div className="filtros" style={{ marginBottom: 'var(--space-sm)' }}>
            <label className="campo-filtro">
              <span>Turma</span>
              <select className="select" value={filtroTurma} onChange={(e) => setFiltroTurma(e.target.value)}>
                <option value="">Todas</option>
                {turmas.dados.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome}
                  </option>
                ))}
              </select>
            </label>
            <label className="campo-filtro">
              <span>Situação</span>
              <select className="select" value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
                <option value="">Todas</option>
                <option value="RASCUNHO">Rascunhos</option>
                <option value="FINALIZADA">Finalizadas</option>
              </select>
            </label>
          </div>

          <h2 className="secao-titulo">Histórico de aulas</h2>
          {historico.erro ? (
            <ErroEstado mensagem={historico.erro} onTentarNovamente={historico.recarregar} />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Data</th>
                    <th scope="col">Turma</th>
                    <th scope="col">Disciplina</th>
                    <th scope="col">Conteúdo</th>
                    <th scope="col">Frequência</th>
                    <th scope="col">Situação</th>
                    <th scope="col">
                      <span className="sr-only">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {!historico.dados && <LinhasEsqueleto colunas={7} linhas={3} />}
                  {historico.dados && !historico.dados.length && (
                    <LinhaEstado colunas={7}>
                      <Vazio>Nenhuma aula registrada ainda.</Vazio>
                    </LinhaEstado>
                  )}
                  {historico.dados?.map((a) => (
                    <tr key={a.id}>
                      <td data-rotulo="Data">{formatarDia(a.data)}</td>
                      <td data-rotulo="Turma">{a.turma}</td>
                      <td data-rotulo="Disciplina">{a.disciplina}</td>
                      <td data-rotulo="Conteúdo">{a.conteudo}</td>
                      <td data-rotulo="Frequência">
                        {a.marcados < a.total_alunos ? (
                          <Badge tom="warn">
                            {a.marcados}/{a.total_alunos} marcados
                          </Badge>
                        ) : (
                          `${a.total_alunos - a.faltas} presente(s) · ${a.faltas} falta(s)`
                        )}
                      </td>
                      <td data-rotulo="Situação">
                        <BadgeDe tipo="aula" valor={a.status} />
                      </td>
                      <td>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => abrir({ turma: a.turma_id, disciplina: a.disciplina_id, data: a.data })}>
                          {a.status === 'rascunho' ? 'Continuar' : 'Ver'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}
