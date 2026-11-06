// documentos.routes.js — consulta e solicitação de documentos escolares.
//
//   GET   /api/documentos/tipos           documentos que podem ser pedidos
//   GET   /api/documentos?status=         responsável: pedidos dos seus filhos · admin: todos
//   POST  /api/documentos                 (responsável) solicita { aluno_id, tipo, finalidade? }
//   PATCH /api/documentos/:id             (admin) { status: EM_ANALISE | DISPONIVEL | RECUSADO, justificativa? }
//   GET   /api/documentos/:id/conteudo    dados do documento DISPONÍVEL, para ver/imprimir/salvar em PDF
//
// Os documentos são GERADOS pela plataforma a partir dos dados do banco (matrícula,
// frequência das aulas e boletins publicados), com um código de validação.
// "Outro documento" não é gerado: a secretaria orienta a retirada pela justificativa.

const crypto = require('crypto');
const { Router } = require('express');

const db = require('../db');
const env = require('../config/env');
const schemas = require('../schemas');
const validar = require('../middlewares/validar');
const { autenticar, autorizar } = require('../middlewares/auth');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { consultaPaginada } = require('../utils/paginacao');
const { alunosDoResponsavel } = require('../utils/acesso');

const router = Router();
router.use(autenticar, autorizar('responsavel', 'admin'));

const TIPOS = [
  { tipo: 'declaracao_matricula', nome: 'Declaração de matrícula', descricao: 'Comprova que o aluno está matriculado neste ano letivo.', gerado: true },
  { tipo: 'declaracao_frequencia', nome: 'Declaração de frequência', descricao: 'Presenças e faltas registradas nas aulas do ano letivo.', gerado: true },
  { tipo: 'historico_escolar', nome: 'Histórico escolar', descricao: 'Médias e faltas publicadas de cada disciplina e bimestre.', gerado: true },
  { tipo: 'boletim', nome: 'Boletim escolar', descricao: 'Boletim oficial com as médias publicadas.', gerado: true },
  { tipo: 'outro', nome: 'Outro documento', descricao: 'Descreva o documento na finalidade; a secretaria orienta a retirada.', gerado: false },
];
const nomeTipo = (t) => TIPOS.find((x) => x.tipo === String(t).toLowerCase())?.nome || t;

const st = (s) => (s ? String(s).toLowerCase() : null);

const SQL = `
  SELECT ds.id, ds.aluno_id, al.nome AS aluno, al.matricula, ds.tipo, ds.finalidade, ds.status, ds.justificativa,
         ds.codigo_validacao, ds.criado_em, ds.atualizado_em, ds.atendido_em,
         us.nome AS solicitante, ua.nome AS atendido_por
    FROM documento_solicitacao ds
    JOIN aluno al ON al.id = ds.aluno_id
    JOIN usuario us ON us.id = ds.solicitante_id
    LEFT JOIN usuario ua ON ua.id = ds.atendido_por`;

const formatar = (d) => ({ ...d, tipo: st(d.tipo), tipo_nome: nomeTipo(d.tipo), status: st(d.status) });

async function buscar(usuario, id) {
  const [d] = await db.query(`${SQL} WHERE ds.id = ?`, [id]);
  if (!d) throw AppError.naoEncontrado('Solicitação não encontrada.');
  if (usuario.perfil === 'responsavel' && !(await alunosDoResponsavel(usuario.responsavelId)).includes(d.aluno_id)) {
    throw AppError.naoEncontrado('Solicitação não encontrada.');
  }
  return d;
}

router.get('/tipos', (req, res) => res.json({ dados: TIPOS }));

// Responsável só vê pedidos dos filhos vinculados (mesma regra na lista e no detalhe)
async function filtroAcesso(u, params) {
  if (u.perfil !== 'responsavel') return { filtro: '', params };
  const filhos = await alunosDoResponsavel(u.responsavelId);
  return { filtro: 'AND ds.aluno_id IN (?)', params: [...params, filhos.length ? filhos : [0]] };
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const u = req.usuario;
    const status = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : null;
    const { filtro, params } = await filtroAcesso(u, [status, status]);
    const { linhas, meta } = await consultaPaginada(
      req,
      `${SQL} WHERE (? IS NULL OR ds.status = ?) ${filtro}
        ORDER BY CASE ds.status WHEN 'SOLICITADO' THEN 0 WHEN 'EM_ANALISE' THEN 1 ELSE 2 END, ds.criado_em DESC, ds.id DESC`,
      params
    );
    res.json({ dados: linhas.map(formatar), ...(meta ? { meta } : {}) });
  })
);

router.post(
  '/',
  autorizar('responsavel'),
  validar(schemas.solicitacaoDocumento),
  asyncHandler(async (req, res) => {
    const { aluno_id, tipo, finalidade } = req.body;
    if (!(await alunosDoResponsavel(req.usuario.responsavelId)).includes(aluno_id)) {
      throw AppError.naoEncontrado('Aluno não encontrado.');
    }
    if (tipo !== 'OUTRO') {
      const aberto = await db.query(
        `SELECT id FROM documento_solicitacao
          WHERE aluno_id = ? AND tipo = ? AND status IN ('SOLICITADO', 'EM_ANALISE')`,
        [aluno_id, tipo]
      );
      if (aberto.length) throw AppError.conflito('Já existe um pedido deste documento em andamento para este aluno.');
    }
    const r = await db.query(
      'INSERT INTO documento_solicitacao (aluno_id, solicitante_id, tipo, finalidade) VALUES (?, ?, ?, ?)',
      [aluno_id, req.usuario.id, tipo, finalidade]
    );
    res.status(201).json({ dados: formatar(await buscar(req.usuario, r.insertId)) });
  })
);

