// LayoutApp.jsx — moldura das telas internas: barra lateral (desktop),
// barra superior com menu em gaveta (celular) e a área onde cada página aparece (<Outlet />).
//
// O menu é organizado por seções e muda conforme o perfil (MENU abaixo).
// A cada 30 s (com a aba visível) busca os contadores de pendências e mensagens:
// aparecem como selos no menu e uma mensagem nova gera um aviso.

import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { api } from '../api/cliente';
import { useAuth } from '../contexto/AuthContext';
import { useToast } from '../contexto/ToastContext';
import { ROTULO_PERFIL } from '../util/formato';
import { definirTema, temaAtual } from '../util/tema';
import { Logo } from './Basicos';
import CookieBanner from './CookieBanner';
import Icone from './Icone';
import { Avatar } from './Interface';

const TODOS = ['admin', 'professor', 'responsavel'];

// Itens do menu: quem vê cada um. Páginas administrativas só para a coordenação.
export const MENU = [
  {
    secao: 'Início',
    itens: [
      { para: '/painel', rotulo: 'Painel', icone: 'painel', perfis: TODOS },
      { para: '/pendencias', rotulo: 'Pendências', icone: 'pendencias', perfis: TODOS, contador: 'pendencias' },
      { para: '/calendario', rotulo: 'Calendário', icone: 'calendario', perfis: TODOS },
    ],
  },
  {
    secao: 'Acompanhamento',
    itens: [
      { para: '/revisao', rotulo: 'Revisão de boletins', icone: 'revisao', perfis: ['admin'] },
      { para: '/notas', rotulo: 'Notas e avaliações', icone: 'notas', perfis: ['professor'] },
      { para: '/aulas', rotulo: 'Aulas e frequência', icone: 'aulas', perfis: ['professor'] },
      { para: '/boletim', rotulo: 'Boletim escolar', icone: 'boletim', perfis: ['responsavel'] },
      { para: '/atividades', rotulo: 'Atividades', icone: 'atividades', perfis: ['professor', 'responsavel'] },
      { para: '/justificativas', rotulo: 'Justificativas de faltas', icone: 'justificativas', perfis: ['admin', 'responsavel'] },
      { para: '/ocorrencias', rotulo: 'Ocorrências', icone: 'ocorrencias', perfis: ['admin', 'professor'] },
      { para: '/documentos', rotulo: 'Documentos escolares', icone: 'documentos', perfis: ['admin', 'responsavel'] },
    ],
  },
  {
    secao: 'Gestão',
    itens: [
      { para: '/relatorios', rotulo: 'Relatórios gerenciais', icone: 'relatorios', perfis: ['admin'] },
      { para: '/relatorios', rotulo: 'Relatórios e retornos', icone: 'relatorios', perfis: ['professor'] },
      { para: '/auditoria', rotulo: 'Auditoria', icone: 'auditoria', perfis: ['admin'] },
    ],
  },
  {
    secao: 'Cadastros',
    itens: [
      { para: '/alunos', rotulo: 'Alunos', icone: 'alunos', perfis: ['admin'] },
      { para: '/professores', rotulo: 'Professores', icone: 'professores', perfis: ['admin'] },
      { para: '/turmas', rotulo: 'Turmas e disciplinas', icone: 'turmas', perfis: ['admin'] },
    ],
  },
  {
    secao: 'Comunicação',
    itens: [
      { para: '/comunicacao', rotulo: 'Mural de conversas', icone: 'mural', perfis: TODOS, contador: 'mensagens_nao_lidas' },
      { para: '/ajuda', rotulo: 'Ajuda e suporte (SAC)', icone: 'ajuda', perfis: TODOS },
    ],
  },
];

const INTERVALO = 30000;

