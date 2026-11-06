// relatorios.routes.js — relatórios gerenciais (RF10), retornos dos responsáveis (RF12)
// e exportação em CSV/XLSX (RF11). Todos os números vêm de consultas ao banco.
//
//   GET /api/relatorios/opcoes                     listas para os filtros (turmas, disciplinas, professores, tags)
//   GET /api/relatorios/indicadores?filtros        totais por status, turma, disciplina, professor, bimestre, aluno e tag
//   GET /api/relatorios/registros?filtros&pagina   registros (paginados)
//   GET /api/relatorios/retornos?filtros&pagina    ciência e observações dos responsáveis (autor e data)
//   GET /api/relatorios/exportar?formato=csv|xlsx&conteudo=registros|indicadores|retornos&filtros   (só coordenação)
//
// Filtros: ano_letivo, turma_id, disciplina_id, professor_id, bimestre (1-4), aluno_id, tag_id, status.
// Permissões (no servidor):
//   coordenação -> tudo;
//   professor   -> sempre limitado aos PRÓPRIOS registros (o filtro professor_id é forçado);
//   responsável -> sem acesso (consulta o boletim dos filhos).
// Registros cancelados ficam fora dos indicadores (aparecem só no total por status ou filtrando status=cancelado).

const { Router } = require('express');

const db = require('../db');
const env = require('../config/env');
const schemas = require('../schemas');
const validar = require('../middlewares/validar');
const { autenticar, autorizar } = require('../middlewares/auth');
const asyncHandler = require('../utils/asyncHandler');
const { auditarAntes } = require('../utils/auditoria');
const { csv, xlsx } = require('../utils/planilha');

const router = Router();
router.use(autenticar, autorizar('admin', 'professor'));

const MEDIA_MINIMA = 6;
const LIMITE_EXPORTACAO = 20000;

const FROM_BASE = `
  FROM acompanhamento a
  JOIN bimestre b    ON b.id = a.bimestre_id
  JOIN turma t       ON t.id = a.turma_id
  JOIN aluno al      ON al.id = a.aluno_id
  JOIN disciplina d  ON d.id = a.disciplina_id
  JOIN professor p   ON p.id = a.professor_id
  JOIN usuario up    ON up.id = p.usuario_id`;

// Professor: o filtro de professor é sempre o dele, qualquer que seja o valor enviado
function filtrosEfetivos(req, origem = 'query') {
  const f = { ...req.validado[origem] };
  f.ano_letivo = f.ano_letivo || env.ANO_LETIVO;
  if (req.usuario.perfil === 'professor') f.professor_id = req.usuario.professorId;
  return f;
}

// Monta o WHERE com parâmetros (nunca concatena valores)
function montarWhere(f, { incluirCancelados = false } = {}) {
  const cond = ['b.ano_letivo = ?'];
  const params = [f.ano_letivo];
  const igual = (coluna, valor) => {
    if (valor !== undefined && valor !== null) {
      cond.push(`${coluna} = ?`);
      params.push(valor);
    }
  };
  igual('a.turma_id', f.turma_id);
  igual('a.disciplina_id', f.disciplina_id);
  igual('a.professor_id', f.professor_id);
  igual('b.numero', f.bimestre);
  igual('a.aluno_id', f.aluno_id);
  if (f.status) igual('a.status', f.status.toUpperCase());
  else if (!incluirCancelados) cond.push("a.status <> 'CANCELADO'");
  if (f.tag_id) {
    cond.push('EXISTS (SELECT 1 FROM acompanhamento_tag x WHERE x.acompanhamento_id = a.id AND x.tag_id = ?)');
    params.push(f.tag_id);
  }
  return { where: `WHERE ${cond.join(' AND ')}`, params };
}

const arred = (n) => (n === null || n === undefined ? null : Number(Number(n).toFixed(2)));

