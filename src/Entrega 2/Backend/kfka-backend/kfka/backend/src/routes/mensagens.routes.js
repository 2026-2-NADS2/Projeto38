// mensagens.routes.js — módulo Comunicação (tabela mensagem).
//
//   GET  /api/mensagens/conversas    lista de conversas (último texto + não lidas)
//   GET  /api/mensagens/:usuarioId   histórico com um contato (marca como lidas)
//        ?antes_de=<id>&limite=50   mensagens mais antigas que <id> (botão "carregar anteriores");
//        a resposta traz tem_mais: true quando ainda há mensagens anteriores
//   POST /api/mensagens              envia mensagem { destinatario_id, texto, aluno_id? }
//
// Quem conversa com quem respeita os vínculos (utils/acesso.js):
//   responsável <-> coordenação e professores dos seus filhos
//   professor   <-> coordenação, professores e responsáveis de alunos das suas turmas
// A mensagem pode ser associada a um aluno que as duas pessoas têm em comum.

const { Router } = require('express');

const db = require('../db');
const schemas = require('../schemas');
const validar = require('../middlewares/validar');
const { autenticar, perfilApi } = require('../middlewares/auth');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { contatosPermitidos, podeVerAluno, alunosDoResponsavel } = require('../utils/acesso');

const router = Router();
router.use(autenticar);

const formatar = (m, meuId) => ({
  id: m.id,
  remetente_id: m.remetente_id,
  destinatario_id: m.destinatario_id,
  texto: m.texto,
  lida: Boolean(m.lida),
  criado_em: m.criado_em,
  minha: m.remetente_id === meuId,
  aluno_id: m.aluno_id ?? null,
  aluno: m.aluno ?? null,
});

const SQL_MENSAGEM = `
  SELECT m.id, m.remetente_id, m.destinatario_id, m.texto, m.lida, m.criado_em, m.aluno_id, a.nome AS aluno
    FROM mensagem m LEFT JOIN aluno a ON a.id = m.aluno_id`;

// Contato com quem posso conversar agora (vínculos) — ou, para ler, alguém com quem já conversei
async function buscarContato(eu, contatoId, { paraEnviar }) {
  if (contatoId === eu.id) throw AppError.requisicaoInvalida('Você não pode enviar mensagem para si mesmo.');

  const [contato] = await db.query('SELECT id, nome, perfil, ativo FROM usuario WHERE id = ?', [contatoId]);
  if (!contato) throw AppError.naoEncontrado('Contato não encontrado.');
  const perfil = perfilApi(contato.perfil);

  const [permitido] = contato.ativo ? await contatosPermitidos(eu, contato.id) : [];
  if (!permitido) {
    if (paraEnviar) {
      if (!contato.ativo) throw AppError.naoEncontrado('Contato não encontrado.');
      throw AppError.semPermissao(
        eu.perfil === 'responsavel' && perfil === 'responsavel'
          ? 'Responsáveis só podem conversar com a equipe da escola.'
          : 'Você só pode conversar com pessoas ligadas aos seus alunos e turmas.'
      );
    }
    const historico = await db.query(
      `SELECT id FROM mensagem WHERE (remetente_id = ? AND destinatario_id = ?)
          OR (remetente_id = ? AND destinatario_id = ?) LIMIT 1`,
      [eu.id, contato.id, contato.id, eu.id]
    );
    if (!historico.length) throw AppError.naoEncontrado('Contato não encontrado.');
  }
  return { id: contato.id, nome: contato.nome, perfil, pode_responder: Boolean(permitido) };
}

// O aluno da conversa precisa ser comum às duas pessoas
async function validarAlunoDaConversa(eu, contato, alunoId) {
  if (!alunoId) return;
  let ok = await podeVerAluno(eu, alunoId);
  if (ok && contato.perfil === 'responsavel') {
    const [r] = await db.query('SELECT id FROM responsavel WHERE usuario_id = ?', [contato.id]);
    ok = Boolean(r) && (await alunosDoResponsavel(r.id)).includes(alunoId);
  }
  if (!ok) {
    throw new AppError(422, 'DADOS_INVALIDOS', 'Verifique os dados enviados.', [
      { campo: 'aluno_id', mensagem: 'Escolha um aluno ligado a esta conversa.' },
    ]);
  }
}

