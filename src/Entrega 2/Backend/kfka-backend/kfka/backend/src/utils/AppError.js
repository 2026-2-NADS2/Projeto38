// AppError.js — erro "esperado" da aplicação, com status HTTP e código.
// Lançar um AppError em qualquer rota faz o middleware de erros responder
// no formato padrão: { erro: { codigo, mensagem, detalhes? } }

class AppError extends Error {
  constructor(status, codigo, mensagem, detalhes) {
    super(mensagem);
    this.status = status;
    this.codigo = codigo;
    this.detalhes = detalhes;
  }

  static requisicaoInvalida(mensagem, detalhes) {
    return new AppError(400, 'REQUISICAO_INVALIDA', mensagem, detalhes);
  }
  static naoAutenticado(mensagem = 'Faça login para continuar.') {
    return new AppError(401, 'NAO_AUTENTICADO', mensagem);
  }
  static semPermissao(mensagem = 'Você não tem permissão para esta ação.') {
    return new AppError(403, 'SEM_PERMISSAO', mensagem);
  }
  static naoEncontrado(mensagem = 'Recurso não encontrado.') {
    return new AppError(404, 'NAO_ENCONTRADO', mensagem);
  }
  static conflito(mensagem) {
    return new AppError(409, 'CONFLITO', mensagem);
  }
}

module.exports = AppError;
