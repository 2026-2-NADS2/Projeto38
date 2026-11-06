// EdicaoRegistro.jsx — a coordenação altera um lançamento antes de publicar (RF06).
// A API grava nova versão e o motivo no histórico; se outra pessoa alterou o registro
// enquanto a janela estava aberta, a API recusa (409) e pede para recarregar.
//
//   <EdicaoRegistro registro={ac} tags={listaDeTags} onFechar={...} onSalvo={(novo) => ...} />

import { useEffect } from 'react';
import { api } from '../api/cliente';
import { useFormulario } from '../hooks/useFormulario';
import { Campo, ErroFormulario, Aviso } from './Formulario';
import Janela from './Janela';
import BotaoAcao from './BotaoAcao';

const regras = {
  media: (v) => {
    const n = Number(String(v).replace(',', '.'));
    if (String(v).trim() === '' || Number.isNaN(n)) return 'Informe a média (0 a 10).';
    if (n < 0 || n > 10) return 'A média vai de 0 a 10.';
    return '';
  },
  faltas: (v) => (String(v).trim() === '' || !/^\d+$/.test(String(v)) ? 'Informe um número inteiro de faltas.' : ''),
  descricao: (v) => (String(v || '').trim().length < 5 ? 'A descrição precisa de pelo menos 5 caracteres.' : ''),
  motivo: (v) => (String(v || '').trim().length < 5 ? 'Explique o motivo da alteração (mínimo 5 caracteres).' : ''),
};

const VAZIO = { media: '', faltas: '', descricao: '', tags: [], motivo: '' };

export default function EdicaoRegistro({ registro, tags = [], onFechar, onSalvo }) {
  const f = useFormulario(VAZIO); // objeto fixo: o reiniciar fica estável entre renderizações
  const { reiniciar } = f;

  useEffect(() => {
    if (!registro) return;
    const ids = tags.filter((t) => (registro.tags || []).includes(t.nome)).map((t) => t.id);
    reiniciar({
      media: String(registro.media ?? '').replace('.', ','),
      faltas: String(registro.faltas ?? 0),
      descricao: registro.descricao || '',
      tags: ids,
      motivo: '',
    });
  }, [registro, tags, reiniciar]);

  if (!registro) return null;
  const semCadastro = (registro.tags || []).filter((n) => !tags.some((t) => t.nome === n));

  async function salvar() {
    if (!f.validar(regras)) throw new Error('invalido');
    try {
      const salvo = await api.patch(`/acompanhamentos/${registro.id}/editar`, {
        media: Number(String(f.valores.media).replace(',', '.')),
        faltas: Number(f.valores.faltas),
        descricao: f.valores.descricao.trim(),
        tags: f.valores.tags,
        motivo: f.valores.motivo.trim(),
        versao: registro.versao,
      });
      onSalvo(salvo);
    } catch (err) {
      f.errosDaApi(err);
      throw err;
    }
  }

  const alternarTag = (id) =>
    f.definir('tags', f.valores.tags.includes(id) ? f.valores.tags.filter((t) => t !== id) : [...f.valores.tags, id]);

  return (
    <Janela
      aberto={Boolean(registro)}
      onFechar={onFechar}
      largo
      titulo="Alterar antes de publicar"
      subtitulo={`${registro.aluno} · ${registro.disciplina} · ${registro.bimestre}º bimestre · versão ${registro.versao}`}
      rodape={
        <>
          <button type="button" className="btn btn-ghost" onClick={onFechar}>
            Cancelar
          </button>
          <BotaoAcao textoOcupado="Salvando..." onAcao={salvar}>
            Salvar alteração
          </BotaoAcao>
        </>
      }
    >
      <Aviso tom="info">
        A alteração gera uma nova versão e fica no histórico com o seu nome e o motivo. O professor vê o que mudou. O registro passa para
        “Em revisão” e continua sem aparecer para a família até ser publicado.
      </Aviso>
      <div className="form-grid">
        <Campo nome="media" rotulo="Média (0 a 10)" erro={f.erros.media}>
          <input inputMode="decimal" value={f.valores.media} onChange={f.campo('media')} />
        </Campo>
        <Campo nome="faltas" rotulo="Faltas no bimestre" erro={f.erros.faltas}>
          <input inputMode="numeric" value={f.valores.faltas} onChange={f.campo('faltas')} />
        </Campo>
        <Campo nome="descricao" rotulo="Descrição do acompanhamento" erro={f.erros.descricao} className="col-2">
          <textarea rows={5} maxLength={5000} value={f.valores.descricao} onChange={f.campo('descricao')} />
        </Campo>
        <div className="campo col-2">
          <span className="rotulo-grupo" id="edicao-tags">
            Tags <span className="opcional">(opcional)</span>
          </span>
          <div className="chips" role="group" aria-labelledby="edicao-tags">
            {tags.map((t) => (
              <button key={t.id} type="button" className="chip" aria-pressed={f.valores.tags.includes(t.id)} title={t.descricao || ''}
                onClick={() => alternarTag(t.id)}>
                {t.nome}
              </button>
            ))}
          </div>
          {semCadastro.length > 0 && (
            <small className="campo-dica">Tag desativada e removida ao salvar: {semCadastro.join(', ')}.</small>
          )}
          {f.erros.tags && <small className="campo-erro" role="alert">{f.erros.tags}</small>}
        </div>
        <Campo nome="motivo" rotulo="Motivo da alteração" erro={f.erros.motivo} className="col-2" dica="Fica registrado no histórico do lançamento.">
          <input maxLength={300} value={f.valores.motivo} onChange={f.campo('motivo')} />
        </Campo>
      </div>
      <ErroFormulario>{f.erroGeral}</ErroFormulario>
    </Janela>
  );
}
