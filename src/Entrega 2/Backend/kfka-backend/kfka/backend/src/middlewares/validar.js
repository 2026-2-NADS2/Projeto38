// validar.js — valida body, query ou params com um schema do Zod.
// Se os dados forem inválidos, responde 422 com a lista de campos e mensagens.
// Se forem válidos, substitui pelos dados "limpos" (com espaços removidos, tipos convertidos etc.).

const AppError = require('../utils/AppError');

function validar(schema, origem = 'body') {
  return (req, res, next) => {
    const resultado = schema.safeParse(req[origem] ?? {});

    if (!resultado.success) {
      const detalhes = resultado.error.issues.map((issue) => ({
        campo: issue.path.join('.') || origem,
        mensagem: issue.message,
      }));
      return next(new AppError(422, 'DADOS_INVALIDOS', 'Verifique os dados enviados.', detalhes));
    }

    // Express 5 torna req.query somente-leitura; guardamos em req.validado também.
    req.validado = { ...(req.validado || {}), [origem]: resultado.data };
    if (origem === 'body') req.body = resultado.data;
    return next();
  };
}

module.exports = validar;
