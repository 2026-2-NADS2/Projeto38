// Login.jsx — entrada no sistema, com validação antes de enviar.

import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api/cliente';
import { Logo, usePaginaPublica, useTitulo } from '../componentes/Basicos';
import { useAuth } from '../contexto/AuthContext';
import Janela from '../componentes/Janela';

const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Login() {
  useTitulo('Entrar');
  usePaginaPublica();
  const { usuario, entrar } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [lembrar, setLembrar] = useState(false);
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [erros, setErros] = useState({});
  const [erroGeral, setErroGeral] = useState(
    new URLSearchParams(location.search).get('sessao') === 'expirada' ? 'Sua sessão expirou. Entre novamente.' : ''
  );
  const [enviando, setEnviando] = useState(false);
  const [ajudaSenha, setAjudaSenha] = useState(false);

  if (usuario) return <Navigate to="/painel" replace />;

  function validar() {
    const e = {};
    if (!email.trim()) e.email = 'Informe seu e-mail.';
    else if (!EMAIL_VALIDO.test(email.trim())) e.email = 'Formato de e-mail inválido.';
    if (!senha) e.senha = 'Informe sua senha.';
    setErros(e);
    return !Object.keys(e).length;
  }

  async function aoEnviar(ev) {
    ev.preventDefault();
    setErroGeral('');
    if (!validar()) return;
    setEnviando(true);
    try {
      const { token, usuario: u } = await api.post('/auth/login', { email: email.trim(), senha });
      entrar(token, u, lembrar);
      navigate(location.state?.de || '/painel', { replace: true });
    } catch (err) {
      setErroGeral(err.message);
      setSenha('');
      setEnviando(false);
    }
  }

  const campo = (nome, valor, setValor) => ({
    value: valor,
    onChange: (e) => {
      setValor(e.target.value);
      if (erros[nome]) setErros((x) => ({ ...x, [nome]: '' }));
    },
    'aria-invalid': Boolean(erros[nome]),
    'aria-describedby': `erro-${nome}`,
  });

  return (
    <div className="auth-shell">
      <div className="auth-side reveal">
        <Link to="/" className="logo" style={{ marginBottom: 'var(--space-lg)', fontSize: '1.4rem' }}>
          <span className="logo-mark">[K]</span> KFKA
        </Link>
        <h1 style={{ fontSize: '2.2rem', lineHeight: 1.2, marginBottom: 'var(--space-sm)' }}>
          Acompanhamento escolar mais simples, <span className="text-gradient">seguro e conectado</span>.
        </h1>
        <p style={{ color: 'var(--text-secondary)', maxWidth: '38ch' }}>Professores, escola e responsáveis em um único ambiente.</p>
        <div className="hero-badges">
          <div>🛡️ Dados protegidos</div>
          <div>🔑 Acesso por permissão</div>
          <div>🔒 Ambiente seguro</div>
        </div>
      </div>

      <div className="auth-side">
        <main className="auth-card reveal reveal-delay-1">
          <Logo className="logo-centro" />
          <h2 style={{ textAlign: 'center', marginBottom: '0.3rem' }}>Bem-vindo(a)!</h2>
          <p style={{ textAlign: 'center', color: 'var(--text-secondary)', marginBottom: 'var(--space-md)', fontSize: '0.9rem' }}>
            Acesse sua conta para continuar.
          </p>

          <form onSubmit={aoEnviar} noValidate>
            <div className="field">
              <label htmlFor="email">E-mail</label>
              <div className={`input-wrap${erros.email ? ' invalido' : ''}`}>
                <span aria-hidden="true">👤</span>
                <input id="email" type="email" autoComplete="username" placeholder="seu.email@exemplo.com"
                  {...campo('email', email, setEmail)} />
              </div>
              <small className="campo-erro" id="erro-email">{erros.email}</small>
            </div>

            <div className="field">
              <label htmlFor="senha">Senha</label>
              <div className={`input-wrap${erros.senha ? ' invalido' : ''}`}>
                <span aria-hidden="true">🔒</span>
                <input id="senha" type={mostrarSenha ? 'text' : 'password'} autoComplete="current-password"
                  placeholder="Digite sua senha" {...campo('senha', senha, setSenha)} />
                <button type="button" className="toggle-senha" onClick={() => setMostrarSenha((v) => !v)}
                  aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}>
                  {mostrarSenha ? '🙈' : '👁️'}
                </button>
              </div>
              <small className="campo-erro" id="erro-senha">{erros.senha}</small>
            </div>

            <p className="error-msg" role="alert">{erroGeral}</p>

            <div className="field-row">
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-secondary)' }}>
                <input type="checkbox" checked={lembrar} onChange={(e) => setLembrar(e.target.checked)} /> Lembrar de mim
              </label>
              <button type="button" className="link-botao" onClick={() => setAjudaSenha(true)}>
                Esqueceu sua senha?
              </button>
            </div>

            <button type="submit" className="btn btn-primary btn-block" disabled={enviando}>
              <span className="rotulo">{enviando ? 'Entrando...' : 'Entrar'}</span>
            </button>
          </form>

          <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 'var(--space-md)' }}>
            É responsável e ainda não tem conta? <Link to="/cadastro" style={{ color: 'var(--cyan)' }}>Cadastre-se</Link>
          </p>
        </main>
      </div>
      <Janela aberto={ajudaSenha} onFechar={() => setAjudaSenha(false)} titulo="Esqueceu sua senha?">
        <p className="parecer">Por segurança, a senha é redefinida com um link gerado pela coordenação da escola:</p>
        <ol className="passos">
          <li>Procure a coordenação (pessoalmente ou por telefone) e peça um link de redefinição.</li>
          <li>Abra o link recebido. Ele vale por 24 horas e só pode ser usado uma vez.</li>
          <li>Escolha a nova senha (mínimo 8 caracteres, com letra e número) e entre novamente.</li>
        </ol>
        <p className="texto-secundario">
          Veja também os <Link to="/termos" className="link">termos de uso</Link> e a <Link to="/privacidade" className="link">política de privacidade</Link>.
        </p>
      </Janela>
    </div>
  );
}
