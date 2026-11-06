// Revisao.jsx — a coordenação publica, devolve ou retifica os lançamentos.
// Publicar faz ENVIADO -> EM_REVISAO -> PUBLICADO (exigência dos triggers do banco).
// Antes de publicar, a coordenação pode alterar (nova versão, com motivo) ou cancelar o registro.

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/cliente';
import { BadgeStatus, ChipsTags, useTitulo } from '../componentes/Basicos';
import BotaoAcao from '../componentes/BotaoAcao';
import Dialogo from '../componentes/Dialogo';
import { Carregando, ErroEstado, Vazio } from '../componentes/Estado';
import HistoricoDialogo from '../componentes/HistoricoDialogo';
import EdicaoRegistro from '../componentes/EdicaoRegistro';
import { Paginacao } from '../componentes/Interface';
import { useToast } from '../contexto/ToastContext';
import { formatarDataHora, formatarNota, reduzirMovimento } from '../util/formato';

const VAZIO = {
  pendentes: 'Nenhum lançamento aguardando revisão. 🎉',
  devolvidos: 'Nenhum lançamento devolvido aos professores.',
  publicados: 'Nenhum lançamento publicado ainda.',
  cancelados: 'Nenhum lançamento cancelado.',
};

const aguardando = (h) => (h === null ? '—' : h < 1 ? 'menos de 1 h' : h < 48 ? `${h} h` : `${Math.floor(h / 24)} dias`);

function CartaoRevisao({ ac, filtro, saindo, onPublicar, onMotivo, onHistorico, onEditar, onRevisar }) {
  return (
    <article className={`cartao${saindo ? ' cartao-saindo' : ''}`}>
      <header className="cartao-topo">
        <div>
          <h2 className="cartao-titulo">{ac.aluno}</h2>
          <p className="texto-secundario">
            {ac.turma} · {ac.disciplina} · {ac.bimestre}º bimestre · versão {ac.versao}
          </p>
        </div>
        <BadgeStatus status={ac.status} />
      </header>

      <dl className="metricas">
        <div>
          <dt>Média</dt>
          <dd className={Number(ac.media) < 6 ? 'nota-baixa' : undefined}>{formatarNota(ac.media)}</dd>
        </div>
        <div>
          <dt>Faltas</dt>
          <dd>{ac.faltas}</dd>
        </div>
        <div>
          <dt>Professor</dt>
          <dd>{ac.professor}</dd>
        </div>
        {filtro === 'pendentes' && (
          <div>
            <dt>Aguardando</dt>
            <dd>{aguardando(ac.horas_aguardando)}</dd>
          </div>
        )}
        {filtro === 'publicados' && (
          <div>
            <dt>Publicado em</dt>
            <dd>{formatarDataHora(ac.publicado_em)}</dd>
          </div>
        )}
      </dl>

      <p className="parecer">{ac.descricao}</p>
      <ChipsTags nomes={ac.tags} />
      {ac.motivo_devolucao && <p className="motivo-box">↩ {ac.motivo_devolucao}</p>}

      <footer className="cartao-acoes">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onHistorico(ac.id)}>
          Histórico
        </button>
        {['pendentes', 'devolvidos'].includes(filtro) && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onMotivo('cancelar', ac)}>
            Cancelar registro
          </button>
        )}
        {filtro === 'pendentes' && (
          <>
            {ac.status === 'enviado' && (
              <BotaoAcao className="btn btn-ghost btn-sm" textoOcupado="Abrindo..." onAcao={() => onRevisar(ac)}>
                Iniciar revisão
              </BotaoAcao>
            )}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onEditar(ac)}>
              Alterar
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onMotivo('devolver', ac)}>
              Devolver
            </button>
            <BotaoAcao className="btn btn-primary btn-sm" data-validar textoOcupado="Publicando..." onAcao={() => onPublicar(ac)}>
              Publicar
            </BotaoAcao>
          </>
        )}
        {filtro === 'publicados' && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onMotivo('retificar', ac)}>
            Retificar
          </button>
        )}
      </footer>
    </article>
  );
}