// Agregado padrão de um grupo: registros, publicados, média e abaixo da média (dos publicados)
const AGREGADO = `
  COUNT(*) AS registros,
  SUM(CASE WHEN a.status = 'PUBLICADO' THEN 1 ELSE 0 END) AS publicados,
  SUM(CASE WHEN a.status IN ('ENVIADO','EM_REVISAO') THEN 1 ELSE 0 END) AS em_revisao,
  AVG(CASE WHEN a.status = 'PUBLICADO' THEN a.media END) AS media,
  SUM(CASE WHEN a.status = 'PUBLICADO' AND a.media < ${MEDIA_MINIMA} THEN 1 ELSE 0 END) AS abaixo_media,
  SUM(a.faltas) AS faltas`;

const linhaAgregado = (l) => ({
  ...l,
  registros: Number(l.registros) || 0,
  publicados: Number(l.publicados) || 0,
  em_revisao: Number(l.em_revisao) || 0,
  media: arred(l.media),
  abaixo_media: Number(l.abaixo_media) || 0,
  faltas: Number(l.faltas) || 0,
});

async function calcularIndicadores(f) {
  const { where, params } = montarWhere(f);
  const comCancelados = montarWhere(f, { incluirCancelados: true });

  const [porStatus, porTurma, porDisciplina, porProfessor, porBimestre, porAluno, porTag, ciencia] = await Promise.all([
    db.query(`SELECT a.status, COUNT(*) AS n ${FROM_BASE} ${comCancelados.where} GROUP BY a.status`, comCancelados.params),
    db.query(
      `SELECT t.id, t.nome AS turma, ${AGREGADO} ${FROM_BASE} ${where} GROUP BY t.id, t.nome, t.serie ORDER BY t.serie, t.nome`,
      params
    ),
    db.query(`SELECT d.id, d.nome AS disciplina, ${AGREGADO} ${FROM_BASE} ${where} GROUP BY d.id, d.nome ORDER BY d.nome`, params),
    db.query(`SELECT p.id, up.nome AS professor, ${AGREGADO} ${FROM_BASE} ${where} GROUP BY p.id, up.nome ORDER BY up.nome`, params),
    db.query(`SELECT b.numero AS bimestre, ${AGREGADO} ${FROM_BASE} ${where} GROUP BY b.numero ORDER BY b.numero`, params),
    // Alunos: os 50 com menor média publicada (lista de atenção)
    db.query(
      `SELECT al.id, al.nome AS aluno, t.nome AS turma, ${AGREGADO} ${FROM_BASE} ${where}
        GROUP BY al.id, al.nome, t.nome
        ORDER BY AVG(CASE WHEN a.status = 'PUBLICADO' THEN a.media END), al.nome
        LIMIT 50`,
      params
    ),
    db.query(
      `SELECT tg.id, tg.nome AS tag, COUNT(*) AS registros
         ${FROM_BASE}
         JOIN acompanhamento_tag x ON x.acompanhamento_id = a.id
         JOIN tag tg ON tg.id = x.tag_id
         ${where}
        GROUP BY tg.id, tg.nome ORDER BY COUNT(*) DESC, tg.nome`,
      params
    ),
    db.query(
      `SELECT SUM(CASE WHEN a.status = 'PUBLICADO' THEN 1 ELSE 0 END) AS publicados,
              SUM(CASE WHEN a.status = 'PUBLICADO' AND EXISTS (SELECT 1 FROM ciencia_responsavel c WHERE c.acompanhamento_id = a.id) THEN 1 ELSE 0 END) AS com_ciencia,
              SUM(CASE WHEN EXISTS (SELECT 1 FROM ciencia_responsavel c WHERE c.acompanhamento_id = a.id AND c.observacao IS NOT NULL) THEN 1 ELSE 0 END) AS com_observacao,
              AVG(CASE WHEN a.status = 'PUBLICADO' THEN a.media END) AS media,
              SUM(CASE WHEN a.status = 'PUBLICADO' AND a.media < ${MEDIA_MINIMA} THEN 1 ELSE 0 END) AS abaixo_media,
              COUNT(*) AS registros
         ${FROM_BASE} ${where}`,
      params
    ),
  ]);

  const status = Object.fromEntries(
    ['RASCUNHO', 'ENVIADO', 'EM_REVISAO', 'DEVOLVIDO', 'PUBLICADO', 'CANCELADO'].map((s) => [s.toLowerCase(), 0])
  );
  porStatus.forEach((l) => {
    status[String(l.status).toLowerCase()] = Number(l.n);
  });
  const c = ciencia[0] || {};
  const publicados = Number(c.publicados) || 0;
  return {
    filtros: f,
    media_minima: MEDIA_MINIMA,
    totais: {
      registros: Number(c.registros) || 0,
      publicados,
      media: arred(c.media),
      abaixo_media: Number(c.abaixo_media) || 0,
      com_ciencia: Number(c.com_ciencia) || 0,
      aguardando_ciencia: publicados - (Number(c.com_ciencia) || 0),
      com_observacao: Number(c.com_observacao) || 0,
    },
    por_status: status,
    por_turma: porTurma.map(linhaAgregado),
    por_disciplina: porDisciplina.map(linhaAgregado),
    por_professor: porProfessor.map(linhaAgregado),
    por_bimestre: porBimestre.map(linhaAgregado),
    por_aluno: porAluno.map(linhaAgregado),
    por_tag: porTag.map((l) => ({ ...l, registros: Number(l.registros) })),
  };
}

