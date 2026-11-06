// Perfil.jsx — "Meu perfil": foto, dados da conta, informações do perfil,
// edição do que é permitido, troca de senha e preferências (tema).

import { useRef, useState } from 'react';
import { api, sessao } from '../api/cliente';
import { useTitulo } from '../componentes/Basicos';
import BotaoAcao from '../componentes/BotaoAcao';
import { Carregando, ErroEstado } from '../componentes/Estado';
import { Aviso, Campo, ErroFormulario } from '../componentes/Formulario';
import Icone from '../componentes/Icone';
import { Avatar, Badge, Detalhe, Topo } from '../componentes/Interface';
import { useAuth } from '../contexto/AuthContext';
import { useConfirmar } from '../contexto/ConfirmarContext';
import { useToast } from '../contexto/ToastContext';
import { useApi } from '../hooks/useApi';
import { telefoneValido, useFormulario } from '../hooks/useFormulario';
import { ROTULO_PERFIL, formatarDataHora } from '../util/formato';
import { definirTema, temaAtual } from '../util/tema';

const LADO = 160; // a foto é salva com 160×160 px

// Lê a imagem escolhida, corta no centro (quadrado) e reduz para JPEG pequeno
function prepararFoto(arquivo) {
  return new Promise((ok, falha) => {
    if (!/^image\/(jpeg|png|webp)$/.test(arquivo.type)) return falha(new Error('Escolha uma imagem JPG, PNG ou WEBP.'));
    if (arquivo.size > 8 * 1024 * 1024) return falha(new Error('A imagem deve ter no máximo 8 MB.'));
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => {
      const lado = Math.min(img.width, img.height);
      const canvas = document.createElement('canvas');
      canvas.width = LADO;
      canvas.height = LADO;
      canvas.getContext('2d').drawImage(img, (img.width - lado) / 2, (img.height - lado) / 2, lado, lado, 0, 0, LADO, LADO);
      URL.revokeObjectURL(url);
      ok(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      falha(new Error('Não foi possível ler esta imagem.'));
    };
    img.src = url;
  });
}

function FotoPerfil({ perfil, onSalvo }) {
  const toast = useToast();
  const confirmar = useConfirmar();
  const entrada = useRef(null);
  const [enviando, setEnviando] = useState(false);

  async function salvar(foto) {
    setEnviando(true);
    try {
      const novo = await api.put('/perfil', { foto, telefone: perfil.telefone });
      onSalvo(novo);
      toast(foto ? 'Foto atualizada.' : 'Foto removida.');
    } catch (err) {
      toast(err.message, 'erro');
    } finally {
      setEnviando(false);
    }
  }

  async function escolher(e) {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    if (!arquivo) return;
    try {
      await salvar(await prepararFoto(arquivo));
    } catch (err) {
      toast(err.message, 'erro');
    }
  }

  async function remover() {
    if (await confirmar({ titulo: 'Remover a foto?', mensagem: 'No lugar dela aparecerão as suas iniciais.', confirmar: 'Remover' })) {
      salvar(null);
    }
  }

  return (
    <div className="perfil-foto">
      <Avatar nome={perfil.nome} foto={perfil.foto} tamanho={96} />
      <div className="perfil-foto-acoes">
        <input ref={entrada} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" id="foto-arquivo" onChange={escolher} />
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => entrada.current?.click()} disabled={enviando}>
          <Icone nome="camera" tamanho={16} /> {enviando ? 'Enviando...' : perfil.foto ? 'Trocar foto' : 'Adicionar foto'}
        </button>
        {perfil.foto && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={remover} disabled={enviando}>
            Remover
          </button>
        )}
        <small className="texto-secundario">A imagem é recortada e reduzida antes de ser enviada.</small>
      </div>
    </div>
  );
}

