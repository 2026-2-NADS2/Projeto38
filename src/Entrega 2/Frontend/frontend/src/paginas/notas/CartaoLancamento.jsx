// CartaoLancamento.jsx — um aluno na planilha do professor.
// Guarda o rascunho do formulário localmente e só fala com a API ao salvar/enviar.

import { useState } from 'react';
import { api, mensagemDeErro } from '../../api/cliente';
import { BadgeStatus } from '../../componentes/Basicos';
import BotaoAcao from '../../componentes/BotaoAcao';
import { useToast } from '../../contexto/ToastContext';

const MOTIVO_BLOQUEIO = {
  enviado: 'Enviado para a coordenação — a edição fica bloqueada até uma eventual devolução.',
  em_revisao: 'Em revisão pela coordenação — a edição fica bloqueada até uma eventual devolução.',
  publicado: 'Publicado para a família. Para corrigir, peça uma retificação à coordenação.',
};

export default function CartaoLancamento({ item, tags, janelaAberta, filtros, realce, onSalvo, onHistorico }) {
  const ac = item.acompanhamento;
  const toast = useToast();
  const editavel = janelaAberta && (!ac || ['rascunho', 'devolvido'].includes(ac.status));

  const [media, setMedia] = useState(ac?.media ?? '');
  const [faltas, setFaltas] = useState(ac?.faltas ?? 0);
  const [descricao, setDescricao] = useState(ac?.descricao ?? '');
  const [marcadas, setMarcadas] = useState(() => new Set((ac?.tags || []).map((t) => t.id)));
  const [erro, setErro] = useState({ texto: '', campo: null });

  const limparErro = () => erro.texto && setErro({ texto: '', campo: null });

  // Validação no navegador antes de enviar (a API valida de novo)
  function ler() {
    const m = Number(String(media).trim().replace(',', '.'));
    if (String(media).trim() === '') return { erro: 'Informe a média.', campo: 'media' };
    if (Number.isNaN(m) || m < 0 || m > 10) return { erro: 'A média deve estar entre 0 e 10.', campo: 'media' };
    const f = Number(String(faltas).trim() || 0);
    if (!Number.isInteger(f) || f < 0) return { erro: 'Faltas deve ser um número inteiro maior ou igual a 0.', campo: 'faltas' };
    if (descricao.trim().length < 5) return { erro: 'Escreva um parecer com pelo menos 5 caracteres.', campo: 'descricao' };
    return { dados: { media: Math.round(m * 100) / 100, faltas: f, descricao: descricao.trim(), tags: [...marcadas] } };
  }

  async function salvar(enviar) {
    const { erro: e, campo, dados } = ler();
    if (e) {
      setErro({ texto: e, campo });
      document.getElementById(`${campo}-${item.aluno_id}`)?.focus();
      throw new Error(e); // mantém o botão no estado normal
    }
    try {
      const salvo = await api.put('/acompanhamentos', {
        aluno_id: item.aluno_id,
        disciplina_id: filtros.disciplina,
        bimestre_id: filtros.bimestre,
        ...dados,
        enviar,
      });
      toast(enviar ? `${item.nome}: enviado para revisão.` : `${item.nome}: rascunho salvo.`);
      onSalvo(item.aluno_id, salvo);
    } catch (err) {
      setErro({ texto: mensagemDeErro(err), campo: null });
      throw err;
    }
  }

  function alternarTag(id) {
    setMarcadas((atual) => {
      const nova = new Set(atual);
      if (nova.has(id)) nova.delete(id);
      else nova.add(id);
      return nova;
    });
  }

  const idCampo = (nome) => `${nome}-${item.aluno_id}`;
  const invalido = (nome) => (erro.campo === nome ? ' invalido' : '');

  return (
    <article className="cartao">
      <header className="cartao-topo">
        <div>
          <h2 className="cartao-titulo">{item.nome}</h2>
          <p className="texto-secundario">
            Matrícula {item.matricula}
            {ac && ` · versão ${ac.versao}`}
          </p>
        </div>
        <span className={`celula-status${realce ? ' realce' : ''}`}>
          <BadgeStatus status={ac ? ac.status : 'sem_lancamento'} />
        </span>
      </header>

      {ac?.status === 'devolvido' && ac.motivo_devolucao && (
        <p className="motivo-box">
          ↩ <strong>Devolvido pela coordenação:</strong> {ac.motivo_devolucao}
        </p>
      )}

      <div className="lanc-campos">
        <label className="lanc-campo" htmlFor={idCampo('media')}>
          <span>Média (0–10)</span>
          <input className={`input-tabela${invalido('media')}`} id={idCampo('media')} type="number" min="0" max="10"
            step="0.1" inputMode="decimal" value={media} disabled={!editavel}
            onChange={(e) => { setMedia(e.target.value); limparErro(); }} />
        </label>
        <label className="lanc-campo" htmlFor={idCampo('faltas')}>
          <span>Faltas</span>
          <input className={`input-tabela${invalido('faltas')}`} id={idCampo('faltas')} type="number" min="0" step="1"
            inputMode="numeric" value={faltas} disabled={!editavel}
            onChange={(e) => { setFaltas(e.target.value); limparErro(); }} />
        </label>
      </div>

      <label className="lanc-campo lanc-descricao" htmlFor={idCampo('descricao')}>
        <span>Parecer descritivo</span>
        <textarea id={idCampo('descricao')} rows={2} maxLength={5000} className={invalido('descricao').trim()}
          placeholder="Como o aluno se desenvolveu neste bimestre?" value={descricao} disabled={!editavel}
          onChange={(e) => { setDescricao(e.target.value); limparErro(); }} />
      </label>

      <div className="chips" role="group" aria-label="Tags de desempenho">
        {tags.map((t) => (
          <button key={t.id} type="button" className="chip" aria-pressed={marcadas.has(t.id)} title={t.descricao || ''}
            disabled={!editavel} onClick={() => alternarTag(t.id)}>
            {t.nome}
          </button>
        ))}
      </div>

      {!editavel && ac && MOTIVO_BLOQUEIO[ac.status] && <p className="texto-secundario">{MOTIVO_BLOQUEIO[ac.status]}</p>}

      <footer className="cartao-acoes">
        <small className="campo-erro" role="alert">{erro.texto}</small>
        {ac && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onHistorico(ac.id)}>
            Histórico
          </button>
        )}
        {editavel && (
          <>
            <BotaoAcao className="btn btn-ghost btn-sm" data-salvar textoOcupado="Salvando..." onAcao={() => salvar(false)}>
              Salvar rascunho
            </BotaoAcao>
            <BotaoAcao className="btn btn-primary btn-sm" textoOcupado="Enviando..." onAcao={() => salvar(true)}>
              Enviar para revisão
            </BotaoAcao>
          </>
        )}
      </footer>
    </article>
  );
}
