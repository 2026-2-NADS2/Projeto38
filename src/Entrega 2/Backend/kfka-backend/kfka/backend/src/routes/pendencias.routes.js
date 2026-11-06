// pendencias.routes.js — painel centralizado de pendências, calculado dos dados reais.
//
//   GET /api/pendencias          lista de pendências do perfil logado
//   GET /api/pendencias/resumo   contadores para o menu (pendências e mensagens não lidas)
//
// Cada pendência: { id, grupo, titulo, descricao, data, prioridade: alta|media|baixa, status, link }
// O "link" leva direto à tela onde a pendência é resolvida.

// O cálculo por perfil fica em backend/src/pendencias/ (coordenacao, professor, responsavel).

const { Router } = require('express');

const db = require('../db');
const { autenticar } = require('../middlewares/auth');
const asyncHandler = require('../utils/asyncHandler');
const { aoAlterar } = require('../utils/auditoria');
const { calcular } = require('../pendencias');

const router = Router();

// Cache curto do contador do menu (RNF05): o menu consulta a cada 30 s em todas as abas abertas,
// e o cálculo completo faz várias consultas. Qualquer alteração na API (POST/PUT/PATCH/DELETE
// bem-sucedido) limpa o cache, então o número nunca fica desatualizado depois de uma ação.
const TTL_RESUMO_MS = 20000;
const cacheResumo = new Map();
aoAlterar(() => cacheResumo.clear());
router.use(autenticar);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const itens = await calcular(req.usuario);
    res.json({ dados: itens, meta: { total: itens.length, altas: itens.filter((i) => i.prioridade === 'alta').length } });
  })
);

router.get(
  '/resumo',
  asyncHandler(async (req, res) => {
    const chave = req.usuario.id;
    let itens = cacheResumo.get(chave);
    if (!itens || itens.expira < Date.now()) {
      itens = { lista: await calcular(req.usuario), expira: Date.now() + TTL_RESUMO_MS };
      cacheResumo.set(chave, itens);
    }
    itens = itens.lista;
    const [m] = await db.query('SELECT COUNT(*) AS n FROM mensagem WHERE destinatario_id = ? AND lida = FALSE', [req.usuario.id]);
    res.json({
      dados: {
        pendencias: itens.filter((i) => i.id !== 'msgs').length,
        altas: itens.filter((i) => i.prioridade === 'alta').length,
        mensagens_nao_lidas: Number(m.n) || 0,
      },
    });
  })
);

module.exports = router;
