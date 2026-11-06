// Documentos.jsx — consulta e solicitação de documentos escolares.
//  Responsável: pede declarações, histórico e boletim; acompanha a situação; abre o documento disponível.
//  Coordenação: analisa, emite (a plataforma gera o documento com código de validação) ou recusa com justificativa.

import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/cliente';
import { useTitulo } from '../componentes/Basicos';
import { ErroEstado, LinhaEstado, LinhasEsqueleto, Vazio } from '../componentes/Estado';
import { Aviso, Campo, ErroFormulario } from '../componentes/Formulario';
import Icone from '../componentes/Icone';
import { BadgeDe, Detalhe, Topo, Paginacao } from '../componentes/Interface';
import Janela from '../componentes/Janela';
import { useAuth } from '../contexto/AuthContext';
import { useToast } from '../contexto/ToastContext';
import { useApi } from '../hooks/useApi';
import { useListaPaginada, useItemAberto } from '../hooks/useListaPaginada';
import { useFormulario } from '../hooks/useFormulario';
import { formatarDataHora } from '../util/formato';
import { STATUS } from '../util/status';

function FormSolicitacao({ tipos, filhos, tipoInicial, onFechar, onSalvo }) {
  const toast = useToast();
  const f = useFormulario({ aluno_id: String(filhos[0]?.id || ''), tipo: tipoInicial || '', finalidade: '' });
  const [enviando, setEnviando] = useState(false);
  const outro = f.valores.tipo === 'OUTRO';

  async function salvar(e) {
    e.preventDefault();
    const ok = f.validar({
      aluno_id: (x) => (!x ? 'Escolha o aluno.' : ''),
      tipo: (x) => (!x ? 'Escolha o documento.' : ''),
      finalidade: (x) => (outro && x.trim().length < 5 ? 'Descreva qual documento você precisa.' : ''),
    });
    if (!ok) return;
    setEnviando(true);
    try {
      await api.post('/documentos', { aluno_id: Number(f.valores.aluno_id), tipo: f.valores.tipo, finalidade: f.valores.finalidade.trim() || null });
      toast('Solicitação enviada. Você acompanha a situação por aqui.');
      onSalvo();
    } catch (err) {
      f.errosDaApi(err);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Janela
      aberto
      onFechar={onFechar}
      titulo="Solicitar documento"
      onSubmit={salvar}
      rodape={
        <>
          <button type="button" className="btn btn-ghost" onClick={onFechar}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={enviando}>
            {enviando ? 'Enviando...' : 'Solicitar'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Campo nome="aluno_id" rotulo="Aluno" erro={f.erros.aluno_id}>
          <select value={f.valores.aluno_id} onChange={f.campo('aluno_id')}>
            {filhos.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome}
              </option>
            ))}
          </select>
        </Campo>
        <Campo nome="tipo" rotulo="Documento" erro={f.erros.tipo}>
          <select value={f.valores.tipo} onChange={f.campo('tipo')}>
            <option value="">Escolha...</option>
            {tipos.map((t) => (
              <option key={t.tipo} value={t.tipo.toUpperCase()}>
                {t.nome}
              </option>
            ))}
          </select>
        </Campo>
        <Campo
          nome="finalidade"
          rotulo={outro ? 'Qual documento e para quê' : 'Finalidade'}
          erro={f.erros.finalidade}
          opcional={!outro}
          className="col-2"
          dica={outro ? null : 'Ex.: apresentar no clube, bolsa de estudos, transferência.'}
        >
          <textarea rows={2} value={f.valores.finalidade} onChange={f.campo('finalidade')} maxLength={300} />
        </Campo>
      </div>
      <ErroFormulario>{f.erroGeral}</ErroFormulario>
    </Janela>
  );
}

