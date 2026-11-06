# KFKA — Plataforma de Acompanhamento Escolar

Plataforma web que centraliza o acompanhamento bimestral dos alunos (média, faltas, parecer descritivo e tags por disciplina), com **revisão pela coordenação antes da publicação** para as famílias e **auditoria automática** de cada alteração.

> Projeto Interdisciplinar — 2º ADS — Entrega 2 (back-end + integração com o front-end).

## Funcionalidades

| Perfil | O que faz |
| --- | --- |
| **Professor(a)** | Lança média, faltas, parecer e tags (turma → disciplina → bimestre) e envia para revisão; **registra cada aula** (conteúdo, descrição, atividades, observações) com **presença/faltas**, em rascunho ou finalizada; cadastra **atividades** com prazo e registra as entregas; registra e acompanha **ocorrências** das suas turmas |
| **Coordenação (admin)** | Publica, devolve ou retifica lançamentos; **cadastra alunos** (com responsáveis e turma, ativar/desativar), **professores** (vínculos com disciplinas/turmas, grade semanal, histórico de vínculos, link de redefinição de senha) e **contas de responsáveis**; mantém **turmas, disciplinas e bimestres**; gerencia o **calendário**; analisa **justificativas de faltas**; emite **documentos**; trata **ocorrências** e o **SAC** |
| **Responsável** | Cria a própria conta (aceite LGPD); **boletim** por filho e bimestre, quadro anual, situação acadêmica e tags (só o que foi publicado), ciência com retorno, PDF; vê **atividades** (pendente/concluída/atrasada); **justifica faltas**; **solicita documentos** |
| Todos | **Painel** e **Pendências** do perfil; **Calendário** escolar (mensal/semanal, filtros); **Mural de conversas** que respeita os vínculos e pode citar o aluno; **Meu perfil** (foto, contato, senha, tema claro/escuro); **Ajuda e suporte (SAC)** com perguntas frequentes, chamados, termos e privacidade |

**Fluxo editorial** (garantido pelos triggers do banco):

```
RASCUNHO → ENVIADO → EM_REVISAO → PUBLICADO
              ↘           ↘
               DEVOLVIDO → ENVIADO ...        PUBLICADO → EM_REVISAO (retificação)
```

O professor só grava **dentro do período de digitação** do bimestre (tabela `bimestre`), e toda alteração vai para `historico_acompanhamento` com autor, data, antes/depois e observação. Antes de publicar, a coordenação pode **alterar** o registro (nova versão, com motivo) ou **cancelá-lo** (estado final, `CANCELADO`). Publicar exige registro completo.

**Adequação aos requisitos (RF01–RF12 / RNF01–RNF07):**
- relatórios gerenciais com exportação CSV/XLSX;
- PDF do boletim gerado no servidor;
- áreas, tags e ano letivo com 4 bimestres;
- sessões revogáveis;
- trilha de auditoria imutável;
- aceite LGPD no primeiro acesso e "Baixar meus dados";
- paginação e marcação de campos obrigatórios.

Os detalhes estão em **[ADEQUACAO.md](ADEQUACAO.md)**, que traz também a matriz de conformidade e os testes.

## Tecnologias

- **Front-end:** React 19 + React Router (Vite), CSS3 responsivo (tema escuro e claro), fetch assíncrono
- **Back-end:** Node.js + Express
- **Banco de dados:** MySQL 8 (`mysql2`), com três scripts:
  - `backend/database/kfka_banco.sql`: script da equipe (tabelas, índices, triggers, views e carga);
  - `backend/database/kfka_expansao.sql`: módulos novos;
  - `backend/database/kfka_adequacao.sql`: sessões, auditoria e índices dos relatórios.

  Há também o opcional `backend/database/kfka_usuario_app.sql`, que cria um usuário MySQL com o menor privilégio.
- **Segurança:**
  - senhas com `bcryptjs`;
  - autenticação **JWT** revogável, conferida no banco a cada requisição;
  - permissões por perfil, sempre no servidor;
  - `helmet` (CSP);
  - limite de tentativas de login;
  - validação com **Zod**;
  - consultas parametrizadas (contra SQL Injection);
  - escape de HTML no front pelo React (contra XSS).

  CSRF não se aplica: o token vai no cabeçalho `Authorization` e não há cookie de sessão.
