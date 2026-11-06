// Aceite.jsx — termo de uso dos dados (LGPD) no primeiro acesso de um responsável cuja conta foi
// criada pela escola. Enquanto não houver aceite, a API recusa os dados dos alunos (403 ACEITE_PENDENTE);
// o aceite é gravado no banco (responsavel.aceite_lgpd_em) e fica na auditoria.

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/cliente';
import { Logo, usePaginaPublica, useTitulo } from '../componentes/Basicos';
import BotaoAcao from '../componentes/BotaoAcao';
import { ErroFormulario } from '../componentes/Formulario';
import { useAuth } from '../contexto/AuthContext';

export default function Aceite() {
  useTitulo('Termo de uso dos dados');
  usePaginaPublica();
  const { usuario, atualizarUsuario, sair } = useAuth();
  const navigate = useNavigate();
  const [marcado, setMarcado] = useState(false);
  const [erro, setErro] = useState('');

  async function aceitar() {
    if (!marcado) {
      setErro('Marque a caixa confirmando que leu e aceita o termo.');
      document.getElementById('aceite-lgpd')?.focus();
      throw new Error('sem aceite');
    }
    try {
      await api.post('/perfil/aceite', { aceite: true });
      atualizarUsuario({ aceite_pendente: false });
      navigate('/painel', { replace: true });
    } catch (err) {
      setErro(err.message);
      throw err;
    }
  }

  return (
    <main className="pagina-texto pagina-aceite">
      <Logo />
      <h1>Antes de continuar</h1>
      <p>
        Olá{usuario?.nome ? `, ${usuario.nome.split(' ')[0]}` : ''}! A escola criou a sua conta para que você acompanhe a vida escolar dos
        alunos vinculados a você. Para ver as informações, leia e aceite como os dados são usados.
      </p>

      <h2>O que a plataforma guarda</h2>
      <ul>
        <li>Seus dados de acesso (nome, e-mail, telefone opcional) e a data deste aceite.</li>
        <li>Dos alunos: nome, matrícula, turma, notas, faltas e pareceres publicados pela coordenação.</li>
        <li>As confirmações de ciência e as observações que você enviar à escola.</li>
      </ul>

      <h2>Para que e quem vê</h2>
      <ul>
        <li>Somente para o acompanhamento escolar; nada é vendido nem compartilhado com terceiros.</li>
        <li>Você vê apenas os alunos vinculados à sua conta e só o que já foi revisado e publicado.</li>
        <li>Professores veem as próprias turmas; a coordenação, o necessário para a gestão escolar.</li>
      </ul>

      <h2>Seus direitos</h2>
      <p>
        Você pode baixar uma cópia dos seus dados em “Meu perfil”, pedir correção ou exclusão e revogar este consentimento pelo “Ajuda e
        suporte”. Leia a <Link to="/privacidade">Política de Privacidade</Link> e os <Link to="/termos">Termos de uso</Link> completos.
      </p>

      <label className="check-linha aceite-check">
        <input
          id="aceite-lgpd"
          type="checkbox"
          checked={marcado}
          aria-required="true"
          aria-invalid={erro && !marcado ? true : undefined}
          aria-describedby={erro ? 'aceite-erro' : undefined}
          onChange={(e) => {
            setMarcado(e.target.checked);
            setErro('');
          }}
        />
        Li e aceito o uso dos meus dados e dos dados dos alunos vinculados, conforme descrito acima.
      </label>
      <div id="aceite-erro">
        <ErroFormulario>{erro}</ErroFormulario>
      </div>

      <div className="acoes-aceite">
        <button type="button" className="btn btn-ghost" onClick={sair}>
          Agora não (sair)
        </button>
        <BotaoAcao textoOcupado="Registrando..." onAcao={aceitar}>
          Aceitar e continuar
        </BotaoAcao>
      </div>
    </main>
  );
}
