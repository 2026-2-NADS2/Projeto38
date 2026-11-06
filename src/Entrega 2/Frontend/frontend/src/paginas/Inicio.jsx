// Inicio.jsx — página inicial pública (apresentação do projeto).

import { Link } from 'react-router-dom';
import { Logo, usePaginaPublica, useTitulo } from '../componentes/Basicos';
import CookieBanner from '../componentes/CookieBanner';
import { useAuth } from '../contexto/AuthContext';

const icone = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: '#04101a', strokeWidth: 2, 'aria-hidden': true };

const RECURSOS = [
  {
    titulo: 'Avaliações',
    texto: 'Média, faltas, parecer e tags por disciplina e bimestre.',
    svg: (
      <svg {...icone}>
        <path d="M9 11l3 3L22 4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    titulo: 'Validação',
    texto: 'A coordenação revisa tudo antes da publicação, com histórico de cada alteração.',
    svg: (
      <svg {...icone}>
        <path d="M12 2l8 3v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V5z" strokeLinejoin="round" />
        <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    titulo: 'Responsáveis',
    texto: 'Boletim publicado, confirmação de ciência e conversa direta com a escola.',
    svg: (
      <svg {...icone}>
        <circle cx="9" cy="8" r="3" />
        <path d="M2 21c0-3.5 3-6 7-6s7 2.5 7 6" strokeLinecap="round" />
        <circle cx="17" cy="8" r="2.5" />
        <path d="M16 15.2c2.7.4 5 2.5 5 5.8" strokeLinecap="round" />
      </svg>
    ),
  },
];

export default function Inicio() {
  useTitulo(null);
  usePaginaPublica();
  const { usuario } = useAuth();
  const destino = usuario ? '/painel' : '/login';

  return (
    <>
      <header className="site-header container">
        <Logo />
        <nav className="nav-links" aria-label="Seções">
          <a href="#funcionalidades">Projeto</a>
          <a href="#como-funciona">Como funciona</a>
          <Link to="/privacidade">Privacidade</Link>
        </nav>
        <Link to={destino} className="btn btn-primary">
          {usuario ? 'Ir para o painel' : 'Entrar'}
        </Link>
      </header>

      <main className="container">
        <section className="hero">
          <div className="reveal">
            <h1>
              Acompanhamento escolar mais simples, <span className="text-gradient">seguro</span> e{' '}
              <span className="text-gradient">conectado</span>.
            </h1>
            <p>
              Centralize o acompanhamento bimestral dos alunos em um único ambiente, do lançamento das notas até a
              comunicação com a família.
            </p>
            <div className="hero-actions">
              <Link to={destino} className="btn btn-primary">
                {usuario ? 'Continuar' : 'Acessar a plataforma'}
              </Link>
              {!usuario && (
                <Link to="/cadastro" className="btn btn-ghost">
                  Sou responsável
                </Link>
              )}
            </div>
            <div className="hero-badges">
              <div>🛡️ Dados protegidos</div>
              <div>🔑 Acesso por permissão</div>
              <div>🔒 Ambiente seguro</div>
            </div>
          </div>
          <div />
        </section>

        <section id="funcionalidades" className="feature-grid" aria-labelledby="titulo-funcionalidades">
          {/* Título só para leitores de tela: os cartões (h3) ficam dentro de uma seção com h2 */}
          <h2 id="titulo-funcionalidades" className="sr-only">
            Funcionalidades
          </h2>
          {RECURSOS.map((r, i) => (
            <article key={r.titulo} className={`feature-card reveal reveal-delay-${i + 1}`}>
              <div className="icon">{r.svg}</div>
              <h3>{r.titulo}</h3>
              <p>{r.texto}</p>
            </article>
          ))}
        </section>

        <section id="como-funciona" className="flow-strip dot-texture">
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', letterSpacing: '0.05em' }}>Como funciona</p>
          <div className="flow-steps">
            <span>Professor</span>
            <span className="sep">→</span>
            <span>Revisão</span>
            <span className="sep">→</span>
            <span>Publicação</span>
            <span className="sep">→</span>
            <span>Família</span>
          </div>
        </section>
      </main>

      <footer className="site-footer">© 2026 KFKA — Tecnologia Educacional</footer>
      <CookieBanner />
    </>
  );
}
