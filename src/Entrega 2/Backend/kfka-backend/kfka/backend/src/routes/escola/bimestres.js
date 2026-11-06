// escola/bimestres.js — bimestres (situação e digitação) e ano letivo com exatamente 4 bimestres.
// Montado em /api pelo routes/escola.routes.js; o login é exigido rota a rota.

const { Router } = require('express');

const db = require('../../db');
const env = require('../../config/env');
const schemas = require('../../schemas');
const validar = require('../../middlewares/validar');
const { autenticar, autorizar } = require('../../middlewares/auth');
const AppError = require('../../utils/AppError');
const asyncHandler = require('../../utils/asyncHandler');
const { auditarNaTransacao, comAuditoria, diferenca } = require('../../utils/auditoria');
const { hoje } = require('../../utils/datas');
const { erroCampo } = require('./comum');

const router = Router();

// Colunas do bimestre + situação da digitação (NOW() do banco, mesmo relógio dos triggers)
const SQL_BIMESTRE = `
  SELECT id, ano_letivo, numero, data_inicio, data_fim, digitacao_inicio, digitacao_fim,
         (NOW() BETWEEN digitacao_inicio AND digitacao_fim) AS aberto,
         CASE WHEN NOW() < digitacao_inicio THEN 'agendada'
              WHEN NOW() <= digitacao_fim THEN 'aberta'
              ELSE 'encerrada' END AS digitacao
    FROM bimestre`;

function comSituacao(b) {
  const dia = hoje();
  let situacao = null;
  if (b.data_inicio && b.data_fim) {
    if (dia < b.data_inicio) situacao = 'futuro';
    else if (dia > b.data_fim) situacao = 'encerrado';
    else situacao = 'em_andamento';
  }
  return { ...b, aberto: Boolean(b.aberto), situacao };
}

router.get(
  '/bimestres',
  autenticar,
  asyncHandler(async (req, res) => {
    const ano = Number(req.query.ano_letivo) || env.ANO_LETIVO;
    const linhas = await db.query(`${SQL_BIMESTRE} WHERE ano_letivo = ? ORDER BY numero`, [ano]);
    res.json({ dados: linhas.map(comSituacao) });
  })
);

router.put(
  '/bimestres/:id',
  autenticar,
  autorizar('admin'),
  validar(schemas.paramId, 'params'),
  validar(schemas.bimestre),
  asyncHandler(async (req, res) => {
    const id = req.validado.params.id;
    const { data_inicio, data_fim, digitacao_inicio, digitacao_fim } = req.body;
    const [atual] = await db.query(`${SQL_BIMESTRE} WHERE id = ?`, [id]);
    if (!atual) throw AppError.naoEncontrado('Bimestre não encontrado.');
    await conferirPeriodo(atual, req.body);

    await comAuditoria(
      req,
      res,
      (tx) =>
        tx.query('UPDATE bimestre SET data_inicio = ?, data_fim = ?, digitacao_inicio = ?, digitacao_fim = ? WHERE id = ?', [
          data_inicio,
          data_fim,
          digitacao_inicio,
          digitacao_fim,
          id,
        ]),
      {
        acao: 'CONFIGURAR_PERIODO',
        entidade: 'bimestre',
        entidade_id: id,
        detalhes: {
          ano_letivo: atual.ano_letivo,
          numero: atual.numero,
          ...diferenca(
            { ...atual, digitacao_inicio: formatarDataHora(atual.digitacao_inicio), digitacao_fim: formatarDataHora(atual.digitacao_fim) },
            req.body,
            ['data_inicio', 'data_fim', 'digitacao_inicio', 'digitacao_fim']
          ),
        },
      }
    );
    const [b] = await db.query(`${SQL_BIMESTRE} WHERE id = ?`, [id]);
    res.json({ dados: comSituacao(b) });
  })
);

