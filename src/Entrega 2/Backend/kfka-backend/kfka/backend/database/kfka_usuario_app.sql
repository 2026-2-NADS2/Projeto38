-- =====================================================================
-- KFKA — usuário do MySQL com o MENOR PRIVILÉGIO para a aplicação (RNF02)
-- Opcional, recomendado em produção. Rode como root DEPOIS de criar o banco
-- (npm run db:setup ou os três scripts pelo Workbench).
--
-- A API só precisa ler e gravar dados. Ela NÃO precisa criar/apagar tabelas,
-- triggers ou usuários. Com este usuário, uma falha na aplicação não consegue
-- derrubar o banco nem alterar a estrutura.
--
-- 1) Troque a senha abaixo por uma senha forte (NÃO use esta).
-- 2) No .env da aplicação: DB_USER=kfka_app e DB_PASSWORD=<a senha escolhida>.
-- 3) Para recriar o banco (npm run db:setup) continue usando o root.
--
-- Atenção: com este usuário a API não consegue aplicar sozinha scripts novos
-- (kfka_expansao.sql / kfka_adequacao.sql). Rode-os como root.
-- =====================================================================

CREATE USER IF NOT EXISTS 'kfka_app'@'%' IDENTIFIED BY 'TROQUE_ESTA_SENHA';

-- Leitura e gravação de dados em todas as tabelas e views do banco kfka
GRANT SELECT, INSERT, UPDATE, DELETE ON kfka.* TO 'kfka_app'@'%';

-- A trilha de auditoria é somente-inclusão: além dos triggers trg_auditoria_bu/bd
-- (que recusam UPDATE e DELETE para qualquer usuário), o ideal é nem conceder
-- esses privilégios na tabela. O MySQL não permite REVOKE de uma tabela quando o
-- GRANT foi no banco inteiro; por isso a proteção efetiva fica nos triggers.

FLUSH PRIVILEGES;

-- Conferência:
-- SHOW GRANTS FOR 'kfka_app'@'%';
