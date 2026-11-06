// perfil.routes.js — "Meu perfil": dados da conta, edição permitida e troca de senha.
//
//   GET /api/perfil         (logado)  dados do usuário + informações do perfil (turmas, filhos...)
//   PUT /api/perfil         (logado)  edita o que é permitido (telefone, foto; nome só a coordenação)
//   PUT /api/perfil/senha   (logado)  troca a senha (exige a senha atual); encerra as outras sessões
//   POST /api/perfil/aceite (responsável) registra o aceite do termo de uso dos dados (LGPD)
//   GET /api/perfil/meus-dados (logado) cópia dos dados pessoais da conta (LGPD, art. 18 — acesso)
//
// E-mail e registro funcional não são editáveis aqui: identificam a pessoa no login e
// nos documentos. Alterações desses dados são feitas pela coordenação.

const { Router } = require('express');
const bcrypt = require('bcryptjs');

const db = require('../db');
const env = require('../config/env');
const schemas = require('../schemas');
const validar = require('../middlewares/validar');
const { autenticar, perfilApi, gerarToken } = require('../middlewares/auth');
const { auditar, auditarAntes, comAuditoria, diferenca } = require('../utils/auditoria');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');

const router = Router();
router.use(autenticar);

async function montarPerfil(usuario) {
  const [u] = await db.query(
    `SELECT u.id, u.nome, u.email, u.perfil, u.foto, u.ultimo_login_em, u.criado_em,
            p.registro, p.documento, COALESCE(p.telefone, r.telefone) AS telefone, r.aceite_lgpd_em
       FROM usuario u
       LEFT JOIN professor   p ON p.usuario_id = u.id
       LEFT JOIN responsavel r ON r.usuario_id = u.id
      WHERE u.id = ?`,
    [usuario.id]
  );
  if (!u) throw AppError.naoAutenticado('Usuário não encontrado. Faça login novamente.');

  const perfil = perfilApi(u.perfil);
  const dados = {
    id: u.id,
    nome: u.nome,
    email: u.email,
    perfil,
    foto: u.foto,
    telefone: u.telefone,
    ultimo_login_em: u.ultimo_login_em,
    criado_em: u.criado_em,
    // O que cada perfil pode editar (a tela usa para habilitar os campos)
    editavel: { nome: perfil === 'admin', telefone: perfil !== 'admin', foto: true },
  };

  if (perfil === 'professor') {
    dados.registro = u.registro;
    dados.documento = u.documento ? mascararDocumento(u.documento) : null;
    dados.vinculos = await db.query(
      `SELECT t.nome AS turma, d.nome AS disciplina
         FROM turma_disciplina_professor tdp
         JOIN turma t ON t.id = tdp.turma_id
         JOIN disciplina d ON d.id = tdp.disciplina_id
        WHERE tdp.professor_id = ? AND t.ano_letivo = ?
        ORDER BY t.serie, t.nome, d.nome`,
      [usuario.professorId, env.ANO_LETIVO]
    );
  }
  if (perfil === 'responsavel') {
    dados.aceite_lgpd_em = u.aceite_lgpd_em;
    dados.filhos = await db.query(
      `SELECT a.nome, a.matricula, ar.parentesco, t.nome AS turma
         FROM aluno_responsavel ar
         JOIN aluno a ON a.id = ar.aluno_id
         LEFT JOIN turma_aluno ta ON ta.aluno_id = a.id AND ta.ano_letivo = ?
         LEFT JOIN turma t ON t.id = ta.turma_id
        WHERE ar.responsavel_id = ? AND ar.autorizado = TRUE AND a.ativo = TRUE
        ORDER BY a.nome`,
      [env.ANO_LETIVO, usuario.responsavelId]
    );
  }
  return dados;
}

// Mostra só o fim do documento (LGPD: exposição mínima)
function mascararDocumento(doc) {
  const s = String(doc);
  return s.length <= 4 ? '****' : `${'*'.repeat(Math.max(0, s.length - 4))}${s.slice(-4)}`;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json({ dados: await montarPerfil(req.usuario) });
  })
);

router.put(
  '/',
  validar(schemas.perfil),
  asyncHandler(async (req, res) => {
    const { perfil, id, professorId, responsavelId } = req.usuario;
    const { nome, telefone, foto } = req.body;
    const antes = await montarPerfil(req.usuario);

    await db.transacao(id, async (tx) => {
      if (nome !== undefined && perfil === 'admin') {
        await tx.query('UPDATE usuario SET nome = ? WHERE id = ?', [nome, id]);
      }
      if (foto !== undefined) await tx.query('UPDATE usuario SET foto = ? WHERE id = ?', [foto, id]);
      if (perfil === 'professor') await tx.query('UPDATE professor SET telefone = ? WHERE id = ?', [telefone, professorId]);
      if (perfil === 'responsavel') {
        await tx.query('UPDATE responsavel SET telefone = ? WHERE id = ?', [telefone, responsavelId]);
      }
    });

    const depois = await montarPerfil(req.usuario);
    auditar(res, {
      acao: 'EDITAR_PERFIL',
      entidade: 'usuario',
      entidade_id: id,
      detalhes: { ...diferenca(antes, depois, ['nome', 'telefone']), ...(foto !== undefined ? { foto: 'alterada' } : {}) },
    });
    res.json({ dados: depois });
  })
);

