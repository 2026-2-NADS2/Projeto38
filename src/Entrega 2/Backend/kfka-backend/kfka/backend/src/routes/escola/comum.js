// escola/comum.js — utilidades compartilhadas pelas rotas de gestão escolar.

const AppError = require('../../utils/AppError');

const erroCampo = (campo, mensagem) => new AppError(422, 'DADOS_INVALIDOS', 'Verifique os dados enviados.', [{ campo, mensagem }]);
// Professor vê só o que leciona; coordenação vê tudo (null = sem filtro)
const professorDe = (usuario) => (usuario.perfil === 'professor' ? usuario.professorId : null);

module.exports = { erroCampo, professorDe };
