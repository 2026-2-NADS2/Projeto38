// Comunicacao.jsx — Mural de conversas entre escola, professores e responsáveis.
//  - atualização a cada 15 s; indicador de não lidas; histórico; nova conversa
//  - cada mensagem pode citar o aluno de que se trata (aluno em comum às duas pessoas)
//  - quem conversa com quem respeita os vínculos (a API confere)
// No celular, a lista e a conversa se alternam (botão ← volta para a lista).

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api } from '../api/cliente';
import { useTitulo } from '../componentes/Basicos';
import { Carregando, ErroEstado, Vazio } from '../componentes/Estado';
import { useAuth } from '../contexto/AuthContext';
import { useToast } from '../contexto/ToastContext';
import { Avatar } from '../componentes/Interface';
import { ROTULO_PERFIL, formatarData, formatarDataHora } from '../util/formato';

const descricao = (c) => (c.perfil === 'responsavel' && c.alunos ? `Resp. de ${c.alunos}` : ROTULO_PERFIL[c.perfil] || '');

function Bolha({ m, contato }) {
  return (
    <div className={`msg${m.minha ? ' mine' : ''}`}>
      <span className="msg-autor">{m.minha ? 'Você' : contato}</span>
      {m.aluno && <span className="msg-aluno">Sobre: {m.aluno}</span>}
      <span className="msg-texto">{m.texto}</span>
      <time className="msg-hora" dateTime={m.criado_em} title={formatarDataHora(m.criado_em)}>
        {new Date(m.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
      </time>
    </div>
  );
}

// Separador de dia: "Hoje", "Ontem" ou a data
function rotuloDia(iso) {
  const d = new Date(iso);
  const hoje = new Date();
  const ontem = new Date(Date.now() - 86400000);
  if (d.toDateString() === hoje.toDateString()) return 'Hoje';
  if (d.toDateString() === ontem.toDateString()) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
}

function Mensagens({ lista, contato }) {
  let dia = null;
  return lista.map((m) => {
    const atual = new Date(m.criado_em).toDateString();
    const separador = atual !== dia;
    dia = atual;
    return (
      <div key={m.id} className="msg-bloco">
        {separador && (
          <p className="msg-dia" role="separator">
            <span>{rotuloDia(m.criado_em)}</span>
          </p>
        )}
        <Bolha m={m} contato={contato} />
      </div>
    );
  });
}

function Conversa({ contatoId, alunosOpcoes, onVoltar, onMudou }) {
  const [dados, setDados] = useState(null); // { contato, mensagens, tem_mais }
  const [carregandoAntigas, setCarregandoAntigas] = useState(false);
  const rolarParaFim = useRef(true);
  const [erro, setErro] = useState(null);
  const [texto, setTexto] = useState('');
  const [alunoId, setAlunoId] = useState('');
  const [erroEnvio, setErroEnvio] = useState('');
  const [enviando, setEnviando] = useState(false);
  const area = useRef(null);
  const campo = useRef(null);

  const carregar = useCallback(
    async (silencioso = false) => {
      if (!silencioso) {
        setErro(null);
        setDados(null);
      }
      try {
        const novo = await api.get(`/mensagens/${contatoId}`);
        // Junta as mensagens novas às já carregadas (inclusive as anteriores pedidas pelo botão)
        setDados((antigo) => {
          if (!antigo || antigo.contato.id !== novo.contato.id) return novo;
          const ultimaAntiga = antigo.mensagens.at(-1)?.id;
          const ultimaNova = novo.mensagens.at(-1)?.id;
          if (ultimaAntiga === ultimaNova) return antigo;
          const ids = new Set(antigo.mensagens.map((m) => m.id));
          rolarParaFim.current = true;
          return { ...antigo, contato: novo.contato, mensagens: [...antigo.mensagens, ...novo.mensagens.filter((m) => !ids.has(m.id))] };
        });
        if (!silencioso) {
          onMudou();
          window.dispatchEvent(new CustomEvent('kfka:atualizar-contadores'));
        }
      } catch (err) {
        if (!silencioso) setErro(err.message);
      }
    },
    [contatoId, onMudou]
  );

  useEffect(() => {
    carregar();
    // Atualiza a cada 15 s, só com a aba visível
    const id = setInterval(() => !document.hidden && carregar(true), 15000);
    return () => clearInterval(id);
  }, [carregar]);

  // Rola para a última mensagem quando chega mensagem nova (não quando carrega as anteriores)
  const alturaAntes = useRef(0);
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    if (rolarParaFim.current) el.scrollTop = el.scrollHeight;
    else el.scrollTop = el.scrollHeight - alturaAntes.current; // mantém a posição de leitura
    rolarParaFim.current = true;
  }, [dados]);

  async function carregarAnteriores() {
    if (!dados?.mensagens.length) return;
    setCarregandoAntigas(true);
    try {
      const r = await api.get(`/mensagens/${contatoId}?antes_de=${dados.mensagens[0].id}&limite=50`);
      alturaAntes.current = area.current?.scrollHeight || 0;
      rolarParaFim.current = false;
      setDados((d) => ({ ...d, mensagens: [...r.mensagens, ...d.mensagens], tem_mais: r.tem_mais }));
    } catch (err) {
      setErroEnvio(err.message);
    } finally {
      setCarregandoAntigas(false);
    }
  }

  useEffect(() => {
    if (dados) campo.current?.focus();
  }, [dados?.contato?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function enviar(e) {
    e.preventDefault();
    const conteudo = texto.trim();
    if (!conteudo) return setErroEnvio('Escreva uma mensagem antes de enviar.');
    if (conteudo.length > 2000) return setErroEnvio('A mensagem deve ter no máximo 2000 caracteres.');
    setEnviando(true);
    try {
      const msg = await api.post('/mensagens', { destinatario_id: contatoId, texto: conteudo, aluno_id: alunoId ? Number(alunoId) : null });
      setDados((d) => ({ ...d, mensagens: [...d.mensagens, msg] }));
      setTexto('');
      onMudou();
    } catch (err) {
      setErroEnvio(err.message);
    } finally {
      setEnviando(false);
    }
  }

  if (erro) return <ErroEstado mensagem={erro} onTentarNovamente={() => carregar()} />;
  if (!dados) return <Carregando texto="Carregando mensagens..." />;

  return (
    <>
      <header className="chat-topo">
        <button type="button" className="btn btn-ghost btn-sm voltar" aria-label="Voltar para conversas" onClick={onVoltar}>
          ←
        </button>
        <Avatar nome={dados.contato.nome} tamanho={34} />
        <div>
          <strong>{dados.contato.nome}</strong>
          <small className="texto-secundario">{ROTULO_PERFIL[dados.contato.perfil]}</small>
        </div>
      </header>
      <div className="chat-mensagens" ref={area}>
        {dados.tem_mais && (
          <button type="button" className="btn btn-ghost btn-sm chat-anteriores" onClick={carregarAnteriores} disabled={carregandoAntigas}>
            {carregandoAntigas ? 'Carregando...' : 'Carregar mensagens anteriores'}
          </button>
        )}
        {dados.mensagens.length ? (
          <Mensagens lista={dados.mensagens} contato={dados.contato.nome} />
        ) : (
          <p className="chat-vazio">Nenhuma mensagem ainda. Diga olá!</p>
        )}
      </div>
      {!dados.contato.pode_responder ? (
        <p className="chat-aviso">Você não tem mais vínculo com esta pessoa: a conversa fica disponível só para leitura.</p>
      ) : (
      <>
      {alunosOpcoes.length > 0 && (
        <div className="chat-aluno">
          <label htmlFor="chat-aluno">Sobre o aluno</label>
          <select id="chat-aluno" className="select" value={alunoId} onChange={(e) => setAlunoId(e.target.value)}>
            <option value="">Assunto geral</option>
            {alunosOpcoes.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome}
              </option>
            ))}
          </select>
        </div>
      )}
      <form className="chat-form" onSubmit={enviar} noValidate>
        <label className="sr-only" htmlFor="chat-texto">Mensagem</label>
        <textarea
          id="chat-texto"
          ref={campo}
          rows={1}
          maxLength={2000}
          placeholder="Escreva uma mensagem..."
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setErroEnvio('');
          }}
          // Enter envia; Shift+Enter quebra linha
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form.requestSubmit();
            }
          }}
        />
        <button type="submit" className="btn btn-primary" disabled={enviando}>
          Enviar
        </button>
      </form>
      <small className="campo-erro" role="alert">{erroEnvio}</small>
      </>
      )}
    </>
  );
}

