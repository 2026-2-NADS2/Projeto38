# Divisão dos commits — 4 integrantes

O projeto agora está separado em duas partes, cada uma com seu próprio `package.json` (como no starter da Aula 12):

```
kfka/
├── backend/    → API Express + MySQL   (Integrantes 1 e 2)
└── frontend/   → React + Vite          (Integrantes 3 e 4)
```

Cada lado foi dividido em duas metades de tamanho parecido. **Nenhum arquivo aparece em duas partes**, então ninguém tem conflito com ninguém.

| Integrante | Parte | Tamanho |
| --- | --- | --- |
| **1** | Backend A — base, banco, segurança, usuários, comunicação e relatórios | 40 arquivos · ~5.900 linhas |
| **2** | Backend B — escola, alunos, notas, boletim, módulos e testes | 32 arquivos · ~6.400 linhas |
| **3** | Frontend A — base do React, componentes, estilos e telas de todos os perfis | 52 arquivos · ~7.000 linhas |
| **4** | Frontend B — telas do professor e da coordenação | 24 arquivos · ~6.000 linhas |

> ⚠️ O sistema só roda depois que **os quatro** enviarem a sua parte.

---

## Antes de começar (todos)

1. Cada um configura o Git com **o próprio nome e o e-mail da própria conta do GitHub**. Sem isso, o commit não conta para você:

   ```bash
   git config --global user.name "Seu Nome"
   git config --global user.email "seu-email-do-github@exemplo.com"
   ```

2. **O Integrante 1** cria o repositório no GitHub e adiciona os outros três em *Settings → Collaborators*.

3. Todos clonam o repositório **vazio**:

   ```bash
   git clone https://github.com/USUARIO/kfka.git
   cd kfka
   ```

4. Extraiam o zip do projeto **em outra pasta**. Cada um copia para dentro do clone **só os arquivos da sua parte** (listas abaixo), mantendo as mesmas pastas.

5. Ordem sugerida: 1 → 2 → 3 → 4. Antes de cada `git push`, rodem `git pull --rebase` para pegar o que os colegas já enviaram.

> **O repositório já existe com a estrutura antiga (`server/`, `client/`...)?** O Integrante 1 apaga a estrutura antiga no primeiro commit e depois segue normalmente:
>
> ```bash
> git rm -r server client database tests vite.config.mjs .env.example docker-compose.yml
> git commit -m "chore: remove estrutura antiga antes da separação backend/frontend"
> ```

---

## Integrante 1 — Backend A (base, banco e segurança)

**Arquivos:**

- Raiz: `package.json`, `.gitignore`, `railway.json`, `.github/`, `DIVISAO-DOS-COMMITS.md`
- `backend/package.json`, `backend/.env.example`, `backend/docker-compose.yml`
- `backend/src/index.js`, `backend/src/app.js`
- `backend/src/config/`, `backend/src/db/`, `backend/src/middlewares/`, `backend/src/utils/`, `backend/src/schemas/`
- `backend/database/` (scripts SQL)
- Rotas: `auth`, `usuarios`, `perfil`, `auditoria`, `mensagens`, `chamados`, `relatorios`, `dashboard` (arquivos `backend/src/routes/<nome>.routes.js`)

**Comandos:**

```bash
git add package.json .gitignore railway.json .github DIVISAO-DOS-COMMITS.md backend/package.json backend/.env.example backend/docker-compose.yml
git commit -m "chore: estrutura do projeto separada em backend e frontend"

git add backend/database backend/src/config backend/src/db
git commit -m "feat(backend): scripts do banco MySQL, configuração e conexão (pool)"

git add backend/src/index.js backend/src/app.js backend/src/middlewares backend/src/utils backend/src/schemas
git commit -m "feat(backend): servidor Express, autenticação JWT, validação e tratamento de erros"

git add backend/src/routes/auth.routes.js backend/src/routes/usuarios.routes.js backend/src/routes/perfil.routes.js backend/src/routes/auditoria.routes.js
git commit -m "feat(backend): rotas de login, usuários, perfil e auditoria"

git add backend/src/routes/mensagens.routes.js backend/src/routes/chamados.routes.js backend/src/routes/relatorios.routes.js backend/src/routes/dashboard.routes.js
git commit -m "feat(backend): rotas de mensagens, SAC, relatórios e painel"

git pull --rebase
git push
```

---

## Integrante 2 — Backend B (escola, notas e módulos)

**Arquivos:**

- Raiz: `ADEQUACAO.md`, `EXPANSAO.md`
- `backend/src/routes/escola.routes.js` e a pasta `backend/src/routes/escola/`
- `backend/src/routes/acompanhamentos.routes.js` e a pasta `backend/src/routes/acompanhamentos/`
- Rotas: `alunos`, `boletim`, `pendencias`, `eventos`, `aulas`, `atividades`, `justificativas`, `documentos`, `ocorrencias`
- `backend/src/pendencias/`
- `backend/tests/`

**Comandos:**

