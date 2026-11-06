// Lancamentos.jsx — planilha do professor: turma -> disciplina -> bimestre.

import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/cliente';
import { Carregando, ErroEstado, Vazio } from '../../componentes/Estado';
import HistoricoDialogo from '../../componentes/HistoricoDialogo';
import { formatarDataHora } from '../../util/formato';
import CartaoLancamento from './CartaoLancamento';

function AvisoJanela({ bimestre: b }) {
  if (!b) return null;
  return (
    <p className={`aviso ${b.aberto ? 'aviso-ok' : 'aviso-fechado'}`} role="status">
      {b.aberto
        ? `Digitação do ${b.numero}º bimestre aberta até ${formatarDataHora(b.digitacao_fim)}.`
        : `Digitação do ${b.numero}º bimestre fechada (de ${formatarDataHora(b.digitacao_inicio)} a ${formatarDataHora(
            b.digitacao_fim
          )}). Os lançamentos podem ser consultados, mas não alterados.`}
    </p>
  );
}

export default function Lancamentos() {
  // Dados de apoio (carregados uma vez)
  const [base, setBase] = useState(null); // { turmas, tags, bimestres }
  const [erroBase, setErroBase] = useState(null);
  // Filtros escolhidos
  const [turma, setTurma] = useState(null);
  const [disciplinas, setDisciplinas] = useState(null);
  const [disciplina, setDisciplina] = useState(null);
  const [bimestre, setBimestre] = useState(null);
  // Planilha
  const [planilha, setPlanilha] = useState(null);
  const [erro, setErro] = useState(null);
  const [realce, setRealce] = useState(null); // aluno salvo por último (para destacar o status)
  const [historicoId, setHistoricoId] = useState(null);

  const carregarBase = useCallback(async () => {
    setErroBase(null);
    try {
      const [turmas, tags, bimestres] = await Promise.all([api.get('/turmas'), api.get('/tags'), api.get('/bimestres')]);
      setBase({ turmas, tags, bimestres });
      if (turmas.length) setTurma(turmas[0].id);
      // Começa pelo bimestre com digitação aberta (ou o último)
      const inicial = bimestres.find((b) => b.aberto) || bimestres[bimestres.length - 1];
      if (inicial) setBimestre(inicial.id);
    } catch (err) {
      setErroBase(err.message);
    }
  }, []);

  useEffect(() => {
    carregarBase();
  }, [carregarBase]);

  // Ao trocar de turma: disciplinas que o professor leciona nela
  useEffect(() => {
    if (!turma) return undefined;
    let ativo = true;
    setDisciplinas(null);
    setDisciplina(null);
    api
      .get(`/disciplinas?turma_id=${turma}`)
      .then((lista) => {
        if (!ativo) return;
        setDisciplinas(lista);
        setDisciplina(lista[0]?.id ?? null);
      })
      .catch((err) => ativo && setErro(err.message));
    return () => {
      ativo = false;
    };
  }, [turma]);

  const carregarPlanilha = useCallback(async () => {
    if (!turma || !disciplina || !bimestre) return;
    setErro(null);
    setPlanilha(null);
    try {
      setPlanilha(await api.get(`/acompanhamentos?turma_id=${turma}&disciplina_id=${disciplina}&bimestre_id=${bimestre}`));
    } catch (err) {
      setErro(err.message);
    }
  }, [turma, disciplina, bimestre]);

  useEffect(() => {
    carregarPlanilha();
  }, [carregarPlanilha]);

  // Atualiza só o aluno salvo (sem recarregar a lista)
  const aoSalvar = useCallback((alunoId, salvo) => {
    setPlanilha((p) => ({
      ...p,
      alunos: p.alunos.map((a) =>
        a.aluno_id === alunoId ? { ...a, acompanhamento: { ...a.acompanhamento, ...salvo, motivo_devolucao: null } } : a
      ),
    }));
    setRealce(alunoId);
  }, []);

  let conteudo;
  if (erroBase) conteudo = <ErroEstado mensagem={erroBase} onTentarNovamente={carregarBase} />;
  else if (!base) conteudo = <Carregando texto="Carregando suas turmas..." />;
  else if (!base.turmas.length) conteudo = <Vazio>Você ainda não tem turmas e disciplinas vinculadas. Fale com a coordenação.</Vazio>;
  else if (erro) conteudo = <ErroEstado mensagem={erro} onTentarNovamente={carregarPlanilha} />;
  else if (disciplinas && !disciplinas.length) conteudo = <Vazio>Você não leciona nenhuma disciplina nesta turma.</Vazio>;
  else if (!planilha) conteudo = <Carregando texto="Carregando alunos..." />;
  else if (!planilha.alunos.length) conteudo = <Vazio>Nenhum aluno matriculado nesta turma.</Vazio>;
  else {
    conteudo = planilha.alunos.map((item) => {
      const ac = item.acompanhamento;
      return (
        <CartaoLancamento
          // A chave muda quando o servidor devolve uma versão nova: o formulário recomeça com os dados salvos
          key={`${item.aluno_id}:${ac?.id ?? 'novo'}:${ac?.versao ?? 0}:${ac?.status ?? ''}`}
          item={item}
          tags={base.tags}
          janelaAberta={planilha.bimestre.aberto}
          filtros={{ disciplina, bimestre }}
          realce={realce === item.aluno_id}
          onSalvo={aoSalvar}
          onHistorico={setHistoricoId}
        />
      );
    });
  }

  return (
    <>
      <div className="app-topbar">
        <div>
          <h1>Notas e avaliações</h1>
          <p>Registre média, faltas e parecer de cada aluno. Depois de enviado, o lançamento passa pela revisão da coordenação.</p>
        </div>
      </div>

      {base && base.turmas.length > 0 && (
        <div className="filtros filtros-lancamento">
          <label className="campo-filtro">
            <span>Turma</span>
            <select className="select" value={turma ?? ''} onChange={(e) => setTurma(Number(e.target.value))}>
              {base.turmas.map((t) => (
                <option key={t.id} value={t.id}>{`${t.nome} (${t.total_alunos} alunos)`}</option>
              ))}
            </select>
          </label>
          <label className="campo-filtro">
            <span>Disciplina</span>
            <select className="select" value={disciplina ?? ''} disabled={!disciplinas}
              onChange={(e) => setDisciplina(Number(e.target.value))}>
              {!disciplinas && <option>Carregando...</option>}
              {disciplinas?.map((d) => (
                <option key={d.id} value={d.id}>{d.nome}</option>
              ))}
            </select>
          </label>
          <label className="campo-filtro">
            <span>Bimestre</span>
            <select className="select" value={bimestre ?? ''} onChange={(e) => setBimestre(Number(e.target.value))}>
              {base.bimestres.map((b) => (
                <option key={b.id} value={b.id}>{`${b.numero}º bimestre${b.aberto ? ' — digitação aberta' : ''}`}</option>
              ))}
            </select>
          </label>
        </div>
      )}

      <AvisoJanela bimestre={planilha?.bimestre} />
      <div className="lista-cartoes" aria-live="polite">{conteudo}</div>
      <HistoricoDialogo id={historicoId} onFechar={() => setHistoricoId(null)} />
    </>
  );
}
