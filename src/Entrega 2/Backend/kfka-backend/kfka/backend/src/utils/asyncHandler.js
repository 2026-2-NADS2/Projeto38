// asyncHandler.js — envolve rotas async para que qualquer erro (inclusive
// do banco) chegue ao middleware de erros, em vez de derrubar o servidor.

module.exports = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
