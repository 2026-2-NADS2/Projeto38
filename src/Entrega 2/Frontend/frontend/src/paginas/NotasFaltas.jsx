// NotasFaltas.jsx — a mesma rota (/notas) mostra telas diferentes por perfil:
//   professor   -> lançamentos (média, faltas, parecer e tags)
//   responsável -> redireciona para /boletim (boletim publicado de cada filho)

import { Navigate, useLocation } from 'react-router-dom';
import { useTitulo } from '../componentes/Basicos';
import { useAuth } from '../contexto/AuthContext';
import Boletim from './notas/Boletim';
import Lancamentos from './notas/Lancamentos';

export default function NotasFaltas() {
  const { usuario } = useAuth();
  const { search } = useLocation();
  const ehResponsavel = usuario.perfil === 'responsavel';
  useTitulo(ehResponsavel ? 'Boletim escolar' : 'Notas e avaliações');
  // O boletim do responsável agora tem endereço próprio (/boletim); /notas continua funcionando
  return ehResponsavel ? <Navigate to={`/boletim${search}`} replace /> : <Lancamentos />;
}

// /boletim — página do responsável
export function PaginaBoletim() {
  useTitulo('Boletim escolar');
  return <Boletim />;
}
