// App.jsx — mapa de rotas do site (React Router).
//
//   Públicas:  /  /login  /cadastro  /privacidade  /termos  /redefinir-senha
//   Internas (login obrigatório; algumas exigem perfil — a API confere de novo):
//     todos:        /painel /pendencias /calendario /comunicacao /ajuda /perfil
//     coordenação:  /revisao /alunos /professores /turmas /auditoria
//     coordenação e professor: /relatorios (o professor vê só os próprios registros)
//   /aceite: termo de uso dos dados (LGPD) para responsável cadastrado pela escola
//     professor:    /notas /aulas
//     responsável:  /boletim
//     mistas:       /atividades (prof., resp.) · /justificativas, /documentos (coord., resp.) · /ocorrencias (coord., prof.)
//   Qualquer outro endereço: página "não encontrada" (404)

import { Navigate, Route, Routes } from 'react-router-dom';
import LayoutApp from './componentes/LayoutApp';
import RotaProtegida from './componentes/RotaProtegida';
import Inicio from './paginas/Inicio';
import Login from './paginas/Login';
import Cadastro from './paginas/Cadastro';
import Privacidade from './paginas/Privacidade';
import Termos from './paginas/Termos';
import RedefinirSenha from './paginas/RedefinirSenha';
import Painel from './paginas/Painel';
import NotasFaltas, { PaginaBoletim } from './paginas/NotasFaltas';
import Revisao from './paginas/Revisao';
import Comunicacao from './paginas/Comunicacao';
import Perfil from './paginas/Perfil';
import Pendencias from './paginas/Pendencias';
import Calendario from './paginas/Calendario';
import Aulas from './paginas/Aulas';
import Atividades from './paginas/Atividades';
import Ajuda from './paginas/Ajuda';
import Alunos from './paginas/Alunos';
import Professores from './paginas/Professores';
import Estrutura from './paginas/Estrutura';
import Justificativas from './paginas/Justificativas';
import Documentos from './paginas/Documentos';
import DocumentoVer from './paginas/DocumentoVer';
import Ocorrencias from './paginas/Ocorrencias';
import Relatorios from './paginas/Relatorios';
import Auditoria from './paginas/Auditoria';
import Aceite from './paginas/Aceite';
import NaoEncontrada from './paginas/NaoEncontrada';

const ADMIN = ['admin'];
const PROF = ['professor'];
const RESP = ['responsavel'];

// Atalho: rota que exige um dos perfis
const so = (perfis, elemento) => <RotaProtegida perfis={perfis}>{elemento}</RotaProtegida>;

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Inicio />} />
      <Route path="/login" element={<Login />} />
      <Route path="/cadastro" element={<Cadastro />} />
      <Route path="/privacidade" element={<Privacidade />} />
      <Route path="/termos" element={<Termos />} />
      <Route path="/redefinir-senha" element={<RedefinirSenha />} />
      <Route path="/aceite" element={so(RESP, <Aceite />)} />

      {/* Telas internas: mesma moldura (menu lateral) e login obrigatório */}
      <Route
        element={
          <RotaProtegida>
            <LayoutApp />
          </RotaProtegida>
        }
      >
        <Route path="/painel" element={<Painel />} />
        <Route path="/pendencias" element={<Pendencias />} />
        <Route path="/calendario" element={<Calendario />} />
        <Route path="/comunicacao" element={<Comunicacao />} />
        <Route path="/mural" element={<Navigate to="/comunicacao" replace />} />
        <Route path="/ajuda" element={<Ajuda />} />
        <Route path="/perfil" element={<Perfil />} />

        <Route path="/notas" element={so(['professor', 'responsavel'], <NotasFaltas />)} />
        <Route path="/boletim" element={so(RESP, <PaginaBoletim />)} />
        <Route path="/aulas" element={so(PROF, <Aulas />)} />
        <Route path="/atividades" element={so(['professor', 'responsavel'], <Atividades />)} />
        <Route path="/justificativas" element={so(['admin', 'responsavel'], <Justificativas />)} />
        <Route path="/documentos" element={so(['admin', 'responsavel'], <Documentos />)} />
        <Route path="/documentos/:id" element={so(['admin', 'responsavel'], <DocumentoVer />)} />
        <Route path="/ocorrencias" element={so(['admin', 'professor'], <Ocorrencias />)} />

        <Route path="/revisao" element={so(ADMIN, <Revisao />)} />
        <Route path="/alunos" element={so(ADMIN, <Alunos />)} />
        <Route path="/professores" element={so(ADMIN, <Professores />)} />
        <Route path="/turmas" element={so(ADMIN, <Estrutura />)} />
        <Route path="/auditoria" element={so(ADMIN, <Auditoria />)} />
        <Route path="/relatorios" element={so(['admin', 'professor'], <Relatorios />)} />
      </Route>

      {/* Endereços da versão HTML antiga continuam funcionando */}
      <Route path="/index.html" element={<Navigate to="/" replace />} />
      <Route path="/login.html" element={<Navigate to="/login" replace />} />
      <Route path="/dashboard.html" element={<Navigate to="/painel" replace />} />

      <Route path="*" element={<NaoEncontrada />} />
    </Routes>
  );
}
