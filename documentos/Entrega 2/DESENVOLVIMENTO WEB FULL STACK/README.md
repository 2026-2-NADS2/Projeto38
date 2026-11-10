# Desenvolvimento Web Full Stack — Entrega 2

**KFKA — Plataforma de Acompanhamento Escolar** · Equipe AlphaTech · FECAP · 2º semestre de ADS · 2026

## Sobre a entrega

Na Entrega 2, a equipe desenvolveu o **back-end** do sistema e o integrou ao front-end:
- uma API em Node.js e Express;
- banco de dados MySQL;
- cadastro e login com rotas protegidas;
- validação dos dados e respostas de erro padronizadas.

O front-end foi migrado para **React**. Também foram tratados os pontos apontados pelo professor na Entrega 1: menu no celular, estados de carregamento e erro e página para rota inexistente.

Fluxo principal: **o professor registra → a coordenação revisa e publica → o responsável consulta o boletim**.

## Onde está o código

| Parte | Pasta |
| --- | --- |
| Back-end (API, banco e testes) | [`src/Entrega 2/Backend/kfka-backend/kfka/backend`](../../../src/Entrega%202/Backend/kfka-backend/kfka/backend) |
| Front-end (React + Vite) | [`src/Entrega 2/Frontend/frontend`](../../../src/Entrega%202/Frontend/frontend) |
| Documentação técnica completa | [`kfka/README.md`](../../../src/Entrega%202/Backend/kfka-backend/kfka/README.md) |

## Tecnologias

- **Front-end:** React, React Router, Vite e CSS responsivo
- **Back-end:** Node.js, Express, Zod (validação), JWT (login) e bcrypt (senhas)
- **Banco de dados:** MySQL

## Funcionalidades

- **Professor(a):** lança média, faltas, parecer e tags e envia para revisão.
- **Coordenação:** revisa, devolve e publica os lançamentos; faz os cadastros da escola; gera relatórios com exportação para Excel.
- **Responsável:** consulta o boletim publicado, baixa o PDF e confirma ciência.

## Sistema publicado

A aplicação está publicada, com front-end e back-end funcionando juntos em produção:

| | Endereço |
| --- | --- |
| Site (front-end, Netlify) | https://kfka-alphatech.netlify.app |
| API (back-end, Railway) — teste de funcionamento | https://kfka-backend-production.up.railway.app/api/saude |

O banco MySQL também está no Railway. As credenciais (conexão com o banco, `JWT_SECRET`) ficam nas variáveis de ambiente das plataformas, fora do código-fonte. Os usuários de demonstração são os mesmos listados abaixo.

## Como executar localmente

**Pré-requisitos:** Node.js 20+ e MySQL (pode ser o do XAMPP).

**1. Banco:** ligue o MySQL. No XAMPP, clique em **Start** no MySQL.

**2. Back-end:** na pasta `src/Entrega 2/Backend/kfka-backend/kfka/backend`, crie um arquivo `.env` com:

```
PORT=3000
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=kfka
DB_TIMEZONE=-03:00
ANO_LETIVO=2026
JWT_SECRET=troque-por-uma-chave-longa-e-aleatoria
SEED_SENHA=Senha@123
```

Depois rode:

```bash
npm install
npm run db:setup   # cria o banco "kfka" com dados de demonstração (apaga o banco se ele já existir)
npm run dev        # API em http://localhost:3000
```

**3. Front-end:** em outro terminal, na pasta `src/Entrega 2/Frontend/frontend`:

```bash
npm install
npm run dev        # site em http://localhost:5173
```

Abra **http://localhost:5173** no navegador.

**Usuários de demonstração** (senha `Senha@123`):

| E-mail | Perfil |
| --- | --- |
| admin@kfka.edu.br | Coordenação |
| carlos.menezes@kfka.edu.br | Professor |
| ana.ribeiro@email.com | Responsável |

## Equipe

Igor Araujo · Matheus Teixeira · Daniel Camara · Enzo Lemos
