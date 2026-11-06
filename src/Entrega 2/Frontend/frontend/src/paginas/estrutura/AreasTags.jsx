// AreasTags.jsx — cadastros de apoio (RF02): áreas do conhecimento e tags de desempenho.
//   Área com disciplinas não é excluída (a API responde 409 explicando).
//   Tag já usada em registros não é excluída: é desativada (some dos lançamentos, fica no histórico).

import { useState } from 'react';
import { api } from '../../api/cliente';
import { ErroEstado, LinhaEstado, LinhasEsqueleto, Vazio } from '../../componentes/Estado';
import { Campo, ErroFormulario } from '../../componentes/Formulario';
import Icone from '../../componentes/Icone';
import { BadgeDe } from '../../componentes/Interface';
import Janela from '../../componentes/Janela';
import { useConfirmar } from '../../contexto/ConfirmarContext';
import { useToast } from '../../contexto/ToastContext';
import { useApi } from '../../hooks/useApi';
import { useFormulario } from '../../hooks/useFormulario';
import Rodape from './Rodape';

// Hook comum: abrir o formulário, salvar (POST/PUT) e excluir com confirmação
function useCadastro({ rota, vazio, regras, corpo, nomeItem, lista }) {
  const toast = useToast();
  const confirmar = useConfirmar();
  const f = useFormulario(vazio);
  const [form, setForm] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const abrir = (item) => {
    f.reiniciar(item ? { ...vazio, ...item, descricao: item.descricao ?? '' } : vazio);
    setForm(item || {});
  };

  async function salvar(e) {
    e.preventDefault();
    if (!f.validar(regras)) return;
    setEnviando(true);
    try {
      if (form.id) await api.put(`${rota}/${form.id}`, corpo(f.valores));
      else await api.post(rota, corpo(f.valores));
      toast(form.id ? `${nomeItem} atualizada.` : `${nomeItem} criada.`);
      setForm(null);
      lista.recarregar({ silencioso: true });
    } catch (err) {
      f.errosDaApi(err);
    } finally {
      setEnviando(false);
    }
  }

  async function excluir(item) {
    if (!(await confirmar({ titulo: `Excluir “${item.nome}”?`, mensagem: 'A exclusão não pode ser desfeita.', confirmar: 'Excluir', perigo: true })))
      return;
    try {
      await api.del(`${rota}/${item.id}`);
      toast(`${nomeItem} excluída.`);
      lista.recarregar({ silencioso: true });
    } catch (err) {
      toast(err.message, 'erro');
    }
  }

  return { f, form, setForm, enviando, abrir, salvar, excluir };
}

