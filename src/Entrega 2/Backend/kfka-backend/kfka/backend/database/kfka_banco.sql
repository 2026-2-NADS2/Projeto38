-- =====================================================================
--  KFKA – Plataforma de Acompanhamento Escolar
--  Script físico do banco de dados (MySQL 8.0+)
--  Projeto Interdisciplinar – 2º ADS – 2º semestre 2026
--
--  Conteúdo:
--    1. Criação do banco
--    2. Tabelas (usuários, cadastros, vínculos, bimestres, acompanhamento,
--       tags, histórico/auditoria, ciência do responsável)
--    3. Índices de desempenho (Entrega 1 de BD)
--    4. Triggers (regras de negócio + auditoria automática)
--    5. Views (Entrega 2 de BD)
--    6. Carga de dados fictícios para demonstração
--
--  Alterações para o site (Entrega 2), marcadas com  [SITE]:
--    - faltas no acompanhamento (por aluno x disciplina x bimestre),
--      também registradas no histórico, nos triggers e nas views
--    - tabela mensagem (módulo Comunicação)
--
--  Como rodar: abra no MySQL Workbench e execute tudo (raio ⚡),
--  ou no terminal:  mysql -u root -p < kfka_banco.sql
-- =====================================================================

DROP DATABASE IF EXISTS kfka;
CREATE DATABASE kfka CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE kfka;

-- =====================================================================
-- 2. TABELAS
-- =====================================================================

-- ---------- Usuários e perfis (RF01) ----------
-- Uma única tabela de login para os 3 perfis. Professor e Responsável
-- têm tabela própria com os dados específicos (relação 1:1).
CREATE TABLE usuario (
    id                 INT AUTO_INCREMENT PRIMARY KEY,
    nome               VARCHAR(120) NOT NULL,
    email              VARCHAR(150) NOT NULL,
    senha_hash         VARCHAR(255) NOT NULL,          -- hash bcrypt, NUNCA a senha pura
    perfil             ENUM('ADMIN','PROFESSOR','RESPONSAVEL') NOT NULL,
    ativo              BOOLEAN NOT NULL DEFAULT TRUE,
    token_recuperacao  VARCHAR(255) NULL,              -- recuperação de senha
    token_expira_em    DATETIME NULL,
    ultimo_login_em    DATETIME NULL,
    criado_em          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT uq_usuario_email UNIQUE (email)
);

CREATE TABLE professor (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id  INT NOT NULL,
    registro    VARCHAR(20) NOT NULL,                  -- registro funcional na escola
    telefone    VARCHAR(20) NULL,
    CONSTRAINT uq_professor_usuario  UNIQUE (usuario_id),
    CONSTRAINT uq_professor_registro UNIQUE (registro),
    CONSTRAINT fk_professor_usuario FOREIGN KEY (usuario_id) REFERENCES usuario(id)
);

CREATE TABLE responsavel (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id       INT NOT NULL,
    telefone         VARCHAR(20) NULL,
    aceite_lgpd_em   DATETIME NULL,                    -- registro de consentimento (LGPD)
    CONSTRAINT uq_responsavel_usuario UNIQUE (usuario_id),
    CONSTRAINT fk_responsavel_usuario FOREIGN KEY (usuario_id) REFERENCES usuario(id)
);

-- ---------- Cadastros escolares (RF02) ----------
-- Aluno não faz login: é visto pelos responsáveis. Coleta mínima (LGPD).
CREATE TABLE aluno (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    nome             VARCHAR(120) NOT NULL,
    matricula        VARCHAR(20)  NOT NULL,
    data_nascimento  DATE NOT NULL,
    ativo            BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_aluno_matricula UNIQUE (matricula)
);

-- N:N – um responsável pode ter vários alunos e vice-versa
CREATE TABLE aluno_responsavel (
    aluno_id        INT NOT NULL,
    responsavel_id  INT NOT NULL,
    parentesco      VARCHAR(30) NOT NULL,              -- Mãe, Pai, Avó, Tutor...
    autorizado      BOOLEAN NOT NULL DEFAULT TRUE,     -- pode ver os relatórios?
    PRIMARY KEY (aluno_id, responsavel_id),
    CONSTRAINT fk_ar_aluno       FOREIGN KEY (aluno_id)       REFERENCES aluno(id),
    CONSTRAINT fk_ar_responsavel FOREIGN KEY (responsavel_id) REFERENCES responsavel(id)
);

CREATE TABLE area (
    id    INT AUTO_INCREMENT PRIMARY KEY,
    nome  VARCHAR(80) NOT NULL,
    CONSTRAINT uq_area_nome UNIQUE (nome)
);

CREATE TABLE disciplina (
    id       INT AUTO_INCREMENT PRIMARY KEY,
    area_id  INT NOT NULL,
    nome     VARCHAR(80) NOT NULL,
    ativo    BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT uq_disciplina_nome UNIQUE (nome),
    CONSTRAINT fk_disciplina_area FOREIGN KEY (area_id) REFERENCES area(id)
);

