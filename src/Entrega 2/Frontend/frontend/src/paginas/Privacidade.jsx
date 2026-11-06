// Privacidade.jsx — política de privacidade (LGPD): finalidade, dados coletados e direitos.

import { Link } from 'react-router-dom';
import { Logo, usePaginaPublica, useTitulo } from '../componentes/Basicos';

export default function Privacidade() {
  useTitulo('Política de Privacidade');
  usePaginaPublica();

  return (
    <main className="pagina-texto">
      <Link to="/">
        <Logo />
      </Link>
      <h1>Política de Privacidade</h1>
      <p>
        A escola, por meio desta plataforma, trata dados pessoais apenas para o acompanhamento escolar dos alunos, seguindo a Lei Geral de
        Proteção de Dados (Lei nº 13.709/2018), com cuidado especial com os dados de crianças e adolescentes, sempre no melhor interesse
        deles (art. 14).
      </p>

      <h2>Quais dados coletamos</h2>
      <ul>
        <li>Usuários: nome, e-mail, telefone (opcional), foto de perfil (opcional) e, para responsáveis, a data do consentimento.</li>
        <li>
          Alunos: nome, matrícula, data de nascimento e turma; documento, e-mail, telefone e endereço apenas quando a escola precisar
          (opcionais e visíveis só para a coordenação).
        </li>
        <li>Acompanhamento: médias, faltas, pareceres, tags, confirmação de ciência, frequência das aulas e entregas de atividades.</li>
        <li>Solicitações: justificativas de faltas, pedidos de documentos e chamados de suporte.</li>
        <li>Ocorrências escolares, registradas apenas com o necessário e com acesso restrito.</li>
        <li>Registros de acesso e de alterações (auditoria), para garantir a segurança e a rastreabilidade.</li>
      </ul>

      <h2>Para que usamos</h2>
      <p>
        Para que professores registrem o acompanhamento, a coordenação revise antes da publicação e os responsáveis
        acompanhem a vida escolar dos alunos. Os dados não são vendidos nem compartilhados com terceiros.
      </p>

      <h2>Quem pode ver</h2>
      <ul>
        <li>Responsáveis veem apenas os alunos vinculados a eles, e só o que já foi publicado.</li>
        <li>Professores veem apenas as turmas e disciplinas em que lecionam; de uma justificativa de falta, veem só a situação.</li>
        <li>Ocorrências de saúde ou bem-estar ficam restritas à coordenação e a quem registrou.</li>
        <li>A coordenação acessa os dados necessários à gestão escolar.</li>
      </ul>

      <h2>Consentimento</h2>
      <p>
        Quem cria a própria conta aceita o termo no cadastro. Quando a conta do responsável é criada pela escola, o termo é apresentado no
        primeiro acesso e os dados dos alunos só aparecem depois do aceite. A data do aceite fica registrada.
      </p>

      <h2>Segurança</h2>
      <p>
        Senhas são guardadas com hash (bcrypt), o acesso é feito por sessão com prazo de expiração e encerrada na hora ao sair, ao trocar a
        senha ou quando a conta é desativada. Cada alteração no acompanhamento e as ações administrativas (cadastros, vínculos,
        publicações, exportações) ficam registradas com autor e data numa trilha de auditoria que não pode ser alterada. A auditoria não
        guarda senhas, tokens nem o texto dos pareceres.
      </p>

      <h2>Por quanto tempo guardamos</h2>
      <p>
        Os registros escolares (notas, frequência, pareceres e histórico) são mantidos pelo tempo que a escola é obrigada a guardá-los pela
        legislação educacional; o prazo exato é definido pela escola. Contas desativadas deixam de acessar a plataforma, mas o histórico
        escolar do aluno é preservado. Exportações em planilha são feitas só pela coordenação e ficam registradas.
      </p>

      <h2>Armazenamento no navegador</h2>
      <p>
        Usamos o armazenamento local do navegador apenas para manter sua sessão aberta e lembrar sua escolha sobre
        este aviso. Não usamos cookies de publicidade.
      </p>

      <h2>Seus direitos</h2>
      <p>
        Você pode baixar uma cópia dos seus dados a qualquer momento em “Meu perfil” → “Baixar meus dados”. Para pedir correção ou
        exclusão, ou revogar o consentimento, abra um chamado em “Ajuda e suporte” (categoria “Dados pessoais / LGPD”) ou fale com a
        coordenação da escola. Veja também os <Link to="/termos">Termos de uso</Link>.
      </p>

      <p style={{ marginTop: 'var(--space-lg)' }}>
        <Link to="/" className="btn btn-ghost">Voltar ao início</Link>
      </p>
    </main>
  );
}