router.patch(
  '/:id',
  autorizar('admin'),
  validar(schemas.paramId, 'params'),
  validar(schemas.atendimentoDocumento),
  asyncHandler(async (req, res) => {
    const d = await buscar(req.usuario, req.validado.params.id);
    if (['DISPONIVEL', 'RECUSADO'].includes(d.status)) throw AppError.conflito('Esta solicitação já foi concluída.');
    const { status, justificativa } = req.body;
    const codigo = status === 'DISPONIVEL' && d.tipo !== 'OUTRO' ? gerarCodigo() : null;
    await db.query(
      `UPDATE documento_solicitacao
          SET status = ?, justificativa = ?, codigo_validacao = COALESCE(?, codigo_validacao),
              atendido_por = ?, atendido_em = NOW()
        WHERE id = ?`,
      [status, justificativa, codigo, req.usuario.id, d.id]
    );
    res.json({ dados: formatar(await buscar(req.usuario, d.id)) });
  })
);

function gerarCodigo() {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(10);
  return `KF${[...bytes].map((b) => alfabeto[b % alfabeto.length]).join('')}`;
}

// ---------------------------------------------------------------------------
// Conteúdo do documento (gerado a partir do banco)
// ---------------------------------------------------------------------------
router.get(
  '/:id/conteudo',
  validar(schemas.paramId, 'params'),
  asyncHandler(async (req, res) => {
    const d = await buscar(req.usuario, req.validado.params.id);
    if (d.status !== 'DISPONIVEL') throw AppError.conflito('Este documento ainda não está disponível.');
    if (d.tipo === 'OUTRO') throw AppError.conflito('Este documento não é gerado pela plataforma. Veja a orientação da secretaria.');

    const [aluno] = await db.query(
      `SELECT a.nome, a.matricula, a.data_nascimento, t.nome AS turma, t.serie, t.turno, ta.ano_letivo
         FROM aluno a
         LEFT JOIN turma_aluno ta ON ta.aluno_id = a.id AND ta.ano_letivo = ?
         LEFT JOIN turma t ON t.id = ta.turma_id
        WHERE a.id = ?`,
      [env.ANO_LETIVO, d.aluno_id]
    );

    const conteudo = {
      solicitacao: formatar(d),
      escola: { nome: 'Escola KFKA — ambiente de demonstração', cidade: 'São Paulo – SP' },
      ano_letivo: env.ANO_LETIVO,
      aluno,
      emitido_em: d.atendido_em,
    };

    if (d.tipo === 'DECLARACAO_FREQUENCIA') {
      const [f] = await db.query(
        `SELECT COUNT(*) AS aulas, SUM(CASE WHEN p.presente = TRUE THEN 1 ELSE 0 END) AS presencas
           FROM aula_presenca p JOIN aula a ON a.id = p.aula_id
          WHERE p.aluno_id = ? AND a.status = 'FINALIZADA' AND a.data >= ?`,
        [d.aluno_id, `${env.ANO_LETIVO}-01-01`]
      );
      const aulas = Number(f.aulas) || 0;
      const presencas = Number(f.presencas) || 0;
      conteudo.frequencia = {
        aulas,
        presencas,
        faltas: aulas - presencas,
        percentual: aulas ? Math.round((presencas / aulas) * 1000) / 10 : null,
      };
    }

    if (d.tipo === 'HISTORICO_ESCOLAR' || d.tipo === 'BOLETIM') {
      const linhas = await db.query(
        `SELECT bimestre, disciplina, area, media, faltas
           FROM vw_acompanhamento_completo
          WHERE aluno_id = ? AND ano_letivo = ? AND status = 'PUBLICADO'
          ORDER BY area, disciplina, bimestre`,
        [d.aluno_id, env.ANO_LETIVO]
      );
      const disciplinas = [];
      for (const l of linhas) {
        let item = disciplinas.find((x) => x.disciplina === l.disciplina);
        if (!item) {
          item = { disciplina: l.disciplina, area: l.area, bimestres: {}, faltas: 0 };
          disciplinas.push(item);
        }
        item.bimestres[l.bimestre] = Number(l.media);
        item.faltas += Number(l.faltas);
      }
      for (const item of disciplinas) {
        const medias = Object.values(item.bimestres);
        item.media = medias.length ? Math.round((medias.reduce((s, n) => s + n, 0) / medias.length) * 10) / 10 : null;
      }
      conteudo.disciplinas = disciplinas;
    }

    res.json({ dados: conteudo });
  })
);

// Detalhe do pedido (o link de uma pendência pode apontar para item fora da página atual)
router.get(
  '/:id',
  validar(schemas.paramId, 'params'),
  asyncHandler(async (req, res) => {
    const { filtro, params } = await filtroAcesso(req.usuario, [req.validado.params.id]);
    const [d] = await db.query(`${SQL} WHERE ds.id = ? ${filtro}`, params);
    if (!d) throw AppError.naoEncontrado('Solicitação não encontrada.');
    res.json({ dados: formatar(d) });
  })
);

module.exports = router;