CREATE TABLE turma (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    nome         VARCHAR(20) NOT NULL,                 -- ex.: 6º A
    serie        TINYINT NOT NULL,                     -- 1 a 9 (Ensino Fundamental)
    ano_letivo   SMALLINT NOT NULL,
    turno        ENUM('MANHA','TARDE','INTEGRAL') NOT NULL,
    ativo        BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT uq_turma_nome_ano UNIQUE (nome, ano_letivo),
    CONSTRAINT uq_turma_id_ano   UNIQUE (id, ano_letivo),       -- usado por FK composta
    CONSTRAINT ck_turma_serie CHECK (serie BETWEEN 1 AND 9)
);

CREATE TABLE tag (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    nome       VARCHAR(50) NOT NULL,
    descricao  VARCHAR(200) NULL,
    ativo      BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT uq_tag_nome UNIQUE (nome)
);

-- ---------- Vínculos da turma (RF03) ----------
-- Aluno matriculado na turma. A FK composta (turma_id, ano_letivo) garante
-- que o ano gravado aqui é o mesmo da turma, e o UNIQUE impede o aluno de
-- estar em duas turmas no mesmo ano.
CREATE TABLE turma_aluno (
    turma_id    INT NOT NULL,
    aluno_id    INT NOT NULL,
    ano_letivo  SMALLINT NOT NULL,
    PRIMARY KEY (turma_id, aluno_id),
    CONSTRAINT uq_aluno_um_por_ano UNIQUE (aluno_id, ano_letivo),
    CONSTRAINT fk_ta_turma FOREIGN KEY (turma_id, ano_letivo) REFERENCES turma(id, ano_letivo),
    CONSTRAINT fk_ta_aluno FOREIGN KEY (aluno_id) REFERENCES aluno(id)
);

-- Qual professor dá qual disciplina em qual turma (1 professor por disciplina/turma)
CREATE TABLE turma_disciplina_professor (
    turma_id       INT NOT NULL,
    disciplina_id  INT NOT NULL,
    professor_id   INT NOT NULL,
    PRIMARY KEY (turma_id, disciplina_id),
    CONSTRAINT uq_tdp_trio UNIQUE (turma_id, disciplina_id, professor_id),  -- usado por FK composta
    CONSTRAINT fk_tdp_turma      FOREIGN KEY (turma_id)      REFERENCES turma(id),
    CONSTRAINT fk_tdp_disciplina FOREIGN KEY (disciplina_id) REFERENCES disciplina(id),
    CONSTRAINT fk_tdp_professor  FOREIGN KEY (professor_id)  REFERENCES professor(id)
);

-- ---------- Períodos bimestrais (RF04) ----------
CREATE TABLE bimestre (
    id                 INT AUTO_INCREMENT PRIMARY KEY,
    ano_letivo         SMALLINT NOT NULL,
    numero             TINYINT NOT NULL,
    digitacao_inicio   DATETIME NOT NULL,
    digitacao_fim      DATETIME NOT NULL,
    CONSTRAINT uq_bimestre UNIQUE (ano_letivo, numero),
    CONSTRAINT ck_bimestre_numero  CHECK (numero BETWEEN 1 AND 4),
    CONSTRAINT ck_bimestre_periodo CHECK (digitacao_fim > digitacao_inicio)
);

-- ---------- Acompanhamento bimestral (RF05/RF06) ----------
-- As duas FKs compostas são o coração da integridade:
--   (turma_id, aluno_id)                    -> o aluno PRECISA estar na turma
--   (turma_id, disciplina_id, professor_id) -> o professor PRECISA dar essa
--                                              disciplina nessa turma
CREATE TABLE acompanhamento (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    aluno_id       INT NOT NULL,
    turma_id       INT NOT NULL,
    disciplina_id  INT NOT NULL,
    professor_id   INT NOT NULL,
    bimestre_id    INT NOT NULL,
    descricao      TEXT NOT NULL,
    media          DECIMAL(4,2) NOT NULL,
    faltas         SMALLINT NOT NULL DEFAULT 0,        -- [SITE] faltas no bimestre/disciplina
    status         ENUM('RASCUNHO','ENVIADO','EM_REVISAO','DEVOLVIDO','PUBLICADO','CANCELADO')
                   NOT NULL DEFAULT 'RASCUNHO',
    versao         INT NOT NULL DEFAULT 1,
    revisor_id     INT NULL,                           -- usuário ADMIN que publicou/devolveu
    criado_em      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    enviado_em     DATETIME NULL,
    publicado_em   DATETIME NULL,
    CONSTRAINT uq_acomp UNIQUE (aluno_id, disciplina_id, bimestre_id),   -- 1 registro por aluno/disciplina/bimestre
    CONSTRAINT ck_acomp_media CHECK (media BETWEEN 0 AND 10),
    CONSTRAINT ck_acomp_faltas CHECK (faltas >= 0),                       -- [SITE]
    CONSTRAINT fk_acomp_turma_aluno FOREIGN KEY (turma_id, aluno_id)
        REFERENCES turma_aluno(turma_id, aluno_id),
    CONSTRAINT fk_acomp_vinculo FOREIGN KEY (turma_id, disciplina_id, professor_id)
        REFERENCES turma_disciplina_professor(turma_id, disciplina_id, professor_id),
    CONSTRAINT fk_acomp_bimestre FOREIGN KEY (bimestre_id) REFERENCES bimestre(id),
    CONSTRAINT fk_acomp_revisor  FOREIGN KEY (revisor_id)  REFERENCES usuario(id)
);

