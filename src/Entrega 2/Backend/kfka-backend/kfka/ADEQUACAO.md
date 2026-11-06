# KFKA — Auditoria e adequação aos requisitos (RF01–RF12 / RNF01–RNF07)

Este documento é o relatório técnico da auditoria e das correções. Mostra o que foi encontrado, o que mudou, como foi testado e o que ainda depende de infraestrutura ou de decisão da escola.

**Ambiente de validação.** Todos os testes foram executados de verdade, em dois bancos:

1. **Driver `mysql2` real (3.11) + Dolt 2.7.** O Dolt é um servidor compatível com MySQL (protocolo e SQL do MySQL; responde como versão 8.0.31). Os três scripts rodaram inteiros pelo `npm run db:setup` (152 comandos, com `DELIMITER`, triggers, `SIGNAL`, views, `CHECK` e JSON), e a suíte completa passou: **49/49**.
2. **Réplica fiel em PostgreSQL**, com as mesmas tabelas, restrições, triggers, views e carga, ligada por um adaptador. A suíte também passou: **49/49**.

Os demais componentes:

- **Cabeçalhos HTTP:** `helmet` **real** (8.1, compilado do código-fonte).
- **Front-end:** empacotado com esbuild, no lugar do Vite, e testado num **Chromium real** (Playwright).

**O que ainda não foi feito:** rodar no **MySQL 8 da Oracle** (o servidor oficial). O Dolt é compatível, mas não é o mesmo servidor. Essa execução está preparada no CI (`.github/workflows/testes.yml`) e no roteiro manual (`ROTEIRO-DE-TESTE.md`, seção 9).

Uma incompatibilidade encontrada pelo Dolt já foi corrigida: a função `TIMESTAMP(data, hora)` com dois argumentos, usada na carga de demonstração do `kfka_expansao.sql`, foi trocada por `data + INTERVAL n MINUTE`. O resultado é o mesmo no MySQL.

---

## 1. Resumo executivo do estado inicial

A plataforma já tinha uma base sólida:

- autenticação JWT com perfis;
- fluxo editorial garantido por triggers;
- histórico de cada lançamento;
- views para o responsável;
- validação Zod no servidor e consultas parametrizadas.

As lacunas estavam em quatro frentes:

- **Funcionais:**
  - não havia relatórios gerenciais (RF10) nem exportação (RF11);
  - o "PDF" dependia da impressão do navegador (RF09);
  - a coordenação não conseguia alterar nem cancelar um registro antes de publicar (RF06);
  - não havia cadastro de áreas e tags (RF02);
  - os bimestres não tinham situação nem criação por ano letivo (RF04);
  - o retorno das famílias não chegava ao professor (RF12).
- **Segurança (P0):**
  - o token continuava válido depois de "Sair", de trocar a senha ou de a conta ser desativada (até 8 h);
  - o tempo de resposta do login revelava quais e-mails existiam.
- **Auditoria:** só o acompanhamento tinha histórico. Cadastros, vínculos, períodos, exportações e acessos negados não eram registrados.
- **LGPD e qualidade:**
  - contas de responsável criadas pela escola entravam sem aceite;
  - não havia como baixar os próprios dados;
  - faltavam paginação, marcação de campos obrigatórios, CI e script de usuário com menor privilégio.

## 2. Matriz de conformidade — RF01 a RF12 (depois das correções)

