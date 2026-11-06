// Auditoria.jsx — consulta da trilha de auditoria (RNF06). Só leitura e só a coordenação.
// Os registros não podem ser alterados nem apagados (o banco recusa) e não guardam senhas ou tokens.

import { useEffect, useState } from 'react';
import { api } from '../api/cliente';
import { useTitulo } from '../componentes/Basicos';
import { ErroEstado, LinhaEstado, LinhasEsqueleto, Vazio } from '../componentes/Estado';
import Janela from '../componentes/Janela';
import { Badge, Detalhe, Paginacao, Topo } from '../componentes/Interface';
import { useApi } from '../hooks/useApi';
import { ROTULO_PERFIL, formatarDataHora } from '../util/formato';

const TOM = { SUCESSO: 'ok', NEGADO: 'danger', FALHA: 'warn' };
const ROTULO_RESULTADO = { SUCESSO: 'Sucesso', NEGADO: 'Negado', FALHA: 'Falha' };
const VAZIO = { usuario_id: '', entidade: '', acao: '', resultado: '', de: '', ate: '' };

// "EDITAR_RELATORIO" -> "Editar relatorio"; "PUT /api/turmas/:id" fica como está
const rotuloAcao = (a) => (/^[A-Z_]+$/.test(a) ? a.charAt(0) + a.slice(1).toLowerCase().replace(/_/g, ' ') : a);

// Detalhes em linhas legíveis: { campo: { de, para } } vira "campo: de → para"
function linhasDetalhe(detalhes) {
  if (!detalhes) return [];
  return Object.entries(detalhes).map(([campo, v]) => {
    if (v && typeof v === 'object' && !Array.isArray(v) && ('de' in v || 'para' in v)) {
      const fmt = (x) => (Array.isArray(x) ? x.join(', ') || '—' : x === null || x === undefined || x === '' ? '—' : String(x));
      return `${campo}: ${fmt(v.de)} → ${fmt(v.para)}`;
    }
    if (Array.isArray(v)) return `${campo}: ${v.map((x) => (typeof x === 'object' ? JSON.stringify(x) : x)).join(', ')}`;
    if (v && typeof v === 'object') return `${campo}: ${JSON.stringify(v)}`;
    return `${campo}: ${v}`;
  });
}