-- N:N – múltiplas tags por acompanhamento
CREATE TABLE acompanhamento_tag (
    acompanhamento_id  INT NOT NULL,
    tag_id             INT NOT NULL,
    PRIMARY KEY (acompanhamento_id, tag_id),
    CONSTRAINT fk_at_acomp FOREIGN KEY (acompanhamento_id) REFERENCES acompanhamento(id) ON DELETE CASCADE,
    CONSTRAINT fk_at_tag   FOREIGN KEY (tag_id)            REFERENCES tag(id)
);

-- ---------- Histórico e auditoria (RF07) ----------
-- Preenchida AUTOMATICAMENTE pelos triggers. Guarda usuário, data/hora,
-- estado anterior e posterior (exigência do item 3 do enunciado).
CREATE TABLE historico_acompanhamento (
    id                  BIGINT AUTO_INCREMENT PRIMARY KEY,
    acompanhamento_id   INT NOT NULL,
    usuario_id          INT NOT NULL,
    acao                VARCHAR(30) NOT NULL,          -- CRIACAO, EDICAO, MUDANCA_STATUS
    status_anterior     ENUM('RASCUNHO','ENVIADO','EM_REVISAO','DEVOLVIDO','PUBLICADO','CANCELADO') NULL,
    status_novo         ENUM('RASCUNHO','ENVIADO','EM_REVISAO','DEVOLVIDO','PUBLICADO','CANCELADO') NOT NULL,
    media_anterior      DECIMAL(4,2) NULL,
    media_nova          DECIMAL(4,2) NOT NULL,
    faltas_anterior     SMALLINT NULL,                 -- [SITE]
    faltas_nova         SMALLINT NOT NULL DEFAULT 0,   -- [SITE]
    descricao_anterior  TEXT NULL,
    descricao_nova      TEXT NOT NULL,
    observacao          VARCHAR(500) NULL,             -- motivo da devolução, por ex.
    data_hora           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_hist_acomp   FOREIGN KEY (acompanhamento_id) REFERENCES acompanhamento(id),
    CONSTRAINT fk_hist_usuario FOREIGN KEY (usuario_id)        REFERENCES usuario(id)
);

-- ---------- Ciência / retorno do responsável (RF12) ----------
CREATE TABLE ciencia_responsavel (
    id                 INT AUTO_INCREMENT PRIMARY KEY,
    acompanhamento_id  INT NOT NULL,
    responsavel_id     INT NOT NULL,
    data_ciencia       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    observacao         VARCHAR(1000) NULL,             -- retorno visível ao professor e admin
    CONSTRAINT uq_ciencia UNIQUE (acompanhamento_id, responsavel_id),
    CONSTRAINT fk_ciencia_acomp FOREIGN KEY (acompanhamento_id) REFERENCES acompanhamento(id),
    CONSTRAINT fk_ciencia_resp  FOREIGN KEY (responsavel_id)    REFERENCES responsavel(id)
);

-- ---------- [SITE] Mensagens entre usuários (módulo Comunicação) ----------
-- Responsável conversa com a equipe (admin/professor); a equipe conversa com todos.
-- Essa regra fica no back-end.
CREATE TABLE mensagem (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    remetente_id     INT NOT NULL,
    destinatario_id  INT NOT NULL,
    texto            VARCHAR(2000) NOT NULL,
    lida             BOOLEAN NOT NULL DEFAULT FALSE,
    criado_em        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_msg_remetente    FOREIGN KEY (remetente_id)    REFERENCES usuario(id),
    CONSTRAINT fk_msg_destinatario FOREIGN KEY (destinatario_id) REFERENCES usuario(id)
);

-- =====================================================================
-- 3. ÍNDICES DE DESEMPENHO
--    (PKs, UNIQUEs e FKs já geram índice automaticamente no MySQL;
--     estes atendem filtros frequentes das telas e relatórios)
-- =====================================================================

