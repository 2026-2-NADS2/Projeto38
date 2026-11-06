// Calendario.jsx — calendário escolar com visão mensal e semanal.
//  - eventos da coordenação, início/fim dos bimestres, prazos de atividades (e de digitação, para a equipe)
//  - cor por categoria + rótulo escrito (a cor nunca é a única pista)
//  - filtros: tipo; turma (equipe) ou aluno (responsável)
//  - coordenação cadastra, edita e exclui eventos

import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/cliente';
import { useTitulo } from '../componentes/Basicos';
import { Carregando, ErroEstado, Vazio } from '../componentes/Estado';
import { Campo, ErroFormulario } from '../componentes/Formulario';
import Icone from '../componentes/Icone';
import { BotaoIcone, Topo } from '../componentes/Interface';
import Janela from '../componentes/Janela';
import { useAuth } from '../contexto/AuthContext';
import { useConfirmar } from '../contexto/ConfirmarContext';
import { useToast } from '../contexto/ToastContext';
import { useApi } from '../hooks/useApi';
import { useFormulario } from '../hooks/useFormulario';
import { diaLocalIso, formatarDia, somarDiasIso } from '../util/formato';
import { TIPOS_EVENTO } from '../util/status';

const SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const CADASTRAVEIS = ['EVENTO', 'PROVA', 'ATIVIDADE', 'REUNIAO', 'FERIADO', 'PRAZO'];

const diaDaSemana = (iso) => new Date(`${iso}T12:00:00`).getDay();
const inicioDaSemana = (iso) => somarDiasIso(iso, -diaDaSemana(iso));

// Dias que aparecem na grade do mês (semanas completas, domingo a sábado)
function gradeDoMes(ref) {
  const [a, m] = ref.split('-').map(Number);
  const primeiro = `${a}-${String(m).padStart(2, '0')}-01`;
  const ultimo = diaLocalIso(new Date(a, m, 0));
  const ini = inicioDaSemana(primeiro);
  const fim = somarDiasIso(inicioDaSemana(ultimo), 6);
  const dias = [];
  for (let d = ini; d <= fim; d = somarDiasIso(d, 1)) dias.push(d);
  return { dias, ini, fim, mes: m };
}

// Um evento de vários dias aparece em cada dia do intervalo
const ocorreEm = (e, dia) => dia >= e.data_inicio && dia <= (e.data_fim || e.data_inicio);

function ChipEvento({ e, onAbrir, compacto }) {
  const cat = TIPOS_EVENTO[e.tipo] || TIPOS_EVENTO.EVENTO;
  return (
    <button type="button" className={`evento-chip ${cat.classe}`} onClick={() => onAbrir(e)} title={`${cat.rotulo}: ${e.titulo}`}>
      <span className="evento-ponto" aria-hidden="true" />
      {!compacto && e.hora_inicio && <span className="evento-hora">{e.hora_inicio}</span>}
      <span className="evento-titulo">
        <span className="sr-only">{cat.rotulo}: </span>
        {e.titulo}
      </span>
    </button>
  );
}

