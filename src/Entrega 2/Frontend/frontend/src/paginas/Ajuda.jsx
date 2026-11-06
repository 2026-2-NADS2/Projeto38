// Ajuda.jsx — central de atendimento (SAC): perguntas frequentes, abertura e acompanhamento
// de chamados, orientações de login/senha, termos de uso, privacidade e LGPD.
// Coordenação: fila de chamados com resposta e mudança de situação.

import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/cliente';
import { useTitulo } from '../componentes/Basicos';
import { Carregando, ErroEstado, LinhaEstado, LinhasEsqueleto, Vazio } from '../componentes/Estado';
import { Aviso, Campo, ErroFormulario } from '../componentes/Formulario';
import Icone from '../componentes/Icone';
import { Abas, BadgeDe, Topo, Paginacao } from '../componentes/Interface';
import Janela from '../componentes/Janela';
import { useAuth } from '../contexto/AuthContext';
import { useToast } from '../contexto/ToastContext';
import { useApi } from '../hooks/useApi';
import { useListaPaginada } from '../hooks/useListaPaginada';
import { useFormulario } from '../hooks/useFormulario';
import { ROTULO_PERFIL, formatarDataHora, relativo } from '../util/formato';
import { CATEGORIAS_CHAMADO, STATUS } from '../util/status';

const FAQ = [
  {
    grupo: 'Acesso e senha',
    itens: [
      ['Como faço o primeiro acesso?', 'Responsáveis criam a própria conta em “Cadastre-se”, na tela de login. Professores e coordenação recebem o acesso da escola.'],
      [
        'Esqueci minha senha. E agora?',
        'Fale com a coordenação (pessoalmente, por telefone ou por um chamado aberto por outra pessoa da família). Ela gera um link de redefinição válido por 24 horas e de uso único. Ao abrir o link, você escolhe a nova senha.',
      ],
      ['Posso trocar minha senha?', 'Sim. Em “Meu perfil” > “Alterar senha”. É preciso informar a senha atual.'],
      ['Minha conta aparece como desativada.', 'A coordenação desativou o acesso. Abra um chamado ou procure a secretaria para reativar.'],
      ['O que é “Lembrar de mim”?', 'Mantém você conectado neste navegador. Em computadores compartilhados, deixe desmarcado e use “Sair” ao terminar.'],
    ],
  },
  {
    grupo: 'Boletim e acompanhamento',
    itens: [
      ['Por que uma nota ainda não aparece no boletim?', 'Toda nota passa pela revisão da coordenação antes de ser publicada. Só o que foi publicado aparece para a família.'],
      ['O que é “confirmar ciência”?', 'É avisar a escola que você viu o resultado. Você pode deixar um retorno para o professor junto com a confirmação.'],
      ['Como baixo o boletim em PDF?', 'No Boletim, use “Imprimir / salvar PDF” e escolha “Salvar como PDF” na janela de impressão do navegador.'],
      ['Como justifico uma falta?', 'Em “Justificativas de faltas”, informe o aluno, a data e o motivo. Atestados e comprovantes devem ser entregues na secretaria.'],
    ],
  },
  {
    grupo: 'Comunicação e documentos',
    itens: [
      ['Com quem posso conversar no mural?', 'Responsáveis falam com a coordenação e com os professores dos seus filhos. Professores falam com a equipe e com as famílias das suas turmas.'],
      ['Como peço uma declaração ou o histórico escolar?', 'Em “Documentos escolares” > “Solicitar documento”. Quando estiver disponível, você abre, imprime ou salva em PDF.'],
      ['Posso enviar arquivos (fotos, atestados)?', 'Ainda não. A plataforma não recebe arquivos; entregue documentos na secretaria e informe no pedido.'],
    ],
  },
  {
    grupo: 'Privacidade (LGPD)',
    itens: [
      ['Quem vê os dados do meu filho?', 'Você vê só os seus filhos. Professores veem as turmas em que lecionam. A coordenação acessa o necessário para a gestão escolar.'],
      ['Ocorrências e justificativas são públicas?', 'Não. Motivos de falta e ocorrências de saúde ficam restritos à coordenação. Professores veem apenas a situação.'],
      ['Como peço correção ou exclusão dos meus dados?', 'Abra um chamado na categoria “Dados cadastrais”. A escola responde pelo próprio chamado.'],
    ],
  },
];

