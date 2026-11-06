-- =====================================================================
-- KFKA — ADEQUAÇÃO AOS REQUISITOS (RF01–RF12 / RNF01–RNF07)
-- Roda DEPOIS de kfka_banco.sql e kfka_expansao.sql. Não apaga dados.
--
--   npm run db:setup  -> roda os três scripts (banco novo)
--   npm start         -> se a tabela "auditoria" não existir, este script é
--                        aplicado sozinho (banco de versão anterior)
--
-- Pelo Workbench: abra e execute este arquivo inteiro depois dos outros dois.
-- =====================================================================
USE kfka;

-- ---------------------------------------------------------------------
-- 1. Sessões revogáveis (RNF02)
--    O token JWT guarda a "versão da sessão". Trocar/redefinir a senha,
--    desativar a conta ou "encerrar todas as sessões" incrementa o número
--    e todos os tokens emitidos antes deixam de valer na hora.
-- ---------------------------------------------------------------------
ALTER TABLE usuario ADD COLUMN sessao_versao INT NOT NULL DEFAULT 0;

-- "Sair" invalida só o token daquele aparelho (identificador jti do JWT).
-- As linhas vencidas são apagadas pela própria API.
CREATE TABLE sessao_encerrada (
    jti        CHAR(32) PRIMARY KEY,
    usuario_id INT NOT NULL,
    expira_em  DATETIME NOT NULL,
    CONSTRAINT fk_se_usuario FOREIGN KEY (usuario_id) REFERENCES usuario(id)
);
CREATE INDEX idx_se_expira ON sessao_encerrada (expira_em);

-- ---------------------------------------------------------------------
-- 2. Trilha de auditoria geral (RNF06)
--    Quem, quando, o quê, em qual registro e com que resultado.
--    "detalhes" guarda só o necessário (valores anterior/novo de campos
--    não sensíveis). Nunca senha, hash, token, foto ou texto pedagógico.
--    Sem FK para usuario de propósito: o registro precisa sobreviver
--    a qualquer mudança no cadastro (o nome fica copiado).
-- ---------------------------------------------------------------------
CREATE TABLE auditoria (
    id           BIGINT AUTO_INCREMENT PRIMARY KEY,
    data_hora    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    usuario_id   INT NULL,
    usuario_nome VARCHAR(120) NULL,
    perfil       VARCHAR(20) NULL,
    acao         VARCHAR(60) NOT NULL,
    entidade     VARCHAR(60) NOT NULL,
    entidade_id  VARCHAR(40) NULL,
    resultado    ENUM('SUCESSO','NEGADO','FALHA') NOT NULL DEFAULT 'SUCESSO',
    detalhes     JSON NULL,
    ip           VARCHAR(45) NULL
);
CREATE INDEX idx_aud_data     ON auditoria (data_hora);
CREATE INDEX idx_aud_entidade ON auditoria (entidade, entidade_id);
CREATE INDEX idx_aud_usuario  ON auditoria (usuario_id, data_hora);

-- Registros de auditoria são somente-inclusão: o próprio banco recusa
-- UPDATE e DELETE (vale também para quem acessa pelo Workbench).
DELIMITER $$
CREATE TRIGGER trg_auditoria_bu
BEFORE UPDATE ON auditoria
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Registros de auditoria não podem ser alterados.';
END$$

CREATE TRIGGER trg_auditoria_bd
BEFORE DELETE ON auditoria
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Registros de auditoria não podem ser excluídos.';
END$$
DELIMITER ;

-- ---------------------------------------------------------------------
-- 3. Índices para os relatórios gerenciais (RNF05)
--    Os relatórios filtram por bimestre (com ou sem status) sem informar
--    turma; o índice idx_acomp_turma_bim_disc começa por turma e não serve.
--    A ciência é procurada por acompanhamento (PK) e por data nos retornos.
--    A lista de alunos é paginada por nome dentro da situação (ativo).
-- ---------------------------------------------------------------------
CREATE INDEX idx_acomp_bim_status ON acompanhamento (bimestre_id, status);
CREATE INDEX idx_ciencia_data     ON ciencia_responsavel (data_ciencia);
CREATE INDEX idx_aluno_ativo_nome ON aluno (ativo, nome);

-- ---------------------------------------------------------------------
-- 4. Solicitações sobre dados pessoais (RNF03 — LGPD art. 18)
--    Nova categoria no SAC para pedidos de correção, exclusão ou revogação
--    do consentimento (o acesso/cópia é feito pela própria pessoa em
--    "Meu perfil" -> "Baixar meus dados").
-- ---------------------------------------------------------------------
ALTER TABLE chamado MODIFY COLUMN categoria
    ENUM('ACESSO','BOLETIM','COMUNICACAO','CADASTRO','DOCUMENTOS','SUGESTAO','LGPD','OUTRO') NOT NULL;
