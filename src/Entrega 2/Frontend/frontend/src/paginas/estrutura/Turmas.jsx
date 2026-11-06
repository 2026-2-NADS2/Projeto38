// Turmas.jsx — turmas do ano letivo: cadastro, edição e ativação.

import { useState } from 'react';
import { api } from '../../api/cliente';
import { ErroEstado, LinhasEsqueleto } from '../../componentes/Estado';
import { Campo, ErroFormulario } from '../../componentes/Formulario';
import Icone from '../../componentes/Icone';
import { Badge, BadgeDe } from '../../componentes/Interface';
import Janela from '../../componentes/Janela';
import { useToast } from '../../contexto/ToastContext';
import { useApi } from '../../hooks/useApi';
import { useFormulario } from '../../hooks/useFormulario';
import Rodape from './Rodape';

const TURNOS = { MANHA: 'Manhã', TARDE: 'Tarde', INTEGRAL: 'Integral' };

function FormTurma({ turma, onFechar, onSalvo }) {
  const toast = useToast();
  const f = useFormulario({ nome: turma?.nome || '', serie: String(turma?.serie || ''), turno: turma?.turno || 'MANHA', ativo: turma?.ativo ?? true });
  const [enviando, setEnviando] = useState(false);
  async function salvar(e) {
    e.preventDefault();
    if (!f.validar({ nome: (x) => (x.trim().length < 2 ? 'Informe o nome (ex.: 6º A).' : ''), serie: (x) => (!x ? 'Escolha a série.' : '') })) return;
    setEnviando(true);
    const corpo = { nome: f.valores.nome.trim(), serie: Number(f.valores.serie), turno: f.valores.turno, ativo: f.valores.ativo };
    try {
      if (turma) await api.put(`/turmas/${turma.id}`, corpo);
      else await api.post('/turmas', corpo); // o servidor usa o ano letivo atual
      toast(turma ? 'Turma atualizada.' : 'Turma criada.');
      onSalvo();
    } catch (err) {
      f.errosDaApi(err);
    } finally {
      setEnviando(false);
    }
  }
  return (
    <Janela aberto onFechar={onFechar} titulo={turma ? `Editar ${turma.nome}` : 'Nova turma'} onSubmit={salvar} rodape={<Rodape onFechar={onFechar} enviando={enviando} />}>
      <div className="form-grid">
        <Campo nome="nome" rotulo="Nome da turma" erro={f.erros.nome}>
          <input value={f.valores.nome} onChange={f.campo('nome')} maxLength={20} placeholder="6º A" />
        </Campo>
        <Campo nome="serie" rotulo="Série (Ensino Fundamental)" erro={f.erros.serie}>
          <select value={f.valores.serie} onChange={f.campo('serie')}>
            <option value="">Escolha...</option>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((s) => (
              <option key={s} value={s}>
                {s}º ano
              </option>
            ))}
          </select>
        </Campo>
        <Campo nome="turno" rotulo="Turno">
          <select value={f.valores.turno} onChange={f.campo('turno')}>
            {Object.entries(TURNOS).map(([v, r]) => (
              <option key={v} value={v}>
                {r}
              </option>
            ))}
          </select>
        </Campo>
      </div>
      {turma && (
        <label className="aceite">
          <input type="checkbox" checked={f.valores.ativo} onChange={f.campo('ativo')} /> Turma ativa (desmarque para encerrar; os registros são mantidos)
        </label>
      )}
      <ErroFormulario>{f.erroGeral}</ErroFormulario>
    </Janela>
  );
}

export default function Turmas() {
  const lista = useApi(() => api.get('/turmas?todas=1'), []);
  const [form, setForm] = useState(null);
  return (
    <>
      <div className="linha-acao">
        <p className="texto-secundario">Turmas do ano letivo atual.</p>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setForm({})}>
          <Icone nome="mais" tamanho={14} /> Nova turma
        </button>
      </div>
      {lista.erro ? (
        <ErroEstado mensagem={lista.erro} onTentarNovamente={lista.recarregar} />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Turma</th>
                <th scope="col">Série</th>
                <th scope="col">Turno</th>
                <th scope="col">Alunos</th>
                <th scope="col">Disciplinas</th>
                <th scope="col">Situação</th>
                <th scope="col">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {!lista.dados && <LinhasEsqueleto colunas={7} linhas={2} />}
              {lista.dados?.map((t) => (
                <tr key={t.id}>
                  <td data-rotulo="Turma">
                    <strong>{t.nome}</strong>
                  </td>
                  <td data-rotulo="Série">{t.serie}º ano</td>
                  <td data-rotulo="Turno">{TURNOS[t.turno]}</td>
                  <td data-rotulo="Alunos">{t.total_alunos}</td>
                  <td data-rotulo="Disciplinas">{t.total_disciplinas || <Badge tom="warn">Nenhuma</Badge>}</td>
                  <td data-rotulo="Situação">
                    <BadgeDe tipo="conta" valor={String(t.ativo)} />
                  </td>
                  <td>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setForm(t)}>
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {form && (
        <FormTurma
          turma={form.id ? form : null}
          onFechar={() => setForm(null)}
          onSalvo={() => {
            setForm(null);
            lista.recarregar({ silencioso: true });
          }}
        />
      )}
    </>
  );
}