-- Fila de revisão do Admin: WHERE status = 'ENVIADO' ORDER BY enviado_em
CREATE INDEX idx_acomp_status_enviado ON acompanhamento (status, enviado_em);

-- Tela do professor: "meus registros deste bimestre"
CREATE INDEX idx_acomp_prof_bim ON acompanhamento (professor_id, bimestre_id, status);

-- Relatórios por turma/disciplina/bimestre (RF10)
CREATE INDEX idx_acomp_turma_bim_disc ON acompanhamento (turma_id, bimestre_id, disciplina_id);

-- Relatórios por tag (RF10): busca "quais acompanhamentos têm a tag X"
CREATE INDEX idx_at_tag ON acompanhamento_tag (tag_id, acompanhamento_id);

-- Histórico de um registro em ordem cronológica
CREATE INDEX idx_hist_acomp_data ON historico_acompanhamento (acompanhamento_id, data_hora);

-- Login filtra por e-mail + ativo (e-mail já é UNIQUE); filtro por perfil na gestão
CREATE INDEX idx_usuario_perfil_ativo ON usuario (perfil, ativo);

-- Busca de aluno por nome nas telas de cadastro
CREATE INDEX idx_aluno_nome ON aluno (nome);

-- Responsável → seus alunos (a PK começa por aluno_id; este cobre o caminho inverso)
CREATE INDEX idx_ar_responsavel ON aluno_responsavel (responsavel_id, aluno_id);

-- [SITE] Conversa entre duas pessoas em ordem cronológica / contador de não lidas
CREATE INDEX idx_msg_conversa ON mensagem (remetente_id, destinatario_id, criado_em);
CREATE INDEX idx_msg_nao_lidas ON mensagem (destinatario_id, lida);

-- =====================================================================
-- 4. TRIGGERS – regras de negócio e auditoria
--
--  IMPORTANTE para o back-end: antes de qualquer INSERT/UPDATE em
--  acompanhamento, a aplicação deve executar, na mesma conexão:
--       SET @usuario_id = <id do usuário logado>;
--  É assim que o histórico sabe QUEM fez a alteração.
-- =====================================================================

DELIMITER $$

-- 4.1 Professor só registra dentro do período de digitação (regra do item 3)
CREATE TRIGGER trg_acomp_bi
BEFORE INSERT ON acompanhamento
FOR EACH ROW
BEGIN
    DECLARE v_ini DATETIME;
    DECLARE v_fim DATETIME;

    IF @usuario_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Defina @usuario_id antes de gravar o acompanhamento.';
    END IF;

    SELECT digitacao_inicio, digitacao_fim INTO v_ini, v_fim
      FROM bimestre WHERE id = NEW.bimestre_id;

    -- @carga_inicial = 1 só é usado pelo script de dados fictícios
    IF COALESCE(@carga_inicial, 0) = 0 AND NOW() NOT BETWEEN v_ini AND v_fim THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Fora do período de digitação deste bimestre.';
    END IF;

    IF NEW.status = 'ENVIADO' THEN
        SET NEW.enviado_em = NOW();
    END IF;
END$$

-- 4.2 Fluxo editorial: só permite transições válidas de status
CREATE TRIGGER trg_acomp_bu
BEFORE UPDATE ON acompanhamento
FOR EACH ROW
BEGIN
    DECLARE v_ini DATETIME;
    DECLARE v_fim DATETIME;

    IF @usuario_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Defina @usuario_id antes de alterar o acompanhamento.';
    END IF;

    IF NEW.status <> OLD.status AND NOT (
           (OLD.status = 'RASCUNHO'   AND NEW.status IN ('ENVIADO','CANCELADO'))
        OR (OLD.status = 'ENVIADO'    AND NEW.status IN ('EM_REVISAO','DEVOLVIDO','CANCELADO'))
        OR (OLD.status = 'EM_REVISAO' AND NEW.status IN ('PUBLICADO','DEVOLVIDO','CANCELADO'))
        OR (OLD.status = 'DEVOLVIDO'  AND NEW.status IN ('ENVIADO','CANCELADO'))
        OR (OLD.status = 'PUBLICADO'  AND NEW.status IN ('EM_REVISAO'))   -- retificação
    ) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Transição de status não permitida.';
    END IF;

    IF OLD.status = 'CANCELADO' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Registro cancelado não pode ser alterado.';
    END IF;

    -- Professor editando (rascunho/devolvido) precisa estar no período
    IF NEW.status IN ('RASCUNHO','DEVOLVIDO','ENVIADO') AND OLD.status IN ('RASCUNHO','DEVOLVIDO')
       AND COALESCE(@carga_inicial, 0) = 0 THEN
        SELECT digitacao_inicio, digitacao_fim INTO v_ini, v_fim
          FROM bimestre WHERE id = NEW.bimestre_id;
        IF NOW() NOT BETWEEN v_ini AND v_fim THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Fora do período de digitação deste bimestre.';
        END IF;
    END IF;

    -- Carimbos automáticos
    IF NEW.status = 'ENVIADO' AND OLD.status <> 'ENVIADO' THEN
        SET NEW.enviado_em = NOW();
    END IF;
    IF NEW.status IN ('PUBLICADO','DEVOLVIDO') AND NEW.status <> OLD.status THEN
        SET NEW.revisor_id = @usuario_id;
    END IF;
    IF NEW.status = 'PUBLICADO' AND OLD.status <> 'PUBLICADO' THEN
        SET NEW.publicado_em = NOW();
    END IF;
    IF NEW.descricao <> OLD.descricao OR NEW.media <> OLD.media
       OR NEW.faltas <> OLD.faltas THEN                                  -- [SITE]
        SET NEW.versao = OLD.versao + 1;
    END IF;
