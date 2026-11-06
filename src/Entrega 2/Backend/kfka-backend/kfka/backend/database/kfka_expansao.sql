-- =====================================================================
--  KFKA – Plataforma de Acompanhamento Escolar
--  Expansão da plataforma (MySQL 8.0+) — roda DEPOIS do kfka_banco.sql
--
--  Novos módulos:
--    perfil (foto) · cadastro completo de alunos e professores · histórico
--    de vínculos · grade de aulas · relatório por aula e frequência ·
--    atividades e entregas · calendário escolar · mural de conversas por
--    aluno · SAC (chamados) · justificativa de faltas · documentos
--    escolares · ocorrências · visualização do boletim
--
--  Como rodar:
--    - npm run db:setup  (roda o kfka_banco.sql e este arquivo, nessa ordem)
--    - Workbench: execute o kfka_banco.sql e depois este arquivo (raio ⚡)
--    - Banco que já existe (ex.: Railway já publicado): o servidor aplica
--      este arquivo sozinho ao iniciar, se a tabela "evento" ainda não existir.
--
--  Datas da carga de demonstração são RELATIVAS ao dia em que o script roda
--  (CURDATE()), para a demonstração nunca ficar "vencida".
-- =====================================================================

USE kfka;

-- =====================================================================
-- 1. COLUNAS NOVAS EM TABELAS EXISTENTES
-- =====================================================================

-- Foto do perfil: imagem JPEG 160x160 em data URL (redimensionada no navegador, ~10 a 30 KB)
ALTER TABLE usuario ADD COLUMN foto MEDIUMTEXT NULL AFTER perfil;

-- Documento (CPF ou outro) do professor
ALTER TABLE professor
    ADD COLUMN documento VARCHAR(20) NULL,
    ADD CONSTRAINT uq_professor_documento UNIQUE (documento);

-- Cadastro completo do aluno. Todos opcionais: coleta mínima (LGPD, art. 14)
ALTER TABLE aluno
    ADD COLUMN documento VARCHAR(20)  NULL,             -- CPF ou RG, quando houver
    ADD COLUMN email     VARCHAR(150) NULL,
    ADD COLUMN telefone  VARCHAR(20)  NULL,
    ADD COLUMN endereco  VARCHAR(200) NULL,
    ADD CONSTRAINT uq_aluno_documento UNIQUE (documento);

-- Início e fim de cada bimestre (as datas de digitação já existiam)
ALTER TABLE bimestre
    ADD COLUMN data_inicio DATE NULL,
    ADD COLUMN data_fim    DATE NULL;

-- Conversa associada a um aluno (opcional)
ALTER TABLE mensagem
    ADD COLUMN aluno_id INT NULL,
    ADD CONSTRAINT fk_msg_aluno FOREIGN KEY (aluno_id) REFERENCES aluno(id);

-- =====================================================================
-- 2. TABELAS NOVAS
-- =====================================================================

-- ---------- Histórico de vínculos professor × disciplina × turma ----------
CREATE TABLE historico_vinculo (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    turma_id       INT NOT NULL,
    disciplina_id  INT NOT NULL,
    professor_id   INT NOT NULL,
    acao           ENUM('VINCULADO','DESVINCULADO') NOT NULL,
    usuario_id     INT NOT NULL,                       -- quem fez a alteração
    data_hora      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_hv_turma      FOREIGN KEY (turma_id)      REFERENCES turma(id),
    CONSTRAINT fk_hv_disciplina FOREIGN KEY (disciplina_id) REFERENCES disciplina(id),
    CONSTRAINT fk_hv_professor  FOREIGN KEY (professor_id)  REFERENCES professor(id),
    CONSTRAINT fk_hv_usuario    FOREIGN KEY (usuario_id)    REFERENCES usuario(id)
);
CREATE INDEX idx_hv_professor ON historico_vinculo (professor_id, data_hora);

-- ---------- Grade semanal: em que dias cada disciplina tem aula na turma ----------
-- dia_semana: 1 = segunda ... 6 = sábado. Usada para apontar "aulas sem registro".
CREATE TABLE grade_aula (
    turma_id       INT NOT NULL,
    disciplina_id  INT NOT NULL,
    dia_semana     TINYINT NOT NULL,
    PRIMARY KEY (turma_id, disciplina_id, dia_semana),
    CONSTRAINT ck_grade_dia CHECK (dia_semana BETWEEN 1 AND 6),
    CONSTRAINT fk_grade_vinculo FOREIGN KEY (turma_id, disciplina_id)
        REFERENCES turma_disciplina_professor(turma_id, disciplina_id) ON DELETE CASCADE
);

