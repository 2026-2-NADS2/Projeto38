// Professores.jsx — cadastro e gerenciamento de professores e das contas de responsáveis (coordenação).
//  Professores: cadastrar, editar, ativar/desativar, vincular a disciplinas e turmas (com dias da grade),
//               consultar o histórico de vínculos e gerar link de redefinição de senha.
//  Responsáveis: criar conta (quando a família não se cadastra sozinha), editar, ativar/desativar, link de senha.

import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/cliente';
import { useTitulo } from '../componentes/Basicos';
import { Carregando, ErroEstado, LinhaEstado, LinhasEsqueleto, Vazio } from '../componentes/Estado';
import { Aviso, Campo, ErroFormulario } from '../componentes/Formulario';
import Icone from '../componentes/Icone';
import { Abas, Badge, BadgeDe, Detalhe, Topo } from '../componentes/Interface';
import Janela from '../componentes/Janela';
import { useConfirmar } from '../contexto/ConfirmarContext';
import { useToast } from '../contexto/ToastContext';
import { useApi } from '../hooks/useApi';
import { emailValido, telefoneValido, useFormulario } from '../hooks/useFormulario';
import { formatarDataHora, relativo } from '../util/formato';
import { DIAS_SEMANA } from '../util/status';

// Senha provisória legível (a pessoa troca em Meu perfil)
function senhaProvisoria() {
  const letras = 'abcdefghjkmnpqrstuvwxyz';
  const n = crypto.getRandomValues(new Uint32Array(6));
  return `Kfka${[...n.slice(0, 3)].map((x) => letras[x % letras.length]).join('')}${[...n.slice(3)].map((x) => x % 10).join('')}`;
}

function FormConta({ conta, perfil, onSalvo, onCancelar }) {
  const toast = useToast();
  const novo = !conta;
  const f = useFormulario({
    nome: conta?.nome || '',
    email: conta?.email || '',
    telefone: conta?.telefone || '',
    registro: conta?.registro || '',
    documento: conta?.documento || '',
    senha: novo ? senhaProvisoria() : '',
  });
  const [enviando, setEnviando] = useState(false);
  const v = f.valores;
  const ehProf = perfil === 'professor';

  async function salvar(e) {
    e.preventDefault();
    const regras = {
      nome: (x) => (x.trim().length < 3 ? 'Informe o nome completo.' : ''),
      email: (x) => (!x.trim() ? 'Informe o e-mail.' : emailValido(x)),
      telefone: telefoneValido,
    };
    if (ehProf) regras.registro = (x) => (!x.trim() ? 'Informe o registro funcional.' : '');
    if (novo) regras.senha = (x) => (x.length < 8 || !/[A-Za-z]/.test(x) || !/[0-9]/.test(x) ? 'Mínimo 8 caracteres, com letra e número.' : '');
    if (!f.validar(regras)) return;
    setEnviando(true);
    const corpo = {
      nome: v.nome.trim(),
      email: v.email.trim(),
      telefone: v.telefone.trim() || null,
      ...(ehProf ? { registro: v.registro.trim(), documento: v.documento.trim() || null } : {}),
    };
    try {
      if (novo) {
        const r = await api.post('/usuarios', { ...corpo, perfil, senha: v.senha });
        toast(`Conta criada. Senha provisória: ${v.senha}`);
        onSalvo(r);
      } else {
        const r = await api.put(`/usuarios/${conta.id}`, corpo);
        toast('Dados atualizados.');
        onSalvo(r);
      }
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
          <input value={v.nome} onChange={f.campo('nome')} maxLength={120} />
        </Campo>
        <Campo nome="email" rotulo="E-mail (login)" erro={f.erros.email}>
          <input type="email" value={v.email} onChange={f.campo('email')} maxLength={150} autoComplete="off" />
        </Campo>
        <Campo nome="telefone" rotulo="Telefone" erro={f.erros.telefone} opcional>
          <input type="tel" value={v.telefone} onChange={f.campo('telefone')} maxLength={20} />
        </Campo>
        {ehProf && (
          <>
            <Campo nome="registro" rotulo="Registro funcional" erro={f.erros.registro}>
              <input value={v.registro} onChange={f.campo('registro')} maxLength={20} placeholder="P-1004" />
            </Campo>
            <Campo nome="documento" rotulo="CPF ou documento" erro={f.erros.documento} opcional>
              <input value={v.documento} onChange={f.campo('documento')} maxLength={20} />
            </Campo>
          </>
        )}
        {novo && (
          <Campo nome="senha" rotulo="Senha provisória" erro={f.erros.senha} dica="Entregue à pessoa; ela pode trocar em Meu perfil." className="col-2">
            <input value={v.senha} onChange={f.campo('senha')} autoComplete="off" />
          </Campo>
        )}
      </div>
      <ErroFormulario>{f.erroGeral}</ErroFormulario>
      <div className="cartao-acoes">
        {onCancelar && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onCancelar}>
            Cancelar
          </button>
        )}
        <button type="submit" className="btn btn-primary btn-sm" disabled={enviando}>
          {enviando ? 'Salvando...' : novo ? 'Criar conta' : 'Salvar alterações'}
        </button>
      </div>
    </form>
  );
}