```bash
git add backend/src/routes/escola.routes.js backend/src/routes/escola backend/src/routes/alunos.routes.js
git commit -m "feat(backend): rotas de turmas, disciplinas, bimestres e alunos"

git add backend/src/routes/acompanhamentos.routes.js backend/src/routes/acompanhamentos backend/src/routes/boletim.routes.js
git commit -m "feat(backend): lançamento de notas, revisão da coordenação e boletim"

git add backend/src/routes/pendencias.routes.js backend/src/pendencias backend/src/routes/eventos.routes.js backend/src/routes/aulas.routes.js backend/src/routes/atividades.routes.js
git commit -m "feat(backend): pendências, calendário, aulas e atividades"

git add backend/src/routes/justificativas.routes.js backend/src/routes/documentos.routes.js backend/src/routes/ocorrencias.routes.js
git commit -m "feat(backend): justificativas de falta, documentos e ocorrências"

git add backend/tests ADEQUACAO.md EXPANSAO.md
git commit -m "test(backend): testes de integração da API e documentação dos módulos"

git pull --rebase
git push
```

---

## Integrante 3 — Frontend A (base e telas de todos os perfis)

**Arquivos:**

- Raiz: `README.md`
- `frontend/package.json`, `frontend/.env.example`, `frontend/vite.config.mjs`, `frontend/index.html`
- `frontend/src/main.jsx`, `frontend/src/App.jsx`
- `frontend/src/api/`, `frontend/src/contexto/`, `frontend/src/hooks/`, `frontend/src/util/`, `frontend/src/componentes/`, `frontend/src/estilos/`
- Páginas (`frontend/src/paginas/`): `Inicio`, `Login`, `Cadastro`, `Privacidade`, `Termos`, `RedefinirSenha`, `Aceite`, `NaoEncontrada`, `Painel`, `Pendencias`, `Perfil`, `Ajuda`, `Comunicacao`, `Calendario` (`.jsx`)

**Comandos:**

```bash
git add frontend/package.json frontend/.env.example frontend/vite.config.mjs frontend/index.html frontend/src/main.jsx frontend/src/App.jsx README.md
git commit -m "feat(frontend): projeto React com Vite e mapa de rotas"

git add frontend/src/api frontend/src/contexto frontend/src/hooks frontend/src/util
git commit -m "feat(frontend): cliente da API, sessão de login e hooks"

git add frontend/src/componentes frontend/src/estilos
git commit -m "feat(frontend): componentes reutilizáveis e estilos"

cd frontend/src/paginas
git add Inicio.jsx Login.jsx Cadastro.jsx Privacidade.jsx Termos.jsx RedefinirSenha.jsx Aceite.jsx NaoEncontrada.jsx
git commit -m "feat(frontend): página inicial, login, cadastro e LGPD"

git add Painel.jsx Pendencias.jsx Perfil.jsx Ajuda.jsx Comunicacao.jsx Calendario.jsx
git commit -m "feat(frontend): painel, pendências, perfil, SAC, mural e calendário"
cd ../../..

git pull --rebase
git push
```

---

## Integrante 4 — Frontend B (telas do professor e da coordenação)

**Arquivos:**

- Raiz: `ROTEIRO-DE-TESTE.md`
- Páginas (`frontend/src/paginas/`): `NotasFaltas.jsx` e a pasta `notas/`, `Estrutura.jsx` e a pasta `estrutura/`, `Revisao`, `Alunos`, `Professores`, `Aulas`, `Atividades`, `Justificativas`, `Documentos`, `DocumentoVer`, `Ocorrencias`, `Relatorios`, `Auditoria` (`.jsx`)

**Comandos:**

```bash
cd frontend/src/paginas
git add NotasFaltas.jsx notas Revisao.jsx
git commit -m "feat(frontend): lançamento de notas, boletim e revisão da coordenação"

git add Estrutura.jsx estrutura Alunos.jsx Professores.jsx
git commit -m "feat(frontend): cadastro de turmas, disciplinas, alunos e professores"

git add Aulas.jsx Atividades.jsx Justificativas.jsx Documentos.jsx DocumentoVer.jsx Ocorrencias.jsx
git commit -m "feat(frontend): aulas, atividades, justificativas, documentos e ocorrências"

git add Relatorios.jsx Auditoria.jsx
git commit -m "feat(frontend): relatórios gerenciais e trilha de auditoria"
cd ../../..

git add ROTEIRO-DE-TESTE.md
git commit -m "docs: roteiro de teste"

git pull --rebase
git push
```

---

## Conferência final (qualquer integrante)

Depois dos quatro pushes:

```bash
git pull
git status          # não deve sobrar nada como "untracked"
npm install         # na pasta kfka: instala backend/ e frontend/
```

Copiem o `.env` para dentro de `backend/` (ele **não** vai para o GitHub). Depois:

```bash
npm run db:setup
npm run dev         # terminal 1 — API em http://localhost:3000
npm run dev:web     # terminal 2 — site em http://localhost:5173
```

Também dá para entrar em cada pasta, como no starter da Aula 12: `cd backend && npm run dev` e `cd frontend && npm run dev`.

**Cuidados:**
- Nunca façam `git add .` na pasta raiz: vocês podem enviar arquivos da parte do colega, ou o `.env` com a senha.
- `node_modules/` e `.env` já estão no `.gitignore`.
- Daqui para a frente, cada um continua mexendo na sua parte. Assim as próximas entregas também mostram commits de todos.