| ID | Requisito | Status | Evidência no código | Problema identificado (antes) | Correção feita |
| --- | --- | --- | --- | --- | --- |
| RF01 | Autenticação e perfis | ATENDIDO | `middlewares/auth.js` (`autenticar` confere conta, versão da sessão, `jti` encerrado e perfil no banco; `autorizar`); `routes/auth.routes.js` (`/login`, `/sair`, `/sair-de-todos`, `/redefinir-senha`); `RotaProtegida.jsx`; testes T-01, T-02, T-05 | "Sair" só apagava o token no navegador; o token seguia válido | Tabela `sessao_encerrada` e coluna `usuario.sessao_versao`; logout no servidor; troca/redefinição de senha e desativação encerram as sessões |
| RF02 | Cadastros escolares | ATENDIDO | `escola.routes.js` (áreas e tags com POST/PUT/DELETE, turmas, disciplinas), `usuarios.routes.js`, `alunos.routes.js`; `paginas/estrutura/AreasTags.jsx`; T-16 | Áreas e tags sem cadastro nem edição | CRUD com exclusão protegida: área com disciplinas e tag usada não são excluídas; tag é desativada |
| RF03 | Vínculos da turma | ATENDIDO | `PUT /api/vinculos` (turma ativa do ano letivo, disciplina ativa, professor ativo; PK impede dois professores na mesma disciplina/turma); `historico_vinculo`; T-16 | Aceitava disciplina desativada e turma de outro ano | Verificação de compatibilidade e auditoria `CRIAR_VINCULO`, `ALTERAR_VINCULO` e `REMOVER_VINCULO` |
| RF04 | Períodos bimestrais | ATENDIDO | `POST /api/anos-letivos` (exatamente 4, em ordem, sem sobreposição, no ano); `PUT /api/bimestres/:id` (não invade os vizinhos); `situacao` e `digitacao` calculadas; `CHECK numero 1..4` + `UNIQUE (ano, numero)`; triggers do período; T-15 | Sem situação futuro/ativo/encerrado; sem criação do ano; edição sem checar vizinhos | Rotas, validações e tela "Novo ano letivo" (`NovoAnoLetivo.jsx`) |
| RF05 | Acompanhamento | ATENDIDO | `PUT /api/acompanhamentos`; FKs compostas; `uq_acomp`; `gravarTags` dentro da transação; T-07 | Tag desativada era aceita | Tag inexistente ou desativada desfaz o lançamento inteiro |
| RF06 | Fluxo editorial | ATENDIDO | `PATCH /:id/revisar`, `/editar` (versão, motivo, bloqueio de concorrência por `versao`), `/cancelar`, `/publicar` (exige registro completo), `/devolver`, `/retificar`; trigger `trg_acomp_bu`; `Revisao.jsx` e `EdicaoRegistro.jsx`; T-08, T-09, T-10 | A coordenação não alterava nem cancelava; não havia "iniciar revisão" | Rotas e telas novas; `CANCELADO` é estado final |
| RF07 | Histórico e auditoria | ATENDIDO | `historico_acompanhamento` (triggers) com autor, revisor, datas, versão, antes/depois e motivo; `auditoria` geral; T-08, T-18 | Atendido para o acompanhamento | Alteração da coordenação gera evento `EDICAO` com o motivo e entrada na auditoria |
| RF08 | Consulta do responsável | ATENDIDO | `vw_relatorio_responsavel` (só PUBLICADO e vínculo autorizado); `alunosDoResponsavel`; 404 para outro id; T-04, testes do `api.test.js` | — | Mantido; testes de IDOR ampliados |
| RF09 | PDF | ATENDIDO | `GET /api/boletim/pdf` + `utils/pdf.js` (gerador próprio, Helvetica/WinAnsi, várias páginas); botão "Baixar PDF" no Boletim; T-11; arquivo lido com `pypdf` | O PDF dependia da impressão do navegador | PDF gerado no servidor só com o publicado, auditado (`GERAR_PDF_BOLETIM`) |
| RF10 | Relatórios gerenciais | ATENDIDO | `routes/relatorios.routes.js` (indicadores por status, turma, disciplina, professor, bimestre, aluno e tag; registros e retornos paginados; professor limitado aos próprios); `Relatorios.jsx`; T-12 | Não existia | Rotas e tela novas |
| RF11 | Exportação | ATENDIDO | `GET /api/relatorios/exportar` (só coordenação, mesmos filtros, auditado) + `utils/planilha.js` (CSV UTF-8 com `;` e proteção contra fórmulas; XLSX OOXML); T-14; arquivos abertos com `openpyxl` | Não existia | Rota, geradores e botões |
| RF12 | Comunicação e retorno | ATENDIDO | `POST /:id/ciencia`; `historico.ciencias` (autor, parentesco, data); `/relatorios/retornos` (professor: só os dele); `HistoricoDialogo.jsx`; T-13 | A observação era gravada mas não chegava ao professor nem à coordenação | Exibição no histórico e no relatório de retornos |

## 3. Matriz de conformidade — RNF01 a RNF07 (depois das correções)

