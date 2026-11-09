# Processo de Aprendizagem e Desenvolvimento — Plataforma de Acompanhamento Escolar (KFKA)

Equipe AlphaTech · FECAP · Análise e Desenvolvimento de Sistemas · 2º semestre de 2026 · 09/11/2026

## 1. Apresentação do projeto

Este documento descreve como a equipe AlphaTech aprendeu e desenvolveu uma plataforma web de acompanhamento escolar no Projeto Interdisciplinar do 2º semestre de Análise e Desenvolvimento de Sistemas da FECAP (2026). A demanda foi proposta pela **KFKA**, empresa parceira do projeto, e a plataforma foi desenvolvida pela equipe.

**Equipe AlphaTech:** Daniel Camara, Enzo Lemos, Igor Araujo e Matheus Lima. O documento é de autoria coletiva.

A plataforma centraliza o acompanhamento bimestral de alunos do Ensino Fundamental e organiza a comunicação entre professores, administração escolar e responsáveis. O fluxo principal é:

**Professor registra → escola revisa → informação é validada e publicada → família consulta.**

O escopo inclui o cadastro de alunos, professores, responsáveis, turmas e disciplinas; o registro de notas, médias e observações; a revisão antes da publicação; a consulta pelos responsáveis, com relatório em PDF; o controle de acesso por perfil; e a comunicação entre escola e família. Também foram desenvolvidos módulos complementares: calendário, atividades, ocorrências, justificativas de falta, conversas, perfil do usuário e pendências.

O objetivo deste documento é mostrar, de forma verdadeira, o que a equipe aprendeu em aula, o que pesquisou por conta própria, o que decidiu e desenvolveu e onde recebeu auxílio de inteligência artificial.

## 2. Processo de aprendizagem e desenvolvimento

O projeto foi construído em duas entregas, acompanhando o avanço das aulas e das disciplinas do semestre.

1. **Base nas disciplinas do semestre.** A equipe estudou HTML, CSS, JavaScript, React, Node.js e MySQL nas 13 aulas de Desenvolvimento Web Full Stack. O banco de dados foi construído nas aulas de Banco de Dados, e a identidade visual se apoiou no site da KFKA e nas aulas de Design de Interface Digital.
2. **Entrega 1 (front-end).** No planejamento inicial, a equipe consultou o ChatGPT sobre requisitos, identidade visual, estrutura da página inicial e personas. Depois, criou as primeiras telas em HTML, CSS e JavaScript: login, painel, notas e faltas, e comunicação. As principais referências foram as aulas e o vídeo "Como Fazer um SITE RESPONSIVO com HTML E CSS PASSO A PASSO", de Matheus Manuel. O Codex auxiliou nessa etapa.
3. **Retorno do professor.** Na Entrega 1, o professor apontou quatro pontos: falta de React, navegação limitada em telas pequenas, ausência de estados de carregamento e erro e ausência de página para rota inexistente.
4. **Entrega 2 (back-end e integração).** A equipe decidiu migrar o front-end para React e usar o próprio banco MySQL (`kfka_banco.sql`). Com o Claude, foram gerados a API em Node.js e Express, a migração para React, os módulos complementares e os testes automatizados. O Claude também adaptou o script do banco para registrar faltas e mensagens.
5. **Testes e correções.** A equipe testou a aplicação, e o Claude também executou testes. Assim foram encontrados erros, como dados que não estavam sendo gravados no banco. O Codex foi usado para corrigir problemas de layout em smartphones.

O resultado é uma aplicação com cerca de 10.700 linhas de JavaScript/JSX no front-end, 1.800 linhas de CSS, 8.700 linhas no servidor, 1.240 linhas de SQL e 49 testes automatizados.

## 3. Conhecimentos adquiridos nas aulas

As 13 aulas de Desenvolvimento Web Full Stack constroem, passo a passo, um projeto de referência: a Plataforma de Avaliações. Esse projeto foi estudado como material de aula, e não como parte do sistema da equipe.