function Vinculos({ prof, onMudou }) {
  const toast = useToast();
  const confirmar = useConfirmar();
  const apoio = useApi(async () => {
    const [turmas, disciplinas, vinculos] = await Promise.all([api.get('/turmas'), api.get('/disciplinas'), api.get('/vinculos')]);
    return { turmas, disciplinas, vinculos };
  }, []);
  const f = useFormulario({ turma_id: '', disciplina_id: '', dias: [] });
  const [enviando, setEnviando] = useState(false);
  const v = f.valores;
  const ocupado = apoio.dados?.vinculos.find((x) => String(x.turma_id) === v.turma_id && String(x.disciplina_id) === v.disciplina_id);
  const meus = (apoio.dados?.vinculos || []).filter((x) => x.professor_id === prof.professor_id);

  function alternarDia(d) {
    f.definir('dias', v.dias.includes(d) ? v.dias.filter((x) => x !== d) : [...v.dias, d].sort());
  }

  async function vincular(e) {
    e.preventDefault();
    if (!f.validar({ turma_id: (x) => (!x ? 'Escolha a turma.' : ''), disciplina_id: (x) => (!x ? 'Escolha a disciplina.' : '') })) return;
    if (ocupado && ocupado.professor_id !== prof.professor_id) {
      const ok = await confirmar({
        titulo: 'Substituir o professor?',
        mensagem: `${ocupado.disciplina} no ${ocupado.turma} hoje é de ${ocupado.professor}. ${prof.nome} assume no lugar.`,
        confirmar: 'Substituir',
      });
      if (!ok) return;
    }
    setEnviando(true);
    try {
      await api.put('/vinculos', { turma_id: Number(v.turma_id), disciplina_id: Number(v.disciplina_id), professor_id: prof.professor_id, dias: v.dias });
      toast('Vínculo salvo.');
      f.reiniciar({ turma_id: '', disciplina_id: '', dias: [] });
      apoio.recarregar({ silencioso: true });
      onMudou();
    } catch (err) {
      f.errosDaApi(err);
    } finally {
      setEnviando(false);
    }
  }

  async function remover(x) {
    if (!(await confirmar({ titulo: 'Remover este vínculo?', mensagem: `${prof.nome} deixa de lecionar ${x.disciplina} no ${x.turma}.`, confirmar: 'Remover', perigo: true }))) return;
    try {
      await api.del(`/vinculos/${x.turma_id}/${x.disciplina_id}`);
      toast('Vínculo removido.');
      apoio.recarregar({ silencioso: true });
      onMudou();
    } catch (err) {
      toast(err.message, 'erro');
    }
  }

  if (apoio.erro) return <ErroEstado mensagem={apoio.erro} onTentarNovamente={apoio.recarregar} />;
  if (!apoio.dados) return <Carregando />;
  return (
    <>
      {!meus.length && <Aviso tom="warn">Sem turmas e disciplinas: o professor ainda não consegue lançar notas nem registrar aulas.</Aviso>}
      <ul className="lista-simples">
        {meus.map((x) => (
          <li key={`${x.turma_id}-${x.disciplina_id}`} className="linha-acao">
            <span>
              <strong>
                {x.disciplina} · {x.turma}
              </strong>
              <span className="texto-secundario">Aulas: {x.dias.length ? x.dias.map((d) => DIAS_SEMANA[d]).join(', ') : 'sem dias na grade'}</span>
            </span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => remover(x)}>
              Remover
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={vincular} noValidate className="sub-form">
        <h3 className="subtitulo">Vincular disciplina e turma</h3>
        <div className="form-grid">
          <Campo nome="turma_id" rotulo="Turma" erro={f.erros.turma_id}>
            <select value={v.turma_id} onChange={f.campo('turma_id')}>
              <option value="">Escolha...</option>
              {apoio.dados.turmas.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                </option>
              ))}
            </select>
          </Campo>
          <Campo nome="disciplina_id" rotulo="Disciplina" erro={f.erros.disciplina_id}>
            <select value={v.disciplina_id} onChange={f.campo('disciplina_id')}>
              <option value="">Escolha...</option>
              {apoio.dados.disciplinas.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nome}
                </option>
              ))}
            </select>
          </Campo>
        </div>
        {ocupado && ocupado.professor_id !== prof.professor_id && (
          <Aviso tom="warn">Hoje esta disciplina nesta turma é de {ocupado.professor}. Ao salvar, {prof.nome} assume.</Aviso>
        )}
        <fieldset className="dias-semana">
          <legend className="texto-secundario">Dias de aula na semana (para apontar aulas sem registro)</legend>
          {[1, 2, 3, 4, 5, 6].map((d) => (
            <button key={d} type="button" className="chip" aria-pressed={v.dias.includes(d)} onClick={() => alternarDia(d)}>
              {DIAS_SEMANA[d]}
            </button>
          ))}
        </fieldset>
        <ErroFormulario>{f.erroGeral}</ErroFormulario>
        <div className="cartao-acoes">
          <button type="submit" className="btn btn-primary btn-sm" disabled={enviando}>
            {enviando ? 'Salvando...' : 'Salvar vínculo'}
          </button>
        </div>
      </form>
    </>
  );
}

