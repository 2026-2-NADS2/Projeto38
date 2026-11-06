// app.js — monta a aplicação Express (separado do index.js para facilitar os testes).

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

const env = require('./config/env');
const db = require('./db');
const { rotaApiNaoEncontrada, entregarApp, tratarErros } = require('./middlewares/erros');
const { registrarAuditoria } = require('./utils/auditoria');

const app = express();

// ---------------------------------------------------------------------------
// Segurança e parsing
// ---------------------------------------------------------------------------
app.disable('x-powered-by');
app.set('trust proxy', 1); // necessário atrás do proxy do Render para o rate limit funcionar

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"], // as páginas usam alguns atributos style=""
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
      },
    },
  })
);

// CORS só é necessário se o front estiver hospedado em outro domínio (ex.: Vercel)
if (env.CORS_ORIGIN.length) {
  app.use('/api', cors({ origin: env.CORS_ORIGIN }));
}

// 200 KB: a foto do perfil chega como imagem pequena em base64 (o navegador já redimensiona)
app.use(express.json({ limit: '200kb' }));

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------
app.get('/api/saude', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ dados: { status: 'ok', banco: 'conectado', horario: new Date().toISOString() } });
  } catch {
    res.status(503).json({ erro: { codigo: 'BANCO_INDISPONIVEL', mensagem: 'Banco de dados indisponível.' } });
  }
});

// Trilha de auditoria: registra alterações, negações de acesso e leituras sensíveis (RNF06)
app.use('/api', registrarAuditoria);

app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/usuarios', require('./routes/usuarios.routes'));
app.use('/api/alunos', require('./routes/alunos.routes'));
app.use('/api/acompanhamentos', require('./routes/acompanhamentos.routes'));
app.use('/api/boletim', require('./routes/boletim.routes'));
app.use('/api/mensagens', require('./routes/mensagens.routes'));
app.use('/api/dashboard', require('./routes/dashboard.routes'));
app.use('/api/perfil', require('./routes/perfil.routes'));
app.use('/api/pendencias', require('./routes/pendencias.routes'));
app.use('/api/eventos', require('./routes/eventos.routes'));
app.use('/api/aulas', require('./routes/aulas.routes'));
app.use('/api/atividades', require('./routes/atividades.routes'));
app.use('/api/chamados', require('./routes/chamados.routes'));
app.use('/api/justificativas', require('./routes/justificativas.routes'));
app.use('/api/documentos', require('./routes/documentos.routes'));
app.use('/api/ocorrencias', require('./routes/ocorrencias.routes'));
app.use('/api/relatorios', require('./routes/relatorios.routes'));
app.use('/api/auditoria', require('./routes/auditoria.routes'));
app.use('/api', require('./routes/escola.routes')); // /turmas, /disciplinas, /bimestres, /tags, /areas, /vinculos, /anos-letivos

app.use('/api', rotaApiNaoEncontrada);

// ---------------------------------------------------------------------------
// Front-end React (build gerado por "npm run build" em frontend/dist)
// ---------------------------------------------------------------------------
const PASTA_FRONT = path.join(__dirname, '..', '..', 'frontend', 'dist');
app.use(express.static(PASTA_FRONT, { index: false }));

// Qualquer outra página (/painel, /revisao, /rota-que-nao-existe...) recebe o
// index.html do React; o React Router decide o que mostrar — inclusive a página 404.
app.use(entregarApp);

// Tratamento de erros — sempre por último
app.use(tratarErros);

module.exports = app;
