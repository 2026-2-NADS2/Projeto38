// Disciplinas.jsx — disciplinas por área do conhecimento.

import { useState } from 'react';
import { api } from '../../api/cliente';
import { ErroEstado, LinhasEsqueleto } from '../../componentes/Estado';
import { Campo, ErroFormulario } from '../../componentes/Formulario';
import Icone from '../../componentes/Icone';
import { BadgeDe } from '../../componentes/Interface';
import Janela from '../../componentes/Janela';
import { useToast } from '../../contexto/ToastContext';
import { useApi } from '../../hooks/useApi';
import { useFormulario } from '../../hooks/useFormulario';
import Rodape from './Rodape';

export default function Disciplinas() {
  const toast = useToast();
  const lista = useApi(async () => {
    const [disciplinas, areas] = await Promise.all([api.get('/disciplinas?todas=1'), api.get('/areas')]);
    return { disciplinas, areas };
  }, []);
  const [form, setForm] = useState(null);
  const f = useFormulario({ nome: '', area_id: '', ativo: true });
  const [enviando, setEnviando] = useState(false);

  function abrir(d) {
    f.reiniciar({ nome: d?.nome || '', area_id: String(d?.area_id || ''), ativo: d?.ativo ?? true });
    setForm(d || {});
  }

  async function salvar(e) {
    e.preventDefault();
    if (!f.validar({ nome: (x) => (x.trim().length < 2 ? 'Informe o nome.' : ''), area_id: (x) => (!x ? 'Escolha a área.' : '') })) return;
    setEnviando(true);
    const corpo = { nome: f.valores.nome.trim(), area_id: Number(f.valores.area_id), ativo: f.valores.ativo };
    try {
      if (form.id) await api.put(`/disciplinas/${form.id}`, corpo);
      else await api.post('/disciplinas', corpo);
      toast(form.id ? 'Disciplina atualizada.' : 'Disciplina criada.');
      setForm(null);
      lista.recarregar({ silencioso: true });
    } catch (err) {
      f.errosDaApi(err);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <div className="linha-acao">
        <p className="texto-secundario">Disciplinas oferecidas pela escola, por área do conhecimento.</p>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => abrir(null)}>
          <Icone nome="mais" tamanho={14} /> Nova disciplina
        </button>
      </div>
      {lista.erro ? (
        <ErroEstado mensagem={lista.erro} onTentarNovamente={lista.recarregar} />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Disciplina</th>
                <th scope="col">Área</th>
                <th scope="col">Situação</th>
                <th scope="col">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {!lista.dados && <LinhasEsqueleto colunas={4} linhas={4} />}
              {lista.dados?.disciplinas.map((d) => (
                <tr key={d.id}>
                  <td data-rotulo="Disciplina">
                    <strong>{d.nome}</strong>
                  </td>
                  <td data-rotulo="Área">{d.area}</td>
                  <td data-rotulo="Situação">
                    <BadgeDe tipo="conta" valor={String(d.ativo)} />
                  </td>
                  <td>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => abrir(d)}>
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
        <Janela aberto onFechar={() => setForm(null)} titulo={form.id ? `Editar ${form.nome}` : 'Nova disciplina'} onSubmit={salvar} rodape={<Rodape onFechar={() => setForm(null)} enviando={enviando} />}>
          <div className="form-grid">
            <Campo nome="nome" rotulo="Nome" erro={f.erros.nome}>
              <input value={f.valores.nome} onChange={f.campo('nome')} maxLength={80} />
            </Campo>
            <Campo nome="area_id" rotulo="Área do conhecimento" erro={f.erros.area_id}>
              <select value={f.valores.area_id} onChange={f.campo('area_id')}>
                <option value="">Escolha...</option>
                {lista.dados.areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nome}
                  </option>
                ))}
              </select>
            </Campo>
          </div>
          <label className="aceite">
            <input type="checkbox" checked={f.valores.ativo} onChange={f.campo('ativo')} /> Disciplina ativa
          </label>
          <ErroFormulario>{f.erroGeral}</ErroFormulario>
        </Janela>
      )}
    </>
  );
}