- **Arquivos gerados sem dependências novas:** PDF (`backend/src/utils/pdf.js`) e CSV/XLSX (`backend/src/utils/planilha.js`).

## Estrutura

```
kfka/
├── package.json                 # atalhos: npm install instala os dois lados; npm run dev, dev:web, db:setup...
├── backend/                     # BACK-END (Express + MySQL) — package.json próprio
│   ├── package.json
│   ├── .env                     # (crie a partir do .env.example; não vai para o GitHub)
│   ├── .env.example
│   ├── docker-compose.yml       # MySQL 8 local (opcional)
│   ├── src/
│   │   ├── index.js / app.js    # inicia o servidor; entrega a API e o build do React (frontend/dist)
│   │   ├── config/env.js        # variáveis de ambiente
│   │   ├── db/                  # pool MySQL, transação com @usuario_id, setup e diagnóstico do banco
│   │   ├── middlewares/         # auth (JWT/perfis), validar (Zod), erros padronizados
│   │   ├── routes/              # auth, usuarios, escola/, alunos, acompanhamentos/, boletim, mensagens, dashboard,
│   │   │                        # perfil, pendencias, eventos, aulas, atividades, chamados, justificativas,
│   │   │                        # documentos, ocorrencias, relatorios, auditoria
│   │   ├── pendencias/          # cálculo das pendências por perfil
│   │   ├── schemas/             # regras de validação
│   │   └── utils/               # AppError, asyncHandler, acesso, datas, auditoria, paginacao, pdf, planilha
│   ├── database/                # kfka_banco.sql, kfka_expansao.sql, kfka_adequacao.sql, kfka_usuario_app.sql
│   └── tests/                   # testes de integração da API
├── frontend/                    # FRONT-END (React + Vite) — package.json próprio
│   ├── package.json
│   ├── vite.config.mjs          # /api -> http://localhost:3000 no desenvolvimento
│   ├── index.html
│   ├── public/
│   └── src/
│       ├── main.jsx / App.jsx   # ponto de entrada e mapa de rotas
│       ├── api/cliente.js       # fetch para a API, sessão, erros padronizados
│       ├── contexto/            # AuthContext, ToastContext, ConfirmarContext
│       ├── componentes/         # LayoutApp, RotaProtegida, Dialogo, Janela, Estado, Formulario...
│       ├── hooks/               # useApi, useFormulario, useListaPaginada
│       ├── paginas/             # telas (estrutura/ e notas/ são subpastas)
│       ├── util/                # formato, status, tema
│       └── estilos/             # CSS
├── .github/workflows/testes.yml # CI: testes num MySQL 8 a cada push
├── DIVISAO-DOS-COMMITS.md       # quem envia o quê (4 integrantes)
└── ROTEIRO-DE-TESTE.md
```

### Rotas do front-end

| Rota | Quem acessa | Tela |
| --- | --- | --- |
| `/` | todos | Página inicial |
| `/login`, `/cadastro`, `/privacidade`, `/termos` | todos | Entrar, criar conta de responsável, privacidade (LGPD), termos de uso |
| `/redefinir-senha?token=` | todos | Nova senha pelo link gerado pela coordenação (24 h, uso único) |
| `/painel`, `/pendencias`, `/calendario` | logado | Painel, pendências e calendário (conteúdo muda por perfil) |
| `/comunicacao` (`/mural`), `/ajuda`, `/perfil` | logado | Mural de conversas, SAC, meu perfil |
| `/notas`, `/aulas` | professor | Lançamento de notas; relatório por aula e frequência |
| `/boletim` | responsável | Boletim escolar (`/notas` redireciona para cá) |
| `/atividades` | professor, responsável | Atividades (gestão ou acompanhamento) |
| `/justificativas`, `/documentos`, `/documentos/:id` | coordenação, responsável | Justificativas de faltas; documentos (pedido, emissão, visualização/PDF) |
| `/ocorrencias` | coordenação, professor | Ocorrências (acesso restrito) |
| `/revisao`, `/alunos`, `/professores`, `/turmas` | coordenação | Revisão de boletins (alterar, cancelar); cadastros; turmas, disciplinas, grade, bimestres/ano letivo, áreas e tags |
| `/relatorios` | coordenação, professor | Indicadores, registros e retornos das famílias; exportação CSV/XLSX (só coordenação) |
| `/auditoria` | coordenação | Trilha de auditoria (somente leitura) |
| `/aceite` | responsável | Termo de uso dos dados no primeiro acesso de conta criada pela escola |
| qualquer outra | todos | Página 404 do React |