function PerguntasFrequentes() {
  const [busca, setBusca] = useState('');
  const termo = busca.trim().toLowerCase();
  const grupos = FAQ.map((g) => ({ ...g, itens: g.itens.filter(([p, r]) => !termo || `${p} ${r}`.toLowerCase().includes(termo)) })).filter((g) => g.itens.length);
  return (
    <>
      <label className="busca">
        <Icone nome="busca" />
        <span className="sr-only">Buscar nas perguntas frequentes</span>
        <input className="input" type="search" placeholder="Buscar dúvida (ex.: senha, boletim, falta)" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </label>
      {!grupos.length && <Vazio>Nada encontrado para “{busca}”. Abra um chamado que a escola responde.</Vazio>}
      {grupos.map((g) => (
        <section key={g.grupo} className="faq-grupo">
          <h2 className="secao-titulo">{g.grupo}</h2>
          {g.itens.map(([pergunta, resposta]) => (
            <details key={pergunta} className="faq" open={Boolean(termo)}>
              <summary>{pergunta}</summary>
              <p>{resposta}</p>
            </details>
          ))}
        </section>
      ))}
      <section className="cartao links-legais">
        <h2 className="cartao-titulo">Termos, privacidade e proteção de dados</h2>
        <p className="texto-secundario">
          A plataforma segue a Lei Geral de Proteção de Dados (Lei 13.709/2018), com cuidado especial com dados de crianças e adolescentes (art. 14).
        </p>
        <div className="cartao-acoes" style={{ justifyContent: 'flex-start' }}>
          <Link to="/termos" className="btn btn-ghost btn-sm">
            Termos de uso
          </Link>
          <Link to="/privacidade" className="btn btn-ghost btn-sm">
            Política de privacidade
          </Link>
        </div>
      </section>
    </>
  );
}

