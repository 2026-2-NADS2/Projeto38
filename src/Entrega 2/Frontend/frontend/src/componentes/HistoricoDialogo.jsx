// HistoricoDialogo.jsx — linha do tempo da auditoria de um lançamento.
// Os eventos vêm da tabela historico_acompanhamento, preenchida pelos triggers do banco.
// Embaixo, o retorno da família (ciência e observação do responsável, com autor e data — RF12).
//
//   <HistoricoDialogo id={idAberto} onFechar={() => setIdAberto(null)} />

import { useEffect, useState } from 'react';
import { api } from '../api/cliente';
import { ROTULO_PERFIL, ROTULO_STATUS, formatarDataHora, formatarNota } from '../util/formato';
import Dialogo from './Dialogo';
import { Carregando, ErroEstado } from './Estado';

const rotulo = (s) => ROTULO_STATUS[s] || s;

function Titulo({ e }) {
  if (e.acao === 'CRIACAO') {
    return (
      <>
        Criou o lançamento como <strong>{rotulo(e.status_novo)}</strong>
      </>
    );
  }
  if (e.acao === 'MUDANCA_STATUS') {
    return (
      <>
        <strong>{rotulo(e.status_anterior)}</strong> → <strong>{rotulo(e.status_novo)}</strong>
      </>
    );
  }
  return 'Editou o lançamento';
}

function mudancas(e) {
  if (e.acao === 'CRIACAO') return [`Média ${formatarNota(e.media_nova)} · ${e.faltas_nova} falta(s)`];
  const itens = [];
  if (Number(e.media_anterior) !== Number(e.media_nova)) {
    itens.push(`Média: ${formatarNota(e.media_anterior)} → ${formatarNota(e.media_nova)}`);
  }
  if (e.faltas_anterior !== null && Number(e.faltas_anterior) !== Number(e.faltas_nova)) {
    itens.push(`Faltas: ${e.faltas_anterior} → ${e.faltas_nova}`);
  }
  if (e.descricao_anterior !== null && e.descricao_anterior !== e.descricao_nova) itens.push('Parecer alterado');
  return itens;
}

export default function HistoricoDialogo({ id, onFechar }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    if (!id) return;
    let ativo = true;
    setDados(null);
    setErro(null);
    api
      .get(`/acompanhamentos/${id}/historico`)
      .then((d) => ativo && setDados(d))
      .catch((err) => ativo && setErro(err.message));
    return () => {
      ativo = false;
    };
  }, [id]);

  const r = dados?.registro;

  return (
    <Dialogo aberto={Boolean(id)} onFechar={onFechar} className="dialogo-largo" rotuloId="historico-titulo">
      <div className="dialogo-conteudo">
        <header className="dialogo-topo">
          <div>
            <h2 id="historico-titulo">Histórico do lançamento</h2>
            {r && (
              <p className="texto-secundario">
                {r.aluno} · {r.disciplina} · {r.bimestre}º bimestre · versão {r.versao}
              </p>
            )}
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onFechar} aria-label="Fechar">
            ✕
          </button>
        </header>

        {erro && <ErroEstado mensagem={erro} />}
        {!erro && !dados && <Carregando texto="Carregando histórico..." />}
        {dados && (
          <ol className="linha-tempo">
            {dados.eventos.map((e) => {
              const itens = mudancas(e);
              return (
                <li key={e.id} className={`evento evento-${e.status_novo}`}>
                  <p className="evento-titulo">
                    <Titulo e={e} />
                  </p>
                  {itens.length > 0 && <p className="evento-mudancas">{itens.join(' · ')}</p>}
                  {e.observacao && <blockquote className="evento-obs">{e.observacao}</blockquote>}
                  <p className="evento-autor">
                    {e.usuario} ({ROTULO_PERFIL[e.perfil] || e.perfil}) · {formatarDataHora(e.data_hora)}
                  </p>
                </li>
              );
            })}
          </ol>
        )}
        {dados && (
          <section className="retornos-familia" aria-labelledby="retornos-titulo">
            <h3 id="retornos-titulo">Retorno da família</h3>
            {dados.ciencias?.length ? (
              <ul className="lista-retornos">
                {dados.ciencias.map((c, i) => (
                  <li key={i}>
                    <p className="evento-autor">
                      <strong>{c.responsavel}</strong>
                      {c.parentesco ? ` (${c.parentesco})` : ''} · ciência em {formatarDataHora(c.data_ciencia)}
                    </p>
                    {c.observacao ? <blockquote className="evento-obs">{c.observacao}</blockquote> : <p className="texto-secundario">Sem observação.</p>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="texto-secundario">
                {r?.status === 'publicado' ? 'A família ainda não confirmou a ciência.' : 'O retorno da família aparece depois da publicação.'}
              </p>
            )}
          </section>
        )}
      </div>
    </Dialogo>
  );
}
