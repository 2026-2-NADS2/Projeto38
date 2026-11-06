// Relatorios.jsx — relatórios gerenciais (RF10), retornos das famílias (RF12) e exportação (RF11).
//
//   Coordenação: indicadores por turma, disciplina, professor, bimestre, aluno e tag; exporta CSV/XLSX.
//   Professor:   os mesmos relatórios, sempre limitados aos próprios registros (a API força o filtro).
//
// Todos os números vêm de GET /api/relatorios/* (consultas ao banco); nada é calculado só na tela.

import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/cliente';
import { BadgeStatus, ChipsTags, useTitulo } from '../componentes/Basicos';
import BotaoAcao from '../componentes/BotaoAcao';
import { CartoesEsqueleto, ErroEstado, LinhaEstado, LinhasEsqueleto, Vazio } from '../componentes/Estado';
import HistoricoDialogo from '../componentes/HistoricoDialogo';
import Icone from '../componentes/Icone';
import { Abas, Paginacao, Topo } from '../componentes/Interface';
import { useAuth } from '../contexto/AuthContext';
import { useToast } from '../contexto/ToastContext';
import { useApi } from '../hooks/useApi';
import { ROTULO_STATUS, formatarDataHora, formatarNota } from '../util/formato';

const FILTROS_VAZIOS = { ano_letivo: '', turma_id: '', disciplina_id: '', professor_id: '', bimestre: '', aluno_id: '', tag_id: '', status: '' };

const consulta = (filtros, extra = {}) => {
  const q = new URLSearchParams();
  Object.entries({ ...filtros, ...extra }).forEach(([k, v]) => {
    if (v !== '' && v !== null && v !== undefined) q.set(k, v);
  });
  return q.toString();
};

function Cartao({ valor, rotulo, destaque }) {
  return (
    <div className={`stat-card${destaque ? ' stat-destaque' : ''}`}>
      <div className="value">{valor ?? '—'}</div>
      <div className="label">{rotulo}</div>
    </div>
  );
}

