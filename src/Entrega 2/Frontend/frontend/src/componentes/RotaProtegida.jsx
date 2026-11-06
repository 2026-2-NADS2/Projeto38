// RotaProtegida.jsx — só deixa entrar quem está logado (e com o perfil certo).
//   <RotaProtegida perfis={['admin']}><Revisao /></RotaProtegida>

import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexto/AuthContext';
import { Carregando } from './Estado';

export default function RotaProtegida({ perfis, children }) {
  const { usuario, carregando } = useAuth();
  const location = useLocation();

  if (carregando) {
    return (
      <div className="tela-cheia">
        <Carregando texto="Verificando sua sessão..." />
      </div>
    );
  }
  // Não logado: vai para o login e volta para cá depois de entrar
  if (!usuario) return <Navigate to="/login" replace state={{ de: location.pathname }} />;
  // Responsável cuja conta foi criada pela escola: aceita o termo (LGPD) antes de ver os dados
  if (usuario.aceite_pendente && location.pathname !== '/aceite') return <Navigate to="/aceite" replace />;
  // Logado, mas sem permissão para esta tela
  if (perfis && !perfis.includes(usuario.perfil)) return <Navigate to="/painel" replace />;

  return children;
}
