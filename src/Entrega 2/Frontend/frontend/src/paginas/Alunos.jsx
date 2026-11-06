// Alunos.jsx — cadastro e gerenciamento de alunos (coordenação).
//  cadastrar · editar · consultar · ativar/desativar · pesquisar e filtrar · vincular responsáveis e turma
// Documento, e-mail, telefone e endereço são opcionais (coleta mínima — LGPD, dados de menores).

import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/cliente';
import { useTitulo } from '../componentes/Basicos';
import { Carregando, ErroEstado, LinhaEstado, LinhasEsqueleto, Vazio } from '../componentes/Estado';
import { Aviso, Campo, ErroFormulario } from '../componentes/Formulario';
import Icone from '../componentes/Icone';
import { Abas, Badge, BadgeDe, Paginacao, Topo } from '../componentes/Interface';
import Janela from '../componentes/Janela';
import { useConfirmar } from '../contexto/ConfirmarContext';
import { useToast } from '../contexto/ToastContext';
import { useApi } from '../hooks/useApi';
import { emailValido, telefoneValido, useFormulario } from '../hooks/useFormulario';
import { diaLocalIso, formatarDia } from '../util/formato';

const VAZIO = { nome: '', matricula: '', data_nascimento: '', turma_id: '', documento: '', email: '', telefone: '', endereco: '' };

function idade(iso) {
  if (!iso) return '';
  const [a, m, d] = iso.split('-').map(Number);
  const hoje = new Date();
  let anos = hoje.getFullYear() - a;
  if (hoje.getMonth() + 1 < m || (hoje.getMonth() + 1 === m && hoje.getDate() < d)) anos -= 1;
  return `${anos} anos`;
}

function FormAluno({ aluno, turmas, onSalvo }) {
  const toast = useToast();
  const f = useFormulario(
    aluno
      ? Object.fromEntries(Object.keys(VAZIO).map((k) => [k, aluno[k] === null || aluno[k] === undefined ? '' : String(aluno[k])]))
      : VAZIO
  );
  const [enviando, setEnviando] = useState(false);
  const v = f.valores;

  async function salvar(e) {
    e.preventDefault();
    const ok = f.validar({
      nome: (x) => (x.trim().length < 3 ? 'Informe o nome completo.' : ''),
      matricula: (x) => (!x.trim() ? 'Informe o número de matrícula.' : ''),
      data_nascimento: (x) => (!x ? 'Informe a data de nascimento.' : x > diaLocalIso() ? 'A data não pode estar no futuro.' : ''),
      turma_id: (x) => (!x ? 'Escolha a turma.' : ''),
      email: emailValido,
      telefone: telefoneValido,
    });
    if (!ok) return;
    setEnviando(true);
    const corpo = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typeof x === 'string' ? x.trim() || null : x]));
    corpo.turma_id = Number(v.turma_id);
    try {
      const salvo = aluno ? await api.put(`/alunos/${aluno.id}`, corpo) : await api.post('/alunos', corpo);
      toast(aluno ? 'Cadastro atualizado.' : 'Aluno cadastrado. Agora vincule os responsáveis.');
      onSalvo(salvo, !aluno);
    } catch (err) {
      f.errosDaApi(err);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={salvar} noValidate>
      <div className="form-grid">
        <Campo nome="nome" rotulo="Nome completo" erro={f.erros.nome} className="col-2">
          <input value={v.nome} onChange={f.campo('nome')} maxLength={120} autoComplete="off" />
        </Campo>
        <Campo nome="matricula" rotulo="Número de matrícula" erro={f.erros.matricula}>
          <input value={v.matricula} onChange={f.campo('matricula')} maxLength={20} inputMode="numeric" />
        </Campo>
        <Campo nome="data_nascimento" rotulo="Data de nascimento" erro={f.erros.data_nascimento}>
          <input type="date" value={v.data_nascimento} max={diaLocalIso()} onChange={f.campo('data_nascimento')} />
        </Campo>
        <Campo nome="turma_id" rotulo={`Turma (ano letivo ${turmas[0]?.ano_letivo || ''})`} erro={f.erros.turma_id}>
          <select value={v.turma_id} onChange={f.campo('turma_id')}>
            <option value="">Escolha...</option>
            {turmas.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </select>
        </Campo>
        <Campo nome="documento" rotulo="CPF ou documento" erro={f.erros.documento} opcional>
          <input value={v.documento} onChange={f.campo('documento')} maxLength={20} placeholder="000.000.000-00" />
        </Campo>
        <Campo nome="email" rotulo="E-mail do aluno" erro={f.erros.email} opcional>
          <input type="email" value={v.email} onChange={f.campo('email')} maxLength={150} />
        </Campo>
        <Campo nome="telefone" rotulo="Telefone de contato" erro={f.erros.telefone} opcional>
          <input type="tel" value={v.telefone} onChange={f.campo('telefone')} maxLength={20} />
        </Campo>
        <Campo nome="endereco" rotulo="Endereço" erro={f.erros.endereco} opcional className="col-2">
          <input value={v.endereco} onChange={f.campo('endereco')} maxLength={200} />
        </Campo>
      </div>
      <ErroFormulario>{f.erroGeral}</ErroFormulario>
      <div className="cartao-acoes">
        <button type="submit" className="btn btn-primary btn-sm" disabled={enviando}>
          {enviando ? 'Salvando...' : aluno ? 'Salvar alterações' : 'Cadastrar aluno'}
        </button>
      </div>
    </form>
  );
}