function DadosConta({ perfil, onSalvo }) {
  const toast = useToast();
  const f = useFormulario({ nome: perfil.nome, telefone: perfil.telefone || '' });
  const mudou = f.valores.nome !== perfil.nome || f.valores.telefone !== (perfil.telefone || '');

  // Devolve true/false: o botão mostra "Salvo ✓" só quando deu certo
  async function salvar(e) {
    e?.preventDefault();
    const regras = { telefone: telefoneValido };
    if (perfil.editavel.nome) regras.nome = (v) => (v.trim().length < 3 ? 'O nome deve ter pelo menos 3 caracteres.' : '');
    if (!f.validar(regras)) return false;
    try {
      const corpo = { telefone: f.valores.telefone.trim() || null };
      if (perfil.editavel.nome) corpo.nome = f.valores.nome.trim();
      const novo = await api.put('/perfil', corpo);
      toast('Dados salvos.');
      onSalvo(novo);
      return true;
    } catch (err) {
      f.errosDaApi(err);
      return false;
    }
  }

  return (
    <form className="cartao" onSubmit={salvar} noValidate>
      <h2 className="cartao-titulo">Dados da conta</h2>
      <div className="form-grid">
        <Campo nome="nome" rotulo="Nome completo" erro={f.erros.nome} dica={perfil.editavel.nome ? null : 'Para corrigir o nome, fale com a coordenação.'}>
          <input value={f.valores.nome} onChange={f.campo('nome')} disabled={!perfil.editavel.nome} autoComplete="name" />
        </Campo>
        <Campo nome="email" rotulo="E-mail (usado no login)" dica="Para trocar o e-mail, fale com a coordenação.">
          <input value={perfil.email} disabled />
        </Campo>
        {perfil.editavel.telefone && (
          <Campo nome="telefone" rotulo="Telefone para contato" erro={f.erros.telefone} opcional>
            <input type="tel" value={f.valores.telefone} onChange={f.campo('telefone')} placeholder="(11) 90000-0000" autoComplete="tel" />
          </Campo>
        )}
      </div>
      <ErroFormulario>{f.erroGeral}</ErroFormulario>
      <div className="cartao-acoes">
        <BotaoAcao
          className="btn btn-primary btn-sm"
          disabled={!mudou}
          textoOcupado="Salvando..."
          onAcao={async () => {
            if (!(await salvar())) throw new Error('não salvo');
          }}
        >
          Salvar alterações
        </BotaoAcao>
      </div>
    </form>
  );
}

function TrocarSenha() {
  const toast = useToast();
  const vazio = { senha_atual: '', nova_senha: '', confirmacao: '' };
  const f = useFormulario(vazio);
  const [mostrar, setMostrar] = useState(false);

  async function salvar(e) {
    e.preventDefault();
    const ok = f.validar({
      senha_atual: (v) => (!v ? 'Informe a senha atual.' : ''),
      nova_senha: (v) =>
        v.length < 8 ? 'A nova senha deve ter pelo menos 8 caracteres.' : !/[A-Za-z]/.test(v) || !/[0-9]/.test(v) ? 'Use pelo menos uma letra e um número.' : '',
      confirmacao: (v, t) => (v !== t.nova_senha ? 'As senhas não conferem.' : ''),
    });
    if (!ok) return;
    try {
      // A troca encerra as sessões abertas em outros aparelhos; esta continua com um token novo
      const { token } = await api.put('/perfil/senha', { senha_atual: f.valores.senha_atual, nova_senha: f.valores.nova_senha });
      sessao.trocarToken(token);
      f.reiniciar(vazio);
      toast('Senha alterada. As sessões abertas em outros aparelhos foram encerradas.');
    } catch (err) {
      f.errosDaApi(err);
    }
  }

  const tipo = mostrar ? 'text' : 'password';
  return (
    <form className="cartao" onSubmit={salvar} noValidate>
      <h2 className="cartao-titulo">
        <Icone nome="cadeado" /> Alterar senha
      </h2>
      <div className="form-grid uma-coluna">
        <Campo nome="senha_atual" rotulo="Senha atual" erro={f.erros.senha_atual}>
          <input type={tipo} value={f.valores.senha_atual} onChange={f.campo('senha_atual')} autoComplete="current-password" />
        </Campo>
        <Campo nome="nova_senha" rotulo="Nova senha" erro={f.erros.nova_senha} dica="Mínimo 8 caracteres, com letra e número.">
          <input type={tipo} value={f.valores.nova_senha} onChange={f.campo('nova_senha')} autoComplete="new-password" />
        </Campo>
        <Campo nome="confirmacao" rotulo="Repita a nova senha" erro={f.erros.confirmacao}>
          <input type={tipo} value={f.valores.confirmacao} onChange={f.campo('confirmacao')} autoComplete="new-password" />
        </Campo>
      </div>
      <label className="aceite">
        <input type="checkbox" checked={mostrar} onChange={(e) => setMostrar(e.target.checked)} /> Mostrar as senhas
      </label>
      <ErroFormulario>{f.erroGeral}</ErroFormulario>
      <div className="cartao-acoes">
        <button type="submit" className="btn btn-primary btn-sm">
          Alterar senha
        </button>
      </div>
    </form>
  );
}

