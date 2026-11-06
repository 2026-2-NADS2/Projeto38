// Painel.jsx — visão geral com dados reais da API.
//  - Equipe: números do fluxo + indicadores por turma/disciplina e tags (views do banco)
//  - Responsável: números + resumo de cada filho

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/cliente';
import { useTitulo } from '../componentes/Basicos';
import { CartoesEsqueleto, ErroEstado, LinhaEstado, LinhasEsqueleto, Vazio } from '../componentes/Estado';
import { useAuth } from '../contexto/AuthContext';
import Icone from '../componentes/Icone';
import { formatarNota, primeiroNome } from '../util/formato';

// Cartão de número; com "para" vira link (com hover e clique)
function Cartao({ valor, rotulo, destaque, para, acao }) {
  const conteudo = (
    <>
      <div className="value">{valor ?? '—'}</div>
      <div className="label">{rotulo}</div>
      {para && acao && <span className="acao">{acao} →</span>}
    </>
  );
  const classe = `stat-card${destaque ? ' stat-destaque' : ''}`;
  return para ? (
    <Link to={para} className={classe}>
      {conteudo}
    </Link>
  ) : (
    <div className={classe}>{conteudo}</div>
  );
}

function CartoesEquipe({ r, ehAdmin }) {
  const msgs = (
    <Cartao valor={r.mensagens_nao_lidas} rotulo="Mensagens não lidas" destaque={r.mensagens_nao_lidas > 0}
      para="/comunicacao" acao="Abrir conversas" />
  );
  if (ehAdmin) {
    return (
      <>
        <Cartao valor={r.total_alunos} rotulo="Alunos matriculados" />
        <Cartao valor={r.pendentes} rotulo="Aguardando revisão" destaque={r.pendentes > 0}
          para={r.pendentes > 0 ? '/revisao' : undefined} acao="Revisar agora" />
        <Cartao valor={r.publicados} rotulo="Publicados para as famílias" />
        {msgs}
      </>
    );
  }
  return (
    <>
      <Cartao valor={r.rascunhos} rotulo="Rascunhos não enviados" destaque={r.rascunhos > 0}
        para={r.rascunhos > 0 ? '/notas' : undefined} acao="Continuar" />
      <Cartao valor={r.devolvidos} rotulo="Devolvidos para ajuste" destaque={r.devolvidos > 0}
        para={r.devolvidos > 0 ? '/notas' : undefined} acao="Corrigir" />
      <Cartao valor={r.pendentes} rotulo="Aguardando a coordenação" />
      {msgs}
    </>
  );
}

function Indicadores({ lista }) {
  if (!lista.length) {
    return (
      <LinhaEstado colunas={9}>
        <Vazio>Nenhum lançamento neste ano ainda.</Vazio>
      </LinhaEstado>
    );
  }
  return lista.map((i) => (
    <tr key={`${i.bimestre}-${i.turma}-${i.disciplina}`}>
      <td data-rotulo="Bimestre">{i.bimestre}º</td>
      <td data-rotulo="Turma">{i.turma}</td>
      <td data-rotulo="Disciplina">{i.disciplina}</td>
      <td data-rotulo="Professor">{i.professor}</td>
      <td data-rotulo="Registros">{i.qtd_registros}</td>
      <td data-rotulo="Publicados">{i.qtd_publicados}</td>
      <td data-rotulo="Média">
        <strong className={i.media_geral < 6 ? 'nota-baixa' : undefined}>{formatarNota(i.media_geral)}</strong>
      </td>
      <td data-rotulo="Abaixo de 6">
        {i.qtd_abaixo_de_6 ? <span className="badge badge-warn">{i.qtd_abaixo_de_6}</span> : '0'}
      </td>
      <td data-rotulo="Faltas">{i.total_faltas}</td>
    </tr>
  ));
}

function TagsFrequentes({ tags }) {
  if (!tags.length) return <Vazio>Nenhuma tag usada ainda.</Vazio>;
  const maior = Math.max(1, ...tags.map((t) => t.total));
  return tags.map((t) => (
    <div className="tag-barra" key={t.tag}>
      <span className="tag-nome">{t.tag}</span>
      <span className="tag-trilho">
        <span className="tag-preenchido" style={{ width: `${Math.round((t.total / maior) * 100)}%` }} />
      </span>
      <span className="tag-total">{t.total}</span>
    </div>
  ));
}

function Filhos({ filhos }) {
  if (!filhos.length) {
    return (
      <LinhaEstado colunas={5}>
        <Vazio>Nenhum aluno vinculado à sua conta ainda. A coordenação fará o vínculo em breve.</Vazio>
      </LinhaEstado>
    );
  }
  return filhos.map((f) => (
    <tr key={f.id}>
      <td data-rotulo="Aluno">
        <Link className="link-tabela" to={`/boletim?aluno=${f.id}`}>{f.nome}</Link>
      </td>
      <td data-rotulo="Turma">{f.turma || '—'}</td>
      <td data-rotulo="Média publicada">{formatarNota(f.resumo.media)}</td>
      <td data-rotulo="Faltas">{f.resumo.faltas_total}</td>
      <td data-rotulo="Aguardando ciência">
        {f.resumo.aguardando_ciencia ? (
          <span className="badge badge-pending">{f.resumo.aguardando_ciencia}</span>
        ) : (
          <span className="badge badge-ok">Em dia</span>
        )}
      </td>
    </tr>
  ));
}