function Areas() {
  const lista = useApi(() => api.get('/areas'), []);
  const c = useCadastro({
    rota: '/areas',
    vazio: { nome: '' },
    regras: { nome: (x) => (x.trim().length < 2 ? 'Informe o nome da área.' : '') },
    corpo: (v) => ({ nome: v.nome.trim() }),
    nomeItem: 'Área',
    lista,
  });

  return (
    <section className="relatorio-grupo">
      <div className="linha-acao">
        <h2 className="secao-titulo">Áreas do conhecimento</h2>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => c.abrir(null)}>
          <Icone nome="mais" tamanho={14} /> Nova área
        </button>
      </div>
      {lista.erro ? (
        <ErroEstado mensagem={lista.erro} onTentarNovamente={lista.recarregar} />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Área</th>
                <th scope="col">Disciplinas</th>
                <th scope="col">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {!lista.dados && <LinhasEsqueleto colunas={3} linhas={3} />}
              {lista.dados && !lista.dados.length && (
                <LinhaEstado colunas={3}>
                  <Vazio>Nenhuma área cadastrada.</Vazio>
                </LinhaEstado>
              )}
              {lista.dados?.map((a) => (
                <tr key={a.id}>
                  <th scope="row" data-rotulo="Área">
                    {a.nome}
                  </th>
                  <td data-rotulo="Disciplinas">{a.disciplinas}</td>
                  <td>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => c.abrir(a)}>
                      Editar
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => c.excluir(a)}
                      disabled={a.disciplinas > 0}
                      title={a.disciplinas > 0 ? 'Tem disciplinas: mude-as de área antes de excluir.' : undefined}
                    >
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {c.form && (
        <Janela aberto onFechar={() => c.setForm(null)} titulo={c.form.id ? `Editar ${c.form.nome}` : 'Nova área'} onSubmit={c.salvar}
          rodape={<Rodape onFechar={() => c.setForm(null)} enviando={c.enviando} />}>
          <div className="form-grid uma-coluna">
            <Campo nome="nome" rotulo="Nome da área" erro={c.f.erros.nome}>
              <input value={c.f.valores.nome} onChange={c.f.campo('nome')} maxLength={80} />
            </Campo>
          </div>
          <ErroFormulario>{c.f.erroGeral}</ErroFormulario>
        </Janela>
      )}
    </section>
  );
}

function Tags() {
  const lista = useApi(() => api.get('/tags?todas=1'), []);
  const c = useCadastro({
    rota: '/tags',
    vazio: { nome: '', descricao: '', ativo: true },
    regras: { nome: (x) => (x.trim().length < 2 ? 'Informe o nome da tag.' : '') },
    corpo: (v) => ({ nome: v.nome.trim(), descricao: v.descricao.trim() || null, ativo: v.ativo }),
    nomeItem: 'Tag',
    lista,
  });

  return (
    <section className="relatorio-grupo">
      <div className="linha-acao">
        <h2 className="secao-titulo">Tags de desempenho</h2>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => c.abrir(null)}>
          <Icone nome="mais" tamanho={14} /> Nova tag
        </button>
      </div>
      <p className="texto-secundario">Tags desativadas deixam de aparecer para os professores, mas continuam nos registros antigos.</p>
      {lista.erro ? (
        <ErroEstado mensagem={lista.erro} onTentarNovamente={lista.recarregar} />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Tag</th>
                <th scope="col">Descrição</th>
                <th scope="col">Usos</th>
                <th scope="col">Situação</th>
                <th scope="col">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {!lista.dados && <LinhasEsqueleto colunas={5} linhas={4} />}
              {lista.dados?.map((t) => (
                <tr key={t.id}>
                  <th scope="row" data-rotulo="Tag">
                    {t.nome}
                  </th>
                  <td data-rotulo="Descrição">{t.descricao || '—'}</td>
                  <td data-rotulo="Usos">{t.usos}</td>
                  <td data-rotulo="Situação">
                    <BadgeDe tipo="conta" valor={String(t.ativo)} />
                  </td>
                  <td>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => c.abrir(t)}>
                      Editar
                    </button>
                    {t.usos === 0 && (
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => c.excluir(t)}>
                        Excluir
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {c.form && (
        <Janela aberto onFechar={() => c.setForm(null)} titulo={c.form.id ? `Editar ${c.form.nome}` : 'Nova tag'} onSubmit={c.salvar}
          rodape={<Rodape onFechar={() => c.setForm(null)} enviando={c.enviando} />}>
          <div className="form-grid uma-coluna">
            <Campo nome="nome" rotulo="Nome da tag" erro={c.f.erros.nome}>
              <input value={c.f.valores.nome} onChange={c.f.campo('nome')} maxLength={50} />
            </Campo>
            <Campo nome="descricao" rotulo="Descrição" erro={c.f.erros.descricao} opcional dica="Aparece ao passar o mouse sobre a tag.">
              <input value={c.f.valores.descricao} onChange={c.f.campo('descricao')} maxLength={200} />
            </Campo>
          </div>
          <label className="aceite">
            <input type="checkbox" checked={c.f.valores.ativo} onChange={c.f.campo('ativo')} /> Tag ativa (disponível nos lançamentos)
          </label>
          <ErroFormulario>{c.f.erroGeral}</ErroFormulario>
        </Janela>
      )}
    </section>
  );
}

export default function AreasTags() {
  return (
    <>
      <Areas />
      <Tags />
    </>
  );
}