function Responsaveis({ aluno, onMudou }) {
  const toast = useToast();
  const confirmar = useConfirmar();
  const contas = useApi(() => api.get('/usuarios?perfil=responsavel'), []);
  const f = useFormulario({ email: '', parentesco: '', autorizado: true });
  const [enviando, setEnviando] = useState(false);

  async function vincular(e) {
    e.preventDefault();
    const ok = f.validar({
      email: (x) => (!x.trim() ? 'Informe o e-mail da conta do responsável.' : emailValido(x)),
      parentesco: (x) => (x.trim().length < 2 ? 'Informe o parentesco (ex.: Mãe, Pai, Avó).' : ''),
    });
    if (!ok) return;
    setEnviando(true);
    try {
      await api.post(`/alunos/${aluno.id}/responsaveis`, { email: f.valores.email.trim(), parentesco: f.valores.parentesco.trim(), autorizado: f.valores.autorizado });
      toast('Responsável vinculado.');
      f.reiniciar({ email: '', parentesco: '', autorizado: true });
      onMudou();
    } catch (err) {
      f.errosDaApi(err);
    } finally {
      setEnviando(false);
    }
  }

  async function remover(r) {
    const ok = await confirmar({
      titulo: `Remover ${r.nome}?`,
      mensagem: `${r.nome} deixa de ver o boletim e as informações de ${aluno.nome}.`,
      confirmar: 'Remover vínculo',
      perigo: true,
    });
    if (!ok) return;
    try {
      await api.del(`/alunos/${aluno.id}/responsaveis/${r.id}`);
      toast('Vínculo removido.');
      onMudou();
    } catch (err) {
      toast(err.message, 'erro');
    }
  }

  return (
    <>
      {!aluno.responsaveis?.length && <Aviso tom="warn">Nenhum responsável vinculado: a família ainda não acompanha este aluno.</Aviso>}
      <ul className="lista-simples">
        {aluno.responsaveis?.map((r) => (
          <li key={r.id} className="linha-acao">
            <span>
              <strong>{r.nome}</strong>
              <span className="texto-secundario">
                {r.parentesco} · {r.email}
                {r.telefone && ` · ${r.telefone}`}
              </span>
            </span>
            <span className="linha-acao-fim">
              {r.autorizado ? <Badge tom="ok">Vê o boletim</Badge> : <Badge tom="neutral">Sem acesso ao boletim</Badge>}
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => remover(r)}>
                Remover
              </button>
            </span>
          </li>
        ))}
      </ul>
      <form onSubmit={vincular} noValidate className="sub-form">
        <h3 className="subtitulo">Vincular responsável</h3>
        <p className="texto-secundario">O responsável precisa ter conta: ele mesmo se cadastra em “Cadastre-se”, ou a coordenação cria em Professores e contas &gt; Responsáveis.</p>
        <div className="form-grid">
          <Campo nome="email" rotulo="E-mail da conta" erro={f.erros.email}>
            <input type="email" list="contas-responsaveis" value={f.valores.email} onChange={f.campo('email')} />
          </Campo>
          <Campo nome="parentesco" rotulo="Parentesco" erro={f.erros.parentesco}>
            <input list="parentescos" value={f.valores.parentesco} onChange={f.campo('parentesco')} maxLength={30} />
          </Campo>
        </div>
        <datalist id="contas-responsaveis">
          {(contas.dados || []).map((c) => (
            <option key={c.id} value={c.email}>
              {c.nome}
            </option>
          ))}
        </datalist>
        <datalist id="parentescos">
          {['Mãe', 'Pai', 'Avó', 'Avô', 'Tia', 'Tio', 'Tutor(a)'].map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
        <label className="aceite">
          <input type="checkbox" checked={f.valores.autorizado} onChange={f.campo('autorizado')} /> Autorizado a ver boletim e informações escolares
        </label>
        <ErroFormulario>{f.erroGeral}</ErroFormulario>
        <div className="cartao-acoes">
          <button type="submit" className="btn btn-primary btn-sm" disabled={enviando}>
            {enviando ? 'Vinculando...' : 'Vincular'}
          </button>
        </div>
      </form>
    </>
  );
}

