// AuthContext.jsx — quem está logado, disponível para todo o app.
//   const { usuario, entrar, sair } = useAuth();

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, sessao } from '../api/cliente';
import { useToast } from './ToastContext';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [carregando, setCarregando] = useState(Boolean(sessao.token()));
  const navigate = useNavigate();
  const toast = useToast();

  // Ao abrir o site com um token salvo, confirma com a API se ele ainda vale
  useEffect(() => {
    if (!sessao.token()) return;
    let ativo = true;
    api
      .get('/auth/me')
      .then((u) => ativo && setUsuario(u))
      .catch((err) => {
        if (!ativo) return;
        if (err.status !== 401) {
          // Servidor fora do ar: usa os dados salvos para não travar a tela
          setUsuario(sessao.usuario());
          toast('Sem conexão com o servidor. Algumas informações podem estar desatualizadas.', 'erro');
        }
      })
      .finally(() => ativo && setCarregando(false));
    return () => {
      ativo = false;
    };
  }, [toast]);

  // Token expirado em qualquer requisição -> volta para o login
  useEffect(() => {
    const aoExpirar = () => {
      setUsuario(null);
      navigate('/login?sessao=expirada', { replace: true });
    };
    window.addEventListener('kfka:sessao-expirada', aoExpirar);
    return () => window.removeEventListener('kfka:sessao-expirada', aoExpirar);
  }, [navigate]);

  // Responsável sem aceite do termo (LGPD): a API recusa os dados até o aceite
  useEffect(() => {
    const aoPedirAceite = () => {
      setUsuario((u) => (u ? { ...u, aceite_pendente: true } : u));
      navigate('/aceite', { replace: true });
    };
    window.addEventListener('kfka:aceite-pendente', aoPedirAceite);
    return () => window.removeEventListener('kfka:aceite-pendente', aoPedirAceite);
  }, [navigate]);

  const entrar = useCallback((token, dadosUsuario, lembrar) => {
    sessao.salvar(token, dadosUsuario, lembrar);
    setUsuario(dadosUsuario);
  }, []);

  // Depois de editar o perfil (nome, foto), o menu mostra os dados novos na hora
  const atualizarUsuario = useCallback((parcial) => {
    setUsuario((atual) => {
      const novo = { ...atual, ...parcial };
      sessao.atualizarUsuario(novo);
      return novo;
    });
  }, []);

  // "Sair" avisa o servidor, que invalida este token na hora (não basta apagar no navegador)
  const sair = useCallback(async () => {
    if (sessao.token()) {
      try {
        await api.post('/auth/sair');
      } catch {
        /* sem conexão: o token some do navegador e expira sozinho */
      }
    }
    sessao.limpar();
    setUsuario(null);
    navigate('/login', { replace: true });
  }, [navigate]);

  return <AuthContext.Provider value={{ usuario, carregando, entrar, sair, atualizarUsuario }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
