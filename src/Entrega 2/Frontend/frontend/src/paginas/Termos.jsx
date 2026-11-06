// Termos.jsx — termos de uso da plataforma (página pública).

import { Link } from 'react-router-dom';
import { Logo, usePaginaPublica, useTitulo } from '../componentes/Basicos';

export default function Termos() {
  useTitulo('Termos de uso');
  usePaginaPublica();

  return (
    <main className="pagina-texto">
      <Link to="/">
        <Logo />
      </Link>
      <h1>Termos de uso</h1>
      <p>
        Estes termos valem para todos que usam a plataforma de acompanhamento escolar: coordenação, professores e responsáveis. Ao entrar, você
        concorda com as regras abaixo.
      </p>

      <h2>1. Finalidade</h2>
      <p>
        A plataforma centraliza o acompanhamento escolar: notas, frequência, pareceres, atividades, calendário, documentos e a comunicação entre
        escola e família. Ela não substitui os canais oficiais da escola para situações urgentes.
      </p>

      <h2>2. Conta e senha</h2>
      <ul>
        <li>A conta é pessoal. Não compartilhe a senha; use “Sair” em computadores de uso comum.</li>
        <li>Responsáveis criam a conta com dados verdadeiros e só veem os alunos que a escola vinculou a eles.</li>
        <li>Se esquecer a senha, a coordenação gera um link de redefinição válido por 24 horas.</li>
      </ul>

      <h2>3. Uso adequado</h2>
      <ul>
        <li>Mensagens no mural devem ser respeitosas e tratar de assuntos escolares.</li>
        <li>É proibido divulgar fora da plataforma informações de outros alunos ou famílias.</li>
        <li>Professores registram notas, aulas e ocorrências com objetividade; tudo é revisado e fica no histórico.</li>
      </ul>

      <h2>4. Publicação das informações</h2>
      <p>
        Notas e pareceres só ficam visíveis para a família depois da revisão da coordenação. Correções feitas depois da publicação ficam registradas
        (data, autor e motivo).
      </p>

      <h2>5. Dados pessoais</h2>
      <p>
        O tratamento dos dados segue a <Link to="/privacidade">Política de Privacidade</Link> e a LGPD, com proteção especial aos dados de crianças e
        adolescentes. Pedidos de acesso, correção ou exclusão são feitos pela central de ajuda (SAC).
      </p>

      <h2>6. Disponibilidade</h2>
      <p>
        A plataforma pode ficar fora do ar para manutenção. Esta é uma versão acadêmica de demonstração (Projeto Interdisciplinar), com dados fictícios.
      </p>

      <p style={{ marginTop: 'var(--space-lg)' }}>
        <Link to="/" className="btn btn-ghost">
          Voltar ao início
        </Link>
      </p>
    </main>
  );
}
