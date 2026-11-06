// Vinculos.jsx — professor de cada disciplina na turma e dias da grade (com histórico).

import { useState } from 'react';
import { api } from '../../api/cliente';
import { Carregando, ErroEstado, LinhaEstado, LinhasEsqueleto, Vazio } from '../../componentes/Estado';
import { Aviso, Campo, ErroFormulario } from '../../componentes/Formulario';
import Icone from '../../componentes/Icone';
import { Badge } from '../../componentes/Interface';
import Janela from '../../componentes/Janela';
import { useConfirmar } from '../../contexto/ConfirmarContext';
import { useToast } from '../../contexto/ToastContext';
import { useApi } from '../../hooks/useApi';
import { useFormulario } from '../../hooks/useFormulario';
import { DIAS_SEMANA } from '../../util/status';
import Rodape from './Rodape';

export default function Vinculos() {
  const toast = useToast();
  const confirmar = useConfirmar();
  const apoio = useApi(async () => {
    const [turmas, disciplinas, professores] = await Promise.all([api.get('/turmas'), api.get('/disciplinas'), api.get('/usuarios?perfil=professor')]);
    return { turmas, disciplinas, professores: professores.filter((p) => p.ativo) };
  }, []);
  const [turma, setTurma] = useState('');
  const turmaAtual = turma || String(apoio.dados?.turmas[0]?.id || '');
  const lista = useApi(() => api.get(`/vinculos?turma_id=${turmaAtual}`), [turmaAtual], { ativo: Boolean(turmaAtual) });
  const [form, setForm] = useState(null);
  const f = useFormulario({ disciplina_id: '', professor_id: '', dias: [] });
  const [enviando, setEnviando] = useState(false);

  function abrir(v) {
    f.reiniciar({ disciplina_id: String(v?.disciplina_id || ''), professor_id: String(v?.professor_id || ''), dias: v?.dias || [] });
    setForm(v || {});
  }

  async function salvar(e) {
    e.preventDefault();
    if (!f.validar({ disciplina_id: (x) => (!x ? 'Escolha a disciplina.' : ''), professor_id: (x) => (!x ? 'Escolha o professor.' : '') })) return;
    setEnviando(true);
    try {
      await api.put('/vinculos', {
        turma_id: Number(turmaAtual),
        disciplina_id: Number(f.valores.disciplina_id),
        professor_id: Number(f.valores.professor_id),
        dias: f.valores.dias,
      });
      toast('Vínculo salvo.');
      setForm(null);
      lista.recarregar({ silencioso: true });
    } catch (err) {
      f.errosDaApi(err);
    } finally {
      setEnviando(false);
    }
  }

  async function remover(v) {
    if (!(await confirmar({ titulo: `Remover ${v.disciplina} desta turma?`, mensagem: `${v.professor} deixa de lecionar ${v.disciplina} no ${v.turma}.`, confirmar: 'Remover', perigo: true }))) return;
    try {
      await api.del(`/vinculos/${v.turma_id}/${v.disciplina_id}`);
      toast('Vínculo removido.');
      lista.recarregar({ silencioso: true });
    } catch (err) {
      toast(err.message, 'erro');
    }
  }

  if (apoio.erro) return <ErroEstado mensagem={apoio.erro} onTentarNovamente={apoio.recarregar} />;
  if (!apoio.dados) return <Carregando />;
  const usadas = new Set((lista.dados || []).map((v) => v.disciplina_id));

  return (
    <>
      <div className="linha-acao">
        <label className="campo-filtro">
          <span>Turma</span>
          <select className="select" value={turmaAtual} onChange={(e) => setTurma(e.target.value)}>
            {apoio.dados.turmas.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => abrir(null)} disabled={!turmaAtual}>
          <Icone nome="mais" tamanho={14} /> Adicionar disciplina
        </button>
      </div>
      <Aviso tom="info">Os dias de aula formam a grade da turma: é com ela que a plataforma aponta “aulas sem registro” para o professor.</Aviso>
      {lista.erro ? (
        <ErroEstado mensagem={lista.erro} onTentarNovamente={lista.recarregar} />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Disciplina</th>
                <th scope="col">Professor(a)</th>
                <th scope="col">Dias de aula</th>
                <th scope="col">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {!lista.dados && <LinhasEsqueleto colunas={4} linhas={3} />}
              {lista.dados && !lista.dados.length && (
                <LinhaEstado colunas={4}>
                  <Vazio>Nenhuma disciplina vinculada a esta turma.</Vazio>
                </LinhaEstado>
              )}
              {lista.dados?.map((v) => (
                <tr key={v.disciplina_id}>
                  <td data-rotulo="Disciplina">
                    <strong>{v.disciplina}</strong>
                  </td>
                  <td data-rotulo="Professor">{v.professor}</td>
                  <td data-rotulo="Dias">{v.dias.length ? v.dias.map((d) => DIAS_SEMANA[d]).join(', ') : <Badge tom="warn">Sem grade</Badge>}</td>
                  <td className="acoes">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => abrir(v)}>
                      Editar
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => remover(v)}>
                      Remover
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {form && (
        <Janela aberto onFechar={() => setForm(null)} titulo={form.disciplina_id ? `${form.disciplina} · ${form.turma}` : 'Adicionar disciplina à turma'} onSubmit={salvar} rodape={<Rodape onFechar={() => setForm(null)} enviando={enviando} />}>
          <div className="form-grid">
            <Campo nome="disciplina_id" rotulo="Disciplina" erro={f.erros.disciplina_id}>
              <select value={f.valores.disciplina_id} onChange={f.campo('disciplina_id')} disabled={Boolean(form.disciplina_id)}>
                <option value="">Escolha...</option>
                {apoio.dados.disciplinas
                  .filter((d) => form.disciplina_id === d.id || !usadas.has(d.id))
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.nome}
                    </option>
                  ))}
              </select>
            </Campo>
            <Campo nome="professor_id" rotulo="Professor(a)" erro={f.erros.professor_id} dica="Trocar o professor só é possível se ainda não houver lançamentos, aulas ou atividades.">
              <select value={f.valores.professor_id} onChange={f.campo('professor_id')}>
                <option value="">Escolha...</option>
                {apoio.dados.professores.map((p) => (
                  <option key={p.professor_id} value={p.professor_id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </Campo>
          </div>
          <fieldset className="dias-semana">
            <legend className="texto-secundario">Dias de aula na semana</legend>
            {[1, 2, 3, 4, 5, 6].map((d) => (
              <button
                key={d}
                type="button"
                className="chip"
                aria-pressed={f.valores.dias.includes(d)}
                onClick={() => f.definir('dias', f.valores.dias.includes(d) ? f.valores.dias.filter((x) => x !== d) : [...f.valores.dias, d].sort())}
              >
                {DIAS_SEMANA[d]}
              </button>
            ))}
          </fieldset>
          <ErroFormulario>{f.erroGeral}</ErroFormulario>
        </Janela>
      )}
    </>
  );
}