| ID | Requisito | Status | Evidência | Problema identificado (antes) | Correção feita / observação |
| --- | --- | --- | --- | --- | --- |
| RNF01 | Usabilidade e acessibilidade | ATENDIDO | Menus por perfil (`LayoutApp.MENU`); `Campo` com `*` + "(obrigatório)" e `aria-required`, `aria-invalid` e `aria-describedby`; foco visível; "Pular para o conteúdo"; abas com setas; badges com texto e ícone (não só cor); contraste ≥ 4,5:1 calculado; fluxos em 1366, 768 e 390 px sem rolagem lateral; navegação só por teclado testada; **verificação automática da árvore de acessibilidade do Chromium em 35 telas × 3 larguras** (nomes acessíveis, imagens, títulos, landmarks, lang, tabelas, ids, foco): nenhum problema | Campos obrigatórios não identificados; teclado e tablet sem teste; título pulando de h1 para h3 na página inicial; sem `<h1>` para leitor de tela no login/cadastro do celular | Corrigido. A verificação usa a mesma árvore que os leitores de tela recebem; o **teste manual com NVDA/VoiceOver** fica recomendado |
| RNF02 | Segurança | ATENDIDO | bcrypt; Zod em todas as rotas; SQL parametrizado (T-06); XSS: React escapa, `nosniff`, CSP do `helmet` **verificado em execução** (T-21: `default-src 'self'`, `script-src 'self'` sem `unsafe`, `object-src 'none'`, `frame-ancestors`, HSTS, `X-Frame-Options`, sem `X-Powered-By`) e site funcionando com a política ativa (0 violações nos fluxos); CSRF não se aplica (token no cabeçalho, sem cookie); sessão revogável (T-01, T-02); limite de tentativas (T-20); login com tempo uniforme (T-03); autorização no servidor (T-04, T-05); erros sem detalhes internos em produção; `kfka_usuario_app.sql` (menor privilégio) | Token não revogável; e-mails descobríveis pelo tempo de resposta | Corrigido |
| RNF03 | Privacidade e LGPD | ATENDIDO | Aceite obrigatório no 1º acesso (`ACEITE_PENDENTE` no servidor, tela `/aceite`, `responsavel.aceite_lgpd_em`); `GET /api/perfil/meus-dados`; categoria "Dados pessoais / LGPD" no SAC; dados do aluno só para quem tem vínculo; Política atualizada (consentimento, segurança, retenção); T-17 | Conta criada pela escola entrava sem aceite; não havia acesso aos próprios dados | Corrigido. **Conformidade legal não é declarada aqui**: prazo de retenção e encarregado (DPO) são decisões da escola |
| RNF04 | Integridade dos dados | ATENDIDO | PK/FK/UNIQUE/CHECK do script; FKs compostas; transações (`db.transacao`) com rollback (T-07); publicação exige registro completo (T-09); cancelado é imutável (trigger, T-10); duplicidade impedida (T-07); exclusões protegidas (T-16); desativação no lugar de exclusão | Publicava registro sem descrição (dado legado); tag desativada era aceita | Corrigido |
| RNF05 | Desempenho | ATENDIDO | Paginação no banco em alunos, relatórios, retornos, auditoria (T-19), chamados, ocorrências, justificativas, documentos e fila de revisão (T-22), e mural com 50 mensagens por vez e "carregar anteriores" (T-23); `utils/paginacao.js` e `useListaPaginada`; índices novos justificados e **confirmados nos planos de execução**; cache de 20 s do contador do menu; **teste de carga** com 2.000 alunos, 40 mil registros e 100 mil linhas de auditoria: todas as telas abaixo de 0,25 s e a exportação do ano inteiro em 0,7 s | Listas inteiras; o contador recalculava tudo a cada 30 s em cada aba | Corrigido. Os planos foram analisados no PostgreSQL; no MySQL o otimizador pode escolher outros caminhos (conferir com `EXPLAIN` depois da migração) |
| RNF06 | Auditabilidade | ATENDIDO | Tabela `auditoria` + triggers `trg_auditoria_bu/bd` (recusam UPDATE e DELETE: T-18); ações administrativas, troca/redefinição de senha e ciência gravam a auditoria **na mesma transação** (`comAuditoria`, `auditarNaTransacao`); exportação, PDF e "meus dados" só são entregues **depois** que o acesso foi registrado (`auditarAntes`); T-24 prova que, sem o registro, a operação não acontece; middleware `registrarAuditoria` cobre o resto (negações, login, logout); detalhes com antes → depois de campos não sensíveis; filtro remove senha, hash, token e foto; tela `/auditoria` | Só o acompanhamento era auditado | Corrigido. Login com falha, logout e edição do próprio perfil continuam registrados logo após a resposta: não há operação de banco para envolver na transação |
| RNF07 | Manutenibilidade | PARCIALMENTE ATENDIDO | Camadas (rotas → schemas → utils/db; páginas → componentes → hooks → api); erros centralizados; componentes reutilizados (`Campo`, `Janela`, `Paginacao`, `useListaPaginada`, `useCadastro`, `EdicaoRegistro`); arquivos grandes divididos por assunto: `escola.routes.js` (642 → 38 linhas + 6 módulos em `routes/escola/`), `acompanhamentos.routes.js` (616 → 34 + 4 em `routes/acompanhamentos/`), `pendencias.routes.js` (~560 → 58 + 4 em `backend/src/pendencias/`) e `Estrutura.jsx` (~620 → 40 + 7 em `paginas/estrutura/`), com o maior arquivo agora em 510 linhas; ESLint sem avisos no código; README, ADEQUACAO.md e ROTEIRO; CI | Sem CI; documentação da adequação inexistente; arquivos de 560–640 linhas | Código corrigido. **Falta só o item Git:** o histórico de commits é da equipe e não pode ser verificado aqui (o projeto chegou sem a pasta `.git`) |

## 4. Problemas identificados (por prioridade)

- **P0**
  - Token válido após sair, trocar a senha ou ser desativado.
  - Enumeração de e-mails pelo tempo de resposta do login.
  - Auditoria inexistente fora do acompanhamento.
- **P1**
  - RF10 e RF11 inexistentes.
  - RF09 sem PDF real.
  - RF06 sem alteração e cancelamento pela coordenação.
  - RF02 sem áreas e tags.
  - RF04 sem situação e sem criação do ano letivo.
  - RF12 retorno invisível ao professor.
  - Vínculo incompatível aceito.
- **P2**
  - Publicação de registro incompleto.
  - Tag desativada aceita.
  - Falta de paginação e cache.
  - Aceite LGPD ausente em contas criadas pela escola e falta de "meus dados".
  - Campos obrigatórios não marcados.
- **P3**
  - Sem CI e sem usuário MySQL de menor privilégio.
  - Documentação da adequação ausente.