END$$

-- 4.3 Auditoria: criação
CREATE TRIGGER trg_acomp_ai
AFTER INSERT ON acompanhamento
FOR EACH ROW
BEGIN
    INSERT INTO historico_acompanhamento
        (acompanhamento_id, usuario_id, acao, status_anterior, status_novo,
         media_anterior, media_nova, faltas_anterior, faltas_nova,          -- [SITE]
         descricao_anterior, descricao_nova, observacao)
    VALUES
        (NEW.id, @usuario_id, 'CRIACAO', NULL, NEW.status,
         NULL, NEW.media, NULL, NEW.faltas,
         NULL, NEW.descricao, @observacao);
END$$

-- 4.4 Auditoria: toda alteração (estado anterior x posterior)
CREATE TRIGGER trg_acomp_au
AFTER UPDATE ON acompanhamento
FOR EACH ROW
BEGIN
    INSERT INTO historico_acompanhamento
        (acompanhamento_id, usuario_id, acao, status_anterior, status_novo,
         media_anterior, media_nova, faltas_anterior, faltas_nova,          -- [SITE]
         descricao_anterior, descricao_nova, observacao)
    VALUES
        (NEW.id, @usuario_id,
         IF(NEW.status <> OLD.status, 'MUDANCA_STATUS', 'EDICAO'),
         OLD.status, NEW.status, OLD.media, NEW.media, OLD.faltas, NEW.faltas,
         OLD.descricao, NEW.descricao,
         @observacao);
END$$

DELIMITER ;

-- =====================================================================
-- 5. VIEWS
-- =====================================================================

-- 5.1 Visão completa do acompanhamento (base para relatórios e exportação
--     Excel – RF10/RF11). Junta as 8 tabelas envolvidas e concatena as tags.
CREATE VIEW vw_acompanhamento_completo AS
SELECT
    a.id                         AS acompanhamento_id,
    b.ano_letivo,
    b.numero                     AS bimestre,
    t.id                         AS turma_id,
    t.nome                       AS turma,
    t.serie,
    al.id                        AS aluno_id,
    al.matricula,
    al.nome                      AS aluno,
    ar.nome                      AS area,
    d.id                         AS disciplina_id,
    d.nome                       AS disciplina,
    p.id                         AS professor_id,
    up.nome                      AS professor,
    a.media,
    a.faltas,                                              -- [SITE]
    a.descricao,
    a.status,
    a.versao,
    (SELECT GROUP_CONCAT(tg.nome ORDER BY tg.nome SEPARATOR ', ')
       FROM acompanhamento_tag at2
       JOIN tag tg ON tg.id = at2.tag_id
      WHERE at2.acompanhamento_id = a.id) AS tags,
    ur.nome                      AS revisor,
    a.enviado_em,
    a.publicado_em
FROM acompanhamento a
JOIN bimestre   b  ON b.id  = a.bimestre_id
JOIN turma      t  ON t.id  = a.turma_id
JOIN aluno      al ON al.id = a.aluno_id
JOIN disciplina d  ON d.id  = a.disciplina_id
JOIN area       ar ON ar.id = d.area_id
JOIN professor  p  ON p.id  = a.professor_id
JOIN usuario    up ON up.id = p.usuario_id
LEFT JOIN usuario ur ON ur.id = a.revisor_id;

-- 5.2 Relatório do responsável (RF08/RF09 – tela e PDF).
--     Só registros PUBLICADOS, só de alunos com vínculo autorizado.
--     Uso no back-end:  SELECT * FROM vw_relatorio_responsavel
--                        WHERE responsavel_id = ? AND ano_letivo = ? ORDER BY bimestre, disciplina;
CREATE VIEW vw_relatorio_responsavel AS
SELECT
    rel.responsavel_id,
    v.acompanhamento_id,
    v.ano_letivo, v.bimestre, v.turma, v.aluno_id, v.aluno,
    v.area, v.disciplina, v.professor, v.media, v.faltas, v.descricao, v.tags,   -- [SITE] faltas
    v.publicado_em,
    c.data_ciencia,
    c.observacao AS retorno_responsavel