function Acesso({ conta, onMudou }) {
  const toast = useToast();
  const confirmar = useConfirmar();
  const [link, setLink] = useState(null);

  async function gerarLink() {
    const ok = await confirmar({
      titulo: 'Gerar link de redefinição de senha?',
      mensagem: 'O link vale 24 horas e pode ser usado uma vez. Um link anterior deixa de valer.',
      confirmar: 'Gerar link',
    });
    if (!ok) return;
    try {
      const r = await api.post(`/usuarios/${conta.id}/link-senha`);
      setLink({ url: `${window.location.origin}${r.caminho}`, expira: r.expira_em });
      onMudou();
    } catch (err) {
      toast(err.message, 'erro');
    }
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link.url);
      toast('Link copiado.');
    } catch {
      toast('Não foi possível copiar. Selecione o link e copie manualmente.', 'erro');
    }
  }

  async function alternar() {
    const desativar = conta.ativo;
    const ok = await confirmar(
      desativar
        ? { titulo: `Desativar a conta de ${conta.nome}?`, mensagem: 'A pessoa não consegue mais entrar. Os registros feitos por ela são mantidos.', confirmar: 'Desativar', perigo: true }
        : { titulo: `Reativar a conta de ${conta.nome}?`, confirmar: 'Reativar' }
    );
    if (!ok) return;
    try {
      await api.patch(`/usuarios/${conta.id}/ativo`, { ativo: !desativar });
      toast(desativar ? 'Conta desativada.' : 'Conta reativada.');
      onMudou();
    } catch (err) {
      toast(err.message, 'erro');
    }
  }

  return (
    <>
      <dl className="detalhes">
        <Detalhe rotulo="Login">{conta.email}</Detalhe>
        <Detalhe rotulo="Situação">
          <BadgeDe tipo="conta" valor={String(conta.ativo)} />
        </Detalhe>
        <Detalhe rotulo="Último acesso">{conta.ultimo_login_em ? `${formatarDataHora(conta.ultimo_login_em)} (${relativo(conta.ultimo_login_em)})` : 'Nunca entrou'}</Detalhe>
        <Detalhe rotulo="Conta criada em">{formatarDataHora(conta.criado_em)}</Detalhe>
      </dl>
      <section className="sub-form">
        <h3 className="subtitulo">Recuperação de senha</h3>
        <p className="texto-secundario">Sem envio de e-mail: gere o link e entregue à pessoa (mensagem, telefone ou pessoalmente).</p>
        {conta.link_senha_ativo && !link && <Badge tom="info">Há um link de redefinição válido</Badge>}
        {link && (
          <div className="link-gerado">
            <input className="input" readOnly value={link.url} onFocus={(e) => e.target.select()} aria-label="Link de redefinição" />
            <button type="button" className="btn btn-primary btn-sm" onClick={copiar}>
              Copiar
            </button>
            <small className="texto-secundario">Válido até {formatarDataHora(link.expira)}.</small>
          </div>
        )}
        <div className="cartao-acoes" style={{ justifyContent: 'flex-start' }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={gerarLink} disabled={!conta.ativo}>
            <Icone nome="cadeado" tamanho={14} /> Gerar link de redefinição
          </button>
          <button type="button" className={`btn btn-sm ${conta.ativo ? 'btn-ghost' : 'btn-primary'}`} onClick={alternar}>
            {conta.ativo ? 'Desativar conta' : 'Reativar conta'}
          </button>
        </div>
      </section>
    </>
  );
}