const SQL_REGISTROS = `
  SELECT a.id, b.ano_letivo, b.numero AS bimestre, t.nome AS turma, al.nome AS aluno, al.matricula,
         d.nome AS disciplina, up.nome AS professor, a.media, a.faltas, a.status, a.versao,
         a.enviado_em, a.publicado_em, a.descricao,
         (SELECT MIN(c.data_ciencia) FROM ciencia_responsavel c WHERE c.acompanhamento_id = a.id) AS data_ciencia
  ${FROM_BASE}`;

async function tagsDe(ids) {
  if (!ids.length) return {};
  const linhas = await db.query(
    `SELECT x.acompanhamento_id, tg.nome FROM acompanhamento_tag x JOIN tag tg ON tg.id = x.tag_id
      WHERE x.acompanhamento_id IN (?) ORDER BY tg.nome`,
    [ids]
  );
  const mapa = {};
  for (const l of linhas) (mapa[l.acompanhamento_id] ||= []).push(l.nome);
  return mapa;
}

async function buscarRegistros(f, { limite, deslocamento }) {
  const { where, params } = montarWhere(f);
  const [{ total }] = await db.query(`SELECT COUNT(*) AS total ${FROM_BASE} ${where}`, params);
  const linhas = await db.query(
    `${SQL_REGISTROS} ${where} ORDER BY t.serie, t.nome, al.nome, b.numero, d.nome, a.id LIMIT ? OFFSET ?`,
    [...params, limite, deslocamento]
  );
  const tags = await tagsDe(linhas.map((l) => l.id));
  return {
    total: Number(total),
    linhas: linhas.map((l) => ({ ...l, status: String(l.status).toLowerCase(), tags: tags[l.id] || [] })),
  };
}

// Retornos: ciência + observação, com quem enviou e quando
function montarWhereRetornos(f) {
  const base = montarWhere({ ...f, status: undefined }, { incluirCancelados: true });
  let { where } = base;
  if (f.com_observacao === '1') where += " AND c.observacao IS NOT NULL AND c.observacao <> ''";
  return { where, params: base.params };
}

