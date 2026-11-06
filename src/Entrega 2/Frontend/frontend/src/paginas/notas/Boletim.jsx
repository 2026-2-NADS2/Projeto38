// Boletim.jsx — boletim escolar do responsável.
//  - só o que foi PUBLICADO pela coordenação (regra da view vw_relatorio_responsavel)
//  - um filho por vez (abas), seleção do bimestre e do ano letivo (histórico de boletins)
//  - quadro anual (médias por bimestre e média anual), situação acadêmica, faltas,
//    pareceres, tags de desempenho e confirmação de ciência com retorno para a escola
//  - "Imprimir / salvar PDF" usa um layout próprio de impressão (cabeçalho da escola)
// Ao abrir um bimestre, a visualização é registrada (some de "Pendências").

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api/cliente';
import { ChipsTags } from '../../componentes/Basicos';
import BotaoAcao from '../../componentes/BotaoAcao';
import Dialogo from '../../componentes/Dialogo';
import { Carregando, ErroEstado, Vazio } from '../../componentes/Estado';
import { Aviso } from '../../componentes/Formulario';
import Icone from '../../componentes/Icone';
import { Abas, Badge, BadgeDe, Topo } from '../../componentes/Interface';
import { useToast } from '../../contexto/ToastContext';
import { formatarDataCurta, formatarDataHora, formatarNota } from '../../util/formato';

function Ciencia({ d, onConfirmar }) {
  if (!d.data_ciencia) {
    return (
      <button type="button" className="btn btn-primary btn-sm nao-imprimir" onClick={() => onConfirmar(d)}>
        Confirmar ciência
      </button>
    );
  }
  return (
    <>
      <Badge tom="ok">Ciente em {formatarDataCurta(d.data_ciencia)}</Badge>
      {d.retorno_responsavel && <p className="retorno">“{d.retorno_responsavel}”</p>}
    </>
  );
}

const Nota = ({ valor }) =>
  valor === null || valor === undefined ? (
    <span className="texto-secundario">—</span>
  ) : (
    <strong className={Number(valor) < 6 ? 'nota-baixa' : undefined}>
      {formatarNota(valor)}
      {Number(valor) < 6 && <span className="sr-only"> (abaixo da média)</span>}
    </strong>
  );