// Privacidade e segurança da conta: cópia dos dados (LGPD) e encerramento de sessões
function SegurancaPrivacidade() {
  const toast = useToast();
  const { sair } = useAuth();
  const confirmar = useConfirmar();

  async function baixar() {
    try {
      await api.baixar('/perfil/meus-dados');
      toast('Arquivo com os seus dados baixado.');
    } catch (err) {
      toast(err.message, 'erro');
      throw err;
    }
  }

  async function encerrarTodas() {
    const ok = await confirmar({
      titulo: 'Encerrar todas as sessões?',
      mensagem: 'Você sai de todos os aparelhos e navegadores, inclusive deste, e precisa entrar de novo.',
      confirmar: 'Encerrar sessões',
    });
    if (!ok) return;
    try {
      await api.post('/auth/sair-de-todos');
      toast('Sessões encerradas.');
      sair();
    } catch (err) {
      toast(err.message, 'erro');
      throw err;
    }
  }

  return (
    <section className="cartao">
      <h2 className="cartao-titulo">
        <Icone nome="cadeado" /> Privacidade e segurança
      </h2>
      <p className="texto-secundario">
        Baixe uma cópia dos dados pessoais que a plataforma guarda sobre você (e, para responsáveis, dos alunos vinculados e dos
        relatórios publicados). O pedido fica registrado na auditoria.
      </p>
      <div className="cartao-acoes">
        <BotaoAcao className="btn btn-ghost btn-sm" textoOcupado="Preparando..." onAcao={baixar}>
          <Icone nome="download" tamanho={14} /> Baixar meus dados
        </BotaoAcao>
        <BotaoAcao className="btn btn-ghost btn-sm" textoOcupado="Encerrando..." onAcao={encerrarTodas}>
          Encerrar todas as sessões
        </BotaoAcao>
      </div>
    </section>
  );
}