export default function Comunicacao() {
  useTitulo('Mural de conversas');
  const { usuario } = useAuth();
  const toast = useToast();
  const [conversas, setConversas] = useState(null);
  const [contatos, setContatos] = useState([]);
  const [meusFilhos, setMeusFilhos] = useState([]);
  const [erro, setErro] = useState(null);
  const [aberta, setAberta] = useState(null); // id do contato

  const carregarLista = useCallback(async (silencioso = false) => {
    if (!silencioso) setErro(null);
    try {
      setConversas(await api.get('/mensagens/conversas'));
    } catch (err) {
      if (!silencioso) setErro(err.message);
    }
  }, []);

  useEffect(() => {
    carregarLista();
    api.get('/usuarios/contatos').then(setContatos).catch(() => setContatos([]));
    if (usuario.perfil === 'responsavel') api.get('/alunos').then(setMeusFilhos).catch(() => setMeusFilhos([]));
    const id = setInterval(() => !document.hidden && carregarLista(true), 15000);
    return () => clearInterval(id);
  }, [carregarLista, usuario.perfil]);

  // Alunos que podem ser citados na conversa aberta
  const contatoAberto = contatos.find((c) => c.id === aberta);
  const alunosOpcoes = usuario.perfil === 'responsavel' ? meusFilhos : contatoAberto?.alunos || [];

  useEffect(() => {
    if (usuario.perfil === 'responsavel' && conversas && !conversas.length) {
      toast('Escolha a coordenação ou um professor em “+ Nova conversa”.');
    }
  }, [conversas, usuario.perfil, toast]);

  const atualizarLista = useCallback(() => carregarLista(true), [carregarLista]);

  let lista;
  if (erro) lista = <ErroEstado mensagem={erro} onTentarNovamente={() => carregarLista()} />;
  else if (!conversas) lista = <Carregando texto="Carregando conversas..." />;
  else if (!conversas.length) lista = <Vazio>Nenhuma conversa ainda. Use “+ Nova conversa” para começar.</Vazio>;
  else {
    lista = conversas.map((c) => (
      <button key={c.contato_id} type="button" className={`chat-item${c.contato_id === aberta ? ' active' : ''}`}
        onClick={() => setAberta(c.contato_id)}>
        <span className="chat-item-topo">
          <span className="nome">{c.nome}</span>
          <span className="hora">{formatarData(c.ultima_em)}</span>
        </span>
        <span className="sub">{descricao(c)}</span>
        <span className="preview">
          {c.enviada_por_mim ? 'Você: ' : ''}
          {c.ultimo_aluno ? `[${c.ultimo_aluno.split(' ')[0]}] ` : ''}
          {c.ultima_mensagem}
        </span>
        {c.nao_lidas > 0 && (
          <span className="contador" aria-label={`${c.nao_lidas} não lida(s)`}>{c.nao_lidas}</span>
        )}
      </button>
    ));
  }

  return (
    <>
      <div className="app-topbar">
        <div>
          <h1>Mural de conversas</h1>
          <p>
            {
              {
                responsavel: 'Converse com a coordenação e com os professores dos seus filhos.',
                professor: 'Converse com a equipe e com as famílias dos alunos das suas turmas.',
                admin: 'Converse com professores e famílias. Cada mensagem pode citar o aluno de que se trata.',
              }[usuario.perfil]
            }
          </p>
        </div>
        <div className="filtros">
          <label className="sr-only" htmlFor="novo-contato">Nova conversa</label>
          <select id="novo-contato" className="select" value="" disabled={!contatos.length}
            onChange={(e) => e.target.value && setAberta(Number(e.target.value))}>
            <option value="">+ Nova conversa...</option>
            {contatos.map((c) => (
              <option key={c.id} value={c.id}>
                {`${c.nome} (${ROTULO_PERFIL[c.perfil]}${c.alunos?.length ? ` · ${c.alunos.map((a) => a.nome.split(' ')[0]).join(', ')}` : ''})`}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className={`chat-shell${aberta ? ' conversa-aberta' : ''}`}>
        <div className="chat-list" aria-label="Conversas">{lista}</div>
        <section className="chat-window" aria-live="polite">
          {aberta ? (
            <Conversa key={aberta} contatoId={aberta} alunosOpcoes={alunosOpcoes} onMudou={atualizarLista}
              onVoltar={() => { setAberta(null); atualizarLista(); }} />
          ) : (
            <p className="chat-vazio">Selecione uma conversa ao lado.</p>
          )}
        </section>
      </div>
    </>
  );
}