Sem login, as telas internas mandam para `/login` (e voltam para a tela pedida depois de entrar). Perfil sem permissão volta para `/painel` — e a API recusa do mesmo jeito (403/404), mesmo que alguém chame a rota direto.

### Regras de acesso (LGPD — dados de crianças e adolescentes)

Centralizadas em `backend/src/utils/acesso.js`:

- **Responsável** vê só alunos vinculados a ele com `autorizado = TRUE`, e do boletim só o que foi **publicado**. Conversa com a coordenação e com os professores dos filhos.
- **Professor** vê só as turmas/disciplinas em que leciona. Conversa com a equipe e com as famílias das suas turmas. Em justificativas vê só a situação (o motivo pode ser de saúde). Em ocorrências vê as que registrou e as **não restritas** das suas turmas.
- **Ocorrências de saúde ou bem-estar** são sempre restritas. Responsáveis não acessam ocorrências.
- Documento (CPF), e-mail, telefone e endereço do aluno só aparecem para a coordenação; o perfil do professor mostra o próprio documento mascarado.
- Senhas com bcrypt; link de redefinição guardado como hash SHA-256, vale 24 h e é de uso único.

## Como rodar localmente

Pré-requisitos: **Node.js 20+** e **MySQL 8** (Docker, MySQL instalado com Workbench, ou Railway).

```bash
# 1. Dependências (na pasta kfka: instala backend/ e frontend/ de uma vez)
npm install

# 2. Variáveis de ambiente
cp backend/.env.example backend/.env
#   -> ajuste DB_USER / DB_PASSWORD (os mesmos do Workbench) e JWT_SECRET

# 3. MySQL (escolha um)
cd backend && docker compose up -d && cd ..   # MySQL 8 local; use DB_PASSWORD=kfka no .env
#   ou use o MySQL instalado no computador (Workbench)

# 4. Banco: roda o backend/database/kfka_banco.sql e grava as senhas de demonstração
npm run db:setup              # ATENÇÃO: apaga e recria o banco "kfka"

# 5. Desenvolvimento: dois terminais
npm run dev        # terminal 1 — API em http://localhost:3000
npm run dev:web    # terminal 2 — React em http://localhost:5173 (abra este no navegador)
```

> Também dá para trabalhar dentro de cada pasta, como no starter da Aula 12: `cd backend && npm run dev` e `cd frontend && npm run dev`.

Para testar como em produção (um servidor só):

```bash
npm run build      # gera frontend/dist
npm start          # front + API em http://localhost:3000
```

> **Preferem rodar o script pelo Workbench?** Pode: execute o `kfka_banco.sql` (raio ⚡) e depois rode só `npm run db:senhas`, que troca o marcador de senha pelo hash bcrypt real.

> **Abra pelo Vite (`http://localhost:5173`) no desenvolvimento ou pelo servidor (`http://localhost:3000`) depois do build.** Pelo Live Server ou abrindo o arquivo direto, o site não encontra a API.

### Usuários de demonstração (carga do kfka_banco.sql)

Senha de todos: valor de `SEED_SENHA` no `.env` (padrão: `Senha@123`).

| E-mail | Perfil | Observação |
| --- | --- | --- |
| admin@kfka.edu.br | Coordenação | Marina |
| carlos.menezes@kfka.edu.br | Professor | Língua Portuguesa e História |
| fernanda.lopes@kfka.edu.br | Professora | Matemática |
| ricardo.tanaka@kfka.edu.br | Professor | Ciências e Inglês |
| ana.ribeiro@email.com | Responsável | Mãe de Lucas e Beatriz |
| luciana.andrade@email.com | Responsável | Mãe de Gabriel, tia de Laura |
| marcos.oliveira@email.com | Responsável | Pai de Sofia, tio de Pedro |

> ⚠️ **Período de digitação:** pela carga do script, só o 4º bimestre está aberto (01/11 a 15/12/2026). Fora dessas datas o banco recusa lançamentos — ajuste `digitacao_inicio`/`digitacao_fim` na tabela `bimestre` antes da apresentação, se necessário.

### Testes