FROM vw_acompanhamento_completo v
JOIN aluno_responsavel rel ON rel.aluno_id = v.aluno_id AND rel.autorizado = TRUE
LEFT JOIN ciencia_responsavel c
       ON c.acompanhamento_id = v.acompanhamento_id
      AND c.responsavel_id    = rel.responsavel_id
WHERE v.status = 'PUBLICADO';

-- 5.3 Fila de revisão do Administrador (RF06)
CREATE VIEW vw_fila_revisao AS
SELECT acompanhamento_id, ano_letivo, bimestre, turma, aluno, disciplina,
       professor, media, faltas, status, enviado_em,          -- [SITE] faltas
       TIMESTAMPDIFF(HOUR, enviado_em, NOW()) AS horas_aguardando
FROM vw_acompanhamento_completo
WHERE status IN ('ENVIADO','EM_REVISAO');

-- 5.4 Indicadores por turma × disciplina × bimestre (RF10)
CREATE VIEW vw_indicadores_turma_disciplina AS
SELECT
    ano_letivo, bimestre, turma, disciplina, professor,
    COUNT(*)                          AS qtd_registros,
    SUM(status = 'PUBLICADO')         AS qtd_publicados,
    ROUND(AVG(media), 2)              AS media_geral,
    MIN(media)                        AS menor_media,
    MAX(media)                        AS maior_media,
    SUM(media < 6)                    AS qtd_abaixo_de_6,
    SUM(faltas)                       AS total_faltas          -- [SITE]
FROM vw_acompanhamento_completo
WHERE status <> 'CANCELADO'
GROUP BY ano_letivo, bimestre, turma, disciplina, professor;

-- 5.5 Frequência de tags (RF10 – relatório por tags / dashboard)
CREATE VIEW vw_frequencia_tags AS
SELECT
    b.ano_letivo, b.numero AS bimestre, t.nome AS turma, tg.nome AS tag,
    COUNT(*) AS ocorrencias
FROM acompanhamento_tag at2
JOIN tag            tg ON tg.id = at2.tag_id
JOIN acompanhamento a  ON a.id  = at2.acompanhamento_id
JOIN bimestre       b  ON b.id  = a.bimestre_id
JOIN turma          t  ON t.id  = a.turma_id
WHERE a.status <> 'CANCELADO'
GROUP BY b.ano_letivo, b.numero, t.nome, tg.nome;

-- 5.6 Retornos dos responsáveis (RF10 – professor vê retornos das suas turmas)
CREATE VIEW vw_retornos_responsaveis AS
SELECT
    v.professor_id, v.professor, v.turma, v.aluno, v.disciplina, v.bimestre,
    u.nome AS responsavel, c.data_ciencia, c.observacao
FROM ciencia_responsavel c
JOIN responsavel r ON r.id = c.responsavel_id
JOIN usuario     u ON u.id = r.usuario_id
JOIN vw_acompanhamento_completo v ON v.acompanhamento_id = c.acompanhamento_id;

-- =====================================================================
-- 6. CARGA DE DADOS FICTÍCIOS (demonstração)
--    Senha de TODOS os usuários de teste: Senha@123
--    O valor abaixo é um MARCADOR. Gere o hash real no back-end e rode o
--    UPDATE indicado no guia (ex.: BCrypt.Net.BCrypt.HashPassword("Senha@123")).
-- =====================================================================

SET @carga_inicial = 1;
SET @hash = '$2a$10$TROCAR.PELO.HASH.BCRYPT.GERADO.NO.BACKEND.xxxxxxxxxxx';

INSERT INTO usuario (id, nome, email, senha_hash, perfil) VALUES
 (1, 'Marina Coordenação',   'admin@kfka.edu.br',          @hash, 'ADMIN'),
 (2, 'Carlos Menezes',       'carlos.menezes@kfka.edu.br', @hash, 'PROFESSOR'),
 (3, 'Fernanda Lopes',       'fernanda.lopes@kfka.edu.br', @hash, 'PROFESSOR'),
 (4, 'Ricardo Tanaka',       'ricardo.tanaka@kfka.edu.br', @hash, 'PROFESSOR'),
 (5, 'Ana Paula Ribeiro',    'ana.ribeiro@email.com',      @hash, 'RESPONSAVEL'),
 (6, 'José Ribeiro',         'jose.ribeiro@email.com',     @hash, 'RESPONSAVEL'),
 (7, 'Luciana Andrade',      'luciana.andrade@email.com',  @hash, 'RESPONSAVEL'),
 (8, 'Marcos Oliveira',      'marcos.oliveira@email.com',  @hash, 'RESPONSAVEL');

SET @usuario_id = 1;   -- carga feita "como" o admin