function DetalheAluno({ id, turmas, aba: abaInicial, onFechar, onMudou }) {
  const toast = useToast();
  const confirmar = useConfirmar();
  const { dados, erro, recarregar } = useApi(() => api.get(`/alunos/${id}`), [id]);
  const [aba, setAba] = useState(abaInicial || 'dados');

  async function alternarAtivo() {
    const desativar = dados.ativo;
    const ok = await confirmar(
      desativar
        ? {
            titulo: `Desativar ${dados.nome}?`,
            mensagem: 'O aluno sai das listas dos professores e da família. O histórico escolar é mantido e ele pode ser reativado.',
            confirmar: 'Desativar',
            perigo: true,
          }
        : { titulo: `Reativar ${dados.nome}?`, mensagem: 'Ele volta a aparecer para professores e responsáveis.', confirmar: 'Reativar' }
    );
    if (!ok) return;
    try {
      await api.patch(`/alunos/${id}/ativo`, { ativo: !desativar });
      toast(desativar ? 'Aluno desativado.' : 'Aluno reativado.');
      recarregar({ silencioso: true });
      onMudou();
    } catch (err) {
      toast(err.message, 'erro');
    }
  }

  return (
    <Janela
      aberto
      largo
      onFechar={onFechar}
      titulo={dados?.nome || 'Aluno'}
      subtitulo={dados && `Matrícula ${dados.matricula} · ${dados.turma || 'sem turma'} · ${formatarDia(dados.data_nascimento)} (${idade(dados.data_nascimento)})`}
      rodape={
        dados && (
          <>
            <BadgeDe tipo="conta" valor={String(dados.ativo)} />
            <button type="button" className={`btn ${dados.ativo ? 'btn-ghost' : 'btn-primary'}`} onClick={alternarAtivo}>
              {dados.ativo ? 'Desativar cadastro' : 'Reativar cadastro'}
            </button>
          </>
        )
      }
    >
      {erro && <ErroEstado mensagem={erro} onTentarNovamente={recarregar} />}
      {!erro && !dados && <Carregando />}
      {dados && (
        <>
          <Abas
            rotulo="Seções do cadastro"
            ativa={aba}
            onTrocar={setAba}
            abas={[
              { id: 'dados', rotulo: 'Dados do aluno' },
              { id: 'responsaveis', rotulo: `Responsáveis (${dados.responsaveis?.length || 0})` },
            ]}
          />
          {aba === 'dados' && (
            <FormAluno
              key={dados.id}
              aluno={dados}
              turmas={turmas}
              onSalvo={() => {
                recarregar({ silencioso: true });
                onMudou();
              }}
            />
          )}
          {aba === 'responsaveis' && (
            <Responsaveis
              aluno={dados}
              onMudou={() => {
                recarregar({ silencioso: true });
                onMudou();
              }}
            />
          )}
        </>
      )}
    </Janela>
  );
}