router.get(
  '/conversas',
  asyncHandler(async (req, res) => {
    const eu = req.usuario.id;
    // Uma linha por contato, calculada no banco (sem carregar todas as mensagens):
    // id da última mensagem e quantas não lidas
    const resumo = await db.query(
      `SELECT x.contato_id, MAX(x.id) AS ultima_id,
              SUM(CASE WHEN x.destinatario_id = ? AND x.lida = FALSE THEN 1 ELSE 0 END) AS nao_lidas
         FROM (SELECT CASE WHEN m.remetente_id = ? THEN m.destinatario_id ELSE m.remetente_id END AS contato_id,
                      m.id, m.destinatario_id, m.lida
                 FROM mensagem m
                WHERE m.remetente_id = ? OR m.destinatario_id = ?) x
        GROUP BY x.contato_id`,
      [eu, eu, eu, eu]
    );
    const ultimas = resumo.length
      ? await db.query(`${SQL_MENSAGEM} WHERE m.id IN (?)`, [resumo.map((r) => r.ultima_id)])
      : [];
    const conversas = new Map();
    for (const r of resumo) {
      const m = ultimas.find((u) => u.id === r.ultima_id);
      conversas.set(r.contato_id, {
        contato_id: r.contato_id,
        ultima_mensagem: m.texto,
        ultima_em: m.criado_em,
        enviada_por_mim: m.remetente_id === eu,
        ultimo_aluno: m.aluno,
        nao_lidas: Number(r.nao_lidas) || 0,
        _id: m.id,
      });
    }
    if (!conversas.size) return res.json({ dados: [] });

    const ids = [...conversas.keys()];
    const usuarios = await db.query('SELECT id, nome, perfil FROM usuario WHERE id IN (?)', [ids]);
    // Para responsáveis, mostra de quem são responsáveis (ex.: "Resp. de Lucas Ribeiro")
    const filhos = await db.query(
      `SELECT r.usuario_id, a.nome
         FROM responsavel r
         JOIN aluno_responsavel ar ON ar.responsavel_id = r.id
         JOIN aluno a ON a.id = ar.aluno_id
        WHERE r.usuario_id IN (?) AND a.ativo = TRUE
        ORDER BY a.nome`,
      [ids]
    );

    const dados = [...conversas.values()].map((c) => {
      const u = usuarios.find((x) => x.id === c.contato_id) || { nome: 'Usuário removido', perfil: '' };
      const alunos = filhos.filter((f) => f.usuario_id === c.contato_id).map((f) => f.nome);
      const { _id, ...resto } = c;
      return { ...resto, nome: u.nome, perfil: perfilApi(u.perfil), alunos: alunos.length ? alunos.join(', ') : null, _id };
    });
    // Mais recente primeiro (o id da mensagem acompanha a ordem de envio)
    dados.sort((a, b) => b._id - a._id);
    res.json({ dados: dados.map(({ _id, ...c }) => c) });
  })
);

router.get(
  '/:usuarioId',
  validar(schemas.paramContato, 'params'),
  asyncHandler(async (req, res) => {
    const eu = req.usuario.id;
    const contato = await buscarContato(req.usuario, req.validado.params.usuarioId, { paraEnviar: false });

    await db.query('UPDATE mensagem SET lida = TRUE WHERE remetente_id = ? AND destinatario_id = ? AND lida = FALSE', [
      contato.id,
      eu,
    ]);

    // Página de mensagens (as mais recentes, ou as anteriores a ?antes_de=), em ordem cronológica.
    // Busca uma a mais só para saber se ainda há anteriores.
    const limite = Math.min(Math.max(Number(req.query.limite) || 50, 1), 100);
    const antesDe = Number(req.query.antes_de) || null;
    const pagina = await db.query(
      `${SQL_MENSAGEM}
        WHERE ((m.remetente_id = ? AND m.destinatario_id = ?) OR (m.remetente_id = ? AND m.destinatario_id = ?))
          AND (? IS NULL OR m.id < ?)
        ORDER BY m.id DESC
        LIMIT ?`,
      [eu, contato.id, contato.id, eu, antesDe, antesDe, limite + 1]
    );
    const temMais = pagina.length > limite;
    const mensagens = pagina.slice(0, limite).reverse().map((m) => formatar(m, eu));
    res.json({ dados: { contato, mensagens, tem_mais: temMais } });
  })
);

router.post(
  '/',
  validar(schemas.mensagem),
  asyncHandler(async (req, res) => {
    const eu = req.usuario.id;
    const contato = await buscarContato(req.usuario, req.body.destinatario_id, { paraEnviar: true });
    await validarAlunoDaConversa(req.usuario, contato, req.body.aluno_id);
    const r = await db.query('INSERT INTO mensagem (remetente_id, destinatario_id, texto, aluno_id) VALUES (?, ?, ?, ?)', [
      eu,
      contato.id,
      req.body.texto,
      req.body.aluno_id,
    ]);
    const [m] = await db.query(`${SQL_MENSAGEM} WHERE m.id = ?`, [r.insertId]);
    res.status(201).json({ dados: formatar(m, eu) });
  })
);

module.exports = router;