function FormEvento({ inicial, turmas, disciplinas, onFechar, onSalvo }) {
  const toast = useToast();
  const editando = Boolean(inicial?.evento_id);
  const f = useFormulario({
    titulo: inicial?.titulo || '',
    tipo: inicial?.tipo && CADASTRAVEIS.includes(inicial.tipo) ? inicial.tipo : 'EVENTO',
    data_inicio: inicial?.data_inicio || diaLocalIso(),
    data_fim: inicial?.data_fim || '',
    hora_inicio: inicial?.hora_inicio || '',
    hora_fim: inicial?.hora_fim || '',
    turma_id: inicial?.turma_id ? String(inicial.turma_id) : '',
    disciplina_id: inicial?.disciplina_id ? String(inicial.disciplina_id) : '',
    publico: inicial?.publico || 'TODOS',
    descricao: inicial?.descricao || '',
  });
  const [enviando, setEnviando] = useState(false);
  const v = f.valores;

  async function salvar(e) {
    e.preventDefault();
    const ok = f.validar({
      titulo: (x) => (x.trim().length < 3 ? 'Informe um título com pelo menos 3 caracteres.' : ''),
      data_inicio: (x) => (!x ? 'Informe a data.' : ''),
      data_fim: (x, t) => (x && x < t.data_inicio ? 'A data final deve ser igual ou depois da inicial.' : ''),
      hora_fim: (x, t) => (x && t.hora_inicio && (!t.data_fim || t.data_fim === t.data_inicio) && x <= t.hora_inicio ? 'O término deve ser depois do início.' : ''),
    });
    if (!ok) return;
    setEnviando(true);
    const corpo = {
      ...v,
      titulo: v.titulo.trim(),
      descricao: v.descricao.trim() || null,
      data_fim: v.data_fim || null,
      hora_inicio: v.hora_inicio || null,
      hora_fim: v.hora_fim || null,
      turma_id: v.turma_id ? Number(v.turma_id) : null,
      disciplina_id: v.disciplina_id ? Number(v.disciplina_id) : null,
    };
    try {
      if (editando) await api.put(`/eventos/${inicial.evento_id}`, corpo);
      else await api.post('/eventos', corpo);
      toast(editando ? 'Evento atualizado.' : 'Evento cadastrado.');
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
      titulo={editando ? 'Editar evento' : 'Novo evento'}
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
        <Campo nome="titulo" rotulo="Título" erro={f.erros.titulo} className="col-2">
          <input value={v.titulo} onChange={f.campo('titulo')} maxLength={120} placeholder="Ex.: Reunião de pais" />
        </Campo>
        <Campo nome="tipo" rotulo="Categoria" erro={f.erros.tipo}>
          <select value={v.tipo} onChange={f.campo('tipo')}>
            {CADASTRAVEIS.map((t) => (
              <option key={t} value={t}>
                {TIPOS_EVENTO[t].rotulo}
              </option>
            ))}
          </select>
        </Campo>
        <Campo nome="publico" rotulo="Quem vê" dica="“Somente equipe” não aparece para as famílias.">
          <select value={v.publico} onChange={f.campo('publico')}>
            <option value="TODOS">Todos</option>
            <option value="EQUIPE">Somente equipe</option>
          </select>
        </Campo>
        <Campo nome="data_inicio" rotulo="Data" erro={f.erros.data_inicio}>
          <input type="date" value={v.data_inicio} onChange={f.campo('data_inicio')} />
        </Campo>
        <Campo nome="data_fim" rotulo="Até" erro={f.erros.data_fim} opcional>
          <input type="date" value={v.data_fim} min={v.data_inicio} onChange={f.campo('data_fim')} />
        </Campo>
        <Campo nome="hora_inicio" rotulo="Início" opcional>
          <input type="time" value={v.hora_inicio} onChange={f.campo('hora_inicio')} />
        </Campo>
        <Campo nome="hora_fim" rotulo="Término" erro={f.erros.hora_fim} opcional>
          <input type="time" value={v.hora_fim} onChange={f.campo('hora_fim')} />
        </Campo>
        <Campo nome="turma_id" rotulo="Turma" dica="Sem turma = escola toda." opcional>
          <select value={v.turma_id} onChange={f.campo('turma_id')}>
            <option value="">Escola toda</option>
            {turmas.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </select>
        </Campo>
        <Campo nome="disciplina_id" rotulo="Disciplina" opcional>
          <select value={v.disciplina_id} onChange={f.campo('disciplina_id')}>
            <option value="">—</option>
            {disciplinas.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nome}
              </option>
            ))}
          </select>
        </Campo>
        <Campo nome="descricao" rotulo="Descrição" opcional className="col-2">
          <textarea rows={3} value={v.descricao} onChange={f.campo('descricao')} maxLength={1000} />
        </Campo>
      </div>
      <ErroFormulario>{f.erroGeral}</ErroFormulario>
    </Janela>
  );
}