-- ---------- Relatório por aula (diário de classe) ----------
-- Um registro por turma × disciplina × dia. A FK composta garante que o
-- professor dá essa disciplina nessa turma.
CREATE TABLE aula (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    turma_id       INT NOT NULL,
    disciplina_id  INT NOT NULL,
    professor_id   INT NOT NULL,
    data           DATE NOT NULL,
    conteudo       VARCHAR(300) NOT NULL,              -- conteúdo ministrado (resumo)
    descricao      TEXT NULL,                          -- como foi a aula
    atividades     TEXT NULL,                          -- atividades realizadas
    observacoes    TEXT NULL,                          -- observações sobre a turma
    status         ENUM('RASCUNHO','FINALIZADA') NOT NULL DEFAULT 'RASCUNHO',
    finalizado_em  DATETIME NULL,
    criado_em      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT uq_aula UNIQUE (turma_id, disciplina_id, data),
    CONSTRAINT fk_aula_vinculo FOREIGN KEY (turma_id, disciplina_id, professor_id)
        REFERENCES turma_disciplina_professor(turma_id, disciplina_id, professor_id)
);
CREATE INDEX idx_aula_professor_data ON aula (professor_id, data);

-- Presença de cada aluno na aula
CREATE TABLE aula_presenca (
    aula_id     INT NOT NULL,
    aluno_id    INT NOT NULL,
    presente    BOOLEAN NOT NULL,
    observacao  VARCHAR(200) NULL,
    PRIMARY KEY (aula_id, aluno_id),
    CONSTRAINT fk_presenca_aula  FOREIGN KEY (aula_id)  REFERENCES aula(id) ON DELETE CASCADE,
    CONSTRAINT fk_presenca_aluno FOREIGN KEY (aluno_id) REFERENCES aluno(id)
);
CREATE INDEX idx_presenca_aluno ON aula_presenca (aluno_id, presente);

-- ---------- Atividades escolares ----------
CREATE TABLE atividade (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    turma_id       INT NOT NULL,
    disciplina_id  INT NOT NULL,
    professor_id   INT NOT NULL,
    titulo         VARCHAR(150) NOT NULL,
    descricao      TEXT NOT NULL,
    link_material  VARCHAR(500) NULL,                  -- anexos: link para o material (upload ainda não suportado)
    prazo          DATETIME NOT NULL,
    status         ENUM('RASCUNHO','PUBLICADA','ENCERRADA','CANCELADA') NOT NULL DEFAULT 'RASCUNHO',
    publicada_em   DATETIME NULL,
    criado_em      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_atividade_vinculo FOREIGN KEY (turma_id, disciplina_id, professor_id)
        REFERENCES turma_disciplina_professor(turma_id, disciplina_id, professor_id)
);
CREATE INDEX idx_atividade_turma_prazo ON atividade (turma_id, status, prazo);

-- Entrega de cada aluno (sem linha = ainda não registrada pelo professor)
CREATE TABLE atividade_entrega (
    atividade_id   INT NOT NULL,
    aluno_id       INT NOT NULL,
    situacao       ENUM('ENTREGUE','ENTREGUE_ATRASO','NAO_ENTREGUE') NOT NULL,
    registrado_em  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (atividade_id, aluno_id),
    CONSTRAINT fk_entrega_atividade FOREIGN KEY (atividade_id) REFERENCES atividade(id) ON DELETE CASCADE,
    CONSTRAINT fk_entrega_aluno     FOREIGN KEY (aluno_id)     REFERENCES aluno(id)
);

-- ---------- Calendário escolar ----------
-- turma_id NULL = evento da escola toda
CREATE TABLE evento (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    titulo         VARCHAR(120) NOT NULL,
    descricao      VARCHAR(1000) NULL,
    tipo           ENUM('EVENTO','PROVA','ATIVIDADE','REUNIAO','FERIADO','PRAZO') NOT NULL,
    data_inicio    DATE NOT NULL,
    data_fim       DATE NULL,
    hora_inicio    TIME NULL,
    hora_fim       TIME NULL,
    turma_id       INT NULL,
    disciplina_id  INT NULL,
    publico        ENUM('TODOS','EQUIPE') NOT NULL DEFAULT 'TODOS',   -- EQUIPE: famílias não veem
    criado_por     INT NOT NULL,
    criado_em      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT ck_evento_periodo CHECK (data_fim IS NULL OR data_fim >= data_inicio),
    CONSTRAINT fk_evento_turma      FOREIGN KEY (turma_id)      REFERENCES turma(id),
    CONSTRAINT fk_evento_disciplina FOREIGN KEY (disciplina_id) REFERENCES disciplina(id),
    CONSTRAINT fk_evento_usuario    FOREIGN KEY (criado_por)    REFERENCES usuario(id)
);
CREATE INDEX idx_evento_periodo ON evento (data_inicio, data_fim);

