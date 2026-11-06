// DocumentoVer.jsx — documento escolar gerado a partir do banco, pronto para imprimir ou salvar em PDF.

import { Link, useParams } from 'react-router-dom';
import { api } from '../api/cliente';
import { useTitulo } from '../componentes/Basicos';
import { Carregando, ErroEstado } from '../componentes/Estado';
import Icone from '../componentes/Icone';
import { useApi } from '../hooks/useApi';
import { formatarDia, formatarNota } from '../util/formato';

const TURNOS = { MANHA: 'manhã', TARDE: 'tarde', INTEGRAL: 'integral' };
const dataExtenso = (iso) =>
  new Date(iso).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });

function Corpo({ c }) {
  const a = c.aluno;
  const tipo = c.solicitacao.tipo;
  const identificacao = (
    <>
      <strong>{a.nome}</strong>, nascido(a) em {formatarDia(a.data_nascimento)}, matrícula nº {a.matricula}
    </>
  );

  if (tipo === 'declaracao_matricula') {
    return (
      <p className="doc-texto">
        Declaramos, para os devidos fins, que {identificacao}, está regularmente matriculado(a) nesta escola no ano letivo de {c.ano_letivo}
        {a.turma ? `, na turma ${a.turma} (${a.serie}º ano do Ensino Fundamental), no período da ${TURNOS[a.turno]}` : ''}.
      </p>
    );
  }

  if (tipo === 'declaracao_frequencia') {
    const f = c.frequencia;
    return (
      <>
        <p className="doc-texto">
          Declaramos, para os devidos fins, que {identificacao}, aluno(a) da turma {a.turma || '—'} no ano letivo de {c.ano_letivo}, apresenta a
          seguinte frequência nas aulas registradas até a data de emissão:
        </p>
        <table className="doc-tabela">
          <tbody>
            <tr>
              <th scope="row">Aulas registradas</th>
              <td>{f.aulas}</td>
            </tr>
            <tr>
              <th scope="row">Presenças</th>
              <td>{f.presencas}</td>
            </tr>
            <tr>
              <th scope="row">Faltas</th>
              <td>{f.faltas}</td>
            </tr>
            <tr>
              <th scope="row">Frequência</th>
              <td>{f.percentual === null ? '—' : `${String(f.percentual).replace('.', ',')}%`}</td>
            </tr>
          </tbody>
        </table>
      </>
    );
  }

  // Histórico escolar e boletim: médias publicadas por disciplina e bimestre
  return (
    <>
      <p className="doc-texto">
        {tipo === 'boletim' ? 'Boletim escolar' : 'Histórico escolar'} de {identificacao}, turma {a.turma || '—'}, ano letivo de {c.ano_letivo}. Constam
        apenas os resultados já publicados pela coordenação pedagógica.
      </p>
      {c.disciplinas.length ? (
        <table className="doc-tabela">
          <thead>
            <tr>
              <th scope="col">Disciplina</th>
              {[1, 2, 3, 4].map((n) => (
                <th scope="col" key={n}>
                  {n}º bim.
                </th>
              ))}
              <th scope="col">Média</th>
              <th scope="col">Faltas</th>
            </tr>
          </thead>
          <tbody>
            {c.disciplinas.map((d) => (
              <tr key={d.disciplina}>
                <td>{d.disciplina}</td>
                {[1, 2, 3, 4].map((n) => (
                  <td key={n}>{d.bimestres[n] === undefined ? '—' : formatarNota(d.bimestres[n])}</td>
                ))}
                <td>
                  <strong>{formatarNota(d.media)}</strong>
                </td>
                <td>{d.faltas}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="doc-texto">Ainda não há resultados publicados neste ano letivo.</p>
      )}
    </>
  );
}

export default function DocumentoVer() {
  const { id } = useParams();
  const { dados: c, erro, recarregar } = useApi(() => api.get(`/documentos/${id}/conteudo`), [id]);
  useTitulo(c ? `${c.solicitacao.tipo_nome} — ${c.aluno.nome}` : 'Documento');

  return (
    <>
      <div className="app-topbar nao-imprimir">
        <Link to="/documentos" className="link-botao voltar-link">
          <Icone nome="esquerda" tamanho={14} /> Voltar aos documentos
        </Link>
        {c && (
          <button type="button" className="btn btn-primary" onClick={() => window.print()}>
            <Icone nome="imprimir" tamanho={16} /> Imprimir / salvar PDF
          </button>
        )}
      </div>
      {erro && <ErroEstado mensagem={erro} onTentarNovamente={recarregar} />}
      {!erro && !c && <Carregando texto="Gerando documento..." />}
      {c && (
        <article className="documento-oficial">
          <header className="doc-cabecalho">
            <span className="logo-mark">[K]</span>
            <div>
              <strong>{c.escola.nome}</strong>
              <span>{c.escola.cidade}</span>
            </div>
          </header>
          <h1 className="doc-titulo">{c.solicitacao.tipo_nome}</h1>
          <Corpo c={c} />
          {c.solicitacao.finalidade && <p className="doc-texto">Finalidade informada: {c.solicitacao.finalidade}.</p>}
          <p className="doc-local">
            {c.escola.cidade.split(' – ')[0]}, {dataExtenso(c.emitido_em)}.
          </p>
          <div className="doc-assinatura">
            <span>{c.solicitacao.atendido_por}</span>
            <small>Coordenação pedagógica</small>
          </div>
          <footer className="doc-rodape">
            Documento emitido pela plataforma de acompanhamento escolar. Código de validação: <strong>{c.solicitacao.codigo_validacao}</strong>. Ambiente
            acadêmico de demonstração — dados fictícios.
          </footer>
        </article>
      )}
    </>
  );
}