Os testes rodam o `db:setup` e por isso **apagam e recriam o banco kfka**. São 49 testes de integração em quatro arquivos, executados um arquivo por vez:
- `api.test.js`: fluxo de notas;
- `expansao.test.js`: módulos da expansão;
- `adequacao.test.js`: sessões, IDOR, XSS/SQL, cabeçalhos de segurança, transações, revisão, PDF, relatórios, exportação, bimestres, LGPD, auditoria (inclusive na mesma transação) e paginação;
- `limite.test.js`: limite de tentativas de login.

```bash
NODE_ENV=test npm test
```

### Atualizar um banco que já existe

Se o banco foi criado com uma versão anterior, **o servidor aplica sozinho ao iniciar** o que estiver faltando, sem apagar nada:
- sem a tabela `evento`: aplica o `kfka_expansao.sql`;
- sem a tabela `auditoria`: aplica o `kfka_adequacao.sql`. A estrutura nova é obrigatória; a carga de demonstração da expansão é ignorada se os ids de exemplo já estiverem ocupados. Pelo Workbench, basta executar os scripts que faltam, nesta ordem.

## API

Base: `/api`. Sucesso: `{ "dados": ... }`. Erros sempre no formato:

```json
{ "erro": { "codigo": "DADOS_INVALIDOS", "mensagem": "Verifique os dados enviados.", "detalhes": [{ "campo": "media", "mensagem": "A média máxima é 10." }] } }
```

| Status | Código | Quando |
| --- | --- | --- |
| 400 | `REQUISICAO_INVALIDA` | JSON malformado, valor inválido |
| 401 | `NAO_AUTENTICADO` | sem token, token inválido/expirado, login incorreto |
| 403 | `SEM_PERMISSAO` / `CONTA_DESATIVADA` | perfil sem acesso; professor fora da sua turma/disciplina; usuário inativo |
| 404 | `NAO_ENCONTRADO` / `ROTA_NAO_ENCONTRADA` | registro ou rota inexistente da API (páginas inexistentes do site mostram a 404 do React) |
| 409 | `CONFLITO` | e-mail/matrícula repetidos, registro já enviado/publicado, ciência já confirmada |
| 409 | `REGRA_DO_BANCO` | regra de trigger: fora do período de digitação, transição de status não permitida |
| 422 | `DADOS_INVALIDOS` | falha de validação (com `detalhes` por campo) |
| 403 | `ACEITE_PENDENTE` | responsável cadastrado pela escola ainda não aceitou o termo (LGPD) |
| 422 | `RELATORIO_INCOMPLETO` | publicação de registro sem descrição ou média |
| 429 | `MUITAS_TENTATIVAS` | excesso de tentativas de login/cadastro |
| 503 | `BANCO_INDISPONIVEL` / `SENHA_DEMO_NAO_CONFIGURADA` | MySQL fora do ar; faltou `npm run db:senhas` |
| 500 | `ERRO_INTERNO` | erro inesperado (detalhes só no log do servidor) |

Rotas protegidas exigem `Authorization: Bearer <token>`.

| Método | Rota | Acesso | Descrição |
| --- | --- | --- | --- |
| GET | `/api/saude` | público | status da API e do banco |
| POST | `/api/auth/cadastro` | público | cria responsável (`aceite_lgpd: true` obrigatório) |
| POST | `/api/auth/login` | público | login → token JWT |
| GET | `/api/auth/me` | logado | usuário logado |
| GET / POST | `/api/usuarios` | admin | lista / cria (professor exige `registro`) |
| GET | `/api/usuarios/contatos` | logado | com quem posso conversar |
| GET / POST | `/api/turmas` | logado / admin | turmas do ano (professor: só as dele) / cria |
| GET | `/api/disciplinas?turma_id=` | logado | disciplinas da turma (professor: só as dele) |
| GET | `/api/bimestres` | logado | bimestres e se a digitação está aberta |
| GET | `/api/tags` | logado | tags de desempenho |
| GET | `/api/alunos` | logado | lista por perfil (`?turma_id=` `?busca=`) |
| GET | `/api/alunos/:id` | logado | detalhe (+ responsáveis para a equipe) |
| POST / PUT / DELETE | `/api/alunos[/:id]` | admin | cria e matricula / edita / desativa |
| POST / DELETE | `/api/alunos/:id/responsaveis[/:rid]` | admin | vincula (por e-mail) / desvincula |
| GET | `/api/acompanhamentos?turma_id&disciplina_id&bimestre_id` | professor, admin | planilha da turma |
| PUT | `/api/acompanhamentos` | professor | salva rascunho ou envia (`enviar: true`) |
| POST | `/api/acompanhamentos/:id/enviar` | professor | rascunho/devolvido → enviado |
| GET | `/api/acompanhamentos/fila?status=` | admin, professor | `pendentes`, `devolvidos`, `publicados`, `rascunhos` |
| PATCH | `/api/acompanhamentos/:id/publicar` | admin | publica (passa por EM_REVISAO) |
| PATCH | `/api/acompanhamentos/:id/devolver` | admin | devolve com `{ motivo }` |
| PATCH | `/api/acompanhamentos/:id/retificar` | admin | publicado → em revisão, com `{ motivo }` |
| GET | `/api/acompanhamentos/:id/historico` | admin, professor | auditoria (triggers) |
| POST | `/api/acompanhamentos/:id/ciencia` | responsável | confirma ciência `{ observacao? }` |
| GET | `/api/boletim` | responsável | filhos + publicados por bimestre/disciplina (view) |
| GET | `/api/mensagens/conversas` | logado | conversas com última mensagem e não lidas |
| GET | `/api/mensagens/:usuarioId` | logado | histórico da conversa (marca como lidas) |
| POST | `/api/mensagens` | logado | envia `{ destinatario_id, texto }` |
| GET | `/api/dashboard/resumo` | logado | números, indicadores e tags (views) por perfil |

