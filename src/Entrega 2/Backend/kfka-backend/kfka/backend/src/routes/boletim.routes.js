// boletim.routes.js — boletim do responsável (tela e impressão/PDF).
//
//   GET  /api/boletim?ano_letivo=     filhos vinculados + registros PUBLICADOS, por bimestre e disciplina
//   GET  /api/boletim/anos            anos letivos com boletim publicado (histórico de boletins)
//   POST /api/boletim/visualizacao    registra que o responsável abriu o boletim { aluno_id, bimestre }
//   GET  /api/boletim/pdf?aluno_id&ano_letivo&bimestre   (responsável do aluno ou coordenação)
//        PDF gerado no servidor só com registros PUBLICADOS (RF09). Cada download vai para a auditoria.
//
// Usa a view vw_relatorio_responsavel do banco, que já aplica as regras:
// só registros PUBLICADOS e só de alunos com vínculo autorizado.
//
// Situação acadêmica (regra da escola: média mínima 6,0):
//   durante o ano  -> "satisfatoria" (todas as médias >= 6) ou "atencao" (alguma abaixo de 6)
//   4 bimestres publicados -> "aprovado" (média anual de todas as disciplinas >= 6) ou "recuperacao"

const { Router } = require('express');
const { z } = require('zod');

const db = require('../db');
const env = require('../config/env');
const validar = require('../middlewares/validar');
const { autenticar, autorizar } = require('../middlewares/auth');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { alunosDoResponsavel } = require('../utils/acesso');
const schemas = require('../schemas');
const { auditarAntes } = require('../utils/auditoria');
const { DocumentoPdf } = require('../utils/pdf');

const router = Router();