function NovoChamado({ onCriado }) {
  const toast = useToast();
  const f = useFormulario({ categoria: '', assunto: '', descricao: '' });
  const [enviando, setEnviando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    const ok = f.validar({
      categoria: (v) => (!v ? 'Escolha a categoria do problema.' : ''),
      assunto: (v) => (v.trim().length < 5 ? 'Resuma o assunto (mínimo 5 caracteres).' : ''),
      descricao: (v) => (v.trim().length < 10 ? 'Descreva a solicitação (mínimo 10 caracteres).' : ''),
    });
    if (!ok) return;
    setEnviando(true);
    try {
      const c = await api.post('/chamados', { ...f.valores, assunto: f.valores.assunto.trim(), descricao: f.valores.descricao.trim() });
      toast(`Chamado #${c.id} aberto. Você será respondido por aqui.`);
      f.reiniciar({ categoria: '', assunto: '', descricao: '' });
      onCriado(c);
    } catch (err) {
      f.errosDaApi(err);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="cartao" onSubmit={enviar} noValidate>
      <h2 className="cartao-titulo">Abrir um chamado</h2>
      <div className="form-grid">
        <Campo nome="categoria" rotulo="Categoria do problema" erro={f.erros.categoria}>
          <select value={f.valores.categoria} onChange={f.campo('categoria')}>
            <option value="">Escolha...</option>
            {Object.entries(CATEGORIAS_CHAMADO).map(([v, r]) => (
              <option key={v} value={v.toUpperCase()}>
                {r}
              </option>
            ))}
          </select>
        </Campo>
        <Campo nome="assunto" rotulo="Assunto" erro={f.erros.assunto}>
          <input value={f.valores.assunto} onChange={f.campo('assunto')} maxLength={120} placeholder="Ex.: Não consigo ver o boletim" />
        </Campo>
        <Campo nome="descricao" rotulo="Descrição da solicitação" erro={f.erros.descricao} className="col-2" dica="Conte o que aconteceu e, se for o caso, em qual tela.">
          <textarea rows={4} value={f.valores.descricao} onChange={f.campo('descricao')} maxLength={3000} />
        </Campo>
      </div>
      <ErroFormulario>{f.erroGeral}</ErroFormulario>
      <div className="cartao-acoes">
        <button type="submit" className="btn btn-primary btn-sm" disabled={enviando}>
          <Icone nome="enviar" tamanho={14} /> {enviando ? 'Enviando...' : 'Enviar chamado'}
        </button>
      </div>
    </form>
  );
}

function TabelaChamados({ lista, ehAdmin, onAbrir }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th scope="col">Nº</th>
            <th scope="col">Assunto</th>
            {ehAdmin && <th scope="col">Solicitante</th>}
            <th scope="col">Categoria</th>
            <th scope="col">Situação</th>
            <th scope="col">Atualizado</th>
            <th scope="col">
              <span className="sr-only">Ações</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {!lista && <LinhasEsqueleto colunas={ehAdmin ? 7 : 6} linhas={2} />}
          {lista && !lista.length && (
            <LinhaEstado colunas={ehAdmin ? 7 : 6}>
              <Vazio>Nenhum chamado ainda.</Vazio>
            </LinhaEstado>
          )}
          {lista?.map((c) => (
            <tr key={c.id}>
              <td data-rotulo="Nº">#{c.id}</td>
              <td data-rotulo="Assunto">{c.assunto}</td>
              {ehAdmin && (
                <td data-rotulo="Solicitante">
                  {c.usuario} <small className="texto-secundario">({ROTULO_PERFIL[c.perfil]})</small>
                </td>
              )}
              <td data-rotulo="Categoria">{CATEGORIAS_CHAMADO[c.categoria]}</td>
              <td data-rotulo="Situação">
                <BadgeDe tipo="chamado" valor={c.status} />
              </td>
              <td data-rotulo="Atualizado">{relativo(c.atualizado_em)}</td>
              <td>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => onAbrir(c.id)}>
                  Abrir
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DetalheChamado({ id, ehAdmin, onFechar, onMudou }) {
  const toast = useToast();
  const { dados, erro, recarregar, setDados } = useApi(() => api.get(`/chamados/${id}`), [id]);
  const [texto, setTexto] = useState('');
  const [status, setStatus] = useState('AGUARDANDO_USUARIO');
  const [erroEnvio, setErroEnvio] = useState('');
  const [enviando, setEnviando] = useState(false);
  const encerrado = dados && ['resolvido', 'fechado'].includes(dados.status);

  async function responder(e) {
    e.preventDefault();
    if (texto.trim().length < 2) return setErroEnvio('Escreva a mensagem.');
    setEnviando(true);
    try {
      await api.post(`/chamados/${id}/interacoes`, { texto: texto.trim(), ...(ehAdmin ? { status } : {}) });
      setTexto('');
      setErroEnvio('');
      toast('Mensagem enviada.');
      await recarregar({ silencioso: true });
      onMudou();
    } catch (err) {
      setErroEnvio(err.message);
    } finally {
      setEnviando(false);
    }
  }

  async function mudarStatus(novo) {
    try {
      const c = await api.patch(`/chamados/${id}/status`, { status: novo });
      setDados((d) => ({ ...d, status: c.status }));
      toast('Situação do chamado atualizada.');
      onMudou();
    } catch (err) {
      toast(err.message, 'erro');
    }
  }

  return (
    <Janela aberto largo onFechar={onFechar} titulo={dados ? `#${dados.id} · ${dados.assunto}` : 'Chamado'} subtitulo={dados && <BadgeDe tipo="chamado" valor={dados.status} />}>
      {erro && <ErroEstado mensagem={erro} onTentarNovamente={recarregar} />}
      {!erro && !dados && <Carregando />}
      {dados && (
        <>
          <ol className="conversa-chamado">
            <li className="mensagem-chamado">
              <p className="mensagem-autor">
                {dados.usuario} · {CATEGORIAS_CHAMADO[dados.categoria]} · {formatarDataHora(dados.criado_em)}
              </p>
              <p className="msg-texto">{dados.descricao}</p>
            </li>
            {dados.conversa.map((m) => (
              <li key={m.id} className={`mensagem-chamado${m.perfil === 'admin' ? ' da-escola' : ''}`}>
                <p className="mensagem-autor">
                  {m.perfil === 'admin' ? `${m.usuario} (escola)` : m.usuario} · {formatarDataHora(m.criado_em)}
                </p>
                <p className="msg-texto">{m.texto}</p>
              </li>
            ))}
          </ol>
          {ehAdmin && (
            <label className="campo-filtro" style={{ maxWidth: 260 }}>
              <span>Mudar situação sem responder</span>
              <select className="select" value={dados.status.toUpperCase()} onChange={(e) => mudarStatus(e.target.value)}>
                {Object.entries(STATUS.chamado).map(([v, [r]]) => (
                  <option key={v} value={v.toUpperCase()}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
          )}
          {encerrado && !ehAdmin ? (
            <Aviso tom="ok">Este chamado foi encerrado. Se precisar, abra um novo.</Aviso>
          ) : (
            <form onSubmit={responder} noValidate className="resposta-chamado">
              <label htmlFor="resposta-chamado" className="subtitulo">
                {ehAdmin ? 'Responder ao solicitante' : 'Responder'}
              </label>
              <textarea id="resposta-chamado" className="input" rows={3} maxLength={3000} value={texto} onChange={(e) => { setTexto(e.target.value); setErroEnvio(''); }} />
              <small className="campo-erro" role="alert">
                {erroEnvio}
              </small>
              <div className="cartao-acoes">
                {ehAdmin && (
                  <label className="campo-filtro">
                    <span>Situação após responder</span>
                    <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
                      <option value="AGUARDANDO_USUARIO">Aguardando o usuário</option>
                      <option value="EM_ATENDIMENTO">Em atendimento</option>
                      <option value="RESOLVIDO">Resolvido</option>
                    </select>
                  </label>
                )}
                <button type="submit" className="btn btn-primary btn-sm" disabled={enviando}>
                  {enviando ? 'Enviando...' : 'Enviar'}
                </button>
              </div>
            </form>
          )}
        </>
      )}
    </Janela>
  );
}

export default function Ajuda() {
  useTitulo('Ajuda e suporte');
  const { usuario } = useAuth();
  const ehAdmin = usuario.perfil === 'admin';
  const [params, setParams] = useSearchParams();
  const [aba, setAba] = useState(params.get('chamado') ? 'chamados' : ehAdmin ? 'chamados' : 'faq');
  const [soAbertos, setSoAbertos] = useState(ehAdmin);
  const chamados = useListaPaginada(`/chamados${soAbertos ? '?status=abertos' : ''}`);
  const aberto = Number(params.get('chamado')) || null;
  // Coordenação vendo só os abertos: o total da lista (todas as páginas); senão, os da página atual
  const pendentes =
    ehAdmin && soAbertos && chamados.meta
      ? chamados.meta.total
      : (chamados.dados || []).filter((c) => (ehAdmin ? ['aberto', 'em_atendimento'] : ['aguardando_usuario']).includes(c.status)).length;

  const abas = [
    { id: 'faq', rotulo: 'Perguntas frequentes' },
    { id: 'chamados', rotulo: ehAdmin ? 'Fila de chamados' : 'Meus chamados', contador: pendentes },
  ];

  return (
    <>
      <Topo
        titulo={ehAdmin ? 'SAC — atendimento' : 'Ajuda e suporte'}
        descricao={ehAdmin ? 'Responda os chamados de famílias e professores e acompanhe a situação de cada um.' : 'Tire dúvidas, abra um chamado e acompanhe o atendimento.'}
      />
      <Abas abas={abas} ativa={aba} onTrocar={setAba} rotulo="Seções da ajuda" />

      {aba === 'faq' && <PerguntasFrequentes />}

      {aba === 'chamados' && (
        <div className="pilha">
          {!ehAdmin && <NovoChamado onCriado={(c) => { chamados.recarregar({ silencioso: true }); setParams({ chamado: c.id }); }} />}
          <div className="linha-acao">
            <h2 className="secao-titulo">{ehAdmin ? 'Chamados' : 'Histórico de chamados'}</h2>
            <label className="aceite">
              <input type="checkbox" checked={soAbertos} onChange={(e) => setSoAbertos(e.target.checked)} /> Só em andamento
            </label>
          </div>
          {chamados.erro ? (
            <ErroEstado mensagem={chamados.erro} onTentarNovamente={chamados.recarregar} />
          ) : (
            <TabelaChamados lista={chamados.dados} ehAdmin={ehAdmin} onAbrir={(id) => setParams({ chamado: id })} />
          )}
          {!chamados.erro && (
            <Paginacao meta={chamados.meta} onPagina={chamados.setPagina} rotulo="chamado(s)" />
          )}
        </div>
      )}

      {aberto && (
        <DetalheChamado
          id={aberto}
          ehAdmin={ehAdmin}
          onFechar={() => setParams({})}
          onMudou={() => {
            chamados.recarregar({ silencioso: true });
            window.dispatchEvent(new CustomEvent('kfka:atualizar-contadores'));
          }}
        />
      )}
    </>
  );
}