const SQL_RETORNOS = `
  SELECT c.id, c.data_ciencia, c.observacao, ur.nome AS responsavel, ar.parentesco,
         a.id AS acompanhamento_id, b.numero AS bimestre, t.nome AS turma, al.nome AS aluno,
         d.nome AS disciplina, up.nome AS professor
  ${FROM_BASE}
  JOIN ciencia_responsavel c ON c.acompanhamento_id = a.id
  JOIN responsavel r ON r.id = c.responsavel_id
  JOIN usuario ur ON ur.id = r.usuario_id
  LEFT JOIN aluno_responsavel ar ON ar.responsavel_id = r.id AND ar.aluno_id = a.aluno_id`;

async function buscarRetornos(f, { limite, deslocamento }) {
  const { where, params } = montarWhereRetornos(f);
  const [{ total }] = await db.query(
    `SELECT COUNT(*) AS total ${FROM_BASE} JOIN ciencia_responsavel c ON c.acompanhamento_id = a.id ${where}`,
    params
  );
  const linhas = await db.query(`${SQL_RETORNOS} ${where} ORDER BY c.data_ciencia DESC, c.id DESC LIMIT ? OFFSET ?`, [
    ...params,
    limite,
    deslocamento,
  ]);
  return { total: Number(total), linhas };
}

const meta = (total, pagina, porPagina) => ({ total, pagina, por_pagina: porPagina, paginas: Math.max(1, Math.ceil(total / porPagina)) });

// ---------------------------------------------------------------------------
router.get(
  '/opcoes',
  asyncHandler(async (req, res) => {
    const pid = req.usuario.perfil === 'professor' ? req.usuario.professorId : null;
    const ano = Number(req.query.ano_letivo) || env.ANO_LETIVO;
    const [turmas, disciplinas, professores, tags, anos] = await Promise.all([
      db.query(
        `SELECT DISTINCT t.id, t.nome, t.serie FROM turma t
           LEFT JOIN turma_disciplina_professor x ON x.turma_id = t.id
          WHERE t.ano_letivo = ? AND (? IS NULL OR x.professor_id = ?) ORDER BY t.serie, t.nome`,
        [ano, pid, pid]
      ),
      db.query(
        `SELECT DISTINCT d.id, d.nome FROM disciplina d
           LEFT JOIN turma_disciplina_professor x ON x.disciplina_id = d.id
          WHERE (? IS NULL OR x.professor_id = ?) ORDER BY d.nome`,
        [pid, pid]
      ),
      pid
        ? db.query('SELECT p.id, u.nome FROM professor p JOIN usuario u ON u.id = p.usuario_id WHERE p.id = ?', [pid])
        : db.query('SELECT p.id, u.nome FROM professor p JOIN usuario u ON u.id = p.usuario_id ORDER BY u.nome'),
      db.query('SELECT id, nome, ativo FROM tag ORDER BY nome'),
      db.query('SELECT DISTINCT ano_letivo FROM bimestre ORDER BY ano_letivo DESC'),
    ]);
    res.json({
      dados: {
        turmas: turmas.map(({ serie, ...t }) => t),
        disciplinas,
        professores,
        tags: tags.map((t) => ({ ...t, ativo: Boolean(t.ativo) })),
        anos: anos.map((a) => a.ano_letivo),
        ano_atual: env.ANO_LETIVO,
        pode_exportar: req.usuario.perfil === 'admin',
      },
    });
  })
);

router.get(
  '/indicadores',
  validar(schemas.filtroRelatorio, 'query'),
  asyncHandler(async (req, res) => {
    res.json({ dados: await calcularIndicadores(filtrosEfetivos(req)) });
  })
);

router.get(
  '/registros',
  validar(schemas.filtroRelatorio, 'query'),
  asyncHandler(async (req, res) => {
    const f = filtrosEfetivos(req);
    const { pagina, por_pagina } = f;
    const { total, linhas } = await buscarRegistros(f, { limite: por_pagina, deslocamento: (pagina - 1) * por_pagina });
    res.json({ dados: linhas, meta: meta(total, pagina, por_pagina) });
  })
);