-- ---------- SAC: chamados de suporte ----------
CREATE TABLE chamado (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id     INT NOT NULL,
    categoria      ENUM('ACESSO','BOLETIM','COMUNICACAO','CADASTRO','DOCUMENTOS','SUGESTAO','OUTRO') NOT NULL,
    assunto        VARCHAR(120) NOT NULL,
    descricao      VARCHAR(3000) NOT NULL,
    status         ENUM('ABERTO','EM_ATENDIMENTO','AGUARDANDO_USUARIO','RESOLVIDO','FECHADO') NOT NULL DEFAULT 'ABERTO',
    criado_em      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_chamado_usuario FOREIGN KEY (usuario_id) REFERENCES usuario(id)
);
CREATE INDEX idx_chamado_status ON chamado (status, atualizado_em);

CREATE TABLE chamado_interacao (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    chamado_id  INT NOT NULL,
    usuario_id  INT NOT NULL,
    texto       VARCHAR(3000) NOT NULL,
    criado_em   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ci_chamado FOREIGN KEY (chamado_id) REFERENCES chamado(id) ON DELETE CASCADE,
    CONSTRAINT fk_ci_usuario FOREIGN KEY (usuario_id) REFERENCES usuario(id)
);

-- ---------- Justificativa de faltas ----------
-- O motivo pode envolver saúde: o professor vê só a situação (aprovada, em análise...).
CREATE TABLE justificativa_falta (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    aluno_id        INT NOT NULL,
    responsavel_id  INT NOT NULL,
    data_inicio     DATE NOT NULL,
    data_fim        DATE NOT NULL,
    motivo          ENUM('SAUDE','CONSULTA','FAMILIAR','TRANSPORTE','LUTO','OUTRO') NOT NULL,
    descricao       VARCHAR(1000) NOT NULL,
    status          ENUM('PENDENTE','EM_ANALISE','APROVADA','RECUSADA','NECESSITA_INFO') NOT NULL DEFAULT 'PENDENTE',
    parecer         VARCHAR(500) NULL,                 -- resposta da escola
    analisado_por   INT NULL,
    analisado_em    DATETIME NULL,
    criado_em       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT ck_justificativa_periodo CHECK (data_fim >= data_inicio),
    CONSTRAINT fk_jf_aluno       FOREIGN KEY (aluno_id)       REFERENCES aluno(id),
    CONSTRAINT fk_jf_responsavel FOREIGN KEY (responsavel_id) REFERENCES responsavel(id),
    CONSTRAINT fk_jf_analisado   FOREIGN KEY (analisado_por)  REFERENCES usuario(id)
);
CREATE INDEX idx_jf_status ON justificativa_falta (status, criado_em);
CREATE INDEX idx_jf_aluno ON justificativa_falta (aluno_id, data_inicio);

-- ---------- Solicitação de documentos escolares ----------
CREATE TABLE documento_solicitacao (
    id                INT AUTO_INCREMENT PRIMARY KEY,
    aluno_id          INT NOT NULL,
    solicitante_id    INT NOT NULL,                    -- usuário (responsável) que pediu
    tipo              ENUM('DECLARACAO_MATRICULA','DECLARACAO_FREQUENCIA','HISTORICO_ESCOLAR','BOLETIM','OUTRO') NOT NULL,
    finalidade        VARCHAR(300) NULL,
    status            ENUM('SOLICITADO','EM_ANALISE','DISPONIVEL','RECUSADO') NOT NULL DEFAULT 'SOLICITADO',
    justificativa     VARCHAR(500) NULL,               -- motivo da recusa ou observação da secretaria
    codigo_validacao  CHAR(12) NULL,                   -- gerado quando o documento fica disponível
    atendido_por      INT NULL,
    atendido_em       DATETIME NULL,
    criado_em         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT uq_doc_codigo UNIQUE (codigo_validacao),
    CONSTRAINT fk_doc_aluno       FOREIGN KEY (aluno_id)       REFERENCES aluno(id),
    CONSTRAINT fk_doc_solicitante FOREIGN KEY (solicitante_id) REFERENCES usuario(id),
    CONSTRAINT fk_doc_atendido    FOREIGN KEY (atendido_por)   REFERENCES usuario(id)
);
CREATE INDEX idx_doc_status ON documento_solicitacao (status, criado_em);