INSERT INTO professor (id, usuario_id, registro, telefone) VALUES
 (1, 2, 'P-1001', '(11) 90000-0001'),
 (2, 3, 'P-1002', '(11) 90000-0002'),
 (3, 4, 'P-1003', '(11) 90000-0003');

INSERT INTO responsavel (id, usuario_id, telefone, aceite_lgpd_em) VALUES
 (1, 5, '(11) 91111-0001', '2026-02-02 10:00:00'),
 (2, 6, '(11) 91111-0002', '2026-02-02 10:05:00'),
 (3, 7, '(11) 91111-0003', '2026-02-03 09:00:00'),
 (4, 8, '(11) 91111-0004', '2026-02-03 09:30:00');

INSERT INTO aluno (id, nome, matricula, data_nascimento) VALUES
 (1, 'Lucas Ribeiro',     '2026001', '2014-03-12'),
 (2, 'Beatriz Ribeiro',   '2026002', '2016-07-25'),
 (3, 'Gabriel Andrade',   '2026003', '2014-11-02'),
 (4, 'Sofia Oliveira',    '2026004', '2014-05-19'),
 (5, 'Pedro Henrique',    '2026005', '2016-01-30'),
 (6, 'Laura Martins',     '2026006', '2016-09-14');

-- Ana e José (pais) veem Lucas e Beatriz; Luciana vê Gabriel; Marcos vê Sofia e Pedro
INSERT INTO aluno_responsavel (aluno_id, responsavel_id, parentesco) VALUES
 (1, 1, 'Mãe'), (1, 2, 'Pai'),
 (2, 1, 'Mãe'), (2, 2, 'Pai'),
 (3, 3, 'Mãe'),
 (4, 4, 'Pai'), (5, 4, 'Tio'),
 (6, 3, 'Tia');

INSERT INTO area (id, nome) VALUES
 (1, 'Linguagens'), (2, 'Matemática'), (3, 'Ciências da Natureza'), (4, 'Ciências Humanas');

INSERT INTO disciplina (id, area_id, nome) VALUES
 (1, 1, 'Língua Portuguesa'),
 (2, 1, 'Inglês'),
 (3, 2, 'Matemática'),
 (4, 3, 'Ciências'),
 (5, 4, 'História');

INSERT INTO turma (id, nome, serie, ano_letivo, turno) VALUES
 (1, '6º A', 6, 2026, 'MANHA'),
 (2, '4º B', 4, 2026, 'TARDE');

INSERT INTO turma_aluno (turma_id, aluno_id, ano_letivo) VALUES
 (1, 1, 2026), (1, 3, 2026), (1, 4, 2026),
 (2, 2, 2026), (2, 5, 2026), (2, 6, 2026);

INSERT INTO turma_disciplina_professor (turma_id, disciplina_id, professor_id) VALUES
 (1, 1, 1), (1, 3, 2), (1, 4, 3), (1, 5, 1),
 (2, 1, 1), (2, 3, 2), (2, 2, 3);

INSERT INTO tag (id, nome, descricao) VALUES
 (1, 'Participativo',          'Participa ativamente das aulas'),
 (2, 'Precisa de reforço',     'Indicado para atividades de reforço'),
 (3, 'Entrega em dia',         'Cumpre prazos de tarefas'),
 (4, 'Dificuldade de atenção', 'Dispersa-se com facilidade'),
 (5, 'Destaque',               'Desempenho acima do esperado'),
 (6, 'Trabalho em equipe',     'Colabora bem com os colegas');

INSERT INTO bimestre (id, ano_letivo, numero, digitacao_inicio, digitacao_fim) VALUES
 (1, 2026, 1, '2026-04-20 00:00:00', '2026-05-05 23:59:59'),
 (2, 2026, 2, '2026-06-29 00:00:00', '2026-07-10 23:59:59'),
 (3, 2026, 3, '2026-09-21 00:00:00', '2026-10-02 23:59:59'),
 (4, 2026, 4, '2026-11-01 00:00:00', '2026-12-15 23:59:59');

-- Acompanhamentos (criados como rascunho pelo professor e depois movidos no fluxo)
SET @usuario_id = 2;  -- Prof. Carlos
INSERT INTO acompanhamento (id, aluno_id, turma_id, disciplina_id, professor_id, bimestre_id, descricao, media, faltas) VALUES
 (1, 1, 1, 1, 1, 1, 'Lucas lê com fluência e produz textos bem estruturados.', 8.50, 1),
 (2, 3, 1, 1, 1, 1, 'Gabriel precisa praticar mais a produção de textos.', 5.50, 4),
 (3, 4, 1, 1, 1, 1, 'Sofia demonstra excelente interpretação de texto.', 9.50, 0),
 (4, 2, 2, 1, 1, 1, 'Beatriz evoluiu na escrita cursiva.', 7.00, 2),
 (5, 1, 1, 5, 1, 1, 'Lucas participa dos debates em sala.', 8.00, 1),
 (6, 1, 1, 1, 1, 4, 'Lucas manteve o bom desempenho no último bimestre.', 8.80, 0);