router.get(
  '/retornos',
  validar(schemas.filtroRetornos, 'query'),
  asyncHandler(async (req, res) => {
    const f = filtrosEfetivos(req);
    const { pagina, por_pagina } = f;
    const { total, linhas } = await buscarRetornos(f, { limite: por_pagina, deslocamento: (pagina - 1) * por_pagina });
    res.json({ dados: linhas, meta: meta(total, pagina, por_pagina) });
  })
);

// ---------------------------------------------------------------------------
// Exportação (RF11) — só a coordenação; os mesmos filtros da tela; fica na auditoria
// ---------------------------------------------------------------------------
const COLUNAS = {
  registros: [
    { chave: 'id', titulo: 'ID', tipo: 'numero' },
    { chave: 'ano_letivo', titulo: 'Ano', tipo: 'numero' },
    { chave: 'bimestre', titulo: 'Bimestre', tipo: 'numero' },
    { chave: 'turma', titulo: 'Turma' },
    { chave: 'matricula', titulo: 'Matrícula' },
    { chave: 'aluno', titulo: 'Aluno' },
    { chave: 'disciplina', titulo: 'Disciplina' },
    { chave: 'professor', titulo: 'Professor' },
    { chave: 'media', titulo: 'Média', tipo: 'numero' },
    { chave: 'faltas', titulo: 'Faltas', tipo: 'numero' },
    { chave: 'status', titulo: 'Status' },
    { chave: 'versao', titulo: 'Versão', tipo: 'numero' },
    { chave: 'tags', titulo: 'Tags' },
    { chave: 'enviado_em', titulo: 'Enviado em', tipo: 'data' },
    { chave: 'publicado_em', titulo: 'Publicado em', tipo: 'data' },
    { chave: 'data_ciencia', titulo: 'Ciência em', tipo: 'data' },
    { chave: 'descricao', titulo: 'Descrição' },
  ],
  retornos: [
    { chave: 'data_ciencia', titulo: 'Data da ciência', tipo: 'data' },
    { chave: 'responsavel', titulo: 'Responsável' },
    { chave: 'parentesco', titulo: 'Parentesco' },
    { chave: 'aluno', titulo: 'Aluno' },
    { chave: 'turma', titulo: 'Turma' },
    { chave: 'disciplina', titulo: 'Disciplina' },
    { chave: 'bimestre', titulo: 'Bimestre', tipo: 'numero' },
    { chave: 'professor', titulo: 'Professor' },
    { chave: 'observacao', titulo: 'Observação' },
  ],
};

const colunasAgregado = (chave, titulo) => [
  { chave, titulo },
  { chave: 'registros', titulo: 'Registros', tipo: 'numero' },
  { chave: 'publicados', titulo: 'Publicados', tipo: 'numero' },
  { chave: 'em_revisao', titulo: 'Aguardando revisão', tipo: 'numero' },
  { chave: 'media', titulo: 'Média (publicados)', tipo: 'numero' },
  { chave: 'abaixo_media', titulo: `Abaixo de ${MEDIA_MINIMA}`, tipo: 'numero' },
  { chave: 'faltas', titulo: 'Faltas', tipo: 'numero' },
];