-- ---------- Ocorrências escolares ----------
-- restrita = TRUE: só a coordenação e quem registrou podem ver (ex.: saúde).
-- Responsáveis não acessam ocorrências pela plataforma.
CREATE TABLE ocorrencia (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    aluno_id        INT NOT NULL,
    turma_id        INT NULL,
    data_hora       DATETIME NOT NULL,
    categoria       ENUM('COMPORTAMENTO','DISCIPLINA','CONVIVENCIA','SAUDE','ADMINISTRATIVA','OUTRA') NOT NULL,
    descricao       TEXT NOT NULL,
    providencias    TEXT NULL,
    status          ENUM('ABERTA','EM_ACOMPANHAMENTO','RESOLVIDA','ARQUIVADA') NOT NULL DEFAULT 'ABERTA',
    restrita        BOOLEAN NOT NULL DEFAULT FALSE,
    registrado_por  INT NOT NULL,
    criado_em       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_oc_aluno     FOREIGN KEY (aluno_id)       REFERENCES aluno(id),
    CONSTRAINT fk_oc_turma     FOREIGN KEY (turma_id)       REFERENCES turma(id),
    CONSTRAINT fk_oc_registro  FOREIGN KEY (registrado_por) REFERENCES usuario(id)
);
CREATE INDEX idx_oc_status ON ocorrencia (status, data_hora);
CREATE INDEX idx_oc_aluno ON ocorrencia (aluno_id, data_hora);

-- Histórico de atualizações da ocorrência
CREATE TABLE ocorrencia_atualizacao (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    ocorrencia_id    INT NOT NULL,
    usuario_id       INT NOT NULL,
    texto            VARCHAR(2000) NOT NULL,
    status_anterior  ENUM('ABERTA','EM_ACOMPANHAMENTO','RESOLVIDA','ARQUIVADA') NULL,
    status_novo      ENUM('ABERTA','EM_ACOMPANHAMENTO','RESOLVIDA','ARQUIVADA') NOT NULL,
    data_hora        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_oa_ocorrencia FOREIGN KEY (ocorrencia_id) REFERENCES ocorrencia(id) ON DELETE CASCADE,
    CONSTRAINT fk_oa_usuario    FOREIGN KEY (usuario_id)    REFERENCES usuario(id)
);

-- ---------- Boletim visualizado pelo responsável ----------
CREATE TABLE boletim_visualizacao (
    responsavel_id  INT NOT NULL,
    aluno_id        INT NOT NULL,
    bimestre_id     INT NOT NULL,
    visualizado_em  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (responsavel_id, aluno_id, bimestre_id),
    CONSTRAINT fk_bv_responsavel FOREIGN KEY (responsavel_id) REFERENCES responsavel(id),
    CONSTRAINT fk_bv_aluno       FOREIGN KEY (aluno_id)       REFERENCES aluno(id),
    CONSTRAINT fk_bv_bimestre    FOREIGN KEY (bimestre_id)    REFERENCES bimestre(id)
);

-- =====================================================================
-- 3. CONFIGURAÇÃO: datas de início e fim dos bimestres de 2026
--    (a coordenação pode alterar em Turmas e disciplinas > Bimestres)
-- =====================================================================
UPDATE bimestre SET data_inicio = '2026-02-02', data_fim = '2026-04-17' WHERE ano_letivo = 2026 AND numero = 1;
UPDATE bimestre SET data_inicio = '2026-04-27', data_fim = '2026-07-03' WHERE ano_letivo = 2026 AND numero = 2;
UPDATE bimestre SET data_inicio = '2026-07-27', data_fim = '2026-09-30' WHERE ano_letivo = 2026 AND numero = 3;
UPDATE bimestre SET data_inicio = '2026-10-05', data_fim = '2026-12-11' WHERE ano_letivo = 2026 AND numero = 4;