export default function Painel() {
  useTitulo('Painel');
  const { usuario } = useAuth();
  const ehResponsavel = usuario.perfil === 'responsavel';
  const ehAdmin = usuario.perfil === 'admin';

  const [dados, setDados] = useState(null); // { resumo, filhos? }
  const [erro, setErro] = useState(null);

  const carregar = useCallback(async () => {
    setErro(null);
    setDados(null);
    try {
      if (ehResponsavel) {
        const [resumo, filhos, pend] = await Promise.all([api.get('/dashboard/resumo'), api.get('/boletim'), api.get('/pendencias/resumo')]);
        setDados({ resumo, filhos, pend });
      } else {
        const [resumo, pend] = await Promise.all([api.get('/dashboard/resumo'), api.get('/pendencias/resumo')]);
        setDados({ resumo, pend });
      }
    } catch (err) {
      setErro(err.message);
    }
  }, [ehResponsavel]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const r = dados?.resumo;

  return (
    <>
      <div className="app-topbar">
        <div>
          <h1>{ehResponsavel ? `Olá, ${primeiroNome(usuario.nome)}!` : 'Painel geral'}</h1>
          <p>
            {ehResponsavel
              ? 'Acompanhe o desempenho dos seus filhos.'
              : ehAdmin
                ? 'Resumo do ano letivo.'
                : 'Seus lançamentos e turmas neste ano letivo.'}
          </p>
        </div>
        {ehAdmin && <Link to="/revisao" className="btn btn-primary">Revisar lançamentos</Link>}
        {usuario.perfil === 'professor' && (
          <div className="topo-acoes">
            <Link to="/aulas" className="btn btn-ghost">Registrar aula</Link>
            <Link to="/notas" className="btn btn-primary">Lançar notas</Link>
          </div>
        )}
        {ehResponsavel && <Link to="/boletim" className="btn btn-primary">Ver boletim</Link>}
      </div>

      {erro && <ErroEstado mensagem={erro} onTentarNovamente={carregar} />}

      {dados?.pend?.pendencias > 0 && (
        <Link to="/pendencias" className={`faixa-pendencias${dados.pend.altas ? ' alta' : ''}`}>
          <Icone nome={dados.pend.altas ? 'alerta' : 'pendencias'} />
          <span>
            <strong>
              {dados.pend.pendencias} pendência{dados.pend.pendencias > 1 ? 's' : ''}
            </strong>
            {dados.pend.altas > 0 && ` · ${dados.pend.altas} com prioridade alta`}
          </span>
          <span className="acao">Ver pendências →</span>
        </Link>
      )}

      {!erro && (
        <section className="stats-row" aria-live="polite">
          {!r && <CartoesEsqueleto quantidade={4} />}
          {r && !ehResponsavel && <CartoesEquipe r={r} ehAdmin={ehAdmin} />}
          {r && ehResponsavel && (
            <>
              <Cartao valor={r.filhos} rotulo="Filho(s) acompanhado(s)" />
              <Cartao valor={r.aguardando_ciencia} rotulo="Relatórios aguardando sua ciência"
                destaque={r.aguardando_ciencia > 0} para={r.aguardando_ciencia > 0 ? '/boletim' : undefined}
                acao="Ver boletim" />
              <Cartao valor={formatarNota(r.media_geral)} rotulo="Média geral publicada" />
              <Cartao valor={r.mensagens_nao_lidas} rotulo="Mensagens não lidas" destaque={r.mensagens_nao_lidas > 0}
                para="/comunicacao" acao="Abrir conversas" />
            </>
          )}
        </section>
      )}

      {!erro && !ehResponsavel && (
        <section>
          <h2 className="secao-titulo">Indicadores por turma e disciplina</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Bim.</th>
                  <th scope="col">Turma</th>
                  <th scope="col">Disciplina</th>
                  <th scope="col">Professor</th>
                  <th scope="col">Registros</th>
                  <th scope="col">Publicados</th>
                  <th scope="col">Média</th>
                  <th scope="col">Abaixo de 6</th>
                  <th scope="col">Faltas</th>
                </tr>
              </thead>
              <tbody>{r ? <Indicadores lista={r.indicadores} /> : <LinhasEsqueleto colunas={9} linhas={4} />}</tbody>
            </table>
          </div>

          <h2 className="secao-titulo">Tags mais frequentes</h2>
          <div className="tags-frequentes">{r ? <TagsFrequentes tags={r.tags} /> : <span className="osso" />}</div>
        </section>
      )}

      {!erro && ehResponsavel && (
        <section>
          <h2 className="secao-titulo">Meus filhos</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Aluno</th>
                  <th scope="col">Turma</th>
                  <th scope="col">Média publicada</th>
                  <th scope="col">Faltas</th>
                  <th scope="col">Aguardando ciência</th>
                </tr>
              </thead>
              <tbody>{dados ? <Filhos filhos={dados.filhos} /> : <LinhasEsqueleto colunas={5} linhas={2} />}</tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