function abasIndicadores(ind) {
  return [
    {
      nome: 'Resumo',
      colunas: [
        { chave: 'item', titulo: 'Indicador' },
        { chave: 'valor', titulo: 'Valor', tipo: 'numero' },
      ],
      linhas: [
        { item: 'Registros (sem cancelados)', valor: ind.totais.registros },
        { item: 'Publicados', valor: ind.totais.publicados },
        { item: 'Média dos publicados', valor: ind.totais.media },
        { item: `Publicados abaixo de ${MEDIA_MINIMA}`, valor: ind.totais.abaixo_media },
        { item: 'Com ciência do responsável', valor: ind.totais.com_ciencia },
        { item: 'Aguardando ciência', valor: ind.totais.aguardando_ciencia },
        { item: 'Com observação do responsável', valor: ind.totais.com_observacao },
        ...Object.entries(ind.por_status).map(([s, n]) => ({ item: `Status: ${s}`, valor: n })),
      ],
    },
    { nome: 'Turmas', item: 'turma', colunas: colunasAgregado('turma', 'Turma'), linhas: ind.por_turma },
    { nome: 'Disciplinas', item: 'disciplina', colunas: colunasAgregado('disciplina', 'Disciplina'), linhas: ind.por_disciplina },
    { nome: 'Professores', item: 'professor', colunas: colunasAgregado('professor', 'Professor'), linhas: ind.por_professor },
    { nome: 'Bimestres', item: 'bimestre', colunas: colunasAgregado('bimestre', 'Bimestre'), linhas: ind.por_bimestre },
    {
      nome: 'Alunos (atenção)',
      item: 'aluno',
      colunas: [{ chave: 'turma', titulo: 'Turma' }, ...colunasAgregado('aluno', 'Aluno')],
      linhas: ind.por_aluno,
    },
    {
      nome: 'Tags',
      item: 'tag',
      colunas: [
        { chave: 'tag', titulo: 'Tag' },
        { chave: 'registros', titulo: 'Registros', tipo: 'numero' },
      ],
      linhas: ind.por_tag,
    },
  ];
}

router.get(
  '/exportar',
  autorizar('admin'),
  validar(schemas.exportacao, 'query'),
  asyncHandler(async (req, res) => {
    const f = filtrosEfetivos(req);
    const { formato, conteudo } = f;
    let abas;
    let total;

    if (conteudo === 'indicadores') {
      abas = abasIndicadores(await calcularIndicadores(f));
      total = abas[0].linhas.length;
    } else {
      const busca = conteudo === 'retornos' ? buscarRetornos : buscarRegistros;
      const r = await busca(f, { limite: LIMITE_EXPORTACAO, deslocamento: 0 });
      total = r.total;
      abas = [{ nome: conteudo === 'retornos' ? 'Retornos' : 'Registros', colunas: COLUNAS[conteudo], linhas: r.linhas }];
    }

    let arquivo;
    if (formato === 'xlsx') {
      arquivo = xlsx(abas);
    } else {
      // CSV tem uma tabela só: nos indicadores, as seções ficam numa coluna "Grupo"
      if (abas.length > 1) {
        const colunas = [{ chave: 'grupo', titulo: 'Grupo' }, { chave: 'item', titulo: 'Item' }, ...colunasAgregado('x', '').slice(1)];
        const linhas = abas
          .slice(1)
          .flatMap((a) => a.linhas.map((l) => ({ ...l, grupo: a.nome, item: a.item === 'aluno' ? `${l.aluno} (${l.turma})` : l[a.item] })));
        const resumo = abas[0].linhas.map((l) => ({ grupo: 'Resumo', item: l.item, registros: l.valor }));
        arquivo = csv(colunas, [...resumo, ...linhas]);
      } else {
        arquivo = csv(abas[0].colunas, abas[0].linhas);
      }
    }

    const filtrosUsados = Object.fromEntries(
      Object.entries(f).filter(([k, v]) => v !== undefined && !['pagina', 'por_pagina', 'formato', 'conteudo'].includes(k))
    );
    await auditarAntes(req, res, {
      acao: 'EXPORTAR_RELATORIO',
      entidade: 'relatorio',
      entidade_id: conteudo,
      detalhes: { formato, conteudo, filtros: filtrosUsados, linhas: total, limite_atingido: total > LIMITE_EXPORTACAO },
    });
    // Cabeçalhos do arquivo só depois de a auditoria estar gravada (se falhar, sai um erro em JSON)
    res.setHeader('Content-Type', formato === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/csv; charset=utf-8');
    const data = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Disposition', `attachment; filename="kfka-${conteudo}-${f.ano_letivo}-${data}.${formato}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(arquivo);
  })
);

module.exports = router;
module.exports.calcularIndicadores = calcularIndicadores;