SET @usuario_id = 3;  -- Profa. Fernanda
INSERT INTO acompanhamento (id, aluno_id, turma_id, disciplina_id, professor_id, bimestre_id, descricao, media, faltas) VALUES
 (7, 1, 1, 3, 2, 1, 'Lucas resolve problemas com frações com autonomia.', 9.00, 1),
 (8, 3, 1, 3, 2, 1, 'Gabriel apresenta dificuldades em operações básicas.', 4.50, 5),
 (9, 4, 1, 3, 2, 1, 'Sofia tem ótimo raciocínio lógico.', 9.80, 0),
 (10, 5, 2, 3, 2, 1, 'Pedro faz as tarefas, mas precisa revisar a tabuada.', 6.00, 3),
 (11, 6, 2, 3, 2, 1, 'Laura acompanha bem os conteúdos.', 7.50, 2);

SET @usuario_id = 4;  -- Prof. Ricardo
INSERT INTO acompanhamento (id, aluno_id, turma_id, disciplina_id, professor_id, bimestre_id, descricao, media, faltas) VALUES
 (12, 1, 1, 4, 3, 1, 'Lucas realizou bem o experimento de germinação.', 8.00, 1),
 (13, 2, 2, 2, 3, 1, 'Beatriz amplia o vocabulário a cada aula.', 8.50, 0);

INSERT INTO acompanhamento_tag (acompanhamento_id, tag_id) VALUES
 (1,1),(1,3),(2,2),(2,4),(3,5),(3,3),(4,3),(5,1),(5,6),(6,3),
 (7,5),(7,3),(8,2),(9,5),(10,2),(11,3),(12,6),(12,1),(13,1);

-- Fluxo: professores enviam
SET @usuario_id = 2;
UPDATE acompanhamento SET status = 'ENVIADO' WHERE id IN (1,2,3,4,5);
SET @usuario_id = 3;
UPDATE acompanhamento SET status = 'ENVIADO' WHERE id IN (7,8,9,10);
SET @usuario_id = 4;
UPDATE acompanhamento SET status = 'ENVIADO' WHERE id IN (12,13);

-- Admin revisa
SET @usuario_id = 1;
UPDATE acompanhamento SET status = 'EM_REVISAO' WHERE id IN (1,2,3,4,5,7,8,9,12,13);

-- Admin ALTERA o texto (rastreado no histórico) e publica
SET @observacao = 'Ajuste de redação pela coordenação';
UPDATE acompanhamento
   SET descricao = 'Gabriel precisa praticar mais a produção de textos; recomendamos leitura diária em casa.'
 WHERE id = 2;
SET @observacao = NULL;
UPDATE acompanhamento SET status = 'PUBLICADO' WHERE id IN (1,2,3,4,5,7,8,9,12);

-- Admin devolve um registro para ajustes
SET @observacao = 'Detalhar quais conteúdos de vocabulário foram trabalhados.';
UPDATE acompanhamento SET status = 'DEVOLVIDO' WHERE id = 13;
SET @observacao = NULL;

-- Responsáveis registram ciência / retorno
INSERT INTO ciencia_responsavel (acompanhamento_id, responsavel_id, observacao) VALUES
 (1, 1, 'Ficamos muito felizes com o desenvolvimento do Lucas!'),
 (7, 1, NULL),
 (2, 3, 'Vamos incentivar a leitura em casa. Obrigada pelo retorno.'),
 (8, 3, 'Gostaria de agendar uma conversa com a professora.');

-- [SITE] Mensagens de exemplo
INSERT INTO mensagem (remetente_id, destinatario_id, texto, lida, criado_em) VALUES
 (5, 2, 'Professor, o Lucas pode refazer a atividade de redação?', FALSE, NOW() - INTERVAL 3 HOUR),
 (2, 5, 'Pode sim! Ele pode entregar até sexta-feira.',               TRUE,  NOW() - INTERVAL 2 HOUR),
 (7, 3, 'Gostaria de conversar sobre as notas do Gabriel em Matemática.', FALSE, NOW() - INTERVAL 1 DAY),
 (1, 2, 'Lembrete: a digitação do 4º bimestre vai até 15/12.',      FALSE, NOW() - INTERVAL 1 DAY);

SET @carga_inicial = NULL;
SET @usuario_id = NULL;

-- =====================================================================
-- FIM. Testes rápidos:
--   SELECT * FROM vw_relatorio_responsavel WHERE responsavel_id = 1;
--   SELECT * FROM vw_fila_revisao;
--   SELECT * FROM vw_indicadores_turma_disciplina;
--   SELECT * FROM historico_acompanhamento WHERE acompanhamento_id = 2;
-- =====================================================================