- **Defeito encontrado nos testes de navegador:** `BotaoAcao` ficava preso em "Salvando..." no modo de desenvolvimento (StrictMode) quando a ação falhava. Corrigido.
- **Encontrados na segunda rodada:**
  - a auditoria geral era gravada fora da transação;
  - listas de chamados, ocorrências, justificativas, documentos, fila e mural sem paginação;
  - título fora de ordem na página inicial e login/cadastro sem `<h1>` para leitor de tela no celular;
  - `TIMESTAMP(data, hora)` na carga de demonstração não é aceito por servidores compatíveis com MySQL.

  Todos corrigidos.

## 5. Correções implementadas

1. **Sessões (RNF02/RF01).**
   - `autenticar` consulta o banco a cada requisição (uma consulta por chave primária).
   - Token com `jti` e `sv` (versão da sessão).
   - `POST /auth/sair` (este aparelho) e `/auth/sair-de-todos`.
   - Troca de senha devolve um token novo e derruba as outras sessões.
   - Redefinição de senha e desativação da conta encerram todas as sessões.
2. **Login.** Comparação bcrypt sempre, com um hash fictício quando o e-mail não existe. Tentativas com falha vão para a auditoria, sem guardar o e-mail digitado.
3. **Auditoria geral.**
   - Tabela imutável.
   - Middleware que registra automaticamente.
   - Detalhes explícitos (antes → depois) nas ações administrativas.
   - Consulta paginada e tela própria.
4. **RF06.**
   - `revisar`, `editar` (com `versao` e motivo) e `cancelar`.
   - `publicar` confere se o registro está completo.
   - Tela Revisão com os botões "Iniciar revisão", "Alterar", "Cancelar registro" e o filtro "Cancelados".
5. **RF02.**
   - CRUD de áreas e tags.
   - GET `/tags?todas=1` para a coordenação.
   - Tela "Áreas e tags".
6. **RF04.**
   - `situacao` e `digitacao` calculadas.
   - `POST /anos-letivos` com 4 bimestres.
   - PUT do bimestre sem sobrepor os vizinhos.
   - Tela com seletor de ano e "Novo ano letivo".
7. **RF09.**
   - Gerador de PDF sem dependência.
   - `GET /boletim/pdf` para o responsável do aluno ou a coordenação, só com o publicado.
   - Botão no Boletim, que some quando não há nada publicado.
8. **RF10, RF11 e RF12.**
   - Rotas de relatórios.
   - Geradores CSV/XLSX.
   - Tela Relatórios (indicadores, registros e retornos) com exportação.
   - Ciências exibidas no Histórico.
9. **RF03 e RNF04.**
   - Compatibilidade do vínculo.
   - Tags dentro da transação.
   - Bloqueio de publicação de registro incompleto.
10. **RNF03.**
    - Aceite LGPD obrigatório no servidor e tela `/aceite`.
    - "Baixar meus dados".
    - Categoria LGPD no SAC.
    - Política de Privacidade atualizada.
11. **RNF05.**
    - Paginação em alunos, relatórios e auditoria.
    - Índices novos.
    - Cache do contador do menu.
12. **RNF01.**
    - Marcação de obrigatórios no `Campo` e nos diálogos.
    - Componente `Paginacao`.
    - Foco visível em chips e abas.
    - Estilos responsivos das telas novas.
13. **RNF07.**
    - CI (GitHub Actions com MySQL 8).
    - `kfka_usuario_app.sql`.
    - README, ROTEIRO (seção 9) e este documento.
14. **Segunda rodada (o que tinha ficado pendente):**
    - auditoria na mesma transação da operação e antes de entregar dados sensíveis;
    - paginação de todas as listas extensas;
    - divisão dos quatro arquivos grandes;
    - validação com o driver `mysql2` real num servidor compatível com MySQL;
    - CSP verificado com o `helmet` real;
    - teste de carga e planos de execução;
    - verificação automática de acessibilidade em todas as telas.

## 6. Arquivos criados e alterados

**Criados**

- Banco:
  - `backend/database/kfka_adequacao.sql`
  - `backend/database/kfka_usuario_app.sql`
- Servidor (segunda rodada):
  - `backend/src/utils/paginacao.js`
  - `backend/src/routes/escola/` (`turmas`, `disciplinas`, `tags`, `vinculos`, `bimestres`, `comum`)
  - `backend/src/routes/acompanhamentos/` (`lancamento`, `revisao`, `historico`, `comum`)
  - `backend/src/pendencias/` (`coordenacao`, `professor`, `responsavel`, `comum`, `index`)
- Front-end (segunda rodada):
  - `frontend/src/hooks/useListaPaginada.js`
  - `frontend/src/paginas/estrutura/` (`Turmas`, `Disciplinas`, `Vinculos`, `Bimestres`, `Rodape`)
- Servidor:
  - `backend/src/routes/relatorios.routes.js`
  - `backend/src/routes/auditoria.routes.js`
  - `backend/src/schemas/adequacao.js`
  - `backend/src/utils/auditoria.js`
  - `backend/src/utils/pdf.js`
  - `backend/src/utils/planilha.js`