function DetalheEvento({ e, ehAdmin, onFechar, onEditar, onExcluir }) {
  const cat = TIPOS_EVENTO[e.tipo] || TIPOS_EVENTO.EVENTO;
  const periodo = e.data_fim && e.data_fim !== e.data_inicio ? `${formatarDia(e.data_inicio)} a ${formatarDia(e.data_fim)}` : formatarDia(e.data_inicio);
  const horario = e.hora_inicio ? `${e.hora_inicio}${e.hora_fim ? ` às ${e.hora_fim}` : ''}` : 'Dia inteiro';
  return (
    <Janela
      aberto
      onFechar={onFechar}
      titulo={e.titulo}
      subtitulo={
        <span className={`evento-categoria ${cat.classe}`}>
          <span className="evento-ponto" aria-hidden="true" /> {cat.rotulo}
          {e.publico === 'EQUIPE' && ' · somente equipe'}
        </span>
      }
      rodape={
        <>
          {e.link && (
            <Link to={e.link} className="btn btn-ghost">
              Ver atividade
            </Link>
          )}
          {ehAdmin && e.editavel && (
            <>
              <button type="button" className="btn btn-ghost" onClick={() => onExcluir(e)}>
                <Icone nome="lixo" tamanho={16} /> Excluir
              </button>
              <button type="button" className="btn btn-primary" onClick={() => onEditar(e)}>
                <Icone nome="editar" tamanho={16} /> Editar
              </button>
            </>
          )}
        </>
      }
    >
      <dl className="detalhes">
        <div className="detalhe">
          <dt>Quando</dt>
          <dd>
            {periodo} · {horario}
          </dd>
        </div>
        <div className="detalhe">
          <dt>Para</dt>
          <dd>{e.turma ? `${e.turma}${e.disciplina ? ` · ${e.disciplina}` : ''}` : 'Escola toda'}</dd>
        </div>
      </dl>
      {e.descricao && <p className="parecer">{e.descricao}</p>}
    </Janela>
  );
}