-- >>> CARGA DE DEMONSTRAÇÃO
-- =====================================================================
-- 4. CARGA DE DEMONSTRAÇÃO (continua a do kfka_banco.sql)
--    Ao atualizar um banco que já existia, o servidor tenta aplicar esta
--    parte; se os ids de demonstração já estiverem ocupados, ela é ignorada.
-- =====================================================================

-- Dados complementares (fictícios)
UPDATE professor SET documento = '111.222.333-01' WHERE id = 1;
UPDATE professor SET documento = '111.222.333-02' WHERE id = 2;
UPDATE aluno SET endereco = 'Rua das Flores, 120 – Centro', telefone = '(11) 91111-0001' WHERE id IN (1, 2);
UPDATE aluno SET endereco = 'Av. Brasil, 455 – Jardim América', telefone = '(11) 91111-0003' WHERE id = 3;

-- Aluno com cadastro incompleto (sem turma e sem responsável) — aparece nas pendências da coordenação
INSERT INTO aluno (id, nome, matricula, data_nascimento) VALUES (7, 'Rafael Souza', '2026007', '2015-08-03');

-- Histórico dos vínculos já existentes
INSERT INTO historico_vinculo (turma_id, disciplina_id, professor_id, acao, usuario_id, data_hora)
SELECT turma_id, disciplina_id, professor_id, 'VINCULADO', 1, '2026-01-20 09:00:00'
  FROM turma_disciplina_professor;

-- Grade semanal (1 = segunda ... 5 = sexta)
INSERT INTO grade_aula (turma_id, disciplina_id, dia_semana) VALUES
 (1, 1, 1), (1, 1, 3),          -- 6º A Língua Portuguesa (Carlos): seg e qua
 (1, 3, 2), (1, 3, 4),          -- 6º A Matemática (Fernanda): ter e qui
 (1, 4, 5),                     -- 6º A Ciências (Ricardo): sex
 (1, 5, 4),                     -- 6º A História (Carlos): qui
 (2, 1, 2), (2, 1, 5),          -- 4º B Língua Portuguesa (Carlos): ter e sex
 (2, 3, 1), (2, 3, 3),          -- 4º B Matemática (Fernanda): seg e qua
 (2, 2, 3);                     -- 4º B Inglês (Ricardo): qua

-- Segunda-feira da semana passada (base das datas das aulas)
SET @seg = CURDATE() - INTERVAL WEEKDAY(CURDATE()) DAY - INTERVAL 7 DAY;

-- Aulas da semana passada: Língua Portuguesa no 6º A (seg finalizada, qua em rascunho)
-- e Matemática no 6º A (ter finalizada). As demais ficam "sem registro" nas pendências.
INSERT INTO aula (id, turma_id, disciplina_id, professor_id, data, conteudo, descricao, atividades, observacoes, status, finalizado_em) VALUES
 (1, 1, 1, 1, @seg, 'Gêneros textuais: a crônica',
  'Leitura compartilhada de duas crônicas e discussão sobre as características do gênero.',
  'Leitura em voz alta; quadro comparativo em duplas.', 'Turma participativa; Gabriel chegou atrasado.', 'FINALIZADA', @seg + INTERVAL 18 HOUR),
 (2, 1, 1, 1, @seg + INTERVAL 2 DAY, 'Produção de texto: crônica',
  'Início da produção individual.', NULL, NULL, 'RASCUNHO', NULL),
 (3, 1, 3, 2, @seg + INTERVAL 1 DAY, 'Frações equivalentes',
  'Explicação com material concreto e exercícios do livro, p. 54.',
  'Exercícios 1 a 8.', 'Revisar simplificação na próxima aula.', 'FINALIZADA', @seg + INTERVAL 1 DAY + INTERVAL 17 HOUR);

INSERT INTO aula_presenca (aula_id, aluno_id, presente) VALUES
 (1, 1, TRUE), (1, 3, FALSE), (1, 4, TRUE),
 (2, 1, FALSE), (2, 3, TRUE),                -- rascunho: Sofia ainda sem marcação (frequência incompleta)
 (3, 1, FALSE), (3, 3, TRUE), (3, 4, TRUE);

