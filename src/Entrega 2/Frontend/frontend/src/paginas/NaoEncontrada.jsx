// NaoEncontrada.jsx — página 404 para qualquer endereço que não existe.

import { Link, useLocation } from 'react-router-dom';
import { Logo, useTitulo } from '../componentes/Basicos';
import { useAuth } from '../contexto/AuthContext';

export default function NaoEncontrada() {
  useTitulo('Página não encontrada');
  const { usuario } = useAuth();
  const { pathname } = useLocation();

  return (
    <main className="pagina-404">
      <Link to="/">
        <Logo />
      </Link>
      <p className="codigo-404 text-gradient">404</p>
      <h1>Página não encontrada</h1>
      <p>
        O endereço <code>{pathname}</code> não existe ou foi movido.
      </p>
      <div className="hero-actions">
        <Link to="/" className="btn btn-ghost">Página inicial</Link>
        <Link to={usuario ? '/painel' : '/login'} className="btn btn-primary">
          {usuario ? 'Ir para o painel' : 'Entrar'}
        </Link>
      </div>
    </main>
  );
}