export default function Revisao() {
  useTitulo('Revisão de boletins');
  const toast = useToast();
  const [params] = useSearchParams();
  const [filtro, setFiltro] = useState(() =>
    ['devolvidos', 'publicados', 'cancelados'].includes(params.get('filtro')) ? params.get('filtro') : 'pendentes'
  );
  const [editando, setEditando] = useState(null);
  const [tags, setTags] = useState([]);
  const [itens, setItens] = useState(null);
  const [pagina, setPagina] = useState(1);
  const [meta, setMeta] = useState(null);
  const [erro, setErro] = useState(null);
  const [saindo, setSaindo] = useState(() => new Set());
  const [historicoId, setHistoricoId] = useState(null);
  // Diálogo de motivo (devolver / retificar)
  const [acao, setAcao] = useState(null); // { tipo, ac }
  const [motivo, setMotivo] = useState('');
  const [erroMotivo, setErroMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);

  const carregar = useCallback(async () => {
    setErro(null);
    setItens(null);
    setSaindo(new Set()); // nova lista: nenhum cartão em saída
    try {
      const r = await api.pagina(`/acompanhamentos/fila?status=${filtro}&pagina=${pagina}&por_pagina=20`);
      setItens(r.dados);
      setMeta(r.meta);
    } catch (err) {
      setErro(err.message);
    }
  }, [filtro, pagina]);

  // Filtro novo volta para a primeira página
  useEffect(() => setPagina(1), [filtro]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // Tags ativas, para a janela de alteração
  useEffect(() => {
    api.get('/tags').then(setTags).catch(() => setTags([]));
  }, []);

  // Troca um cartão pela versão que a API devolveu (sem recarregar a lista)
  const atualizar = (id, parcial) => setItens((lista) => lista?.map((a) => (a.id === id ? { ...a, ...parcial } : a)) ?? lista);

  async function revisar(ac) {
    try {
      const r = await api.patch(`/acompanhamentos/${ac.id}/revisar`);
      atualizar(ac.id, { status: r.status, versao: r.versao });
      toast('Registro em revisão.');
    } catch (err) {
      toast(err.message, 'erro');
      throw err;
    }
  }

  function aoSalvarEdicao(salvo) {
    atualizar(salvo.id, { ...salvo, tags: salvo.tags.map((t) => t.nome) });
    setEditando(null);
    toast('Alteração salva (nova versão no histórico).');
  }

  // O cartão revisado sai da lista com um fade curto (150 ms), sem recarregar tudo
  function remover(id) {
    setSaindo((s) => new Set(s).add(id));
    setTimeout(() => {
      setItens((lista) => lista?.filter((a) => a.id !== id) ?? lista);
      setSaindo((s) => {
        const novo = new Set(s);
        novo.delete(id);
        return novo;
      });
    }, reduzirMovimento() ? 0 : 150);
  }

  async function publicar(ac) {
    try {
      await api.patch(`/acompanhamentos/${ac.id}/publicar`);
      toast('Publicado: a família já pode ver.');
      remover(ac.id);
      window.dispatchEvent(new CustomEvent('kfka:atualizar-contadores'));
    } catch (err) {
      toast(err.message, 'erro');
      throw err;
    }
  }

  function abrirMotivo(tipo, ac) {
    setAcao({ tipo, ac });
    setMotivo('');
    setErroMotivo('');
  }

  async function confirmarMotivo(e) {
    e.preventDefault();
    const texto = motivo.trim();
    if (texto.length < 5) {
      setErroMotivo('Explique o motivo com pelo menos 5 caracteres.');
      return;
    }
    setEnviando(true);
    try {
      await api.patch(`/acompanhamentos/${acao.ac.id}/${acao.tipo}`, { motivo: texto });
      toast(
        { retificar: 'Publicação retificada: voltou para revisão.', cancelar: 'Registro cancelado.', devolver: 'Devolvido ao professor.' }[
          acao.tipo
        ]
      );
      window.dispatchEvent(new CustomEvent('kfka:atualizar-contadores'));
      remover(acao.ac.id);
      setAcao(null);
    } catch (err) {
      setErroMotivo(err.message);
    } finally {
      setEnviando(false);
    }
  }

  const TEXTOS = {
    devolver: { titulo: 'Devolver ao professor', rotulo: 'Motivo da devolução', botao: 'Devolver', extra: '' },
    retificar: {
      titulo: 'Retificar publicação',
      rotulo: 'Motivo da retificação',
      botao: 'Retificar',
      extra: '. O registro sai do boletim da família e volta para revisão.',
    },
    cancelar: {
      titulo: 'Cancelar registro',
      rotulo: 'Motivo do cancelamento',
      botao: 'Cancelar registro',
      extra: '. O cancelamento é definitivo: o registro não pode mais ser editado nem publicado (fica no histórico).',
    },
  };
  const textos = TEXTOS[acao?.tipo] || TEXTOS.devolver;

  let conteudo;
  if (erro) conteudo = <ErroEstado mensagem={erro} onTentarNovamente={carregar} />;
  else if (!itens) conteudo = <Carregando texto="Carregando lançamentos..." />;
  else if (!itens.length) conteudo = <Vazio>{VAZIO[filtro]}</Vazio>;
  else {
    conteudo = itens.map((ac) => (
      <CartaoRevisao key={ac.id} ac={ac} filtro={filtro} saindo={saindo.has(ac.id)} onPublicar={publicar}
        onMotivo={abrirMotivo} onHistorico={setHistoricoId} onEditar={setEditando} onRevisar={revisar} />
    ));
  }

  return (
    <>
      <div className="app-topbar">
        <div>
          <h1>Revisão de boletins</h1>
          <p>Confira o que os professores enviaram antes de publicar para as famílias.</p>
        </div>
        <div className="filtros">
          <label className="sr-only" htmlFor="filtro-status">Mostrar</label>
          <select id="filtro-status" className="select" value={filtro} onChange={(e) => setFiltro(e.target.value)}>
            <option value="pendentes">Aguardando revisão</option>
            <option value="devolvidos">Devolvidos ao professor</option>
            <option value="publicados">Publicados</option>
            <option value="cancelados">Cancelados</option>
          </select>
        </div>
      </div>

      <div className="lista-cartoes" aria-live="polite">{conteudo}</div>
      <Paginacao meta={meta} onPagina={setPagina} rotulo="lançamento(s)" />

      <Dialogo aberto={Boolean(acao)} onFechar={() => setAcao(null)} rotuloId="motivo-titulo">
        <form onSubmit={confirmarMotivo} noValidate>
          <h2 id="motivo-titulo">{textos.titulo}</h2>
          <p className="texto-secundario">
            {acao && `${acao.ac.aluno} — ${acao.ac.disciplina}, ${acao.ac.bimestre}º bimestre`}
            {textos.extra}
          </p>
          <div className="field">
            <label htmlFor="motivo">
              {textos.rotulo}
              <span className="obrigatorio" title="Campo obrigatório">
                <span aria-hidden="true"> *</span>
                <span className="sr-only"> (obrigatório)</span>
              </span>
            </label>
            <textarea id="motivo" rows={3} maxLength={500} placeholder="Ex.: conferir o número de faltas." value={motivo}
              aria-required="true" aria-invalid={erroMotivo ? true : undefined} aria-describedby="motivo-erro"
              onChange={(e) => { setMotivo(e.target.value); setErroMotivo(''); }} />
            <small className="campo-erro" id="motivo-erro" role="alert">{erroMotivo}</small>
          </div>
          <div className="dialogo-acoes">
            <button type="button" className="btn btn-ghost" onClick={() => setAcao(null)}>Voltar</button>
            <button type="submit" className={acao?.tipo === 'cancelar' ? 'btn btn-perigo' : 'btn btn-primary'} disabled={enviando}>
              <span className="rotulo">{enviando ? 'Salvando...' : textos.botao}</span>
            </button>
          </div>
        </form>
      </Dialogo>

      <HistoricoDialogo id={historicoId} onFechar={() => setHistoricoId(null)} />
      <EdicaoRegistro registro={editando} tags={tags} onFechar={() => setEditando(null)} onSalvo={aoSalvarEdicao} />
    </>
  );
}
