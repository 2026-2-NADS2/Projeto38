# Programação Orientada a Objetos — Entrega 2

**KFKA — Plataforma de Acompanhamento Escolar** · Equipe AlphaTech · FECAP · 2º semestre de ADS · 2026

## Sobre a entrega

Segundo o enunciado, o objetivo da Entrega 2 é a **subida do backend** do sistema, garantindo que ele esteja disponível e acessível, com a configuração do serviço de backend e a conexão com o banco de dados.

Na Entrega 2, o backend da plataforma KFKA completa foi desenvolvido em **Node.js + Express**, conectado ao banco **MySQL** e executado como serviço em servidor local (`localhost`).

## Código

Backend: [`src/Entrega 2/Backend/kfka-backend/kfka/backend`](../../../src/Entrega%202/Backend/kfka-backend/kfka/backend)

## Como o backend está organizado

| Camada | Pasta | Responsabilidade |
| --- | --- | --- |
| Ponto de entrada | `src/index.js` | Confere o banco e inicia o servidor |
| Aplicação | `src/app.js` | Monta o Express: segurança, rotas da API e tratamento de erros |
| Configuração | `src/config/env.js` | Lê e valida as variáveis de ambiente (`.env`) |
| Banco de dados | `src/db/` | Conexão com o MySQL (pool) e transações |
| Rotas | `src/routes/` | Endpoints da API, separados por assunto |
| Middlewares | `src/middlewares/` | Autenticação, permissões por perfil, validação e erros |
| Utilitários | `src/utils/` | Geração de PDF e planilhas, auditoria, paginação |

### Classes do backend

- **`AppError`** (`src/utils/AppError.js`):
  - **herda** de `Error` (`class AppError extends Error`) e acrescenta o status HTTP, o código e os detalhes do erro;
  - tem **métodos estáticos de fábrica** (`naoAutenticado()`, `semPermissao()`, `naoEncontrado()`, `conflito()`);
  - é usada pelas rotas para que todos os erros sigam o mesmo formato.
- **`DocumentoPdf`** (`src/utils/pdf.js`):
  - **encapsula** a montagem do PDF do boletim: guarda páginas, margens e posição atual;
  - oferece métodos como `texto()`, `paragrafo()`, `tabela()`, `novaPagina()` e `gerar()`;
  - é usada em `src/routes/boletim.routes.js`.

O restante do backend é organizado em **módulos**: funções exportadas por arquivo, no padrão do Node.js.

## Como executar em servidor local

**Pré-requisitos:** Node.js 20+ e MySQL (pode ser o do XAMPP).

1. Ligue o MySQL (no XAMPP: **Start** no MySQL).
2. Na pasta do backend, crie o arquivo `.env`. O conteúdo está no [README de Full Stack](../DESENVOLVIMENTO%20WEB%20FULL%20STACK).
3. Rode:
   ```bash
   npm install
   npm run db:setup   # cria o banco "kfka" (apaga o banco se ele já existir)
   npm run dev        # servidor em http://localhost:3000
   ```
4. Abra **http://localhost:3000/api/saude**. A resposta deve ser `"status": "ok"` e `"banco": "conectado"`, confirmando o serviço no ar e a conexão com o banco.

Para usar o sistema completo, com as telas, ligue também o front-end, conforme o [README de Full Stack](../DESENVOLVIMENTO%20WEB%20FULL%20STACK).

## Equipe

Igor Araujo · Matheus Teixeira · Daniel Camara · Enzo Lemos