- Front-end:
  - `frontend/src/paginas/Relatorios.jsx`
  - `frontend/src/paginas/Auditoria.jsx`
  - `frontend/src/paginas/Aceite.jsx`
  - `frontend/src/paginas/estrutura/AreasTags.jsx`
  - `frontend/src/paginas/estrutura/NovoAnoLetivo.jsx`
  - `frontend/src/componentes/EdicaoRegistro.jsx`
  - `frontend/src/estilos/adequacao.css`
- Testes:
  - `backend/tests/adequacao.test.js`
  - `backend/tests/limite.test.js`
- Projeto:
  - `.github/workflows/testes.yml`
  - `ADEQUACAO.md`

**Alterados**

- Servidor:
  - `backend/src/app.js`
  - `backend/src/index.js`
  - `backend/src/db/setup.js`
  - `backend/src/middlewares/auth.js`
  - `backend/src/routes/acompanhamentos.routes.js`
  - `backend/src/routes/alunos.routes.js`
  - `backend/src/routes/auth.routes.js`
  - `backend/src/routes/boletim.routes.js`
  - `backend/src/routes/escola.routes.js`
  - `backend/src/routes/pendencias.routes.js`
  - `backend/src/routes/perfil.routes.js`
  - `backend/src/routes/usuarios.routes.js`
  - `backend/src/schemas/index.js`
  - `backend/src/schemas/expansao.js`
  - Segunda rodada: `chamados`, `documentos`, `justificativas`, `ocorrencias` e `mensagens` (`.routes.js`), `backend/src/middlewares/erros.js`
- Front-end:
  - `frontend/src/App.jsx`
  - `frontend/src/main.jsx`
  - `frontend/src/api/cliente.js`
  - `frontend/src/contexto/AuthContext.jsx`
  - `frontend/src/componentes/BotaoAcao.jsx`
  - `frontend/src/componentes/Formulario.jsx`
  - `frontend/src/componentes/HistoricoDialogo.jsx`
  - `frontend/src/componentes/Icone.jsx`
  - `frontend/src/componentes/Interface.jsx`
  - `frontend/src/componentes/LayoutApp.jsx`
  - `frontend/src/componentes/RotaProtegida.jsx`
  - `frontend/src/paginas/Alunos.jsx`
  - `frontend/src/paginas/Calendario.jsx`
  - `frontend/src/paginas/Estrutura.jsx`
  - `frontend/src/paginas/Perfil.jsx`
  - `frontend/src/paginas/Privacidade.jsx`
  - `frontend/src/paginas/Revisao.jsx`
  - `frontend/src/paginas/notas/Boletim.jsx`
  - `frontend/src/util/status.js`
  - Segunda rodada: `Ajuda.jsx`, `Comunicacao.jsx`, `Documentos.jsx`, `Justificativas.jsx`, `Ocorrencias.jsx`, `Inicio.jsx`, `estilos/components.css`
- Testes e documentação:
  - `backend/tests/expansao.test.js` (a troca de senha agora devolve um token novo)
  - `README.md`
  - `ROTEIRO-DE-TESTE.md`

`backend/database/kfka_banco.sql` (script da equipe) **não foi alterado**. Em `backend/database/kfka_expansao.sql`, só a carga de demonstração mudou: `TIMESTAMP(data, hora)` virou `data + INTERVAL n MINUTE`, com o mesmo resultado.

## 7. Alterações no banco de dados (`kfka_adequacao.sql`, 14 comandos, roda por último)

1. `usuario.sessao_versao INT NOT NULL DEFAULT 0`: revoga todos os tokens de uma conta.
2. `sessao_encerrada (jti PK, usuario_id FK, expira_em)` e o índice `idx_se_expira`. É o "Sair" de um aparelho; as linhas vencidas são limpas no login.
3. `auditoria (id, data_hora, usuario_id, usuario_nome, perfil, acao, entidade, entidade_id, resultado ENUM, detalhes JSON, ip)` e os índices por data, por entidade/id e por usuário.
   - Sem FK para `usuario`, de propósito: o registro precisa sobreviver a qualquer mudança no cadastro.
4. Triggers `trg_auditoria_bu` e `trg_auditoria_bd` (SIGNAL 45000): a auditoria é somente-inclusão.
5. Índices dos relatórios:
   - `idx_acomp_bim_status (bimestre_id, status)`: os filtros por bimestre não usavam o índice que começa por turma.
   - `idx_ciencia_data`: retornos ordenados por data.
   - `idx_aluno_ativo_nome`: lista paginada de alunos.
6. `chamado.categoria` ganha `'LGPD'`.

Total no banco: **33 tabelas, 6 views, 6 triggers**. O servidor aplica o script sozinho em banco antigo (sem a tabela `auditoria`), sem apagar dados.

## 8. Testes executados e resultados

### 8.1 API (node:test) — **49/49 aprovados nos dois bancos**

Executados com `NODE_ENV=test node --test --test-concurrency=1 backend/tests/*.test.js` em dois bancos: driver `mysql2` real + Dolt (compatível com MySQL) e réplica PostgreSQL.