export default function Calendario() {
  useTitulo('Calendário');
  const { usuario } = useAuth();
  const toast = useToast();
  const confirmar = useConfirmar();
  const [params] = useSearchParams();
  const ehAdmin = usuario.perfil === 'admin';
  const ehResp = usuario.perfil === 'responsavel';

  const [visao, setVisao] = useState('mes');
  const [ref, setRef] = useState(params.get('data') || diaLocalIso());
  const [tipos, setTipos] = useState([]); // vazio = todos
  const [turma, setTurma] = useState('');
  const [aluno, setAluno] = useState('');
  const [aberto, setAberto] = useState(null);
  const [form, setForm] = useState(null);

  const apoio = useApi(async () => {
    if (ehResp) return { alunos: await api.get('/alunos'), turmas: [], disciplinas: [] };
    const [turmas, disciplinas] = await Promise.all([api.get('/turmas'), ehAdmin ? api.get('/disciplinas') : Promise.resolve([])]);
    return { turmas, disciplinas, alunos: [] };
  }, []);

  const periodo = useMemo(() => {
    if (visao === 'mes') return gradeDoMes(ref);
    const ini = inicioDaSemana(ref);
    const dias = Array.from({ length: 7 }, (_, i) => somarDiasIso(ini, i));
    return { dias, ini, fim: dias[6], mes: Number(ref.slice(5, 7)) };
  }, [visao, ref]);

  const { dados: eventos, erro, recarregar } = useApi(() => {
    const q = new URLSearchParams({ inicio: periodo.ini, fim: periodo.fim });
    if (turma) q.set('turma_id', turma);
    if (aluno) q.set('aluno_id', aluno);
    if (tipos.length) q.set('tipo', tipos.join(','));
    return api.get(`/eventos?${q}`);
  }, [periodo.ini, periodo.fim, turma, aluno, tipos.join(',')]);

  const hoje = diaLocalIso();
  const [ano, mes] = ref.split('-').map(Number);
  const titulo =
    visao === 'mes'
      ? `${MESES[mes - 1][0].toUpperCase()}${MESES[mes - 1].slice(1)} de ${ano}`
      : `${formatarDia(periodo.ini).slice(0, 5)} a ${formatarDia(periodo.fim)}`;

  function mover(n) {
    if (visao === 'mes') setRef(diaLocalIso(new Date(ano, mes - 1 + n, 1)));
    else setRef(somarDiasIso(ref, 7 * n));
  }

  function alternarTipo(t) {
    setTipos((lista) => (lista.includes(t) ? lista.filter((x) => x !== t) : [...lista, t]));
  }

  async function excluir(e) {
    const ok = await confirmar({ titulo: 'Excluir este evento?', mensagem: `“${e.titulo}” sai do calendário de todos.`, confirmar: 'Excluir', perigo: true });
    if (!ok) return;
    try {
      await api.del(`/eventos/${e.evento_id}`);
      toast('Evento excluído.');
      setAberto(null);
      recarregar();
    } catch (err) {
      toast(err.message, 'erro');
    }
  }

  const doDia = (dia) => (eventos || []).filter((e) => ocorreEm(e, dia));
  // Agenda: no mês, só o que acontece dentro do mês (a grade mostra também dias vizinhos)
  const mesIni = `${ano}-${String(mes).padStart(2, '0')}-01`;
  const mesFim = diaLocalIso(new Date(ano, mes, 0));
  const agenda = (eventos || []).filter(
    (e) => visao === 'semana' || (e.data_inicio <= mesFim && (e.data_fim || e.data_inicio) >= mesIni)
  );

  return (
    <>
      <Topo
        titulo="Calendário escolar"
        descricao={ehResp ? 'Provas, reuniões, eventos e prazos das turmas dos seus filhos.' : 'Eventos, provas, bimestres e prazos da escola.'}
      >
        {ehAdmin && (
          <button type="button" className="btn btn-primary" onClick={() => setForm({ data_inicio: ref })}>
            <Icone nome="mais" tamanho={16} /> Novo evento
          </button>
        )}
      </Topo>

      <div className="cal-barra">
        <div className="cal-nav">
          <BotaoIcone icone="esquerda" rotulo={visao === 'mes' ? 'Mês anterior' : 'Semana anterior'} onClick={() => mover(-1)} />
          <h2 className="cal-titulo" aria-live="polite">
            {titulo}
          </h2>
          <BotaoIcone icone="direita" rotulo={visao === 'mes' ? 'Próximo mês' : 'Próxima semana'} onClick={() => mover(1)} />
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRef(hoje)}>
            Hoje
          </button>
        </div>
        <div className="filtros">
          <div className="segmentado" role="group" aria-label="Visualização">
            <button type="button" aria-pressed={visao === 'mes'} onClick={() => setVisao('mes')}>
              Mês
            </button>
            <button type="button" aria-pressed={visao === 'semana'} onClick={() => setVisao('semana')}>
              Semana
            </button>
          </div>
          {!ehResp && apoio.dados?.turmas?.length > 0 && (
            <label className="campo-filtro">
              <span className="sr-only">Turma</span>
              <select className="select" value={turma} onChange={(e) => setTurma(e.target.value)}>
                <option value="">Todas as turmas</option>
                {apoio.dados.turmas.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome}
                  </option>
                ))}
              </select>
            </label>
          )}
          {ehResp && apoio.dados?.alunos?.length > 1 && (
            <label className="campo-filtro">
              <span className="sr-only">Aluno</span>
              <select className="select" value={aluno} onChange={(e) => setAluno(e.target.value)}>
                <option value="">Todos os filhos</option>
                {apoio.dados.alunos.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nome}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </div>

      <div className="filtro-chips legenda" role="group" aria-label="Filtrar por categoria">
        {Object.entries(TIPOS_EVENTO)
          .filter(([t]) => !(ehResp && t === 'PRAZO'))
          .map(([t, c]) => (
            <button key={t} type="button" className={`chip chip-cat ${c.classe}`} aria-pressed={tipos.includes(t)} onClick={() => alternarTipo(t)}>
              <span className="evento-ponto" aria-hidden="true" />
              {c.rotulo}
            </button>
          ))}
        {tipos.length > 0 && (
          <button type="button" className="link-botao" onClick={() => setTipos([])}>
            Limpar filtro
          </button>
        )}
      </div>

      {erro && <ErroEstado mensagem={erro} onTentarNovamente={recarregar} />}

      {!erro && (
        <div className={`cal-grade cal-${visao}`} aria-busy={!eventos}>
          {SEMANA.map((d) => (
            <div key={d} className="cal-cabecalho" aria-hidden="true">
              {d}
            </div>
          ))}
          {periodo.dias.map((dia) => {
            const lista = doDia(dia);
            const fora = visao === 'mes' && Number(dia.slice(5, 7)) !== periodo.mes;
            return (
              <div
                key={dia}
                className={`cal-dia${fora ? ' fora' : ''}${dia === hoje ? ' hoje' : ''}`}
                aria-label={`${formatarDia(dia)}${lista.length ? `, ${lista.length} evento(s)` : ''}`}
              >
                <div className="cal-dia-topo">
                  <span className="cal-num">
                    <span className="cal-semana-movel">{SEMANA[diaDaSemana(dia)]} </span>
                    {Number(dia.slice(8))}
                  </span>
                  {ehAdmin && (
                    <button type="button" className="cal-mais" aria-label={`Novo evento em ${formatarDia(dia)}`} onClick={() => setForm({ data_inicio: dia })}>
                      <Icone nome="mais" tamanho={14} />
                    </button>
                  )}
                </div>
                <div className="cal-eventos">
                  {lista.slice(0, visao === 'mes' ? 3 : 20).map((e) => (
                    <ChipEvento key={e.id} e={e} onAbrir={setAberto} compacto={visao === 'mes'} />
                  ))}
                  {visao === 'mes' && lista.length > 3 && (
                    <button type="button" className="cal-mais-eventos" onClick={() => { setVisao('semana'); setRef(dia); }}>
                      +{lista.length - 3} mais
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <section className="cal-agenda">
        <h2 className="secao-titulo">{visao === 'mes' ? 'Agenda do mês' : 'Agenda da semana'}</h2>
        {!eventos && !erro && <Carregando texto="Carregando eventos..." />}
        {eventos && !agenda.length && <Vazio>Nenhum evento neste período{tipos.length ? ' com os filtros escolhidos' : ''}.</Vazio>}
        {eventos && agenda.length > 0 && (
          <ul className="agenda-lista">
            {agenda.map((e) => {
              const cat = TIPOS_EVENTO[e.tipo] || TIPOS_EVENTO.EVENTO;
              return (
                <li key={e.id}>
                  <button type="button" className={`agenda-item ${cat.classe}`} onClick={() => setAberto(e)}>
                    <span className="agenda-data">
                      <strong>{formatarDia(e.data_inicio).slice(0, 5)}</strong>
                      <small>{SEMANA[diaDaSemana(e.data_inicio)]}</small>
                    </span>
                    <span className="agenda-texto">
                      <strong>{e.titulo}</strong>
                      <span className="texto-secundario">
                        <span className="evento-categoria">
                          <span className="evento-ponto" aria-hidden="true" /> {cat.rotulo}
                        </span>
                        {e.hora_inicio && ` · ${e.hora_inicio}${e.hora_fim ? `–${e.hora_fim}` : ''}`}
                        {` · ${e.turma || 'Escola toda'}`}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {aberto && (
        <DetalheEvento
          e={aberto}
          ehAdmin={ehAdmin}
          onFechar={() => setAberto(null)}
          onEditar={(e) => {
            setAberto(null);
            setForm(e);
          }}
          onExcluir={excluir}
        />
      )}
      {form && (
        <FormEvento
          inicial={form}
          turmas={apoio.dados?.turmas || []}
          disciplinas={apoio.dados?.disciplinas || []}
          onFechar={() => setForm(null)}
          onSalvo={() => {
            setForm(null);
            recarregar();
          }}
        />
      )}
    </>
  );
}