// Tabela de um agrupamento (turma, disciplina, professor, bimestre, aluno)
function TabelaGrupo({ titulo, coluna, rotuloColuna, linhas, extra }) {
  return (
    <section className="relatorio-grupo">
      <h2 className="secao-titulo">{titulo}</h2>
      <div className="table-wrap">
        <table>
          <caption className="sr-only">{titulo}</caption>
          <thead>
            <tr>
              <th scope="col">{rotuloColuna}</th>
              {extra && <th scope="col">{extra.rotulo}</th>}
              <th scope="col">Registros</th>
              <th scope="col">Publicados</th>
              <th scope="col">Em revisão</th>
              <th scope="col">Média (publicados)</th>
              <th scope="col">Abaixo de 6</th>
              <th scope="col">Faltas</th>
            </tr>
          </thead>
          <tbody>
            {!linhas.length && (
              <LinhaEstado colunas={extra ? 8 : 7}>
                <Vazio>Sem registros para os filtros escolhidos.</Vazio>
              </LinhaEstado>
            )}
            {linhas.map((l) => (
              <tr key={`${l[coluna]}-${l.id ?? ''}`}>
                <th scope="row" data-rotulo={rotuloColuna}>
                  {coluna === 'bimestre' ? `${l.bimestre}º bimestre` : l[coluna]}
                </th>
                {extra && <td data-rotulo={extra.rotulo}>{l[extra.chave]}</td>}
                <td data-rotulo="Registros">{l.registros}</td>
                <td data-rotulo="Publicados">{l.publicados}</td>
                <td data-rotulo="Em revisão">{l.em_revisao}</td>
                <td data-rotulo="Média" className={l.media !== null && l.media < 6 ? 'nota-baixa' : undefined}>
                  {l.media === null ? '—' : formatarNota(l.media)}
                </td>
                <td data-rotulo="Abaixo de 6">{l.abaixo_media}</td>
                <td data-rotulo="Faltas">{l.faltas}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Indicadores({ filtros, ehAdmin }) {
  const ind = useApi(() => api.get(`/relatorios/indicadores?${consulta(filtros)}`), [consulta(filtros)]);
  if (ind.erro) return <ErroEstado mensagem={ind.erro} onTentarNovamente={ind.recarregar} />;
  const d = ind.dados;
  return (
    <div aria-live="polite" aria-busy={ind.carregando}>
      <section className="stats-row">
        {!d && <CartoesEsqueleto quantidade={6} />}
        {d && (
          <>
            <Cartao valor={d.totais.registros} rotulo="Registros (sem cancelados)" />
            <Cartao valor={d.totais.publicados} rotulo="Publicados para as famílias" />
            <Cartao valor={formatarNota(d.totais.media)} rotulo="Média dos publicados" />
            <Cartao valor={d.totais.abaixo_media} rotulo={`Publicados abaixo de ${formatarNota(d.media_minima)}`} destaque={d.totais.abaixo_media > 0} />
            <Cartao valor={d.totais.aguardando_ciencia} rotulo="Aguardando ciência da família" />
            <Cartao valor={d.totais.com_observacao} rotulo="Com observação da família" />
          </>
        )}
      </section>

      {d && (
        <>
          <section className="relatorio-grupo">
            <h2 className="secao-titulo">Situação dos registros</h2>
            <ul className="lista-status">
              {Object.entries(d.por_status).map(([s, n]) => (
                <li key={s}>
                  <BadgeStatus status={s} /> <strong>{n}</strong>
                </li>
              ))}
            </ul>
          </section>
          {ehAdmin && <TabelaGrupo titulo="Por turma" coluna="turma" rotuloColuna="Turma" linhas={d.por_turma} />}
          <TabelaGrupo titulo="Por disciplina" coluna="disciplina" rotuloColuna="Disciplina" linhas={d.por_disciplina} />
          {ehAdmin && <TabelaGrupo titulo="Por professor" coluna="professor" rotuloColuna="Professor(a)" linhas={d.por_professor} />}
          {!ehAdmin && <TabelaGrupo titulo="Por turma" coluna="turma" rotuloColuna="Turma" linhas={d.por_turma} />}
          <TabelaGrupo titulo="Por bimestre" coluna="bimestre" rotuloColuna="Bimestre" linhas={d.por_bimestre} />
          <TabelaGrupo
            titulo="Alunos que pedem atenção (menor média publicada primeiro)"
            coluna="aluno"
            rotuloColuna="Aluno"
            extra={{ chave: 'turma', rotulo: 'Turma' }}
            linhas={d.por_aluno}
          />
          <section className="relatorio-grupo">
            <h2 className="secao-titulo">Tags mais usadas</h2>
            {d.por_tag.length ? (
              <ul className="lista-status">
                {d.por_tag.map((t) => (
                  <li key={t.id}>
                    <span className="chip chip-estatico">{t.tag}</span> <strong>{t.registros}</strong>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="texto-secundario">Nenhuma tag nos registros filtrados.</p>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Registros({ filtros, onHistorico }) {
  const [pagina, setPagina] = useState(1);
  const chave = consulta(filtros);
  useEffect(() => setPagina(1), [chave]);
  const r = useApi(() => api.pagina(`/relatorios/registros?${consulta(filtros, { pagina, por_pagina: 25 })}`), [chave, pagina]);
  if (r.erro) return <ErroEstado mensagem={r.erro} onTentarNovamente={r.recarregar} />;
  const linhas = r.dados?.dados;
  return (
    <>
      <div className="table-wrap" aria-live="polite" aria-busy={r.carregando}>
        <table>
          <caption className="sr-only">Registros de acompanhamento</caption>
          <thead>
            <tr>
              <th scope="col">Aluno</th>
              <th scope="col">Turma</th>
              <th scope="col">Disciplina</th>
              <th scope="col">Bim.</th>
              <th scope="col">Professor(a)</th>
              <th scope="col">Média</th>
              <th scope="col">Faltas</th>
              <th scope="col">Situação</th>
              <th scope="col">Tags</th>
              <th scope="col">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {!linhas && <LinhasEsqueleto colunas={10} linhas={6} />}
            {linhas && !linhas.length && (
              <LinhaEstado colunas={10}>
                <Vazio>Nenhum registro para os filtros escolhidos.</Vazio>
              </LinhaEstado>
            )}
            {linhas?.map((l) => (
              <tr key={l.id}>
                <th scope="row" data-rotulo="Aluno">
                  {l.aluno}
                  <br />
                  <small className="texto-secundario">{l.matricula}</small>
                </th>
                <td data-rotulo="Turma">{l.turma}</td>
                <td data-rotulo="Disciplina">{l.disciplina}</td>
                <td data-rotulo="Bimestre">{l.bimestre}º</td>
                <td data-rotulo="Professor(a)">{l.professor}</td>
                <td data-rotulo="Média" className={Number(l.media) < 6 ? 'nota-baixa' : undefined}>
                  {formatarNota(l.media)}
                </td>
                <td data-rotulo="Faltas">{l.faltas}</td>
                <td data-rotulo="Situação">
                  <BadgeStatus status={l.status} />
                  {l.data_ciencia && <small className="texto-secundario bloco">Ciência {formatarDataHora(l.data_ciencia)}</small>}
                </td>
                <td data-rotulo="Tags">
                  <ChipsTags nomes={l.tags} />
                </td>
                <td>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => onHistorico(l.id)}>
                    Histórico
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Paginacao meta={r.dados?.meta} onPagina={setPagina} rotulo="registro(s)" />
    </>
  );
}

function Retornos({ filtros, comObservacao }) {
  const [pagina, setPagina] = useState(1);
  const chave = consulta(filtros, { com_observacao: comObservacao ? 1 : '' });
  useEffect(() => setPagina(1), [chave]);
  const r = useApi(() => api.pagina(`/relatorios/retornos?${chave}&pagina=${pagina}&por_pagina=25`), [chave, pagina]);
  if (r.erro) return <ErroEstado mensagem={r.erro} onTentarNovamente={r.recarregar} />;
  const linhas = r.dados?.dados;
  return (
    <>
      <div className="table-wrap" aria-live="polite" aria-busy={r.carregando}>
        <table>
          <caption className="sr-only">Ciência e observações das famílias</caption>
          <thead>
            <tr>
              <th scope="col">Data</th>
              <th scope="col">Responsável</th>
              <th scope="col">Aluno</th>
              <th scope="col">Disciplina</th>
              <th scope="col">Bim.</th>
              <th scope="col">Professor(a)</th>
              <th scope="col">Observação</th>
            </tr>
          </thead>
          <tbody>
            {!linhas && <LinhasEsqueleto colunas={7} linhas={5} />}
            {linhas && !linhas.length && (
              <LinhaEstado colunas={7}>
                <Vazio>Nenhum retorno das famílias para os filtros escolhidos.</Vazio>
              </LinhaEstado>
            )}
            {linhas?.map((l) => (
              <tr key={l.id}>
                <td data-rotulo="Data">{formatarDataHora(l.data_ciencia)}</td>
                <th scope="row" data-rotulo="Responsável">
                  {l.responsavel}
                  {l.parentesco && <small className="texto-secundario bloco">{l.parentesco}</small>}
                </th>
                <td data-rotulo="Aluno">
                  {l.aluno} <small className="texto-secundario">({l.turma})</small>
                </td>
                <td data-rotulo="Disciplina">{l.disciplina}</td>
                <td data-rotulo="Bimestre">{l.bimestre}º</td>
                <td data-rotulo="Professor(a)">{l.professor}</td>
                <td data-rotulo="Observação" className="texto-longo">
                  {l.observacao || <span className="texto-secundario">Só confirmou a ciência</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Paginacao meta={r.dados?.meta} onPagina={setPagina} rotulo="retorno(s)" />
    </>
  );
}

export default function Relatorios() {
  const { usuario } = useAuth();
  const ehAdmin = usuario.perfil === 'admin';
  useTitulo(ehAdmin ? 'Relatórios gerenciais' : 'Relatórios e retornos');
  const toast = useToast();
  const [aba, setAba] = useState('indicadores');
  const [filtros, setFiltros] = useState(FILTROS_VAZIOS);
  const [comObservacao, setComObservacao] = useState(false);
  const [historicoId, setHistoricoId] = useState(null);
  const opcoes = useApi(() => api.get(`/relatorios/opcoes${filtros.ano_letivo ? `?ano_letivo=${filtros.ano_letivo}` : ''}`), [filtros.ano_letivo]);
  const alunos = useApi(
    () => (filtros.turma_id ? api.get(`/alunos?turma_id=${filtros.turma_id}&situacao=todos`) : Promise.resolve([])),
    [filtros.turma_id]
  );
  const o = opcoes.dados;

  const definir = (campo) => (e) =>
    setFiltros((f) => ({ ...f, [campo]: e.target.value, ...(campo === 'turma_id' ? { aluno_id: '' } : {}) }));
  const ativos = useMemo(() => Object.values(filtros).filter(Boolean).length, [filtros]);

  async function exportar(formato) {
    const conteudo = aba;
    const q = consulta(filtros, { formato, conteudo, com_observacao: conteudo === 'retornos' && comObservacao ? 1 : '' });
    try {
      await api.baixar(`/relatorios/exportar?${q}`);
      toast(`Arquivo ${formato.toUpperCase()} gerado com os filtros atuais.`);
    } catch (err) {
      toast(err.message, 'erro');
      throw err;
    }
  }

  const seletor = (campo, rotulo, itens, rotuloTodos, rotular = (i) => i.nome) => (
    <label className="campo-filtro">
      <span>{rotulo}</span>
      <select className="select" value={filtros[campo]} onChange={definir(campo)}>
        <option value="">{rotuloTodos}</option>
        {itens.map((i) => (
          <option key={i.id ?? i} value={i.id ?? i}>
            {rotular(i)}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <>
      <Topo
        titulo={ehAdmin ? 'Relatórios gerenciais' : 'Relatórios e retornos'}
        descricao={
          ehAdmin
            ? 'Indicadores reais do acompanhamento por turma, disciplina, professor, bimestre, aluno e tag.'
            : 'Seus registros e o retorno das famílias nas suas turmas.'
        }
      >
        {ehAdmin && (
          <>
            <BotaoAcao className="btn btn-ghost" textoOcupado="Gerando..." onAcao={() => exportar('csv')}>
              <Icone nome="download" tamanho={16} /> Exportar CSV
            </BotaoAcao>
            <BotaoAcao className="btn btn-primary" textoOcupado="Gerando..." onAcao={() => exportar('xlsx')}>
              <Icone nome="download" tamanho={16} /> Exportar Excel
            </BotaoAcao>
          </>
        )}
      </Topo>

      {opcoes.erro && <ErroEstado mensagem={opcoes.erro} onTentarNovamente={opcoes.recarregar} />}
      {o && (
        <form className="filtros barra-filtros filtros-relatorio" role="search" aria-label="Filtros do relatório" onSubmit={(e) => e.preventDefault()}>
          {seletor('ano_letivo', 'Ano letivo', o.anos, `Atual (${o.ano_atual})`, (a) => a)}
          {seletor('turma_id', 'Turma', o.turmas, 'Todas')}
          {seletor('disciplina_id', 'Disciplina', o.disciplinas, 'Todas')}
          {ehAdmin && seletor('professor_id', 'Professor(a)', o.professores, 'Todos')}
          {seletor('bimestre', 'Bimestre', [1, 2, 3, 4], 'Todos', (b) => `${b}º bimestre`)}
          {filtros.turma_id && seletor('aluno_id', 'Aluno', alunos.dados || [], 'Todos')}
          {seletor('tag_id', 'Tag', o.tags, 'Todas', (t) => `${t.nome}${t.ativo ? '' : ' (desativada)'}`)}
          {aba !== 'retornos' &&
            seletor(
              'status',
              'Situação',
              ['rascunho', 'enviado', 'em_revisao', 'devolvido', 'publicado', 'cancelado'],
              'Todas (sem canceladas)',
              (s) => ROTULO_STATUS[s] || s
            )}
          {ativos > 0 && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFiltros(FILTROS_VAZIOS)}>
              Limpar filtros ({ativos})
            </button>
          )}
        </form>
      )}

      <Abas
        rotulo="Tipo de relatório"
        ativa={aba}
        onTrocar={setAba}
        abas={[
          { id: 'indicadores', rotulo: 'Indicadores' },
          { id: 'registros', rotulo: 'Registros' },
          { id: 'retornos', rotulo: 'Retornos das famílias' },
        ]}
      />

      <div role="tabpanel" className="painel-aba" aria-label={{ indicadores: 'Indicadores', registros: 'Registros', retornos: 'Retornos das famílias' }[aba]}>
        {aba === 'indicadores' && <Indicadores filtros={filtros} ehAdmin={ehAdmin} />}
        {aba === 'registros' && <Registros filtros={filtros} onHistorico={setHistoricoId} />}
        {aba === 'retornos' && (
          <>
            <label className="check-linha">
              <input type="checkbox" checked={comObservacao} onChange={(e) => setComObservacao(e.target.checked)} /> Mostrar só os que têm
              observação escrita
            </label>
            <Retornos filtros={filtros} comObservacao={comObservacao} />
          </>
        )}
      </div>
      {ehAdmin && (
        <p className="texto-secundario rodape-lista">
          A exportação usa a aba e os filtros atuais e fica registrada na auditoria (contém dados pessoais de alunos: guarde com cuidado).
        </p>
      )}

      <HistoricoDialogo id={historicoId} onFechar={() => setHistoricoId(null)} />
    </>
  );
}