-- Atividades
INSERT INTO atividade (id, turma_id, disciplina_id, professor_id, titulo, descricao, link_material, prazo, status, publicada_em) VALUES
 (1, 1, 1, 1, 'Crônica: um dia na minha cidade',
  'Escreva uma crônica de 15 a 20 linhas sobre um acontecimento do seu bairro. Capriche no título!',
  NULL, CURDATE() + INTERVAL 2 DAY + INTERVAL 1439 MINUTE, 'PUBLICADA', NOW() - INTERVAL 3 DAY),
 (2, 1, 3, 2, 'Lista de frações',
  'Resolva os exercícios 1 a 12 da página 58 do livro.',
  NULL, CURDATE() - INTERVAL 1 DAY + INTERVAL 1439 MINUTE, 'PUBLICADA', NOW() - INTERVAL 6 DAY),
 (3, 2, 2, 3, 'Vocabulary cards',
  'Make 10 cards with words about food (word + drawing).',
  'https://exemplo.kfka.edu.br/material/vocabulary', CURDATE() + INTERVAL 7 DAY + INTERVAL 1080 MINUTE, 'PUBLICADA', NOW() - INTERVAL 1 DAY),
 (4, 2, 1, 1, 'Leitura: O Pequeno Príncipe (cap. 1 a 3)',
  'Ler os capítulos e anotar as palavras desconhecidas.',
  NULL, CURDATE() + INTERVAL 10 DAY + INTERVAL 1439 MINUTE, 'RASCUNHO', NULL);

INSERT INTO atividade_entrega (atividade_id, aluno_id, situacao) VALUES
 (2, 1, 'ENTREGUE'), (2, 4, 'ENTREGUE');      -- Gabriel ainda não entregou: atrasada

-- Calendário
INSERT INTO evento (titulo, descricao, tipo, data_inicio, data_fim, hora_inicio, hora_fim, turma_id, disciplina_id, publico, criado_por) VALUES
 ('Reunião de pais e mestres', 'Apresentação dos resultados do 3º bimestre. Auditório.', 'REUNIAO',
  CURDATE() + INTERVAL 6 DAY, NULL, '19:00:00', '20:30:00', NULL, NULL, 'TODOS', 1),
 ('Prova de Matemática', 'Conteúdo: frações e números decimais.', 'PROVA',
  CURDATE() + INTERVAL 3 DAY, NULL, '08:00:00', '09:40:00', 1, 3, 'TODOS', 1),
 ('Prova de Língua Portuguesa', 'Interpretação de texto e gêneros textuais.', 'PROVA',
  CURDATE() + INTERVAL 9 DAY, NULL, '13:30:00', '15:00:00', 2, 1, 'TODOS', 1),
 ('Feira de Ciências', 'Exposição dos projetos das turmas. Aberta às famílias.', 'EVENTO',
  CURDATE() + INTERVAL 13 DAY, CURDATE() + INTERVAL 14 DAY, NULL, NULL, NULL, NULL, 'TODOS', 1),
 ('Proclamação da República', 'Feriado nacional — não há aula.', 'FERIADO', '2026-11-15', NULL, NULL, NULL, NULL, NULL, 'TODOS', 1),
 ('Dia da Consciência Negra', 'Feriado nacional — não há aula.', 'FERIADO', '2026-11-20', NULL, NULL, NULL, NULL, NULL, 'TODOS', 1),
 ('Conselho de classe', 'Fechamento do 4º bimestre.', 'REUNIAO', '2026-12-14', NULL, '14:00:00', '17:00:00', NULL, NULL, 'EQUIPE', 1);

-- Mensagens ligadas a um aluno
INSERT INTO mensagem (remetente_id, destinatario_id, texto, lida, criado_em, aluno_id) VALUES
 (8, 1, 'Boa tarde! A Sofia vai precisar sair mais cedo na sexta-feira.', FALSE, NOW() - INTERVAL 5 HOUR, 4),
 (3, 7, 'Olá, Luciana! Podemos conversar na quinta às 17h sobre o Gabriel?', TRUE, NOW() - INTERVAL 20 HOUR, 3);

-- SAC
INSERT INTO chamado (id, usuario_id, categoria, assunto, descricao, status, criado_em) VALUES
 (1, 7, 'BOLETIM', 'Não encontro o boletim da Laura',
  'O boletim da Laura não aparece no 1º bimestre. Está certo?', 'AGUARDANDO_USUARIO', NOW() - INTERVAL 2 DAY),
 (2, 5, 'SUGESTAO', 'Aviso por e-mail',
  'Seria ótimo receber um e-mail quando o boletim for publicado.', 'ABERTO', NOW() - INTERVAL 1 DAY);