router.put(
  '/senha',
  validar(schemas.trocaSenha),
  asyncHandler(async (req, res) => {
    const [u] = await db.query('SELECT senha_hash FROM usuario WHERE id = ?', [req.usuario.id]);
    let confere = false;
    try {
      confere = await bcrypt.compare(req.body.senha_atual, u.senha_hash);
    } catch {
      confere = false;
    }
    if (!confere) {
      throw new AppError(422, 'DADOS_INVALIDOS', 'Verifique os dados enviados.', [
        { campo: 'senha_atual', mensagem: 'A senha atual não confere.' },
      ]);
    }
    const hash = await bcrypt.hash(req.body.nova_senha, 10);
    // A troca encerra todas as sessões abertas (outros aparelhos); esta recebe um token novo
    await comAuditoria(
      req,
      res,
      (tx) =>
        tx.query(
          `UPDATE usuario SET senha_hash = ?, token_recuperacao = NULL, token_expira_em = NULL,
                  sessao_versao = sessao_versao + 1 WHERE id = ?`,
          [hash, req.usuario.id]
        ),
      { acao: 'TROCAR_SENHA', entidade: 'usuario', entidade_id: req.usuario.id, detalhes: null }
    );
    const [conta] = await db.query(
      `SELECT u.id, u.nome, u.perfil, u.sessao_versao, p.id AS professor_id, r.id AS responsavel_id
         FROM usuario u LEFT JOIN professor p ON p.usuario_id = u.id LEFT JOIN responsavel r ON r.usuario_id = u.id
        WHERE u.id = ?`,
      [req.usuario.id]
    );
    res.json({ dados: { token: gerarToken(conta) } });
  })
);

// Aceite do termo (LGPD) por conta de responsável criada pela coordenação.
// O cadastro público já registra o aceite; aqui é o primeiro acesso das contas criadas pela escola.
router.post(
  '/aceite',
  validar(schemas.aceiteLgpd),
  asyncHandler(async (req, res) => {
    if (req.usuario.perfil !== 'responsavel') throw AppError.semPermissao('O aceite é feito pela conta do responsável.');
    // Consentimento e registro de auditoria na mesma transação
    await comAuditoria(
      req,
      res,
      (tx) => tx.query('UPDATE responsavel SET aceite_lgpd_em = NOW() WHERE id = ? AND aceite_lgpd_em IS NULL', [req.usuario.responsavelId]),
      (r) => ({
        acao: 'ACEITE_LGPD',
        entidade: 'responsavel',
        entidade_id: req.usuario.responsavelId,
        detalhes: { ja_aceito: r.affectedRows === 0 },
      })
    );
    const [{ aceite_lgpd_em }] = await db.query('SELECT aceite_lgpd_em FROM responsavel WHERE id = ?', [
      req.usuario.responsavelId,
    ]);
    res.json({ dados: { aceite_lgpd_em } });
  })
);

// Direito de acesso (LGPD art. 18, II): a pessoa baixa os dados pessoais que a plataforma guarda
// sobre ela (e, se for responsável, os dados cadastrais e relatórios PUBLICADOS dos alunos vinculados).
// Não inclui hash de senha, tokens nem registros internos de outras pessoas.
router.get(
  '/meus-dados',
  asyncHandler(async (req, res) => {
    const { id, perfil, responsavelId, professorId } = req.usuario;
    const [conta] = await db.query(
      'SELECT id, nome, email, perfil, ativo, ultimo_login_em, criado_em, atualizado_em FROM usuario WHERE id = ?',
      [id]
    );
    const dados = {
      gerado_em: new Date().toISOString(),
      conta: { ...conta, perfil: perfilApi(conta.perfil), ativo: Boolean(conta.ativo) },
      finalidade:
        'Dados usados apenas para o acompanhamento escolar: acesso à plataforma, comunicação com a escola e consulta dos relatórios publicados.',
    };
    if (perfil === 'professor') {
      [dados.professor] = await db.query('SELECT registro, telefone, documento FROM professor WHERE id = ?', [professorId]);
      dados.vinculos = (await montarPerfil(req.usuario)).vinculos;
    }
    if (perfil === 'responsavel') {
      [dados.responsavel] = await db.query('SELECT telefone, aceite_lgpd_em FROM responsavel WHERE id = ?', [responsavelId]);
      dados.alunos = await db.query(
        `SELECT a.id, a.nome, a.matricula, a.data_nascimento, ar.parentesco, ar.autorizado
           FROM aluno_responsavel ar JOIN aluno a ON a.id = ar.aluno_id
          WHERE ar.responsavel_id = ? ORDER BY a.nome`,
        [responsavelId]
      );
      dados.relatorios_publicados = await db.query(
        `SELECT aluno, disciplina, bimestre, ano_letivo, media, faltas, descricao, publicado_em, data_ciencia
           FROM vw_relatorio_responsavel WHERE responsavel_id = ?
          ORDER BY ano_letivo, bimestre, aluno, disciplina`,
        [responsavelId]
      );
      dados.retornos_enviados = await db.query(
        `SELECT acompanhamento_id, data_ciencia, observacao FROM ciencia_responsavel WHERE responsavel_id = ?
          ORDER BY data_ciencia`,
        [responsavelId]
      );
    }
    dados.mensagens = {
      enviadas: Number((await db.query('SELECT COUNT(*) AS n FROM mensagem WHERE remetente_id = ?', [id]))[0].n),
      recebidas: Number((await db.query('SELECT COUNT(*) AS n FROM mensagem WHERE destinatario_id = ?', [id]))[0].n),
    };
    await auditarAntes(req, res, { acao: 'EXPORTAR_MEUS_DADOS', entidade: 'usuario', entidade_id: id, detalhes: null });
    res.setHeader('Content-Disposition', `attachment; filename="meus-dados-kfka-${id}.json"`);
    res.json({ dados });
  })
);

module.exports = router;
module.exports.mascararDocumento = mascararDocumento;
