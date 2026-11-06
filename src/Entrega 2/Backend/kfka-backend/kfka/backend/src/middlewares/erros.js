// erros.js — tratamento centralizado de erros e de rotas inexistentes.
// Toda resposta de erro da API segue o mesmo formato:
//   { "erro": { "codigo": "NAO_ENCONTRADO", "mensagem": "...", "detalhes": [...] } }

const path = require('path');
const AppError = require('../utils/AppError');
const env = require('../config/env');

// Rotas da API que não existem -> JSON 404
function rotaApiNaoEncontrada(req, res, next) {
  next(new AppError(404, 'ROTA_NAO_ENCONTRADA', `Rota ${req.method} ${req.originalUrl} não existe.`));
}

// Páginas do site: entrega o index.html do React (aplicação de página única).
// O React Router mostra a tela certa — ou a página "não encontrada".
const fs = require('fs');
const INDEX_REACT = path.join(__dirname, '..', '..', '..', 'frontend', 'dist', 'index.html');

function entregarApp(req, res) {
  if (req.method !== 'GET') {
    return res.status(404).json({ erro: { codigo: 'ROTA_NAO_ENCONTRADA', mensagem: 'Rota não encontrada.' } });
  }
  if (!fs.existsSync(INDEX_REACT)) {
    return res
      .status(503)
      .type('text/plain; charset=utf-8')
      .send('O front-end ainda não foi compilado. Rode "npm run build" (produção) ou "npm run dev:web" (desenvolvimento).');
  }
  return res.sendFile(INDEX_REACT);
}

// Converte erros conhecidos (JSON malformado, restrições do banco) em AppError
function normalizar(err) {
  if (err instanceof AppError) return err;

  // Corpo da requisição com JSON inválido (lançado pelo express.json)
  if (err.type === 'entity.parse.failed') {
    return AppError.requisicaoInvalida('O corpo da requisição não é um JSON válido.');
  }
  if (err.type === 'entity.too.large') {
    return new AppError(413, 'CORPO_MUITO_GRANDE', 'O corpo da requisição é grande demais.');
  }

  // Regras de negócio dos triggers (SIGNAL SQLSTATE '45000'):
  // "Fora do período de digitação", "Transição de status não permitida"...
  if (err.sqlState === '45000') {
    return new AppError(409, 'REGRA_DO_BANCO', err.sqlMessage || err.message);
  }

  // Banco fora do ar / conexão perdida
  if (['ECONNREFUSED', 'PROTOCOL_CONNECTION_LOST', 'ETIMEDOUT', 'ER_ACCESS_DENIED_ERROR'].includes(err.code)) {
    return new AppError(503, 'BANCO_INDISPONIVEL', 'Banco de dados indisponível. Tente novamente em instantes.');
  }

  // Tabela ou coluna inexistente: o banco é de uma versão anterior do projeto
  // (ex.: alguém rodou só o kfka_banco.sql no Workbench com o servidor ligado)
  if (err.errno === 1054 || err.errno === 1146) {
    console.error(`[KFKA] Banco desatualizado: ${err.sqlMessage || err.message}`);
    console.error('        Rode "npm run db:diagnostico" para ver o que falta (ou "npm run db:setup" para recriar).');
    return new AppError(
      503,
      'BANCO_DESATUALIZADO',
      'O banco de dados está desatualizado. Reinicie o servidor ou rode "npm run db:setup".'
    );
  }

  // Códigos de erro do MySQL
  switch (err.errno) {
    case 1062: // ER_DUP_ENTRY (UNIQUE)
      return AppError.conflito(mensagemDuplicado(err.sqlMessage || ''));
    case 1451: // ER_ROW_IS_REFERENCED (apagar algo que tem dependentes)
      return AppError.conflito('Operação não permitida: o registro está ligado a outros dados.');
    case 1452: // ER_NO_REFERENCED_ROW (chave estrangeira inexistente)
      return new AppError(422, 'DADOS_INVALIDOS', 'Um dos itens informados não existe (turma, disciplina, tag...).');
    case 3819: // ER_CHECK_CONSTRAINT_VIOLATED
    case 1264: // ER_WARN_DATA_OUT_OF_RANGE
    case 1265: // WARN_DATA_TRUNCATED
    case 1366: // ER_TRUNCATED_WRONG_VALUE_FOR_FIELD
    case 1406: // ER_DATA_TOO_LONG
      return AppError.requisicaoInvalida('Valor inválido para um dos campos.');
    default:
      return null;
  }
}

// Mensagem amigável conforme a restrição UNIQUE violada (nomes do kfka_banco.sql)
function mensagemDuplicado(mensagem) {
  if (/uq_usuario_email/.test(mensagem)) return 'Este e-mail já está cadastrado.';
  if (/uq_aluno_matricula/.test(mensagem)) return 'Já existe um aluno com esta matrícula.';
  if (/uq_professor_registro/.test(mensagem)) return 'Já existe um professor com este registro.';
  if (/uq_turma_nome_ano/.test(mensagem)) return 'Já existe uma turma com este nome neste ano.';
  if (/uq_aluno_um_por_ano/.test(mensagem)) return 'O aluno já está matriculado em uma turma neste ano.';
  return 'Já existe um registro com esses dados.';
}

function tratarErros(err, req, res, next) {
  const erro = normalizar(err);

  if (!erro) {
    // Erro inesperado: registra no log, mas não expõe detalhes internos ao cliente
    console.error('[KFKA] Erro inesperado:', err);
    return res.status(500).json({
      erro: {
        codigo: 'ERRO_INTERNO',
        mensagem: 'Ocorreu um erro inesperado. Tente novamente em instantes.',
        ...(env.isProducao ? {} : { detalhes: err.message }),
      },
    });
  }

  return res.status(erro.status).json({
    erro: {
      codigo: erro.codigo,
      mensagem: erro.message,
      ...(erro.detalhes ? { detalhes: erro.detalhes } : {}),
    },
  });
}

module.exports = { rotaApiNaoEncontrada, entregarApp, tratarErros };