| ID | Requisito | Pré-condição | Passos | Esperado | Encontrado | Status |
| --- | --- | --- | --- | --- | --- | --- |
| T-01 | RNF02/RF01 | Marcos logado | Coordenação desativa e depois reativa a conta | Token antigo → 401 na hora e continua 401 após reativar; login novo funciona | Igual | Aprovado |
| T-02 | RF01 | 2 sessões do José | `/sair` na sessão A; `/sair-de-todos` na B; token adulterado | A → 401 e B → 200; depois B → 401; adulterado → 401 | Igual | Aprovado |
| T-03 | RNF02 | — | Login com e-mail existente e inexistente (2× cada) | Mesma mensagem; tempos comparáveis | Inexistente > 50% do tempo do existente | Aprovado |
| T-04 | RF08 | Ana (Lucas e Beatriz) | Acessar o aluno 3, PDF do aluno 3, ciência do registro 2, histórico de outro professor, lançamento fora da disciplina | 404 / 404 / 404 / 404 / 403 | Igual | Aprovado |
| T-05 | RNF02 | Professor e responsável | 5 rotas administrativas + editar, criar tag e indicadores | 403 em todas | Igual | Aprovado |
| T-06 | RNF02 | — | Mensagem com `<script>`/`<img onerror>`; buscas `' OR '1'='1`, `DROP TABLE` | Texto guardado como dado; JSON + `nosniff`; buscas vazias; 7 alunos intactos | Igual | Aprovado |
| T-07 | RNF04/RF05 | Sofia sem registro no 4º bimestre | Lançar com tag inexistente, depois com tag desativada, depois válido duas vezes | 422 sem registro criado (rollback); 201; 200 no mesmo id; 1 linha | Igual | Aprovado |
| T-08 | RF06/RF07 | Registro 10 enviado | Editar com versão errada, sem motivo, depois correto | 409, 422, 200 (em revisão, versão +1); histórico com motivo; auditoria com faltas de → para | Igual | Aprovado |
| T-09 | RNF04 | Registro 10 com descrição em branco (forçado no banco) | Publicar, corrigir, publicar; depois editar e cancelar o publicado | 422 `RELATORIO_INCOMPLETO`; 200; 409/409 | Igual | Aprovado |
| T-10 | RF06 | Registro 13 devolvido | Cancelar ×2; professor edita; publicar; UPDATE direto no banco | 200; 409; 409; 409; trigger 45000; sai dos indicadores | Igual | Aprovado |
| T-11 | RF09 | Lucas com publicados e rascunho | Baixar o PDF (Ana e coordenação); 4º bimestre; professor; id inválido | PDF válido com publicado e sem rascunho; 404; 403; 422; auditado | Igual | Aprovado |
| T-12 | RF10 | — | Indicadores, registros filtrados por turma+tag; professor pedindo outro professor | Somas = total = COUNT no banco; média = AVG no banco; só os próprios; status inválido → 422 | Igual | Aprovado |
| T-13 | RF12 | Registro 5 publicado | Ana envia ciência com observação | O professor do registro vê, com autor, parentesco e data; o outro professor não vê; o histórico mostra | Igual | Aprovado |
| T-14 | RF11 | — | CSV de registros da turma 1; XLSX de indicadores e de retornos; professor; formato pdf | CSV com BOM e linhas = total filtrado; 7 abas; 403; 422; auditoria com filtros e linhas | Igual | Aprovado |
| T-15 | RF04 | — | Situação dos bimestres; criar 2027 com 3, sobrepostos, ano errado, válido, repetido; INSERT de 5º e duplicado; PUT invadindo o vizinho | encerrado/encerrada; 422 ×3; 201 (futuro/agendada); 409; banco recusa; 422 | Igual | Aprovado |
| T-16 | RF02/RF03 | — | Área (criar, duplicar, renomear, excluir com e sem disciplina); tag (criar, excluir, excluir usada); vínculo com disciplina inativa; vínculo repetido | 201/409/200/409/204; 201/204/409; 422; 200 sem duplicar | Igual | Aprovado |
| T-17 | RNF03 | — | Coordenação cria responsável; login; `/alunos`; aceite false e true; `meus-dados` | `aceite_pendente`; 403 `ACEITE_PENDENTE`; 422; 200 e libera; JSON sem senha, hash ou token | Igual | Aprovado |
| T-18 | RNF06 | Ações dos testes anteriores | Ler toda a auditoria; UPDATE e DELETE direto; DELETE pela API | 15 tipos de ação, falha de login, negação; nenhum segredo nem token; banco recusa; 404 | Igual | Aprovado |
| T-19 | RNF05 | 7 alunos | Páginas 1 e 3 com 3 por página; `por_pagina=500`; auditoria com 5 | 3 + 1, total 7, 3 páginas; 422; 5 itens | Igual | Aprovado |
| T-20 | RNF02 | Processo novo | 20 logins errados, depois a senha certa e um cadastro | 429 `MUITAS_TENTATIVAS` nos dois | Igual | Aprovado |
| T-21 | RNF02 | `helmet` real | Ler os cabeçalhos de `/api/saude`, de uma rota inexistente e de `/login` | CSP sem `unsafe` em script, `object-src 'none'`, `frame-ancestors`, `nosniff`, `SAMEORIGIN`, HSTS, `no-referrer`, sem `X-Powered-By` | Igual | Aprovado |
| T-22 | RNF05 | — | Chamados, ocorrências, justificativas, documentos e fila: página 1 e 2 com 1 item; `por_pagina=0`; `pagina=abc`; detalhe por id de outra família | Mesma ordem e total da lista completa; 422; 422; 404 | Igual | Aprovado |
| T-23 | RNF05 | — | 60 mensagens; abrir a conversa; "carregar anteriores" | 50 mais recentes em ordem e `tem_mais`; as anteriores sem repetir; lista de conversas com última mensagem e não lidas certas | Igual | Aprovado |
| T-24 | RNF06 | Trigger de teste que faz a gravação da auditoria falhar | Editar tag, iniciar revisão, exportar, baixar PDF; depois um cancelamento recusado | Nada é alterado nem entregue (o erro desfaz a operação); a operação recusada não gera registro de sucesso | Igual | Aprovado |