INSERT INTO chamado_interacao (chamado_id, usuario_id, texto, criado_em) VALUES
 (1, 1, 'Olá, Luciana! O lançamento de Matemática da Laura ainda está em revisão. Assim que for publicado, ele aparece no boletim. Isso resolve sua dúvida?', NOW() - INTERVAL 1 DAY);

-- Justificativas de faltas
INSERT INTO justificativa_falta (id, aluno_id, responsavel_id, data_inicio, data_fim, motivo, descricao, status, parecer, analisado_por, analisado_em, criado_em) VALUES
 (1, 1, 1, @seg + INTERVAL 1 DAY, @seg + INTERVAL 2 DAY, 'CONSULTA',
  'Lucas teve consulta médica de rotina nos dois dias.', 'PENDENTE', NULL, NULL, NULL, NOW() - INTERVAL 1 DAY),
 (2, 5, 4, '2026-10-20', '2026-10-20', 'TRANSPORTE',
  'O transporte escolar não passou neste dia.', 'NECESSITA_INFO',
  'Informe, por favor, se avisou a escola no dia e qual era a empresa de transporte.', 1, NOW() - INTERVAL 3 DAY, NOW() - INTERVAL 5 DAY);

-- Documentos
INSERT INTO documento_solicitacao (id, aluno_id, solicitante_id, tipo, finalidade, status, justificativa, codigo_validacao, atendido_por, atendido_em, criado_em) VALUES
 (1, 1, 5, 'DECLARACAO_MATRICULA', 'Apresentar no clube esportivo', 'DISPONIVEL', NULL, 'KF26A1B2C3D4', 1, NOW() - INTERVAL 2 DAY, NOW() - INTERVAL 4 DAY),
 (2, 2, 5, 'HISTORICO_ESCOLAR', NULL, 'SOLICITADO', NULL, NULL, NULL, NULL, NOW() - INTERVAL 6 HOUR),
 (3, 4, 8, 'DECLARACAO_FREQUENCIA', 'Bolsa de estudos', 'RECUSADO',
  'Para a bolsa, a declaração precisa do período exato. Abra um novo pedido informando as datas.', NULL, 1, NOW() - INTERVAL 1 DAY, NOW() - INTERVAL 3 DAY);

-- Ocorrências
INSERT INTO ocorrencia (id, aluno_id, turma_id, data_hora, categoria, descricao, providencias, status, restrita, registrado_por) VALUES
 (1, 3, 1, @seg + INTERVAL 9 HOUR, 'COMPORTAMENTO',
  'Conversas paralelas recorrentes durante a explicação, atrapalhando os colegas.',
  'Conversa individual com o aluno ao final da aula.', 'EM_ACOMPANHAMENTO', FALSE, 2),
 (2, 5, 2, NOW() - INTERVAL 2 DAY, 'SAUDE',
  'Aluno relatou dor de cabeça e foi encaminhado à secretaria.',
  'Família avisada por telefone; o responsável buscou o aluno às 10h.', 'RESOLVIDA', TRUE, 1);
INSERT INTO ocorrencia_atualizacao (ocorrencia_id, usuario_id, texto, status_anterior, status_novo, data_hora) VALUES
 (1, 2, 'Ocorrência registrada.', NULL, 'ABERTA', @seg + INTERVAL 9 HOUR),
 (1, 1, 'Coordenação conversou com o aluno; acompanhar nas próximas semanas.', 'ABERTA', 'EM_ACOMPANHAMENTO', @seg + INTERVAL 1 DAY + INTERVAL 10 HOUR),
 (2, 1, 'Ocorrência registrada.', NULL, 'ABERTA', NOW() - INTERVAL 2 DAY),
 (2, 1, 'Responsável buscou o aluno; situação encerrada.', 'ABERTA', 'RESOLVIDA', NOW() - INTERVAL 2 DAY + INTERVAL 2 HOUR);

-- Boletins já vistos (Ana viu o 1º bimestre do Lucas, ainda não o da Beatriz)
INSERT INTO boletim_visualizacao (responsavel_id, aluno_id, bimestre_id) VALUES (1, 1, 1);

SET @seg = NULL;

-- =====================================================================
-- FIM da expansão. Testes rápidos:
--   SELECT * FROM aula a JOIN aula_presenca p ON p.aula_id = a.id;
--   SELECT * FROM evento ORDER BY data_inicio;
--   SELECT * FROM justificativa_falta;
-- =====================================================================
