// RedefinirSenha.jsx — página pública aberta pelo link que a coordenação gera
// (/redefinir-senha?token=...). O link vale 24 horas e só pode ser usado uma vez.

import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/cliente';
import { Logo, usePaginaPublica, useTitulo } from '../componentes/Basicos';
import { Carregando } from '../componentes/Estado';
import { Aviso, Campo, ErroFormulario } from '../componentes/Formulario';
import { useToast } from '../contexto/ToastContext';
import { useApi } from '../hooks/useApi';
import { useFormulario } from '../hooks/useFormulario';

export default function RedefinirSenha() {
  useTitulo('Redefinir senha');
  usePaginaPublica();
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const navigate = useNavigate();
  const toast = useToast();
  const valido = /^[a-f0-9]{48}$/.test(token);
  const { dados, erro } = useApi(() => api.get(`/auth/redefinir-senha/${token}`), [token], { ativo: valido });
  const f = useFormulario({ senha: '', confirmacao: '' });
  const [enviando, setEnviando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    const ok = f.validar({
      senha: (v) => (v.length < 8 ? 'A senha deve ter pelo menos 8 caracteres.' : !/[A-Za-z]/.test(v) || !/[0-9]/.test(v) ? 'Use pelo menos uma letra e um número.' : ''),
      confirmacao: (v, t) => (v !== t.senha ? 'As senhas não conferem.' : ''),
    });
    if (!ok) return;
    setEnviando(true);
    try {
      await api.post('/auth/redefinir-senha', { token, senha: f.valores.senha });
      toast('Senha definida! Entre com a nova senha.');
      navigate('/login', { replace: true });
    } catch (err) {
      f.errosDaApi(err);
      setEnviando(false);
    }
  }

  let conteudo;
  if (!valido || erro) {
    conteudo = (
      <Aviso tom="danger" titulo="Link inválido ou expirado">
        {erro || 'O endereço está incompleto.'} Peça um novo link à coordenação da escola.
      </Aviso>
    );
  } else if (!dados) {
    conteudo = <Carregando texto="Conferindo o link..." />;
  } else {
    conteudo = (
      <form onSubmit={enviar} noValidate>
        <p className="texto-secundario" style={{ marginBottom: 'var(--space-md)' }}>
          Olá, <strong>{dados.nome}</strong> ({dados.email}). Escolha uma nova senha para entrar na plataforma.
        </p>
        <Campo nome="senha" rotulo="Nova senha" erro={f.erros.senha} dica="Mínimo 8 caracteres, com letra e número.">
          <input type="password" value={f.valores.senha} onChange={f.campo('senha')} autoComplete="new-password" />
        </Campo>
        <Campo nome="confirmacao" rotulo="Repita a nova senha" erro={f.erros.confirmacao}>
          <input type="password" value={f.valores.confirmacao} onChange={f.campo('confirmacao')} autoComplete="new-password" />
        </Campo>
        <ErroFormulario>{f.erroGeral}</ErroFormulario>
        <button type="submit" className="btn btn-primary btn-block" disabled={enviando}>
          <span className="rotulo">{enviando ? 'Salvando...' : 'Definir nova senha'}</span>
        </button>
      </form>
    );
  }

  return (
    <main className="pagina-centro">
      <div className="auth-card">
        <Link to="/">
          <Logo className="logo-centro" />
        </Link>
        <h1 className="titulo-centro">Redefinir senha</h1>
        {conteudo}
        <p className="texto-secundario" style={{ textAlign: 'center', marginTop: 'var(--space-md)' }}>
          <Link to="/login" className="link">
            Voltar para o login
          </Link>
        </p>
      </div>
    </main>
  );
}
