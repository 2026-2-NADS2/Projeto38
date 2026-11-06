// Pendencias.jsx — painel centralizado de pendências do perfil logado.
// Tudo é calculado pela API a partir dos dados reais (GET /api/pendencias).

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/cliente';
import { useTitulo } from '../componentes/Basicos';
import { CartoesEsqueleto, ErroEstado, Vazio } from '../componentes/Estado';
import Icone from '../componentes/Icone';
import { BadgeDe, Badge, Topo } from '../componentes/Interface';
import { useAuth } from '../contexto/AuthContext';
import { useApi } from '../hooks/useApi';
import { formatarQuando, relativo } from '../util/formato';

const DESCRICAO = {
  admin: 'Revisões, cadastros incompletos, chamados e solicitações que aguardam a coordenação.',
  professor: 'Lançamentos não enviados, aulas sem registro, prazos de atividades e correções pedidas.',
  responsavel: 'Boletins novos, faltas a justificar, atividades e solicitações que aguardam resposta.',
};

export default function Pendencias() {
  useTitulo('Pendências');
  const { usuario } = useAuth();
  const { dados, erro, recarregar } = useApi(() => api.get('/pendencias'), []);
  const [prioridade, setPrioridade] = useState('todas');

  const grupos = useMemo(() => {
    const lista = (dados || []).filter((p) => prioridade === 'todas' || p.prioridade === prioridade);
    const mapa = new Map();
    for (const p of lista) {
      if (!mapa.has(p.grupo)) mapa.set(p.grupo, []);
      mapa.get(p.grupo).push(p);
    }
    return [...mapa.entries()];
  }, [dados, prioridade]);

  const contagem = (pr) => (dados || []).filter((p) => p.prioridade === pr).length;

  return (
    <>
      <Topo titulo="Pendências" descricao={DESCRICAO[usuario.perfil]}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => recarregar()}>
          Atualizar
        </button>
      </Topo>

      {erro && <ErroEstado mensagem={erro} onTentarNovamente={recarregar} />}

      {!erro && !dados && (
        <div className="stats-row">
          <CartoesEsqueleto quantidade={3} />
        </div>
      )}

      {dados && (
        <>
          <div className="filtro-chips" role="group" aria-label="Filtrar por prioridade">
            {[
              ['todas', `Todas (${dados.length})`],
              ['alta', `Alta (${contagem('alta')})`],
              ['media', `Média (${contagem('media')})`],
              ['baixa', `Baixa (${contagem('baixa')})`],
            ].map(([valor, rotulo]) => (
              <button key={valor} type="button" className="chip" aria-pressed={prioridade === valor} onClick={() => setPrioridade(valor)}>
                {rotulo}
              </button>
            ))}
          </div>

          {!dados.length && (
            <Vazio>
              <Icone nome="check" tamanho={28} />
              <strong>Tudo em dia!</strong>
              Nenhuma pendência no momento.
            </Vazio>
          )}
          {dados.length > 0 && !grupos.length && <Vazio>Nenhuma pendência com esta prioridade.</Vazio>}

          {grupos.map(([grupo, itens]) => (
            <section key={grupo} className="pendencia-grupo">
              <h2 className="secao-titulo">
                {grupo} <span className="contador-secao">{itens.length}</span>
              </h2>
              <ul className="lista-pendencias">
                {itens.map((p) => (
                  <li key={p.id} className={`pendencia prioridade-${p.prioridade}`}>
                    <Link to={p.link} className="pendencia-link">
                      <span className="pendencia-texto">
                        <strong>{p.titulo}</strong>
                        <span className="texto-secundario">{p.descricao}</span>
                      </span>
                      <span className="pendencia-meta">
                        <BadgeDe tipo="prioridade" valor={p.prioridade} />
                        <Badge tom="neutral">{p.status}</Badge>
                        {p.data && (
                          <time className="texto-secundario" dateTime={p.data} title={formatarQuando(p.data)}>
                            {relativo(p.data)}
                          </time>
                        )}
                      </span>
                      <Icone nome="direita" className="pendencia-seta" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </>
  );
}