function Atendimento({ d, onFechar, onSalvo }) {
  const toast = useToast();
  const f = useFormulario({ status: 'DISPONIVEL', justificativa: '' });
  const [enviando, setEnviando] = useState(false);
  const concluida = ['disponivel', 'recusado'].includes(d.status);
  const gerado = d.tipo !== 'outro';

  async function salvar(e) {
    e.preventDefault();
    if (!f.validar({ justificativa: (x, t) => (t.status === 'RECUSADO' && x.trim().length < 5 ? 'Informe o motivo da recusa.' : '') })) return;
    setEnviando(true);
    try {
      await api.patch(`/documentos/${d.id}`, { status: f.valores.status, justificativa: f.valores.justificativa.trim() || null });
      toast({ DISPONIVEL: 'Documento disponibilizado para a família.', RECUSADO: 'Solicitação recusada.', EM_ANALISE: 'Marcado como em análise.' }[f.valores.status]);
      window.dispatchEvent(new CustomEvent('kfka:atualizar-contadores'));
      onSalvo();
    } catch (err) {
      f.errosDaApi(err);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Janela
      aberto
      onFechar={onFechar}
      titulo={`${d.tipo_nome} — ${d.aluno}`}
      subtitulo={<BadgeDe tipo="documento" valor={d.status} />}
      onSubmit={concluida ? undefined : salvar}
      rodape={
        concluida ? (
          d.status === 'disponivel' &&
          gerado && (
            <Link className="btn btn-primary" to={`/documentos/${d.id}`}>
              Ver documento
            </Link>
          )
        ) : (
          <>
            <button type="button" className="btn btn-ghost" onClick={onFechar}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={enviando}>
              {enviando ? 'Salvando...' : 'Registrar'}
            </button>
          </>
        )
      }
    >
      <dl className="detalhes">
        <Detalhe rotulo="Solicitado por">
          {d.solicitante} em {formatarDataHora(d.criado_em)}
        </Detalhe>
        <Detalhe rotulo="Matrícula">{d.matricula}</Detalhe>
        <Detalhe rotulo="Finalidade">{d.finalidade}</Detalhe>
        {d.atendido_por && (
          <Detalhe rotulo="Atendido por">
            {d.atendido_por} em {formatarDataHora(d.atendido_em)}
          </Detalhe>
        )}
        {d.codigo_validacao && <Detalhe rotulo="Código de validação">{d.codigo_validacao}</Detalhe>}
      </dl>
      {d.justificativa && <p className="motivo-box">{d.justificativa}</p>}
      {!concluida && (
        <>
          <div className="form-grid">
            <Campo nome="status" rotulo="Decisão">
              <select value={f.valores.status} onChange={f.campo('status')}>
                <option value="DISPONIVEL">{gerado ? 'Emitir e disponibilizar' : 'Marcar como pronto para retirada'}</option>
                <option value="EM_ANALISE">Em análise</option>
                <option value="RECUSADO">Recusar</option>
              </select>
            </Campo>
            <Campo
              nome="justificativa"
              rotulo={f.valores.status === 'RECUSADO' ? 'Motivo da recusa' : 'Observação para a família'}
              erro={f.erros.justificativa}
              opcional={f.valores.status !== 'RECUSADO'}
              className="col-2"
            >
              <textarea rows={2} value={f.valores.justificativa} onChange={f.campo('justificativa')} maxLength={500} />
            </Campo>
          </div>
          {gerado && f.valores.status === 'DISPONIVEL' && (
            <Aviso tom="info">O documento é gerado com os dados atuais do banco (matrícula, frequência e boletins publicados) e recebe um código de validação.</Aviso>
          )}
          {!gerado && <Aviso tom="warn">“Outro documento” não é gerado pela plataforma: informe na observação como e quando retirar na secretaria.</Aviso>}
        </>
      )}
      <ErroFormulario>{f.erroGeral}</ErroFormulario>
    </Janela>
  );
}

function Tabela({ lista, ehAdmin, onAbrir }) {
  const col = ehAdmin ? 6 : 5;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th scope="col">Documento</th>
            <th scope="col">Aluno</th>
            {ehAdmin && <th scope="col">Solicitante</th>}
            <th scope="col">Solicitado em</th>
            <th scope="col">Situação</th>
            <th scope="col">
              <span className="sr-only">Ações</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {!lista && <LinhasEsqueleto colunas={col} linhas={3} />}
          {lista && !lista.length && (
            <LinhaEstado colunas={col}>
              <Vazio>Nenhuma solicitação.</Vazio>
            </LinhaEstado>
          )}
          {lista?.map((d) => (
            <tr key={d.id}>
              <td data-rotulo="Documento">
                <strong>{d.tipo_nome}</strong>
                {d.finalidade && (
                  <>
                    <br />
                    <small className="texto-secundario">{d.finalidade}</small>
                  </>
                )}
              </td>
              <td data-rotulo="Aluno">{d.aluno}</td>
              {ehAdmin && <td data-rotulo="Solicitante">{d.solicitante}</td>}
              <td data-rotulo="Solicitado em">{formatarDataHora(d.criado_em)}</td>
              <td data-rotulo="Situação">
                <BadgeDe tipo="documento" valor={d.status} />
                {!ehAdmin && d.status === 'recusado' && d.justificativa && <p className="retorno">{d.justificativa}</p>}
                {!ehAdmin && d.status === 'disponivel' && d.tipo === 'outro' && d.justificativa && <p className="retorno">{d.justificativa}</p>}
              </td>
              <td>
                {ehAdmin ? (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => onAbrir(d.id)}>
                    {['solicitado', 'em_analise'].includes(d.status) ? 'Atender' : 'Ver'}
                  </button>
                ) : (
                  d.status === 'disponivel' &&
                  d.tipo !== 'outro' && (
                    <Link className="btn btn-primary btn-sm" to={`/documentos/${d.id}`}>
                      <Icone nome="imprimir" tamanho={14} /> Abrir
                    </Link>
                  )
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Documentos() {
  useTitulo('Documentos escolares');
  const { usuario } = useAuth();
  const ehAdmin = usuario.perfil === 'admin';
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState('');
  const [pedido, setPedido] = useState(null);
  const tipos = useApi(() => api.get('/documentos/tipos'), []);
  const filhos = useApi(() => (ehAdmin ? Promise.resolve([]) : api.get('/alunos')), []);
  const lista = useListaPaginada(`/documentos${status ? `?status=${status}` : ''}`);
  const abrir = Number(params.get('abrir')) || null;
  const aberta = useItemAberto(lista.dados, abrir, '/documentos');

  return (
    <>
      <Topo
        titulo="Documentos escolares"
        descricao={ehAdmin ? 'Atenda os pedidos de declarações, histórico e boletim.' : 'Solicite declarações, histórico e boletim e acompanhe cada pedido.'}
      >
        {!ehAdmin && (
          <button type="button" className="btn btn-primary" onClick={() => setPedido('')} disabled={!filhos.dados?.length}>
            <Icone nome="mais" tamanho={16} /> Solicitar documento
          </button>
        )}
      </Topo>

      {!ehAdmin && tipos.dados && (
        <section>
          <h2 className="secao-titulo">Documentos disponíveis</h2>
          <div className="grade-tipos">
            {tipos.dados.map((t) => (
              <button key={t.tipo} type="button" className="tipo-documento" onClick={() => setPedido(t.tipo.toUpperCase())} disabled={!filhos.dados?.length}>
                <Icone nome={t.gerado ? 'boletim' : 'documentos'} tamanho={22} />
                <strong>{t.nome}</strong>
                <span className="texto-secundario">{t.descricao}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="linha-acao">
        <h2 className="secao-titulo">{ehAdmin ? 'Solicitações' : 'Histórico de solicitações'}</h2>
        <label className="campo-filtro">
          <span className="sr-only">Situação</span>
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todas as situações</option>
            {Object.entries(STATUS.documento).map(([v, [r]]) => (
              <option key={v} value={v.toUpperCase()}>
                {r}
              </option>
            ))}
          </select>
        </label>
      </div>
      {lista.erro ? <ErroEstado mensagem={lista.erro} onTentarNovamente={lista.recarregar} /> : <Tabela lista={lista.dados} ehAdmin={ehAdmin} onAbrir={(id) => setParams({ abrir: id })} />}
      <Paginacao meta={lista.meta} onPagina={lista.setPagina} rotulo="solicitação(ões)" />

      {pedido !== null && tipos.dados && filhos.dados && (
        <FormSolicitacao
          tipos={tipos.dados}
          filhos={filhos.dados}
          tipoInicial={pedido}
          onFechar={() => setPedido(null)}
          onSalvo={() => {
            setPedido(null);
            lista.recarregar({ silencioso: true });
          }}
        />
      )}
      {ehAdmin && aberta && (
        <Atendimento
          key={aberta.id + aberta.status}
          d={aberta}
          onFechar={() => setParams({})}
          onSalvo={() => {
            setParams({});
            lista.recarregar({ silencioso: true });
          }}
        />
      )}
      {!ehAdmin && aberta && (
        <Janela aberto onFechar={() => setParams({})} titulo={`${aberta.tipo_nome} — ${aberta.aluno}`} subtitulo={<BadgeDe tipo="documento" valor={aberta.status} />}>
          <dl className="detalhes">
            <Detalhe rotulo="Solicitado em">{formatarDataHora(aberta.criado_em)}</Detalhe>
            <Detalhe rotulo="Finalidade">{aberta.finalidade}</Detalhe>
          </dl>
          {aberta.justificativa && <p className="motivo-box">{aberta.justificativa}</p>}
          {aberta.status === 'disponivel' && aberta.tipo !== 'outro' && (
            <Link className="btn btn-primary" to={`/documentos/${aberta.id}`}>
              Abrir documento
            </Link>
          )}
        </Janela>
      )}
    </>
  );
}