function DetalheConta({ id, onFechar, onMudou }) {
  const { dados, erro, recarregar } = useApi(() => api.get(`/usuarios/${id}`), [id]);
  const [aba, setAba] = useState('dados');
  const ehProf = dados?.perfil === 'professor';
  const mudou = () => {
    recarregar({ silencioso: true });
    onMudou();
  };
  const abas = [{ id: 'dados', rotulo: 'Dados' }];
  if (ehProf) abas.push({ id: 'vinculos', rotulo: 'Disciplinas e turmas' }, { id: 'historico', rotulo: 'Histórico de vínculos' });
  if (dados?.perfil === 'responsavel') abas.push({ id: 'alunos', rotulo: 'Alunos' });
  abas.push({ id: 'acesso', rotulo: 'Acesso à plataforma' });

  return (
    <Janela aberto largo onFechar={onFechar} titulo={dados?.nome || 'Conta'} subtitulo={dados && (ehProf ? `Professor(a) · registro ${dados.registro}` : 'Responsável')}>
      {erro && <ErroEstado mensagem={erro} onTentarNovamente={recarregar} />}
      {!erro && !dados && <Carregando />}
      {dados && (
        <>
          <Abas abas={abas} ativa={aba} onTrocar={setAba} rotulo="Seções" />
          {aba === 'dados' && <FormConta key={dados.email + dados.nome} conta={dados} perfil={dados.perfil} onSalvo={mudou} />}
          {aba === 'vinculos' && <Vinculos prof={dados} onMudou={mudou} />}
          {aba === 'historico' &&
            (dados.historico_vinculos.length ? (
              <ol className="linha-tempo">
                {dados.historico_vinculos.map((h) => (
                  <li key={h.id} className={`evento ${h.acao === 'VINCULADO' ? 'evento-publicado' : 'evento-devolvido'}`}>
                    <p className="evento-titulo">
                      <strong>{h.acao === 'VINCULADO' ? 'Vinculado a' : 'Desvinculado de'}</strong> {h.disciplina} · {h.turma}
                    </p>
                    <p className="evento-autor">
                      {h.usuario} · {formatarDataHora(h.data_hora)}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <Vazio>Nenhuma alteração de vínculo registrada.</Vazio>
            ))}
          {aba === 'alunos' &&
            (dados.alunos.length ? (
              <ul className="lista-simples">
                {dados.alunos.map((a) => (
                  <li key={a.id} className="linha-acao">
                    <span>
                      <strong>{a.nome}</strong>
                      <span className="texto-secundario">
                        {a.parentesco} · matrícula {a.matricula}
                      </span>
                    </span>
                    <Link className="btn btn-ghost btn-sm" to={`/alunos?abrir=${a.id}&aba=responsaveis`}>
                      Ver aluno
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <Vazio>Nenhum aluno vinculado. O vínculo é feito no cadastro do aluno (Alunos &gt; Responsáveis).</Vazio>
            ))}
          {aba === 'acesso' && <Acesso conta={dados} onMudou={mudou} />}
        </>
      )}
    </Janela>
  );
}

export default function Professores() {
  useTitulo('Professores e contas');
  const [params, setParams] = useSearchParams();
  const [aba, setAba] = useState(params.get('aba') === 'responsaveis' ? 'responsavel' : 'professor');
  const [novo, setNovo] = useState(false);
  const [busca, setBusca] = useState('');
  const lista = useApi(() => api.get(`/usuarios?perfil=${aba}`), [aba]);
  const abrir = Number(params.get('abrir')) || null;
  const ehProf = aba === 'professor';
  const termo = busca.trim().toLowerCase();
  const visiveis = (lista.dados || []).filter((u) => !termo || `${u.nome} ${u.email} ${u.registro || ''}`.toLowerCase().includes(termo));

  return (
    <>
      <Topo titulo="Professores e contas" descricao="Cadastre professores, vincule às disciplinas e turmas e gerencie o acesso à plataforma.">
        <button type="button" className="btn btn-primary" onClick={() => setNovo(true)}>
          <Icone nome="mais" tamanho={16} /> {ehProf ? 'Novo professor' : 'Nova conta de responsável'}
        </button>
      </Topo>
      <Abas
        rotulo="Tipo de conta"
        ativa={aba}
        onTrocar={(a) => {
          setAba(a);
          setBusca('');
        }}
        abas={[
          { id: 'professor', rotulo: 'Professores' },
          { id: 'responsavel', rotulo: 'Responsáveis' },
        ]}
      />
      <div className="filtros barra-filtros">
        <label className="busca">
          <Icone nome="busca" />
          <span className="sr-only">Buscar</span>
          <input className="input" type="search" placeholder={ehProf ? 'Buscar por nome, e-mail ou registro' : 'Buscar por nome ou e-mail'} value={busca} onChange={(e) => setBusca(e.target.value)} />
        </label>
      </div>

      {lista.erro ? (
        <ErroEstado mensagem={lista.erro} onTentarNovamente={lista.recarregar} />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Nome</th>
                {ehProf && <th scope="col">Registro</th>}
                <th scope="col">E-mail</th>
                <th scope="col">{ehProf ? 'Disciplinas/turmas' : 'Alunos'}</th>
                <th scope="col">Último acesso</th>
                <th scope="col">Situação</th>
                <th scope="col">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {!lista.dados && <LinhasEsqueleto colunas={ehProf ? 7 : 6} linhas={4} />}
              {lista.dados && !visiveis.length && (
                <LinhaEstado colunas={ehProf ? 7 : 6}>
                  <Vazio>Nenhuma conta encontrada.</Vazio>
                </LinhaEstado>
              )}
              {visiveis.map((u) => {
                const n = ehProf ? u.total_vinculos : u.total_alunos;
                return (
                  <tr key={u.id}>
                    <td data-rotulo="Nome">
                      <strong>{u.nome}</strong>
                      {u.telefone && (
                        <>
                          <br />
                          <small className="texto-secundario">{u.telefone}</small>
                        </>
                      )}
                    </td>
                    {ehProf && <td data-rotulo="Registro">{u.registro}</td>}
                    <td data-rotulo="E-mail">{u.email}</td>
                    <td data-rotulo={ehProf ? 'Vínculos' : 'Alunos'}>{n ? n : <Badge tom="warn">Nenhum</Badge>}</td>
                    <td data-rotulo="Último acesso">{u.ultimo_login_em ? relativo(u.ultimo_login_em) : 'Nunca'}</td>
                    <td data-rotulo="Situação">
                      <BadgeDe tipo="conta" valor={String(u.ativo)} />
                    </td>
                    <td>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setParams({ abrir: u.id, ...(ehProf ? {} : { aba: 'responsaveis' }) })}>
                        Abrir
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {novo && (
        <Janela aberto largo onFechar={() => setNovo(false)} titulo={ehProf ? 'Novo professor' : 'Nova conta de responsável'}>
          <FormConta
            perfil={aba}
            onCancelar={() => setNovo(false)}
            onSalvo={(r) => {
              setNovo(false);
              lista.recarregar({ silencioso: true });
              setParams({ abrir: r.id, ...(ehProf ? {} : { aba: 'responsaveis' }) });
            }}
          />
        </Janela>
      )}
      {abrir && (
        <DetalheConta
          key={abrir}
          id={abrir}
          onFechar={() => setParams(ehProf ? {} : { aba: 'responsaveis' })}
          onMudou={() => lista.recarregar({ silencioso: true })}
        />
      )}
    </>
  );
}