#### Rotas da expansão

| Método | Rota | Acesso | Descrição |
| --- | --- | --- | --- |
| GET / PUT | `/api/perfil` | logado | meus dados (por perfil) / edita telefone e foto (nome: só coordenação) |
| PUT | `/api/perfil/senha` | logado | troca a senha `{ senha_atual, nova_senha }` |
| GET / POST | `/api/auth/redefinir-senha[/:token]` | público | confere o link / grava a nova senha |
| GET / PUT | `/api/usuarios/:id` | admin | detalhe (vínculos, histórico, filhos) / edita |
| PATCH | `/api/usuarios/:id/ativo` | admin | ativa/desativa a conta |
| POST | `/api/usuarios/:id/link-senha` | admin | gera link de redefinição (24 h) |
| PATCH | `/api/alunos/:id/ativo` | admin | ativa/desativa o aluno (`?situacao=inativos` na lista) |
| PUT | `/api/turmas/:id` · POST/PUT `/api/disciplinas[/:id]` · GET `/api/areas` | admin | turmas e disciplinas |
| GET / PUT / DELETE | `/api/vinculos[/:turma/:disciplina]` | admin | professor de cada disciplina na turma + dias da grade (com histórico) |
| PUT | `/api/bimestres/:id` | admin | datas do bimestre e da digitação |
| GET | `/api/pendencias` · `/api/pendencias/resumo` | logado | pendências do perfil / contadores do menu |
| GET / POST / PUT / DELETE | `/api/eventos[/:id]` | logado / admin | calendário (eventos + bimestres + prazos de atividades) |
| GET | `/api/aulas` · `/api/aulas/sem-registro` · `/api/aulas/chamada` | professor (admin lê) | histórico, dias da grade sem registro, formulário da aula |
| PUT / DELETE | `/api/aulas[/:id]` | professor | salva rascunho ou finaliza com presenças / exclui rascunho |
| GET / POST / PUT / PATCH / DELETE | `/api/atividades[/:id][/status]` | professor, responsável | atividades; responsável vê a situação de cada filho |
| PUT | `/api/atividades/:id/entregas` | professor | registra entregas |
| GET / POST | `/api/chamados[/:id][/interacoes]` · PATCH `/status` | logado / admin | SAC |
| GET / POST / PUT | `/api/justificativas[/:id]` · GET `/faltas` · PATCH `/:id/analise` | responsável, admin (professor lê a situação) | justificativas de faltas |
| GET / POST / PATCH | `/api/documentos[/:id]` · GET `/tipos` · GET `/:id/conteudo` | responsável, admin | solicitação, emissão e conteúdo do documento |
| GET / POST | `/api/ocorrencias[/:id][/atualizacoes]` · PATCH `/:id/restricao` | admin, professor | ocorrências |
| GET / POST | `/api/boletim/anos` · `/api/boletim/visualizacao` | responsável | histórico de anos / boletim visto |

#### Rotas da adequação (ver ADEQUACAO.md)

