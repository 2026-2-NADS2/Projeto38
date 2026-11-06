// db/index.js — conexão com o MySQL (pool) e transações com auditoria.

const mysql = require('mysql2/promise');
const env = require('../config/env');

// Mesmo padrão da Aula 12 (src/bancoDados.js): host/porta/usuário/senha/banco separados.
const pool = mysql.createPool({
  host: env.DB.host,
  port: env.DB.port,
  user: env.DB.user,
  password: env.DB.password,
  database: env.DB.database,
  ssl: env.DATABASE_SSL ? { rejectUnauthorized: false } : undefined,
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: true, // DECIMAL (médias) volta como número, não como texto
  dateStrings: ['DATE'], // datas sem hora (ex.: nascimento) voltam como 'AAAA-MM-DD'
  timezone: env.DB_TIMEZONE,
});

// Cada conexão nova usa o fuso de Brasília: o NOW() dos triggers
// (período de digitação) passa a bater com as datas da tabela bimestre.
pool.on('connection', (conexao) => {
  conexao.query(`SET time_zone = '${env.DB_TIMEZONE}'`);
});

/**
 * Consulta simples. Sempre com parâmetros (?) — nunca concatene valores
 * na string SQL: isso evita SQL Injection.
 * Retorna as linhas (SELECT) ou o resultado (INSERT/UPDATE: insertId, affectedRows).
 */
async function query(sql, parametros = []) {
  const [resultado] = await pool.query(sql, parametros);
  return resultado;
}

/**
 * Executa várias operações numa transação, identificando QUEM está alterando.
 *
 * Os triggers do banco (trg_acomp_*) exigem a variável de sessão @usuario_id
 * para gravar o histórico/auditoria. Ela é definida na MESMA conexão da
 * transação e LIMPA no final — senão a próxima requisição que pegasse essa
 * conexão do pool "herdaria" o usuário anterior.
 *
 *   await transacao(req.usuario.id, async (tx) => {
 *     await tx.observacao('Motivo da devolução');   // opcional (@observacao)
 *     await tx.query('UPDATE acompanhamento SET ...', [...]);
 *   });
 */
async function transacao(usuarioId, fn) {
  const conexao = await pool.getConnection();
  try {
    await conexao.beginTransaction();
    await conexao.query('SET @usuario_id = ?, @observacao = ?', [usuarioId ?? null, null]);

    const tx = {
      query: async (sql, parametros = []) => (await conexao.query(sql, parametros))[0],
      observacao: (texto) => conexao.query('SET @observacao = ?', [texto ?? null]),
    };

    const resultado = await fn(tx);
    await conexao.commit();
    return resultado;
  } catch (err) {
    try {
      await conexao.rollback();
    } catch {
      /* conexão já caiu: nada a desfazer */
    }
    throw err;
  } finally {
    try {
      await conexao.query('SET @usuario_id = NULL, @observacao = NULL');
    } catch {
      /* ignora */
    }
    conexao.release();
  }
}

module.exports = { query, transacao, pool };