export default function Auditoria() {
  useTitulo('Auditoria');
  const [filtros, setFiltros] = useState(VAZIO);
  const [pagina, setPagina] = useState(1);
  const [aberto, setAberto] = useState(null);
  const opcoes = useApi(() => api.get('/auditoria/opcoes'), []);
  const chave = new URLSearchParams(Object.entries(filtros).filter(([, v]) => v)).toString();
  useEffect(() => setPagina(1), [chave]);
  const lista = useApi(() => api.pagina(`/auditoria?${chave}&pagina=${pagina}&por_pagina=30`), [chave, pagina]);
  const linhas = lista.dados?.dados;
  const definir = (campo) => (e) => setFiltros((f) => ({ ...f, [campo]: e.target.value }));

  return (
    <>
      <Topo
        titulo="Auditoria"
        descricao="Quem fez o quê e quando: cadastros, vínculos, períodos, revisões, publicações, exportações, acessos e tentativas negadas."
      />

      <form className="filtros barra-filtros" role="search" aria-label="Filtros da auditoria" onSubmit={(e) => e.preventDefault()}>
        <label className="campo-filtro">
          <span>Usuário</span>
          <select className="select" value={filtros.usuario_id} onChange={definir('usuario_id')}>
            <option value="">Todos</option>
            {(opcoes.dados?.usuarios || []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="campo-filtro">
          <span>Entidade</span>
          <select className="select" value={filtros.entidade} onChange={definir('entidade')}>
            <option value="">Todas</option>
            {(opcoes.dados?.entidades || []).map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </label>
        <label className="campo-filtro">
          <span>Ação</span>
          <input className="input" list="acoes-auditoria" value={filtros.acao} onChange={definir('acao')} placeholder="Ex.: PUBLICAR" maxLength={60} />
          <datalist id="acoes-auditoria">
            {(opcoes.dados?.acoes || []).map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </label>
        <label className="campo-filtro">
          <span>Resultado</span>
          <select className="select" value={filtros.resultado} onChange={definir('resultado')}>
            <option value="">Todos</option>
            <option value="SUCESSO">Sucesso</option>
            <option value="NEGADO">Negado</option>
            <option value="FALHA">Falha</option>
          </select>
        </label>
        <label className="campo-filtro">
          <span>De</span>
          <input className="input" type="date" value={filtros.de} onChange={definir('de')} />
        </label>
        <label className="campo-filtro">
          <span>Até</span>
          <input className="input" type="date" value={filtros.ate} onChange={definir('ate')} />
        </label>
        {chave && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFiltros(VAZIO)}>
            Limpar filtros
          </button>
        )}
      </form>

      {lista.erro ? (
        <ErroEstado mensagem={lista.erro} onTentarNovamente={lista.recarregar} />
      ) : (
        <div className="table-wrap" aria-live="polite" aria-busy={lista.carregando}>
          <table>
            <caption className="sr-only">Registros de auditoria, do mais recente para o mais antigo</caption>
            <thead>
              <tr>
                <th scope="col">Data e hora</th>
                <th scope="col">Usuário</th>
                <th scope="col">Ação</th>
                <th scope="col">Entidade</th>
                <th scope="col">Resultado</th>
                <th scope="col">
                  <span className="sr-only">Detalhes</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {!linhas && <LinhasEsqueleto colunas={6} linhas={8} />}
              {linhas && !linhas.length && (
                <LinhaEstado colunas={6}>
                  <Vazio>Nenhum registro para os filtros escolhidos.</Vazio>
                </LinhaEstado>
              )}
              {linhas?.map((a) => (
                <tr key={a.id}>
                  <td data-rotulo="Data e hora">{formatarDataHora(a.data_hora)}</td>
                  <td data-rotulo="Usuário">
                    {a.usuario_nome || <span className="texto-secundario">Não identificado</span>}
                    {a.perfil && <small className="texto-secundario bloco">{ROTULO_PERFIL[a.perfil] || a.perfil}</small>}
                  </td>
                  <td data-rotulo="Ação">{rotuloAcao(a.acao)}</td>
                  <td data-rotulo="Entidade">
                    {a.entidade}
                    {a.entidade_id && <small className="texto-secundario"> #{a.entidade_id}</small>}
                  </td>
                  <td data-rotulo="Resultado">
                    <Badge tom={TOM[a.resultado]}>{ROTULO_RESULTADO[a.resultado]}</Badge>
                  </td>
                  <td>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAberto(a)}>
                      Detalhes
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Paginacao meta={lista.dados?.meta} onPagina={setPagina} rotulo="registro(s)" />

      {aberto && (
        <Janela aberto onFechar={() => setAberto(null)} titulo={rotuloAcao(aberto.acao)} subtitulo={`Registro nº ${aberto.id}`}>
          <dl className="lista-detalhes">
            <Detalhe rotulo="Data e hora">{formatarDataHora(aberto.data_hora)}</Detalhe>
            <Detalhe rotulo="Usuário">{aberto.usuario_nome ? `${aberto.usuario_nome} (id ${aberto.usuario_id})` : null}</Detalhe>
            <Detalhe rotulo="Perfil">{ROTULO_PERFIL[aberto.perfil] || aberto.perfil}</Detalhe>
            <Detalhe rotulo="Entidade">{`${aberto.entidade}${aberto.entidade_id ? ` #${aberto.entidade_id}` : ''}`}</Detalhe>
            <Detalhe rotulo="Resultado">{ROTULO_RESULTADO[aberto.resultado]}</Detalhe>
            <Detalhe rotulo="Endereço IP">{aberto.ip}</Detalhe>
          </dl>
          <h3 className="secao-titulo">O que mudou</h3>
          {linhasDetalhe(aberto.detalhes).length ? (
            <ul className="lista-mudancas">
              {linhasDetalhe(aberto.detalhes).map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          ) : (
            <p className="texto-secundario">Sem detalhes adicionais para esta ação.</p>
          )}
          <p className="texto-secundario">Senhas, tokens, fotos e textos pedagógicos nunca são gravados na auditoria.</p>
        </Janela>
      )}
    </>
  );
}