export default function Alunos() {
  useTitulo('Alunos');
  const [params, setParams] = useSearchParams();
  const [busca, setBusca] = useState('');
  const [termo, setTermo] = useState('');
  const [turma, setTurma] = useState('');
  const [situacao, setSituacao] = useState('ativos');
  const [pagina, setPagina] = useState(1);
  const [novo, setNovo] = useState(false);
  const turmas = useApi(() => api.get('/turmas'), []);
  // Lista paginada no servidor (25 por página): não carrega a escola inteira de uma vez
  const resposta = useApi(() => {
    const q = new URLSearchParams({ situacao, pagina, por_pagina: 25 });
    if (termo) q.set('busca', termo);
    if (turma) q.set('turma_id', turma);
    return api.pagina(`/alunos?${q}`);
  }, [termo, turma, situacao, pagina]);
  const lista = { ...resposta, dados: resposta.dados?.dados ?? null };

  // Filtro novo volta para a primeira página
  useEffect(() => setPagina(1), [termo, turma, situacao]);
  const abrir = Number(params.get('abrir')) || null;

  // Busca com pequena espera (não consulta a cada tecla)
  useEffect(() => {
    const t = setTimeout(() => setTermo(busca.trim()), 300);
    return () => clearTimeout(t);
  }, [busca]);

  return (
    <>
      <Topo titulo="Alunos" descricao="Cadastre alunos, mantenha os dados atualizados e vincule turma e responsáveis.">
        <button type="button" className="btn btn-primary" onClick={() => setNovo(true)} disabled={!turmas.dados}>
          <Icone nome="mais" tamanho={16} /> Novo aluno
        </button>
      </Topo>

      <div className="filtros barra-filtros">
        <label className="busca">
          <Icone nome="busca" />
          <span className="sr-only">Buscar por nome ou matrícula</span>
          <input className="input" type="search" placeholder="Buscar por nome ou matrícula" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </label>
        <label className="campo-filtro">
          <span className="sr-only">Turma</span>
          <select className="select" value={turma} onChange={(e) => setTurma(e.target.value)}>
            <option value="">Todas as turmas</option>
            {(turmas.dados || []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="campo-filtro">
          <span className="sr-only">Situação</span>
          <select className="select" value={situacao} onChange={(e) => setSituacao(e.target.value)}>
            <option value="ativos">Ativos</option>
            <option value="inativos">Inativos</option>
            <option value="todos">Todos</option>
          </select>
        </label>
      </div>

      {lista.erro ? (
        <ErroEstado mensagem={lista.erro} onTentarNovamente={lista.recarregar} />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Aluno</th>
                <th scope="col">Matrícula</th>
                <th scope="col">Turma</th>
                <th scope="col">Responsáveis</th>
                <th scope="col">Situação</th>
                <th scope="col">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {!lista.dados && <LinhasEsqueleto colunas={6} linhas={5} />}
              {lista.dados && !lista.dados.length && (
                <LinhaEstado colunas={6}>
                  <Vazio>Nenhum aluno encontrado{termo ? ` para “${termo}”` : ''}.</Vazio>
                </LinhaEstado>
              )}
              {lista.dados?.map((a) => (
                <tr key={a.id}>
                  <td data-rotulo="Aluno">
                    <strong>{a.nome}</strong>
                    <br />
                    <small className="texto-secundario">{idade(a.data_nascimento)}</small>
                  </td>
                  <td data-rotulo="Matrícula">{a.matricula}</td>
                  <td data-rotulo="Turma">{a.turma || <Badge tom="warn">Sem turma</Badge>}</td>
                  <td data-rotulo="Responsáveis">{a.total_responsaveis ? a.total_responsaveis : <Badge tom="warn">Nenhum</Badge>}</td>
                  <td data-rotulo="Situação">
                    <BadgeDe tipo="conta" valor={String(a.ativo)} />
                  </td>
                  <td>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setParams({ abrir: a.id })}>
                      Abrir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Paginacao meta={resposta.dados?.meta} onPagina={setPagina} rotulo="aluno(s)" />

      {novo && turmas.dados && (
        <Janela aberto largo onFechar={() => setNovo(false)} titulo="Novo aluno">
          <FormAluno
            turmas={turmas.dados}
            onSalvo={(salvo) => {
              setNovo(false);
              lista.recarregar({ silencioso: true });
              setParams({ abrir: salvo.id, aba: 'responsaveis' });
            }}
          />
        </Janela>
      )}
      {abrir && turmas.dados && (
        <DetalheAluno
          key={abrir}
          id={abrir}
          turmas={turmas.dados}
          aba={params.get('aba')}
          onFechar={() => setParams({})}
          onMudou={() => lista.recarregar({ silencioso: true })}
        />
      )}
    </>
  );
}