| Aula | Conteúdo estudado | Material de apoio |
| --- | --- | --- |
| 01 | HTML semântico (`header`, `nav`, `main`, `article`, `footer`), história do HTML, leitura de wireframe, Emmet | Slides da Aula 01; apostilas do Módulo 1 |
| 02 | Variáveis CSS (design tokens), Flexbox, CSS Grid, media queries e mobile-first | Slides da Aula 02; apostilas do Módulo 1 |
| 03 | Funções puras e métodos de array (`map`, `filter`, `reduce`) | Apostila do Módulo 2 (JavaScript) |
| 04 | `fetch`, `async/await`, status HTTP, tratamento de erro e CORS | Apostila do Módulo 2 |
| 05 | Classes, herança e erros customizados | Apostila do Módulo 2 |
| 06 | Componentes React, JSX e props | Apostila do Módulo 3 (React) |
| 07 | `useState`, `useEffect`, formulários controlados e os estados carregando, erro e conteúdo | Apostila do Módulo 3 |
| 08 | React Router, rota 404 e organização de pastas | Apostila do Módulo 3 |
| 09 | API com Node.js e Express, rotas e status HTTP; testes com `curl` e Postman | Starter e enunciado da Aula 09 |
| 10 | MySQL com `mysql2`, pool de conexões, consultas com `?` (contra SQL Injection), repositórios e `.env` | Starter e enunciado da Aula 10 |
| 11 | Autenticação com bcrypt e JWT, middleware e rota protegida | Starter e enunciado da Aula 11 |
| 12 | Validação centralizada, classes de erro, tratamento central de erros e diferença entre 401 e 403 | Starter e enunciado da Aula 12; apostila do Módulo 3 |
| 13 | Ligação do front-end com a API (`VITE_API_URL`, token, Context) e publicação (Netlify e Render) | Starter da Aula 13 |

Duas outras disciplinas do semestre também entraram no projeto:

- **Banco de Dados:** o modelo relacional, os índices, os triggers e as views do script `kfka_banco.sql`.
- **Design de Interface Digital:** as estratégias de interface usadas na identidade visual, junto com o site da KFKA.

## 4. Aplicação dos conhecimentos no projeto

A tabela abaixo relaciona cada conteúdo ao que foi encontrado no código do projeto. A presença de um conceito no código não indica, sozinha, quem o escreveu. A autoria está descrita nas seções 6 e 7.

| Conteúdo (aula) | Como aparece no projeto | Situação |
| --- | --- | --- |
| HTML semântico (01) | `header`, `main`, `section`, `article`, `nav` e `footer` nas telas em React | Aplicado |
| Variáveis CSS (02) | Cores e espaçamentos definidos em `:root` e usados mais de 500 vezes; tema claro e escuro | Aplicado |
| Flexbox e Grid (02) | Flexbox em mais de 100 regras; Grid em 16 layouts, sem `grid-template-areas` | Aplicado |
| Responsividade (02) | Media queries para 900, 768, 640 e 560 px | Aplicado |
| Mobile-first (02) | O CSS parte da tela do computador e se adapta para telas menores (desktop-first) | Aplicado de forma diferente da aula |
| Funções e arrays (03) | Uso constante de `map`, `filter`, `reduce` e `find` | Aplicado |
| `fetch` e tratamento de erro (04) | `client/src/api/cliente.js` faz as requisições e trata erros | Aplicado |
| Classes e erros customizados (05 e 12) | Uma classe `AppError` com tipos de erro, em vez de uma classe por erro | Aplicado de forma diferente da aula |
| Componentes, props e hooks (06 e 07) | 55 componentes `.jsx`; `useState`, `useEffect` e hooks próprios (`useApi`, `useFormulario`) com estados de carregando e erro | Aplicado |
| React Router e 404 (08) | Rotas por perfil, `RotaProtegida` e página `NaoEncontrada` | Aplicado |
| Organização de pastas (08) | `componentes/`, `paginas/`, `contexto/`, `hooks/` e `api/`, com nomes em português | Aplicado |
| Context e token (12 e 13) | `AuthContext` com token no cabeçalho `Authorization: Bearer` e `VITE_API_URL` | Aplicado |
| API Express (09) | API REST em Express 4 com CommonJS; o curso usa Express 5 com ES Modules | Aplicado de forma diferente da aula |
| MySQL, pool e `?` (10) | Pool do `mysql2` e consultas parametrizadas; o SQL fica nas rotas, sem repositórios | Aplicado, sem o padrão repositório |
| `.env` (10) | `.env.example` e `config/env.js`, que valida as variáveis | Aplicado |
| bcrypt, JWT e rota protegida (11) | Senhas com bcrypt, login com JWT e middleware de autenticação e perfil | Aplicado |
| Validação centralizada (12) | Feita com a biblioteca Zod, e não com validadores escritos à mão | Aplicado com outra ferramenta |
| Tratamento central de erros e 401/403 (12) | Middleware único de erros e respostas 403 para perfil sem permissão | Aplicado |
| Publicação (13) | Projeto configurado para o Railway, com front-end e API no mesmo serviço; o curso usa Netlify e Render | Aplicado com outra plataforma |