Os 25 testes anteriores (`api.test.js` e `expansao.test.js`) continuam aprovados nos dois bancos. Um deles foi ajustado: a troca de senha agora devolve 200 com token novo, e o teste confere que o token antigo morreu.

### 8.2 Navegador (Chromium, Playwright) — `harness/web/adequacao.mjs`

- **19 passos** aprovados em **1366, 768 e 390 px**, sem erro de console nem de servidor. Os passos incluem:
  - alterar e cancelar na Revisão;
  - relatórios com filtro;
  - CSV com o mesmo número de linhas da tela;
  - Excel;
  - retornos;
  - áreas e tags;
  - ano letivo 2027;
  - auditoria (antes → depois);
  - criação de responsável;
  - "Sair" → token 401;
  - PDF (Lucas, sem o rascunho);
  - 4º bimestre sem botão de PDF;
  - "Baixar meus dados";
  - aceite LGPD;
  - professor em `/auditoria` → painel;
  - navegação **só por teclado** (Tab → "Pular", Tab até o menu, abrindo a gaveta com Enter no celular e tablet, Enter; setas nas abas);
  - professor sem exportação;
  - verificação de rolagem horizontal.
- **Fluxos anteriores:** 21 passos (`fluxos.mjs`) continuam aprovados em 1366, 768 e 390 px.
- **Rodada final:** os fluxos rodaram com o CSP real ativo nas três larguras, 40 passos cada, sem violações de CSP nem erros de console.
- **Acessibilidade automática** (`acessibilidade.mjs`): árvore de acessibilidade do Chromium (CDP) em 35 telas dos 4 perfis (público, coordenação, professor, responsável), em 1366, 768 e 390 px. Cerca de 8 mil nós por largura foram conferidos: botões, links e campos com nome; imagens com texto alternativo; um `<h1>`; títulos em ordem; `<main>`; `lang`; tabelas com `<th>`; ids únicos; `aria-describedby` válidos; foco visível no 1º Tab. Os dois problemas encontrados foram corrigidos e a rodada final terminou **sem problemas**.
- **Visita a todas as telas** dos 3 perfis, incluindo `/relatorios` e `/auditoria`, nas combinações 1366 escuro, 1366 claro, 768 claro e 390 escuro (e de novo na rodada final: 1366 claro, 768 escuro e 390 claro): nenhum erro e **nenhuma rolagem horizontal**.
- **Contraste (WCAG)** calculado dos tokens dos dois temas: texto, secundário, "muted", perigo, aviso, sucesso e destaque sobre os três fundos. O menor valor foi 4,94:1, acima do mínimo AA de 4,5:1.
- **Arquivos gerados**, abertos com bibliotecas independentes:
  - XLSX de registros, indicadores (7 abas) e retornos com `openpyxl`, sem avisos;
  - PDF com `pypdf` (texto, acentos, sem o rascunho).
- **Teste de carga** (réplica com 2.007 alunos, 40.013 registros de acompanhamento, 40.019 tags e 100.000 linhas de auditoria; 7 chamadas cada):

  | Rota | Mediana | Máximo |
  | --- | --- | --- |
  | Indicadores do ano | 178 ms | 244 ms |
  | Indicadores de um bimestre | 59 ms | 64 ms |
  | Registros (página 1 / página 800) | 77 / 146 ms | 151 ms |
  | Retornos | 18 ms | 20 ms |
  | Alunos (página 1 / página 40 com busca) | 5 / 11 ms | 13 ms |
  | Auditoria (página 1 / página 3000 / por entidade) | 8 / 16 / 4 ms | 17 ms |
  | Fila de revisão | 35 ms | 43 ms |
  | Planilha do professor | 7 ms | 12 ms |
  | Contador do menu | 2 ms | 37 ms |
  | Painel | 99 ms | 118 ms |
  | Exportar CSV / XLSX do ano inteiro (40 mil linhas) | 462 / 713 ms | 799 ms |

  **Planos de execução (PostgreSQL):** `idx_acomp_bim_status` é usado no filtro por bimestre; `idx_aud_entidade` na auditoria por registro; `idx_aluno_ativo_nome` na lista paginada de alunos. Duas consultas fazem leitura sequencial, porque devolvem muitas linhas e o otimizador prefere esse caminho; cada uma leva cerca de 7 ms com 40 mil linhas:
  - filtro por turma;
  - fila de revisão, que devolve 12% da tabela.