function InfoPerfil({ perfil }) {
  if (perfil.perfil === 'professor') {
    return (
      <section className="cartao">
        <h2 className="cartao-titulo">Dados profissionais</h2>
        <dl className="detalhes">
          <Detalhe rotulo="Registro funcional">{perfil.registro}</Detalhe>
          <Detalhe rotulo="Documento">{perfil.documento}</Detalhe>
        </dl>
        <h3 className="subtitulo">Turmas e disciplinas</h3>
        {perfil.vinculos.length ? (
          <ul className="chips">
            {perfil.vinculos.map((v) => (
              <li key={`${v.turma}-${v.disciplina}`} className="chip chip-estatico">
                {v.disciplina} · {v.turma}
              </li>
            ))}
          </ul>
        ) : (
          <p className="texto-secundario">Nenhuma turma vinculada. A coordenação faz esse cadastro.</p>
        )}
      </section>
    );
  }
  if (perfil.perfil === 'responsavel') {
    return (
      <section className="cartao">
        <h2 className="cartao-titulo">Alunos vinculados</h2>
        {perfil.filhos.length ? (
          <ul className="lista-simples">
            {perfil.filhos.map((f) => (
              <li key={f.matricula}>
                <strong>{f.nome}</strong>
                <span className="texto-secundario">
                  {f.parentesco} · {f.turma || 'Sem turma'} · Matrícula {f.matricula}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="texto-secundario">Nenhum aluno vinculado ainda. A coordenação fará o vínculo.</p>
        )}
        <p className="texto-secundario lgpd-nota">
          <Icone nome="revisao" tamanho={14} /> Consentimento LGPD registrado em {formatarDataHora(perfil.aceite_lgpd_em) || '—'}. Para pedir correção
          ou exclusão de dados, abra um chamado em Ajuda e suporte.
        </p>
      </section>
    );
  }
  return (
    <section className="cartao">
      <h2 className="cartao-titulo">Coordenação</h2>
      <p className="texto-secundario">
        Você tem acesso à gestão da escola: cadastros, revisão e publicação de boletins, justificativas, documentos, ocorrências e SAC.
      </p>
    </section>
  );
}

function Preferencias() {
  const [tema, setTema] = useState(temaAtual);
  function trocar(novo) {
    setTema(novo);
    definirTema(novo);
  }
  return (
    <section className="cartao">
      <h2 className="cartao-titulo">Preferências deste navegador</h2>
      <fieldset className="opcoes-tema">
        <legend className="texto-secundario">Aparência</legend>
        {[
          ['escuro', 'Escuro', 'lua'],
          ['claro', 'Claro', 'sol'],
        ].map(([valor, rotulo, icone]) => (
          <label key={valor} className={`opcao-tema${tema === valor ? ' ativa' : ''}`}>
            <input type="radio" name="tema" value={valor} checked={tema === valor} onChange={() => trocar(valor)} />
            <Icone nome={icone} /> {rotulo}
          </label>
        ))}
      </fieldset>
    </section>
  );
}

export default function Perfil() {
  useTitulo('Meu perfil');
  const { atualizarUsuario } = useAuth();
  const { dados: perfil, erro, recarregar, setDados } = useApi(() => api.get('/perfil'), []);

  function aoSalvar(novo) {
    setDados(novo);
    atualizarUsuario({ nome: novo.nome, foto: novo.foto });
  }

  return (
    <>
      <Topo titulo="Meu perfil" descricao="Seus dados de acesso, informações de contato e preferências." />
      {erro && <ErroEstado mensagem={erro} onTentarNovamente={recarregar} />}
      {!erro && !perfil && <Carregando texto="Carregando seu perfil..." />}
      {perfil && (
        <div className="perfil-grade">
          <section className="cartao perfil-resumo">
            <FotoPerfil perfil={perfil} onSalvo={aoSalvar} />
            <div>
              <h2>{perfil.nome}</h2>
              <p className="texto-secundario">{perfil.email}</p>
              <Badge tom="info">{ROTULO_PERFIL[perfil.perfil]}</Badge>
              <p className="texto-secundario perfil-acesso">
                Último acesso: {formatarDataHora(perfil.ultimo_login_em) || 'primeiro acesso'} · Conta criada em {formatarDataHora(perfil.criado_em)}
              </p>
            </div>
          </section>
          <DadosConta key={`${perfil.nome}|${perfil.telefone}`} perfil={perfil} onSalvo={aoSalvar} />
          <InfoPerfil perfil={perfil} />
          <TrocarSenha />
          <SegurancaPrivacidade />
          <Preferencias />
          <Aviso tom="info" titulo="Seus dados">
            A plataforma usa seus dados apenas para o acompanhamento escolar (LGPD). Veja a{' '}
            <a className="link" href="/privacidade">
              Política de Privacidade
            </a>{' '}
            e os{' '}
            <a className="link" href="/termos">
              Termos de uso
            </a>
            .
          </Aviso>
        </div>
      )}
    </>
  );
}