export default function LayoutApp() {
  const { usuario, sair } = useAuth();
  const toast = useToast();
  const [menuAberto, setMenuAberto] = useState(false);
  const [contadores, setContadores] = useState({});
  const [tema, setTema] = useState(temaAtual);
  const location = useLocation();
  const botaoMenu = useRef(null);
  const primeiroLink = useRef(null);
  const naoLidasAntes = useRef(null);

  // Fecha o menu ao trocar de página
  useEffect(() => setMenuAberto(false), [location.pathname]);

  // Esc fecha o menu e devolve o foco ao botão
  useEffect(() => {
    if (!menuAberto) return undefined;
    primeiroLink.current?.focus({ preventScroll: true });
    const aoTeclar = (e) => {
      if (e.key === 'Escape') {
        setMenuAberto(false);
        botaoMenu.current?.focus();
      }
    };
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [menuAberto]);

  // Contadores do menu e aviso de mensagem nova
  useEffect(() => {
    let ativo = true;
    async function atualizar() {
      if (document.hidden) return;
      try {
        const r = await api.get('/pendencias/resumo');
        if (!ativo) return;
        setContadores(r);
        if (naoLidasAntes.current !== null && r.mensagens_nao_lidas > naoLidasAntes.current && !location.pathname.startsWith('/comunicacao')) {
          toast('Você recebeu uma nova mensagem no mural.', 'info');
        }
        naoLidasAntes.current = r.mensagens_nao_lidas;
      } catch {
        /* sem conexão: tenta de novo no próximo ciclo */
      }
    }
    atualizar();
    const id = setInterval(atualizar, INTERVALO);
    // Outras telas avisam quando algo mudou (ex.: leu mensagens, resolveu pendência)
    window.addEventListener('kfka:atualizar-contadores', atualizar);
    return () => {
      ativo = false;
      clearInterval(id);
      window.removeEventListener('kfka:atualizar-contadores', atualizar);
    };
  }, [toast, location.pathname]);

  useEffect(() => {
    const aoMudar = (e) => setTema(e.detail);
    window.addEventListener('kfka:tema', aoMudar);
    return () => window.removeEventListener('kfka:tema', aoMudar);
  }, []);

  const secoes = MENU.map((s) => ({ ...s, itens: s.itens.filter((m) => m.perfis.includes(usuario.perfil)) })).filter(
    (s) => s.itens.length
  );
  let indice = 0;

  return (
    <>
      <a className="pular-conteudo" href="#conteudo">
        Pular para o conteúdo
      </a>
      <header className="mobile-bar">
        <Logo />
        <button
          ref={botaoMenu}
          type="button"
          className="botao-menu"
          aria-label={menuAberto ? 'Fechar menu' : 'Abrir menu'}
          aria-expanded={menuAberto}
          aria-controls="menu-lateral"
          onClick={() => setMenuAberto((v) => !v)}
        >
          <Icone nome={menuAberto ? 'fechar' : 'menu'} tamanho={20} />
          {!menuAberto && contadores.altas > 0 && <span className="ponto-alerta" aria-hidden="true" />}
        </button>
      </header>

      <div className="app-shell">
        {/* Fundo escuro do menu no celular: fica DENTRO do .app-shell, na mesma camada
            do menu (z-index 30 < 40), senão cobriria os próprios links */}
        <div className={`menu-fundo${menuAberto ? ' visivel' : ''}`} onClick={() => setMenuAberto(false)} />

        <aside className={`sidebar${menuAberto ? ' aberta' : ''}`} id="menu-lateral">
          <Logo />
          <nav className="sidebar-nav" aria-label="Menu principal">
            {secoes.map((s) => (
              <div className="menu-secao" key={s.secao}>
                <p className="menu-secao-titulo">{s.secao}</p>
                {s.itens.map((m) => {
                  const n = m.contador ? contadores[m.contador] || 0 : 0;
                  const ref = indice++ === 0 ? primeiroLink : undefined;
                  return (
                    <NavLink key={m.para} to={m.para} ref={ref} className={({ isActive }) => (isActive ? 'active' : undefined)}>
                      <Icone nome={m.icone} />
                      <span className="menu-rotulo">{m.rotulo}</span>
                      {n > 0 && (
                        <span className="menu-contador" aria-label={`${n} ${m.contador === 'pendencias' ? 'pendência(s)' : 'não lida(s)'}`}>
                          {n > 99 ? '99+' : n}
                        </span>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            ))}
          </nav>

          <div className="sidebar-user">
            <Link to="/perfil" className="sidebar-perfil" aria-label="Meu perfil">
              <Avatar nome={usuario.nome} foto={usuario.foto} tamanho={36} />
              <span>
                <strong>{usuario.nome}</strong>
                <small>{ROTULO_PERFIL[usuario.perfil]}</small>
              </span>
            </Link>
            <div className="sidebar-acoes">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => definirTema(tema === 'claro' ? 'escuro' : 'claro')}
                aria-label={tema === 'claro' ? 'Usar tema escuro' : 'Usar tema claro'}
                title={tema === 'claro' ? 'Tema escuro' : 'Tema claro'}
              >
                <Icone nome={tema === 'claro' ? 'lua' : 'sol'} tamanho={16} />
                {tema === 'claro' ? 'Escuro' : 'Claro'}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={sair}>
                <Icone nome="sair" tamanho={16} /> Sair
              </button>
            </div>
          </div>
        </aside>

        <main className="app-main" id="conteudo" tabIndex={-1}>
          <Outlet />
        </main>
      </div>

      <CookieBanner />
    </>
  );
}
