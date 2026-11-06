// Cadastro.jsx — criação de conta de responsável, com validação completa no navegador.
// (A API valida de novo: nunca confie só na validação do front.)

import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { api } from '../api/cliente';
import { usePaginaPublica, useTitulo } from '../componentes/Basicos';
import { useAuth } from '../contexto/AuthContext';

const REGRAS = {
  nome: (d) => (!d.nome.trim() ? 'Informe seu nome.' : d.nome.trim().length < 3 ? 'O nome deve ter pelo menos 3 caracteres.' : ''),
  email: (d) =>
    !d.email.trim() ? 'Informe seu e-mail.' : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim()) ? 'Formato de e-mail inválido.' : '',
  telefone: (d) =>
    d.telefone.trim() && !/^[0-9()+\-\s]{8,20}$/.test(d.telefone.trim()) ? 'Use apenas números, espaços, parênteses e hífen.' : '',
  senha: (d) =>
    d.senha.length < 8
      ? 'A senha deve ter pelo menos 8 caracteres.'
      : !/[A-Za-z]/.test(d.senha) || !/[0-9]/.test(d.senha)
        ? 'Use pelo menos uma letra e um número.'
        : '',
  confirmacao: (d) => (!d.confirmacao || d.confirmacao !== d.senha ? 'As senhas não conferem.' : ''),
  aceite_lgpd: (d) => (d.aceite_lgpd ? '' : 'É preciso aceitar para criar a conta.'),
};

const CAMPOS = [
  { nome: 'nome', rotulo: 'Nome completo', tipo: 'text', icone: '👤', auto: 'name', dica: 'Seu nome' },
  { nome: 'email', rotulo: 'E-mail', tipo: 'email', icone: '✉️', auto: 'email', dica: 'seu.email@exemplo.com' },
  { nome: 'telefone', rotulo: 'Telefone', opcional: true, tipo: 'tel', icone: '📞', auto: 'tel', dica: '(11) 90000-0000' },
  { nome: 'senha', rotulo: 'Senha', tipo: 'password', icone: '🔒', auto: 'new-password', dica: 'Mínimo 8 caracteres, com letra e número' },
  { nome: 'confirmacao', rotulo: 'Confirme a senha', tipo: 'password', icone: '🔒', auto: 'new-password', dica: 'Repita a senha' },
];

export default function Cadastro() {
  useTitulo('Criar conta');
  usePaginaPublica();
  const { usuario, entrar } = useAuth();
  const navigate = useNavigate();

  const [dados, setDados] = useState({ nome: '', email: '', telefone: '', senha: '', confirmacao: '', aceite_lgpd: false });
  const [erros, setErros] = useState({});
  const [erroGeral, setErroGeral] = useState('');
  const [enviando, setEnviando] = useState(false);

  if (usuario) return <Navigate to="/painel" replace />;

  const mudar = (nome, valor) => {
    setDados((d) => ({ ...d, [nome]: valor }));
    setErros((e) => ({ ...e, [nome]: '' }));
  };
  // Valida ao sair do campo (só se a pessoa digitou algo)
  const aoSair = (nome) => dados[nome] && setErros((e) => ({ ...e, [nome]: REGRAS[nome](dados) }));

  async function aoEnviar(ev) {
    ev.preventDefault();
    setErroGeral('');
    const novos = Object.fromEntries(Object.keys(REGRAS).map((k) => [k, REGRAS[k](dados)]));
    setErros(novos);
    const primeiro = Object.keys(novos).find((k) => novos[k]);
    if (primeiro) {
      document.getElementById(primeiro === 'aceite_lgpd' ? 'aceite' : primeiro)?.focus();
      return;
    }

    setEnviando(true);
    try {
      const { token, usuario: u } = await api.post('/auth/cadastro', {
        nome: dados.nome.trim(),
        email: dados.email.trim(),
        senha: dados.senha,
        telefone: dados.telefone.trim() || undefined,
        aceite_lgpd: true,
      });
      entrar(token, u, false);
      navigate('/painel', { replace: true });
    } catch (err) {
      // Erros por campo vindos da API (422) aparecem embaixo de cada campo
      setErros(Object.fromEntries(err.detalhes.map((d) => [d.campo, d.mensagem])));
      setErroGeral(err.message);
      setEnviando(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-side reveal">
        <Link to="/" className="logo" style={{ marginBottom: 'var(--space-lg)', fontSize: '1.4rem' }}>
          <span className="logo-mark">[K]</span> KFKA
        </Link>
        <h1 style={{ fontSize: '2.2rem', lineHeight: 1.2, marginBottom: 'var(--space-sm)' }}>
          Acompanhe a vida escolar <span className="text-gradient">de perto</span>.
        </h1>
        <p style={{ color: 'var(--text-secondary)', maxWidth: '38ch' }}>
          Crie sua conta de responsável. Depois, a coordenação vincula seu(s) filho(s) ao seu cadastro.
        </p>
      </div>

      <div className="auth-side">
        <main className="auth-card reveal reveal-delay-1">
          <h2 style={{ textAlign: 'center', marginBottom: '0.3rem' }}>Criar conta</h2>
          <p style={{ textAlign: 'center', color: 'var(--text-secondary)', marginBottom: 'var(--space-md)', fontSize: '0.9rem' }}>
            Cadastro para pais e responsáveis.
          </p>

          <form onSubmit={aoEnviar} noValidate>
            {CAMPOS.map((c) => (
              <div className="field" key={c.nome}>
                <label htmlFor={c.nome}>
                  {c.rotulo} {c.opcional && <small className="texto-secundario">(opcional)</small>}
                </label>
                <div className={`input-wrap${erros[c.nome] ? ' invalido' : ''}`}>
                  <span aria-hidden="true">{c.icone}</span>
                  <input id={c.nome} type={c.tipo} autoComplete={c.auto} placeholder={c.dica}
                    maxLength={c.nome === 'telefone' ? 20 : 120} value={dados[c.nome]}
                    onChange={(e) => mudar(c.nome, e.target.value)} onBlur={() => aoSair(c.nome)}
                    aria-invalid={Boolean(erros[c.nome])} aria-describedby={`erro-${c.nome}`} />
                </div>
                <small className="campo-erro" id={`erro-${c.nome}`}>{erros[c.nome]}</small>
              </div>
            ))}

            <div className="field campo-aceite">
              <label className="aceite">
                <input type="checkbox" id="aceite" checked={dados.aceite_lgpd}
                  onChange={(e) => mudar('aceite_lgpd', e.target.checked)} aria-describedby="erro-aceite" />
                <span>
                  Autorizo o uso dos meus dados e dos dados do(s) aluno(s) para o acompanhamento escolar, conforme a{' '}
                  <Link to="/privacidade" target="_blank" style={{ color: 'var(--cyan)' }}>Política de Privacidade (LGPD)</Link>.
                </span>
              </label>
              <small className="campo-erro" id="erro-aceite">{erros.aceite_lgpd}</small>
            </div>

            <p className="error-msg" role="alert">{erroGeral}</p>

            <button type="submit" className="btn btn-primary btn-block" disabled={enviando}>
              <span className="rotulo">{enviando ? 'Criando conta...' : 'Criar conta'}</span>
            </button>
          </form>

          <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 'var(--space-md)' }}>
            Já tem conta? <Link to="/login" style={{ color: 'var(--cyan)' }}>Entrar</Link>
          </p>
        </main>
      </div>
    </div>
  );
}