O projeto também traz recursos que não fazem parte das aulas de Full Stack: triggers e views no banco (vindos da disciplina de Banco de Dados), validação com Zod, testes automatizados, geração de PDF e planilhas, proteções de segurança (`helmet`, limite de tentativas de login) e recursos de LGPD.

## 5. Pesquisas e estudos independentes

Além das aulas, a equipe usou quatro referências externas.

| Referência | Tipo | Como foi usada |
| --- | --- | --- |
| ["Como Fazer um SITE RESPONSIVO com HTML E CSS PASSO A PASSO"](https://www.youtube.com/watch?v=Nua1Ug5DgxE&list=PL9zVxgnjCLHlYerrH772UrPPNYQjbF1DS), de Matheus Manuel (YouTube) | Videoaula | Referência para as páginas responsivas da Entrega 1, junto com as aulas |
| Sala do Futuro (plataforma educacional do governo do Estado de São Paulo) | Plataforma escolar real | Referência de como uma plataforma escolar organiza informações acadêmicas |
| Google Classroom | Plataforma escolar real | Referência de organização de turmas, atividades e comunicação |
| Site da KFKA (empresa parceira) | Identidade visual | Referência para as cores e o estilo da plataforma |

## 6. Utilização de ferramentas de inteligência artificial

A equipe usou três ferramentas de IA: o **ChatGPT** (OpenAI), no planejamento inicial, o **Codex** (OpenAI) e o **Claude** (Anthropic). Da Entrega 2 em diante, a maior parte do código foi gerada pelo Claude.

| Ferramenta | Etapa | O que fez |
| --- | --- | --- |
| ChatGPT (OpenAI) | Planejamento inicial | Apoiou o levantamento de requisitos, a identidade visual, a estrutura da Home Page no Figma e a definição de personas |
| Codex (OpenAI) | Entrega 1 | Auxiliou na construção das páginas em HTML, CSS e JavaScript |
| Codex (OpenAI) | Correções | Corrigiu erros e bugs, como o layout em smartphones |
| Claude (Anthropic) | Entrega 2 | Analisou a Entrega 1, apontou problemas (navegação no celular, risco de XSS, falta de página 404) e gerou a API em Node.js e Express, com autenticação e validação |
| Claude (Anthropic) | Banco de dados | Adaptou a API ao MySQL da equipe e fez 15 alterações no `kfka_banco.sql` para registrar faltas e mensagens |
| Claude (Anthropic) | Front-end | Migrou as telas para React, mantendo o visual da Entrega 1 |
| Claude (Anthropic) | Expansão | Gerou os módulos complementares (calendário, atividades, ocorrências, justificativas, documentos e outros) |
| Claude (Anthropic) | Qualidade | Revisou os requisitos, corrigiu falhas de segurança, gerou 49 testes automatizados e encontrou erros, como dados que não eram gravados no banco |
| Claude (Anthropic) | Documentação | Gerou relatórios de apoio, o guia de publicação e esta documentação do processo |

**Limitações observadas:**

- Os testes do Claude rodaram em um banco compatível com MySQL, e não no MySQL 8 oficial.
- O Claude recusou instalar bibliotecas de aplicativo mobile (Expo e React Native) que a equipe pediu, porque elas não servem para um site web.
- A IA também errou. Por exemplo, dados que não estavam sendo gravados no banco só foram identificados nos testes e depois corrigidos.

A declaração no modelo da FECAP está na seção 10.

## 7. Decisões e validações

As decisões que definiram o projeto foram da equipe. A IA executou boa parte da implementação a partir delas.

| Decisão ou trabalho da equipe | Detalhe |
| --- | --- |
| Escopo, perfis e fluxo da plataforma | Definidos a partir da demanda da KFKA: professor, administração escolar e responsável, com revisão antes da publicação |
| Entrega 1 | Páginas em HTML, CSS e JavaScript feitas com base nas aulas e no vídeo de Matheus Manuel, com auxílio do Codex |
| Banco de dados | Script `kfka_banco.sql`, com tabelas, índices, triggers e views, desenvolvido nas aulas de Banco de Dados |
| Manter o banco da equipe | Pedido para a API usar o MySQL da equipe, revisando o plano de migração antes de qualquer código |
| Migrar para React | Decisão tomada após o retorno do professor na Entrega 1 |
| Identidade visual | Baseada no site da KFKA e nas aulas de Design de Interface Digital |
| Referências de produto | Sala do Futuro e Google Classroom |
| Testes | A equipe testou a aplicação por conta própria; o Claude também executou testes |
| Correções | Bugs corrigidos com o Codex, como o layout em smartphones |

Conforme o Guia para o Uso Responsável de IA na FECAP, a equipe assume a responsabilidade pelo resultado final, inclusive pelas partes geradas por IA.

## 8. Dificuldades encontradas e soluções

| Dificuldade | Solução |
| --- | --- |
| A Entrega 1 não usava React | Front-end migrado para React, com componentes, contextos e rotas |
| Navegação limitada em telas pequenas | Menu em gaveta no celular e correções de layout em smartphones (com o Codex) |
| Sem estados de carregamento e erro | Indicadores de carregamento, mensagens de erro e estados vazios nas telas |
| Sem página para rota inexistente | Página 404 no React e resposta 404 padronizada na API |
| API diferente do banco da equipe | API adaptada ao `kfka_banco.sql`, depois da revisão do plano de migração |
| Dados que não eram gravados no banco | Erro encontrado nos testes e corrigido |
| Risco de XSS na Entrega 1 (`innerHTML` sem escape) | O React escapa o texto exibido na tela |

Uma diferença em relação às aulas ficou como aprendizado: a Aula 02 ensina a começar o layout pelo celular (mobile-first), mas o projeto partiu da tela do computador. Os problemas de navegação no celular apontados na Entrega 1 mostraram, na prática, por que a aula recomenda o caminho inverso.

## 9. Considerações finais

O projeto reuniu os conteúdos do semestre em uma solução para uma demanda real da KFKA. Quase todos os conceitos das 13 aulas de Full Stack aparecem no código: HTML semântico, variáveis CSS, React, rotas, API em Express, MySQL com consultas parametrizadas, autenticação com JWT e tratamento central de erros. O banco de dados e a identidade visual vieram das disciplinas de Banco de Dados e Design de Interface.

A IA teve papel grande no desenvolvimento, sobretudo a partir da Entrega 2, quando o Claude gerou a maior parte do código. Isso trouxe um aprendizado importante: usar IA exige saber o que pedir, conferir o resultado e testar, porque a ferramenta também erra. O retorno do professor na Entrega 1 e os testes foram decisivos para corrigir o rumo do projeto.

A equipe declara o uso de IA de forma completa, como pede a FECAP, e reconhece que, pelo guia, cada integrante deve ser capaz de explicar o código que apresenta.

## 10. Referências e declarações

### Declaração de uso de inteligência artificial (modelo FECAP, Art. 7º)

| Campo | Preenchimento |
| --- | --- |
| Ferramenta utilizada | ChatGPT (OpenAI); Claude (Anthropic), via claude.ai; Codex (OpenAI) |
| Versão/modelo | ChatGPT: versão não identificada. Claude: Opus 5.5 na sessão desta documentação (09/11/2026); versão não identificada nas sessões de 03 a 05/11/2026. Codex: versão não identificada |
| Disciplina / Trabalho | Projeto Interdisciplinar — 2º semestre de Análise e Desenvolvimento de Sistemas — Entregas 1 e 2 |
| Finalidade de uso | **ChatGPT:** apoio no planejamento inicial (requisitos, identidade visual, estrutura da Home Page no Figma e personas). **Codex:** apoio na construção das páginas da Entrega 1 e correção de bugs (ex.: layout em smartphones). **Claude:** análise da Entrega 1; geração da API em Node.js e Express; adaptação ao banco MySQL da equipe; migração do front-end para React; módulos complementares; revisão de requisitos e de segurança; testes automatizados e identificação de erros; guia de publicação; relatórios e esta documentação |
| Prompts principais utilizados | Ver a lista logo abaixo da tabela |
| Trechos ou entregas afetadas | Planejamento inicial (requisitos, identidade visual, Home Page no Figma e personas, com o ChatGPT); Entrega 1 (páginas HTML, CSS e JavaScript, com auxílio do Codex); `server/` (API completa); `client/src/` (front-end em React); `database/kfka_expansao.sql`, `kfka_adequacao.sql` e `kfka_usuario_app.sql`; alterações marcadas `[SITE]` no `kfka_banco.sql`; `tests/` e integração contínua; `README.md` e configuração de publicação; ajustes de CSS; este documento |

**Prompts principais utilizados**

*ChatGPT: prompts iniciais, reconstruídos a partir do histórico (não são cópia literal)*

1. "Estamos desenvolvendo um projeto de tecnologia educacional para a empresa KFKA. A proposta é criar uma plataforma de acompanhamento escolar voltada ao Ensino Fundamental. Auxilie no levantamento de requisitos e na identificação dos principais problemas relacionados à comunicação entre professores, administração escolar e responsáveis. Apresente sugestões de funcionalidades, requisitos funcionais e não funcionais […]"
2. "Estamos desenvolvendo a identidade visual da KFKA – Tecnologia Educacional. […] Nossa direção visual utiliza branco, cinza, azul-escuro e preto, com possibilidades de gradientes azuis. Apresente sugestões de combinações de cores, tipografia, elementos gráficos e referências visuais […]"
3. "Estamos desenvolvendo a Home Page da KFKA no Figma, com resolução de 1440x1024 pixels. […] Auxilie no planejamento da estrutura da página, sugerindo uma hierarquia de informações, organização das seções, elementos de navegação e boas práticas de UX/UI Design."
4. "Estamos desenvolvendo uma plataforma de acompanhamento escolar e precisamos compreender melhor os diferentes perfis de usuários. Considere três públicos: administradores escolares, professores e responsáveis pelos alunos. Auxilie na identificação dos objetivos, necessidades, dificuldades e expectativas de cada perfil […]"

*Claude*

5. "A primeira entrega do projeto já está feita, (segue o arquivo .zip fixado). Diante dos resumos que te dei sobre o projeto, gostaria que me ajudasse na segunda entrega do trabalho, além de dar feedback…" (trecho literal)
6. Pedido para adaptar o sistema ao banco MySQL da equipe (`kfka_banco.sql`), apresentando o plano de migração antes do código (resumo do pedido).
7. Pedido para instalar bibliotecas Expo e React Native, recusado por não servirem a um site web (resumo do pedido).
8. Prompt-mestre para documentar o processo de aprendizagem e desenvolvimento do projeto (09/11/2026).

### Referências

CURSO FULLSTACK — PLATAFORMA DE AVALIAÇÕES. **Aula 01: HTML semântico com Emmet**; **Aula 02: CSS, Flexbox, Grid e mobile-first**. Slides de aula. FECAP, 2026.

CURSO FULLSTACK — PLATAFORMA DE AVALIAÇÕES. **Apostila Módulo 1: HTML & CSS**; **Apostila Aulas 01–02**; **Apostila Módulo 2: JavaScript**; **Apostila Módulo 3: React**. Material de apoio. FECAP, 2026.

CURSO FULLSTACK — PLATAFORMA DE AVALIAÇÕES. **Starters e enunciados das Aulas 09 a 13**. Código-base de aula. FECAP, 2026.

FECAP. **Guia para o Uso Responsável de IA na FECAP**. São Paulo: FECAP, 2026. Disponível em: <https://www.fecap.br/wp-content/uploads/2026/08/Guia-para-o-Uso-Responsavel-de-IA-na-FECAP.pdf>. Acesso em: 9 nov. 2026.

MANUEL, Matheus. **Como Fazer um SITE RESPONSIVO com HTML E CSS PASSO A PASSO**. YouTube. Disponível em: <https://www.youtube.com/watch?v=Nua1Ug5DgxE&list=PL9zVxgnjCLHlYerrH772UrPPNYQjbF1DS>.

GOOGLE. **Google Classroom**. Plataforma educacional. Disponível em: <https://classroom.google.com>.

SÃO PAULO (Estado). Secretaria da Educação. **Sala do Futuro**. Plataforma educacional.

KFKA. **Site institucional**. Referência de identidade visual.