- **Desempenho com os dados de demonstração** (primeira rodada; 10 chamadas cada, mediana):

  | Rota | Mediana |
  | --- | --- |
  | Indicadores | 13,7 ms |
  | Registros | 6 ms |
  | Retornos | 12 ms |
  | Alunos paginados | 3 ms |
  | Auditoria | 2 ms |
  | Contador do menu | 1,8 ms |
  | Exportar XLSX | 13 ms |
- **ESLint:** nenhum nome indefinido ou não usado no código novo. Os únicos avisos são da configuração, que não tem o plugin `react-hooks` (já existiam antes).

## 9. Dependências de infraestrutura e decisões externas

| Item | O que já está pronto | O que falta (fora do código) |
| --- | --- | --- |
| Execução no MySQL 8 real | Validado com o driver `mysql2` real num servidor compatível (Dolt, 49/49); CI com MySQL 8 e roteiro manual | Rodar `npm run db:setup` e `npm test` no MySQL da equipe (ou ativar o GitHub Actions) |
| Recuperação de senha por e-mail | Link de uso único (24 h) gerado pela coordenação | Serviço de e-mail (SMTP) e credenciais; não foi inventado |
| HTTPS e cookies | Token no cabeçalho, sem cookies | HTTPS na hospedagem (Railway/Render já fornecem) |
| Usuário com menor privilégio | `backend/database/kfka_usuario_app.sql` | Executar como root e trocar `DB_USER`/`DB_PASSWORD` |
| LGPD institucional | Aceite, acesso aos dados, canal de solicitação, política | Prazo de retenção, encarregado (DPO) e base legal formal: decisão da escola |
| Testes com leitor de tela | Árvore de acessibilidade verificada em 35 telas × 3 larguras, sem problemas | Teste manual com NVDA/VoiceOver (recomendado, não obrigatório) |
| Versionamento Git | Divisão sugerida no README | Commits feitos pela equipe (a autoria não foi forjada) |

## 10. Pendências que não puderam ser resolvidas aqui

Tudo o que podia ser feito no código foi feito. Restam itens que dependem da equipe ou de infraestrutura:

1. **Rodar no MySQL 8 da Oracle.** O projeto já passou 49/49 com o driver real num servidor compatível (Dolt), mas não no servidor oficial.
   - Basta `npm run db:setup` + `NODE_ENV=test npm test` no MySQL da equipe, ou ativar o GitHub Actions.
   - Depois, conferir os planos dos relatórios com `EXPLAIN`.
2. **Histórico de commits (RNF07).** Os commits são da equipe; a autoria não deve ser forjada.
3. **Teste manual com leitor de tela** (NVDA/VoiceOver), como complemento da verificação automática.
4. **Decisões e serviços externos:**
   - e-mail (SMTP) para recuperação de senha;
   - prazo de retenção e encarregado (DPO) da LGPD.

## 11. Percentual de atendimento ANTES das correções

Pontuação: Atendido = 1, Parcial = 0,5, Não atendido = 0. Nenhum requisito ficou como "não foi possível validar".

| Grupo | Atendidos | Parciais | Não atendidos | Pontos | % |
| --- | --- | --- | --- | --- | --- |
| RF (12) | RF05, RF07, RF08 | RF01, RF02, RF03, RF04, RF06, RF09, RF12 | RF10, RF11 | 3 + 3,5 = **6,5** | **54,2%** |
| RNF (7) | — | RNF01 a RNF07 | — | **3,5** | **50,0%** |
| Geral (19) | | | | **10,0** | **52,6%** |

> **Nota sobre a reclassificação.** No diagnóstico inicial enviado no começo do trabalho, RF01 e RF03 estavam como "atendidos" (estimativa de 62,5% RF). A análise detalhada mostrou que o logout não invalidava o token (RF01) e que vínculos com disciplina desativada eram aceitos (RF03). Por isso os dois foram reclassificados como **parciais**, e a tabela acima usa esses valores.

## 12. Percentual de atendimento DEPOIS das correções

| Grupo | Atendidos | Parciais | Não atendidos | Pontos | % |
| --- | --- | --- | --- | --- | --- |
| RF (12) | RF01 a RF12 | — | — | **12** | **100%** |
| RNF (7) | RNF01, RNF02, RNF03, RNF04, RNF05, RNF06 | RNF07 (só o item Git) | — | 6 + 0,5 = **6,5** | **92,9%** |
| Geral (19) | | | | **18,5** | **97,4%** |

Na primeira rodada, o resultado tinha sido RNF 85,7% e geral 94,7%. RNF05 passou a atendido depois de paginar todas as listas extensas e fazer o teste de carga.

A validação foi feita no driver `mysql2` real com servidor compatível (Dolt), na réplica PostgreSQL e no navegador. A confirmação no MySQL 8 da Oracle é a pendência 1.