| Método | Rota | Acesso | Descrição |
| --- | --- | --- | --- |
| POST | `/api/auth/sair` · `/api/auth/sair-de-todos` | logado | encerra o token deste aparelho / todas as sessões |
| POST · GET | `/api/perfil/aceite` · `/api/perfil/meus-dados` | responsável · logado | aceite LGPD / cópia dos dados pessoais (JSON) |
| PATCH | `/api/acompanhamentos/:id/revisar` · `/editar` · `/cancelar` | admin | em revisão / alteração antes de publicar (versão + motivo) / cancelamento |
| GET | `/api/boletim/pdf?aluno_id&ano_letivo&bimestre` | responsável do aluno, admin | PDF só com relatórios publicados |
| POST · PUT · DELETE | `/api/areas[/:id]` · `/api/tags[/:id]` (GET `?todas=1`) | admin | áreas e tags (exclusão só sem uso) |
| GET · POST | `/api/anos-letivos` | admin | anos configurados / cria ano com exatamente 4 bimestres |
| GET | `/api/relatorios/opcoes` · `/indicadores` · `/registros` · `/retornos` | admin, professor (só os próprios) | relatórios gerenciais e retornos (paginados) |
| GET | `/api/relatorios/exportar?formato=csv\|xlsx&conteudo=registros\|indicadores\|retornos` | admin | exportação com os mesmos filtros (auditada) |
| GET | `/api/auditoria` · `/opcoes` · `/registro/:entidade/:id` | admin | trilha de auditoria (somente leitura, paginada) |

### Como o back-end conversa com os triggers

Os triggers precisam saber **quem** está alterando. Toda gravação em `acompanhamento` passa por `db.transacao(usuarioId, ...)`, que, na mesma conexão:

1. abre a transação e roda `SET @usuario_id = ?` (e `@observacao` quando há motivo);
2. executa os comandos — os triggers validam as regras e gravam o histórico;
3. faz commit (ou rollback em caso de erro) e **limpa** as variáveis antes de devolver a conexão ao pool.

## Deploy (front + back juntos)

O MySQL precisa aceitar **triggers**. O mais simples é o **Railway** (acesso root):

1. **Railway → New → Database → MySQL.** Em *Connect*, copie host, porta, usuário e senha.
2. Monte `DATABASE_URL=mysql://root:SENHA@HOST:PORTA/kfka` (o script cria o banco `kfka`) — ou preencha `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` e `DB_NAME=kfka`.
3. Rode o banco a partir do seu computador, apontando para o Railway: `npm run db:setup`.
4. **Web Service** (Railway ou Render) a partir do repositório GitHub:
   - Build: `npm install --include=dev && npm run build` — Start: `npm start` — Health check: `/api/saude`
   - (`--include=dev` garante que o Vite seja instalado mesmo com `NODE_ENV=production`)
   - Variáveis: `NODE_ENV=production`, `DATABASE_URL` (ou `DB_*`), `JWT_SECRET` (32+ caracteres), `SEED_SENHA`, `DB_TIMEZONE=-03:00`
5. Em produção, o `db:setup` só roda com `--forcar` (ele apaga o banco).

> Se o provedor recusar criar trigger com o erro *"You do not have the SUPER privilege and binary logging is enabled"*, ative `log_bin_trust_function_creators = 1` no painel do MySQL.

## Trabalho em equipe (histórico de commits)

O critério pede commits de **todos os integrantes**. Sugestão de divisão:

- Banco (`backend/database/kfka_banco.sql`, `backend/src/db/`)
- Autenticação e middlewares (`backend/src/middlewares/`, `routes/auth.routes.js`, `routes/usuarios.routes.js`)
- Lançamento e revisão (`routes/acompanhamentos.routes.js`)
- Boletim, painel e comunicação (`routes/boletim.routes.js`, `routes/dashboard.routes.js`, `routes/mensagens.routes.js`)
- Front React: estrutura, rotas e componentes (`frontend/src/App.jsx`, `componentes/`, `contexto/`)
- Telas React (`frontend/src/paginas/`)
- Testes e deploy (`backend/tests/`, README)
- Expansão: banco (`backend/database/kfka_expansao.sql`), rotas novas (`backend/src/routes/*`), telas novas (`frontend/src/paginas/*`) — dá para dividir por módulo (calendário, aulas, atividades, SAC, documentos, ocorrências, cadastros)