// DATETIME lido do banco (Date) -> 'AAAA-MM-DD HH:MM:SS' no fuso da escola, para comparar com o enviado
function formatarDataHora(valor) {
  if (!(valor instanceof Date)) return valor;
  const [, sinal, h, m] = env.DB_TIMEZONE.match(/^([+-])(\d{2}):(\d{2})$/);
  const desloc = (sinal === '-' ? -1 : 1) * (Number(h) * 60 + Number(m)) * 60000;
  return new Date(valor.getTime() + desloc).toISOString().slice(0, 19).replace('T', ' ');
}

// Datas do bimestre dentro do ano letivo e sem sobrepor o anterior/seguinte (RF04)
async function conferirPeriodo(bimestre, { data_inicio, data_fim }) {
  const ano = String(bimestre.ano_letivo);
  if (!data_inicio.startsWith(ano) || !data_fim.startsWith(ano)) {
    throw erroCampo('data_inicio', `As datas do bimestre devem ser de ${ano}.`);
  }
  const vizinhos = await db.query(
    'SELECT numero, data_inicio, data_fim FROM bimestre WHERE ano_letivo = ? AND id <> ? ORDER BY numero',
    [bimestre.ano_letivo, bimestre.id]
  );
  for (const v of vizinhos) {
    if (!v.data_inicio || !v.data_fim) continue;
    if (v.numero < bimestre.numero && data_inicio <= v.data_fim) {
      throw erroCampo('data_inicio', `O ${bimestre.numero}º bimestre deve começar depois do fim do ${v.numero}º (${v.data_fim}).`);
    }
    if (v.numero > bimestre.numero && data_fim >= v.data_inicio) {
      throw erroCampo('data_fim', `O ${bimestre.numero}º bimestre deve terminar antes do início do ${v.numero}º (${v.data_inicio}).`);
    }
  }
}

router.get(
  '/anos-letivos',
  autenticar,
  autorizar('admin'),
  asyncHandler(async (req, res) => {
    const linhas = await db.query(
      `SELECT ano_letivo, COUNT(*) AS bimestres,
              (SELECT COUNT(*) FROM turma t WHERE t.ano_letivo = b.ano_letivo) AS turmas
         FROM bimestre b GROUP BY ano_letivo ORDER BY ano_letivo DESC`
    );
    res.json({
      dados: linhas.map((l) => ({ ...l, bimestres: Number(l.bimestres), turmas: Number(l.turmas), atual: l.ano_letivo === env.ANO_LETIVO })),
    });
  })
);

// Novo ano letivo: os 4 bimestres são criados juntos, na mesma transação.
// O UNIQUE (ano_letivo, numero) e o CHECK numero 1..4 do banco impedem um 5º bimestre.
router.post(
  '/anos-letivos',
  autenticar,
  autorizar('admin'),
  validar(schemas.anoLetivo),
  asyncHandler(async (req, res) => {
    const { ano_letivo, bimestres } = req.body;
    const existentes = await db.query('SELECT COUNT(*) AS n FROM bimestre WHERE ano_letivo = ?', [ano_letivo]);
    if (Number(existentes[0].n) > 0) throw AppError.conflito(`O ano letivo ${ano_letivo} já tem bimestres configurados.`);

    await db.transacao(req.usuario.id, async (tx) => {
      for (const b of [...bimestres].sort((x, y) => x.numero - y.numero)) {
        await tx.query(
          `INSERT INTO bimestre (ano_letivo, numero, data_inicio, data_fim, digitacao_inicio, digitacao_fim)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [ano_letivo, b.numero, b.data_inicio, b.data_fim, b.digitacao_inicio, b.digitacao_fim]
        );
      }
      await auditarNaTransacao(tx, req, res, {
        acao: 'CRIAR_ANO_LETIVO',
        entidade: 'bimestre',
        entidade_id: ano_letivo,
        detalhes: { ano_letivo, bimestres: bimestres.map((b) => ({ numero: b.numero, de: b.data_inicio, ate: b.data_fim })) },
      });
    });
    const criados = await db.query(`${SQL_BIMESTRE} WHERE ano_letivo = ? ORDER BY numero`, [ano_letivo]);
    res.status(201).json({ dados: criados.map(comSituacao) });
  })
);

module.exports = router;