function QuadroAnual({ filho, bimestres }) {
  if (!filho.quadro.length) return null;
  return (
    <section>
      <h3 className="bimestre-titulo">Quadro anual — médias por bimestre (média mínima 6,0)</h3>
      <div className="table-wrap">
        <table className="tabela-quadro">
          <thead>
            <tr>
              <th scope="col">Disciplina</th>
              {bimestres.map((n) => (
                <th scope="col" key={n}>
                  {n}º bim.
                </th>
              ))}
              <th scope="col">Média anual</th>
              <th scope="col">Faltas</th>
            </tr>
          </thead>
          <tbody>
            {filho.quadro.map((d) => (
              <tr key={d.disciplina}>
                <td data-rotulo="Disciplina">
                  <strong>{d.disciplina}</strong>
                  <br />
                  <small className="texto-secundario">{d.area}</small>
                </td>
                {bimestres.map((n) => (
                  <td key={n} data-rotulo={`${n}º bimestre`}>
                    <Nota valor={d.bimestres[n]} />
                  </td>
                ))}
                <td data-rotulo="Média anual">
                  <Nota valor={d.media_anual} />
                </td>
                <td data-rotulo="Faltas">{d.faltas}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Indicadores({ filho }) {
  const contagem = {};
  for (const b of filho.bimestres) for (const d of b.disciplinas) for (const t of d.tags) contagem[t] = (contagem[t] || 0) + 1;
  const tags = Object.entries(contagem).sort((a, b) => b[1] - a[1]);
  if (!tags.length) return null;
  return (
    <section className="indicadores-boletim">
      <h3 className="bimestre-titulo">Indicadores de desempenho (tags dos professores)</h3>
      <ul className="chips">
        {tags.map(([t, n]) => (
          <li key={t} className="chip chip-estatico">
            {t} <span className="texto-secundario">×{n}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function BoletimFilho({ filho, bimestre, bimestresAno, realce, onConfirmar }) {
  const r = filho.resumo;
  const visiveis = filho.bimestres.filter((b) => !bimestre || b.numero === bimestre);
  return (
    <section className="boletim">
      <header className="boletim-topo">
        <div>
          <h2>{filho.nome}</h2>
          <p className="texto-secundario">
            {filho.turma || 'Sem turma'} · Matrícula {filho.matricula} · Ano letivo {filho.ano_letivo}
          </p>
        </div>
        <BadgeDe tipo="situacaoBoletim" valor={filho.situacao.codigo} className="badge-grande" />
      </header>

      <dl className="metricas metricas-boletim">
        <div>
          <dt>Média geral publicada</dt>
          <dd>
            <Nota valor={r.media} />
          </dd>
        </div>
        <div>
          <dt>Faltas no ano</dt>
          <dd>{r.faltas_total}</dd>
        </div>
        <div>
          <dt>Disciplinas publicadas</dt>
          <dd>{r.publicados}</dd>
        </div>
        <div>
          <dt>Aguardando sua ciência</dt>
          <dd>{r.aguardando_ciencia ? <span className="destaque">{r.aguardando_ciencia}</span> : 'Nenhuma'}</dd>
        </div>
      </dl>
      {filho.situacao.detalhe && (
        <Aviso tom="warn" titulo="Situação acadêmica: em atenção">
          {filho.situacao.detalhe}. Converse com o professor pelo Mural de conversas.
        </Aviso>
      )}

      {!filho.bimestres.length && <Vazio>Nenhum boletim publicado ainda para este aluno neste ano.</Vazio>}

      {!bimestre && <QuadroAnual filho={filho} bimestres={bimestresAno} />}
      <Indicadores filho={filho} />

      {bimestre && !visiveis.length && <Vazio>O {bimestre}º bimestre ainda não foi publicado pela coordenação.</Vazio>}

      {visiveis.map((b) => (
        <div key={b.numero} className="bimestre-bloco">
          <h3 className="bimestre-titulo">
            {b.numero}º bimestre · média {formatarNota(b.media)} · {b.faltas} falta(s)
          </h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Disciplina</th>
                  <th scope="col">Média</th>
                  <th scope="col">Faltas</th>
                  <th scope="col">Comentário do professor</th>
                  <th scope="col">Ciência</th>
                </tr>
              </thead>
              <tbody>
                {b.disciplinas.map((d) => (
                  <tr key={d.id}>
                    <td data-rotulo="Disciplina">
                      <strong>{d.disciplina}</strong>
                      <br />
                      <small className="texto-secundario">{d.professor}</small>
                    </td>
                    <td data-rotulo="Média">
                      <Nota valor={d.media} />
                    </td>
                    <td data-rotulo="Faltas">{d.faltas}</td>
                    <td data-rotulo="Comentário" className="celula-parecer">
                      {d.descricao}
                      <ChipsTags nomes={d.tags} />
                    </td>
                    <td data-rotulo="Ciência" className={`celula-ciencia${realce === d.id ? ' realce' : ''}`}>
                      <Ciencia d={d} onConfirmar={onConfirmar} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </section>
  );
}

export default function Boletim() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [anos, setAnos] = useState(null);
  const [ano, setAno] = useState(null);
  const [resposta, setResposta] = useState(null); // { dados }
  const [erro, setErro] = useState(null);
  const [pendente, setPendente] = useState(null);
  const [retorno, setRetorno] = useState('');
  const [erroCiencia, setErroCiencia] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [realce, setRealce] = useState(null);

  const carregar = useCallback(async () => {
    setErro(null);
    setResposta(null);
    try {
      const lista = anos || (await api.get('/boletim/anos'));
      if (!anos) setAnos(lista);
      const alvo = ano || lista[0];
      if (!ano) setAno(alvo);
      setResposta({ dados: await api.get(`/boletim?ano_letivo=${alvo}`) });
    } catch (err) {
      setErro(err.message);
    }
  }, [ano, anos]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const filhos = resposta?.dados;
  const alunoId = Number(params.get('aluno')) || filhos?.[0]?.id;
  const bimestre = Number(params.get('bimestre')) || null;
  const filho = filhos?.find((f) => f.id === alunoId) || filhos?.[0];
  const bimestresAno = [1, 2, 3, 4];

  function trocar(novo) {
    const p = { aluno: novo.aluno ?? alunoId, bimestre: novo.bimestre ?? bimestre ?? '' };
    setParams(Object.fromEntries(Object.entries(p).filter(([, v]) => v)), { replace: true });
  }

  // Registra a visualização dos bimestres mostrados na tela
  const mostrados = useMemo(
    () => (filho ? filho.bimestres.filter((b) => (!bimestre || b.numero === bimestre) && !b.visualizado).map((b) => b.numero) : []),
    [filho, bimestre]
  );
  useEffect(() => {
    if (!filho || !mostrados.length) return;
    Promise.all(mostrados.map((n) => api.post('/boletim/visualizacao', { aluno_id: filho.id, bimestre: n, ano_letivo: filho.ano_letivo })))
      .then(() => {
        setResposta((r) => ({
          ...r,
          dados: r.dados.map((f) =>
            f.id !== filho.id ? f : { ...f, bimestres: f.bimestres.map((b) => (mostrados.includes(b.numero) ? { ...b, visualizado: true } : b)) }
          ),
        }));
        window.dispatchEvent(new CustomEvent('kfka:atualizar-contadores'));
      })
      .catch(() => {});
  }, [filho?.id, mostrados.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  function abrir(d) {
    setPendente(d);
    setRetorno('');
    setErroCiencia('');
  }

  async function confirmar(e) {
    e.preventDefault();
    if (retorno.trim().length > 1000) {
      setErroCiencia('O retorno deve ter no máximo 1000 caracteres.');
      return;
    }
    setEnviando(true);
    try {
      const salvo = await api.post(`/acompanhamentos/${pendente.id}/ciencia`, retorno.trim() ? { observacao: retorno.trim() } : {});
      // Atualiza só a linha confirmada e o contador do filho
      setResposta((r) => ({
        ...r,
        dados: r.dados.map((f) => {
          let mudou = false;
          const bimestres = f.bimestres.map((b) => ({
            ...b,
            disciplinas: b.disciplinas.map((d) => {
              if (d.id !== pendente.id) return d;
              mudou = true;
              return { ...d, data_ciencia: salvo.data_ciencia, retorno_responsavel: salvo.observacao };
            }),
          }));
          return mudou ? { ...f, bimestres, resumo: { ...f.resumo, aguardando_ciencia: f.resumo.aguardando_ciencia - 1 } } : f;
        }),
      }));
      setRealce(pendente.id);
      setPendente(null);
      toast('Ciência confirmada. Obrigado!');
      window.dispatchEvent(new CustomEvent('kfka:atualizar-contadores'));
    } catch (err) {
      setErroCiencia(err.message);
    } finally {
      setEnviando(false);
    }
  }

  async function baixarPdf() {
    const q = new URLSearchParams({ aluno_id: filho.id, ano_letivo: ano });
    if (bimestre) q.set('bimestre', bimestre);
    try {
      await api.baixar(`/boletim/pdf?${q}`);
      toast('PDF baixado.');
    } catch (err) {
      toast(err.message, 'erro');
      throw err;
    }
  }

  let conteudo;
  if (erro) conteudo = <ErroEstado mensagem={erro} onTentarNovamente={carregar} />;
  else if (!filhos) conteudo = <Carregando texto="Carregando boletim..." />;
  else if (!filhos.length) conteudo = <Vazio>Nenhum aluno vinculado à sua conta ainda. A coordenação fará o vínculo em breve.</Vazio>;
  else {
    conteudo = (
      <>
        {filhos.length > 1 && (
          <Abas
            rotulo="Filhos"
            ativa={filho.id}
            onTrocar={(id) => trocar({ aluno: id })}
            abas={filhos.map((f) => ({ id: f.id, rotulo: f.nome.split(' ')[0], contador: f.resumo.nao_visualizados }))}
          />
        )}
        <div className="filtros nao-imprimir" style={{ marginBottom: 'var(--space-md)' }}>
          <label className="campo-filtro">
            <span>Bimestre</span>
            <select className="select" value={bimestre || ''} onChange={(e) => trocar({ bimestre: Number(e.target.value) || '' })}>
              <option value="">Ano completo</option>
              {bimestresAno.map((n) => {
                const pub = filho.bimestres.find((b) => b.numero === n);
                return (
                  <option key={n} value={n}>
                    {n}º bimestre{pub ? (pub.visualizado ? '' : ' — novo') : ' — não publicado'}
                  </option>
                );
              })}
            </select>
          </label>
          {anos?.length > 1 && (
            <label className="campo-filtro">
              <span>Ano letivo (histórico)</span>
              <select className="select" value={ano || ''} onChange={(e) => setAno(Number(e.target.value))}>
                {anos.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {/* Cabeçalho que só aparece na impressão / PDF */}
        <div className="so-impressao cabecalho-impressao">
          <strong>Escola KFKA — Boletim escolar {filho.ano_letivo}</strong>
          <span>
            {filho.nome} · {filho.turma || 'Sem turma'} · Matrícula {filho.matricula} · {bimestre ? `${bimestre}º bimestre` : 'Ano completo'}
          </span>
          <span>Emitido em {formatarDataHora(new Date().toISOString())} pela plataforma. Somente informações publicadas pela coordenação.</span>
        </div>

        <BoletimFilho filho={filho} bimestre={bimestre} bimestresAno={bimestresAno} realce={realce} onConfirmar={abrir} />
      </>
    );
  }

  return (
    <>
      <Topo titulo="Boletim escolar" descricao="Notas, médias, faltas e comentários já revisados pela coordenação. Confirme a ciência de cada disciplina.">
        {filho && (
          <>
            <button type="button" className="btn btn-ghost" onClick={() => window.print()}>
              <Icone nome="imprimir" tamanho={16} /> Imprimir
            </button>
            {/* PDF gerado no servidor, só com o que foi publicado (o botão some se não há nada publicado) */}
            {(bimestre ? filho.bimestres.some((b) => b.numero === bimestre) : filho.bimestres.length > 0) && (
              <BotaoAcao className="btn btn-primary" textoOcupado="Gerando PDF..." onAcao={baixarPdf}>
                <Icone nome="download" tamanho={16} /> Baixar PDF
              </BotaoAcao>
            )}
          </>
        )}
      </Topo>

      {conteudo}

      <Dialogo aberto={Boolean(pendente)} onFechar={() => setPendente(null)} rotuloId="ciencia-titulo">
        <form onSubmit={confirmar} noValidate>
          <h2 id="ciencia-titulo">Confirmar ciência</h2>
          <p className="texto-secundario">{pendente && `${pendente.disciplina} — ${pendente.bimestre}º bimestre`}</p>
          <div className="field">
            <label htmlFor="ciencia-retorno">Retorno para a escola (opcional)</label>
            <textarea id="ciencia-retorno" rows={3} maxLength={1000} placeholder="Ex.: Vamos incentivar a leitura em casa."
              value={retorno} onChange={(e) => { setRetorno(e.target.value); setErroCiencia(''); }} />
            <small className="campo-erro">{erroCiencia}</small>
          </div>
          <div className="dialogo-acoes">
            <button type="button" className="btn btn-ghost" onClick={() => setPendente(null)}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={enviando}>
              <span className="rotulo">{enviando ? 'Confirmando...' : 'Confirmar ciência'}</span>
            </button>
          </div>
        </form>
      </Dialogo>
    </>
  );
}