// ---------------------------------------------------------------------------
// PDF do relatório publicado (antes do router.use abaixo: a coordenação também pode gerar)
// ---------------------------------------------------------------------------
router.get(
  '/pdf',
  autenticar,
  autorizar('responsavel', 'admin'),
  validar(schemas.pdfBoletim, 'query'),
  asyncHandler(async (req, res) => {
    const { aluno_id, bimestre } = req.validado.query;
    const ano = req.validado.query.ano_letivo || env.ANO_LETIVO;
    const ehResponsavel = req.usuario.perfil === 'responsavel';

    // Responsável: só aluno vinculado e autorizado (mesma regra da view). Outro id -> 404 (não revela que existe)
    if (ehResponsavel && !(await alunosDoResponsavel(req.usuario.responsavelId)).includes(aluno_id)) {
      throw AppError.naoEncontrado('Aluno não encontrado.');
    }

    const [aluno] = await db.query(
      `SELECT a.id, a.nome, a.matricula, t.nome AS turma, t.turno
         FROM aluno a
         LEFT JOIN turma_aluno ta ON ta.aluno_id = a.id AND ta.ano_letivo = ?
         LEFT JOIN turma t ON t.id = ta.turma_id
        WHERE a.id = ?`,
      [ano, aluno_id]
    );
    if (!aluno) throw AppError.naoEncontrado('Aluno não encontrado.');

    // Só PUBLICADOS: o responsável lê pela view com o vínculo; a coordenação, pela view completa
    const registros = ehResponsavel
      ? await db.query(
          `SELECT acompanhamento_id AS id, bimestre, area, disciplina, professor, media, faltas, descricao, tags,
                  publicado_em, data_ciencia
             FROM vw_relatorio_responsavel
            WHERE responsavel_id = ? AND aluno_id = ? AND ano_letivo = ? AND (? IS NULL OR bimestre = ?)
            ORDER BY bimestre, disciplina`,
          [req.usuario.responsavelId, aluno_id, ano, bimestre ?? null, bimestre ?? null]
        )
      : await db.query(
          `SELECT v.acompanhamento_id AS id, v.bimestre, v.area, v.disciplina, v.professor, v.media, v.faltas,
                  v.descricao, v.tags, v.publicado_em,
                  (SELECT MIN(c.data_ciencia) FROM ciencia_responsavel c WHERE c.acompanhamento_id = v.acompanhamento_id) AS data_ciencia
             FROM vw_acompanhamento_completo v
            WHERE v.aluno_id = ? AND v.ano_letivo = ? AND v.status = 'PUBLICADO' AND (? IS NULL OR v.bimestre = ?)
            ORDER BY v.bimestre, v.disciplina`,
          [aluno_id, ano, bimestre ?? null, bimestre ?? null]
        );
    if (!registros.length) {
      throw AppError.naoEncontrado(
        bimestre ? `Não há relatório publicado do ${bimestre}º bimestre para este aluno.` : 'Não há relatórios publicados para este aluno neste ano.'
      );
    }

    const pdf = montarPdf({ aluno, ano, bimestre, registros, geradoPor: req.usuario.nome });
    await auditarAntes(req, res, {
      acao: 'GERAR_PDF_BOLETIM',
      entidade: 'aluno',
      entidade_id: aluno_id,
      detalhes: { ano_letivo: ano, bimestre: bimestre ?? 'todos', registros: registros.length },
    });
    const nome = `boletim-${aluno.matricula}-${ano}${bimestre ? `-b${bimestre}` : ''}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(pdf);
  })
);

const dataBr = (d) =>
  d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—';
const nota = (n) => Number(n).toFixed(1).replace('.', ',');

function montarPdf({ aluno, ano, bimestre, registros, geradoPor }) {
  const doc = new DocumentoPdf({ titulo: `Boletim ${aluno.nome} ${ano}` });
  const m = doc.margem;
  const L = doc.areaUtil;

  doc.aoNovaPagina = (d) => {
    d.retangulo(0, 0, d.largura, 6, { preenchimento: '#2563eb' });
    d.texto('Plataforma de Acompanhamento Escolar', m, 22, { tamanho: 9, cor: '#2563eb', negrito: true });
    d.texto(`${aluno.nome} · ${ano}`, m, 22, { tamanho: 9, cor: '#6b7280', alinhar: 'direita', largura: L });
    d.linha(m, 38, m + L, 38);
    d.y = 52;
  };
  doc.aoNovaPagina(doc);

  doc.texto(bimestre ? `Relatório do ${bimestre}º bimestre` : 'Relatório de acompanhamento', m, doc.y, { tamanho: 18, negrito: true, cor: '#111827' });
  doc.y += 28;
  const linhaInfo = (rotulo, valor, x) => {
    doc.texto(rotulo, x, doc.y, { tamanho: 8, cor: '#6b7280' });
    doc.texto(valor || '—', x, doc.y + 11, { tamanho: 10.5, negrito: true });
  };
  doc.retangulo(m, doc.y - 8, L, 44, { preenchimento: '#f3f6fd' });
  linhaInfo('Aluno(a)', aluno.nome, m + 10);
  linhaInfo('Matrícula', aluno.matricula, m + 270);
  linhaInfo('Turma', aluno.turma ? `${aluno.turma}` : null, m + 360);
  linhaInfo('Ano letivo', String(ano), m + 450);
  doc.y += 50;

  // Quadro por bimestre
  const bimestres = [...new Set(registros.map((r) => r.bimestre))];
  for (const b of bimestres) {
    const doBim = registros.filter((r) => r.bimestre === b);
    doc.reservar(80);
    doc.texto(`${b}º bimestre`, m, doc.y, { tamanho: 12, negrito: true, cor: '#1e3a8a' });
    doc.y += 20;
    doc.tabela(
      [
        { titulo: 'Disciplina', largura: 150 },
        { titulo: 'Professor(a)', largura: 150 },
        { titulo: 'Média', largura: 55, alinhar: 'direita' },
        { titulo: 'Faltas', largura: 55, alinhar: 'direita' },
        { titulo: 'Situação', largura: L - 410 },
      ],
      doBim.map((r) => [
        r.disciplina,
        r.professor,
        nota(r.media),
        String(r.faltas),
        Number(r.media) >= MEDIA_MINIMA ? 'Acima da média' : 'Abaixo da média',
      ])
    );
    const medias = doBim.map((r) => Number(r.media));
    doc.y += 6;
    doc.texto(
      `Média do bimestre: ${nota(media(medias))}   ·   Faltas: ${doBim.reduce((s, r) => s + Number(r.faltas), 0)}   ·   Média mínima: ${nota(MEDIA_MINIMA)}`,
      m,
      doc.y,
      { tamanho: 9, cor: '#374151' }
    );
    doc.y += 22;

    // Acompanhamento descritivo de cada disciplina
    for (const r of doBim) {
      doc.reservar(54);
      doc.texto(`${r.disciplina}`, m, doc.y, { tamanho: 10.5, negrito: true });
      doc.texto(`Publicado em ${dataBr(r.publicado_em)}`, m, doc.y, { tamanho: 8, cor: '#6b7280', alinhar: 'direita', largura: L });
      doc.y += 15;
      if (r.tags) {
        doc.paragrafo(`Destaques: ${r.tags}`, m, L, { tamanho: 8.5, cor: '#1d4ed8' });
        doc.y += 2;
      }
      doc.paragrafo(r.descricao, m, L, { tamanho: 9.5, cor: '#1f2937' });
      doc.paragrafo(r.data_ciencia ? `Ciência registrada pelo responsável em ${dataBr(r.data_ciencia)}.` : 'Ciência ainda não registrada.', m, L, {
        tamanho: 8,
        cor: '#6b7280',
      });
      doc.y += 10;
    }
  }

  const gerado = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  return doc.gerar({
    rodape: (p, total) =>
      `Gerado em ${gerado} por ${geradoPor} · Contém apenas relatórios publicados pela coordenação · Página ${p} de ${total}`,
  });
}

router.use(autenticar, autorizar('responsavel'));

const MEDIA_MINIMA = 6;
const media = (lista) => (lista.length ? Number((lista.reduce((s, n) => s + n, 0) / lista.length).toFixed(2)) : null);

function situacao(disciplinas, bimestresPublicados) {
  if (!disciplinas.length) return { codigo: 'sem_dados', texto: 'Sem notas publicadas' };
  const anuais = disciplinas.map((d) => d.media_anual).filter((m) => m !== null);
  if (bimestresPublicados >= 4) {
    return anuais.every((m) => m >= MEDIA_MINIMA)
      ? { codigo: 'aprovado', texto: 'Aprovado' }
      : { codigo: 'recuperacao', texto: 'Em recuperação' };
  }
  const abaixo = disciplinas.filter((d) => d.media_anual !== null && d.media_anual < MEDIA_MINIMA).map((d) => d.disciplina);
  return abaixo.length
    ? { codigo: 'atencao', texto: 'Em atenção', detalhe: `Média abaixo de 6 em: ${abaixo.join(', ')}` }
    : { codigo: 'satisfatoria', texto: 'Satisfatória' };
}

router.get(
  '/anos',
  asyncHandler(async (req, res) => {
    const linhas = await db.query(
      'SELECT DISTINCT ano_letivo FROM vw_relatorio_responsavel WHERE responsavel_id = ? ORDER BY ano_letivo DESC',
      [req.usuario.responsavelId]
    );
    const anos = linhas.map((l) => l.ano_letivo);
    if (!anos.includes(env.ANO_LETIVO)) anos.unshift(env.ANO_LETIVO);
    res.json({ dados: anos });
  })
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const rid = req.usuario.responsavelId;
    const ano = Number(req.query.ano_letivo) || env.ANO_LETIVO;

    // Filhos vinculados (aparecem mesmo sem nada publicado ainda)
    const filhos = await db.query(
      `SELECT a.id, a.nome, a.matricula, ar.parentesco, t.nome AS turma, t.turno
         FROM aluno_responsavel ar
         JOIN aluno a ON a.id = ar.aluno_id
         LEFT JOIN turma_aluno ta ON ta.aluno_id = a.id AND ta.ano_letivo = ?
         LEFT JOIN turma t        ON t.id = ta.turma_id
        WHERE ar.responsavel_id = ? AND ar.autorizado = TRUE AND a.ativo = TRUE
        ORDER BY a.nome`,
      [ano, rid]
    );

    const registros = await db.query(
      `SELECT acompanhamento_id AS id, aluno_id, bimestre, area, disciplina, professor, media, faltas,
              descricao, tags, publicado_em, data_ciencia, retorno_responsavel
         FROM vw_relatorio_responsavel
        WHERE responsavel_id = ? AND ano_letivo = ?
        ORDER BY bimestre, disciplina`,
      [rid, ano]
    );

    const bimestresAno = await db.query('SELECT id, numero, data_inicio, data_fim FROM bimestre WHERE ano_letivo = ? ORDER BY numero', [ano]);
    const vistos = await db.query(
      `SELECT v.aluno_id, b.numero, v.visualizado_em FROM boletim_visualizacao v
         JOIN bimestre b ON b.id = v.bimestre_id
        WHERE v.responsavel_id = ? AND b.ano_letivo = ?`,
      [rid, ano]
    );

    const dados = filhos.map((f) => {
      const meus = registros
        .filter((r) => r.aluno_id === f.id)
        .map(({ aluno_id, ...r }) => ({ ...r, tags: r.tags ? r.tags.split(', ') : [], situacao: Number(r.media) >= MEDIA_MINIMA ? 'acima' : 'abaixo' }));

      // Agrupa por bimestre: [{ numero: 1, disciplinas: [...], media, visualizado }, ...]
      const bimestres = [...new Set(meus.map((r) => r.bimestre))].map((numero) => {
        const disciplinas = meus.filter((r) => r.bimestre === numero);
        const ultimaPublicacao = disciplinas.map((d) => new Date(d.publicado_em).getTime()).sort().pop();
        const visto = vistos.find((v) => v.aluno_id === f.id && v.numero === numero);
        return {
          numero,
          disciplinas,
          media: media(disciplinas.map((d) => Number(d.media))),
          faltas: disciplinas.reduce((s, d) => s + Number(d.faltas), 0),
          // "Novo" se nunca foi aberto ou se algo foi publicado depois da última visualização
          visualizado: Boolean(visto && new Date(visto.visualizado_em).getTime() >= ultimaPublicacao),
        };
      });

      // Quadro anual por disciplina (média de cada bimestre + média anual)
      const nomes = [...new Set(meus.map((r) => r.disciplina))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
      const quadro = nomes.map((disciplina) => {
        const linhas = meus.filter((r) => r.disciplina === disciplina);
        const porBimestre = Object.fromEntries(linhas.map((r) => [r.bimestre, Number(r.media)]));
        return {
          disciplina,
          area: linhas[0].area,
          bimestres: porBimestre,
          faltas: linhas.reduce((s, r) => s + Number(r.faltas), 0),
          media_anual: media(Object.values(porBimestre)),
        };
      });

      const medias = meus.map((r) => Number(r.media));
      return {
        ...f,
        ano_letivo: ano,
        resumo: {
          media: media(medias),
          faltas_total: meus.reduce((s, r) => s + Number(r.faltas), 0),
          aguardando_ciencia: meus.filter((r) => !r.data_ciencia).length,
          publicados: meus.length,
          nao_visualizados: bimestres.filter((b) => !b.visualizado).length,
        },
        situacao: situacao(quadro, bimestres.length),
        quadro,
        bimestres,
      };
    });

    res.json({
      dados,
      meta: { ano_letivo: ano, media_minima: MEDIA_MINIMA, bimestres: bimestresAno.map((b) => b.numero) },
    });
  })
);

const schemaVisualizacao = z.object({
  aluno_id: z.number().int().positive(),
  bimestre: z.number().int().min(1).max(4),
  ano_letivo: z.number().int().optional(),
});

router.post(
  '/visualizacao',
  validar(schemaVisualizacao),
  asyncHandler(async (req, res) => {
    const rid = req.usuario.responsavelId;
    const { aluno_id, bimestre } = req.body;
    const ano = req.body.ano_letivo || env.ANO_LETIVO;
    if (!(await alunosDoResponsavel(rid)).includes(aluno_id)) throw AppError.naoEncontrado('Aluno não encontrado.');
    const [b] = await db.query('SELECT id FROM bimestre WHERE ano_letivo = ? AND numero = ?', [ano, bimestre]);
    if (!b) throw AppError.naoEncontrado('Bimestre não encontrado.');

    await db.transacao(req.usuario.id, async (tx) => {
      await tx.query('DELETE FROM boletim_visualizacao WHERE responsavel_id = ? AND aluno_id = ? AND bimestre_id = ?', [
        rid,
        aluno_id,
        b.id,
      ]);
      await tx.query('INSERT INTO boletim_visualizacao (responsavel_id, aluno_id, bimestre_id) VALUES (?, ?, ?)', [
        rid,
        aluno_id,
        b.id,
      ]);
    });
    res.status(204).end();
  })
);

module.exports = router;
