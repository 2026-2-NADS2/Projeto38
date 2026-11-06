# KFKA — Expansão da plataforma (novembro/2026)

Trabalho feito sobre o projeto existente (React + Express + MySQL), sem recriar nada: as telas, rotas e regras que já funcionavam continuam iguais, e o `kfka_banco.sql` da equipe **não foi alterado** — os módulos novos ficam em `backend/database/kfka_expansao.sql`, que roda depois dele.

## O que foi implementado

| # | Módulo | Onde | Destaques |
| --- | --- | --- | --- |
| 2.1 | Perfil | `/perfil` | Foto (recortada e reduzida no navegador), dados por perfil, edição permitida (telefone; nome só a coordenação), troca de senha com a senha atual, tema claro/escuro |
| 2.2 | Mural de conversas | `/comunicacao` | Contatos respeitam os vínculos (família ↔ professores dos filhos), mensagem pode citar o aluno, separador por dia, autor e horário, não lidas, aviso de mensagem nova no menu |
| 2.3 | Calendário | `/calendario` | Mês e semana, categorias com cor **e** nome, bimestres, prazos de atividades e de digitação, filtros por tipo, turma (equipe) ou filho (família); coordenação cadastra/edita/exclui; evento "somente equipe" |
| 2.4 | Relatório por aula | `/aulas` | Conteúdo, descrição, atividades, observações, presença/falta por aluno, rascunho e finalização (bloqueia), histórico, "aulas da grade sem registro" |
| 2.5 | Atividades | `/atividades` | Cadastro, publicação, prazo, link de material, encerrar/cancelar, entregas por aluno; família vê pendente/concluída/atrasada de cada filho |
| 2.6 | SAC | `/ajuda`, `/termos` | Perguntas frequentes com busca, chamados com categoria, conversa e situação; orientações de login/senha, termos, privacidade e LGPD |
| 2.7 | Boletim | `/boletim` | Abas por filho, bimestre, quadro anual (médias por bimestre + média anual), situação acadêmica, comentários, tags, ciência, histórico por ano letivo, impressão/PDF com cabeçalho |
| 2.8 | Cadastro de alunos | `/alunos` | Todos os campos pedidos (documento, e-mail, contato e endereço opcionais), busca, filtros, ativar/desativar com confirmação, vínculo de responsáveis e turma |
| 2.9 | Pendências | `/pendencias` | Calculadas dos dados reais para cada perfil, com prioridade, situação, data e link direto; contadores no menu e faixa no painel |
| 2.10 | Documentos | `/documentos` | Pedido, situação (solicitado, em análise, disponível, recusado), justificativa da recusa, histórico; o documento é **gerado do banco** com código de validação e sai em PDF pela impressão |
| 2.11 | Feedback visual | todas | Avisos de sucesso/erro, confirmação antes de ações importantes, erros embaixo dos campos, carregamento, estados vazios, badges com ícone + texto |
| 2.12 | Professores | `/professores` | Cadastro e edição, ativar/desativar, vínculos com disciplinas e turmas (com dias da grade), histórico de vínculos, link de redefinição de senha; também contas de responsáveis |
| 2.13 | Justificativas | `/justificativas` | Família envia (a partir das faltas registradas nas aulas) e complementa; coordenação aprova, recusa ou pede informações; o professor vê só a situação |
| 2.14 | Ocorrências | `/ocorrencias` | Categorias pedidas, providências, histórico, situação só pela coordenação, restrição de acesso (saúde sempre restrita) |
| — | Turmas e disciplinas | `/turmas` | Turmas, disciplinas, professores e grade por turma, datas dos bimestres e da digitação |
| — | Recuperação de senha | `/redefinir-senha` | Link gerado pela coordenação, 24 h, uso único (guardado como hash) |

Menu reorganizado por seções e por perfil, com ícones SVG no lugar dos emojis. Contraste do texto cinza corrigido. Tema claro (branco/cinza-claro) disponível; o escuro continua o padrão.

## Arquivos

- **Banco:** `backend/database/kfka_expansao.sql` (novo: 14 tabelas, colunas novas em 5 tabelas, carga de demonstração com datas relativas ao dia de instalação).
- **API — novos:** `backend/src/routes/{perfil,pendencias,eventos,aulas,atividades,chamados,justificativas,documentos,ocorrencias}.routes.js`, `backend/src/schemas/expansao.js`, `backend/src/utils/{acesso,datas}.js`.
- **API — alterados:** `app.js` (rotas novas), `index.js` (cria o banco vazio e atualiza banco antigo sozinho), `db/setup.js` (roda os dois scripts), `routes/{auth,usuarios,escola,alunos,mensagens,boletim}.routes.js`, `schemas/index.js`.
- **Front — novos:** 15 páginas em `frontend/src/paginas/`, `componentes/{Icone,Interface,Formulario,Janela}.jsx`, `contexto/ConfirmarContext.jsx`, `hooks/{useApi,useFormulario}.js`, `util/{status,tema}.js`, `estilos/expansao.css`.
- **Front — alterados:** `App.jsx`, `main.jsx`, `LayoutApp.jsx`, `Basicos.jsx`, `AuthContext.jsx`, `api/cliente.js`, `Painel`, `Comunicacao`, `Revisao`, `Login`, `NotasFaltas`, `Privacidade`, `notas/Boletim`, `notas/Lancamentos`, `util/formato.js`, CSS (cores viraram variáveis).
- **Outros:** `backend/tests/expansao.test.js` (novo), `backend/tests/api.test.js` (ajustes), `package.json` (testes um arquivo por vez), `railway.json`, `README.md`, `ROTEIRO-DE-TESTE.md`.

## Como foi testado

O ambiente de desenvolvimento usado não tinha acesso ao npm nem a um MySQL. Para testar mesmo assim:

1. **API:** réplica fiel do `kfka_banco.sql` + `kfka_expansao.sql` em PostgreSQL (mesmas tabelas, restrições, triggers, views e carga) e adaptadores mínimos das bibliotecas. As consultas da API usam só SQL compatível com os dois bancos. Resultado: **25/25 testes de integração** (os 13 antigos + 12 novos, cobrindo permissões por perfil, validações e fluxos).
2. **Navegador (Chromium):** todas as telas dos 3 perfis sem erro de console, em desktop e celular (360–390 px, sem rolagem lateral), tema escuro e claro; **21 fluxos completos com cliques reais** (cadastrar aluno com validação, vincular responsável, desativar com confirmação, criar evento, gerar link e redefinir senha, analisar justificativa, responder chamado, finalizar aula com presença, publicar atividade e registrar entrega, ocorrência de saúde restrita, mensagem citando aluno, ciência no boletim, complementar justificativa, solicitar e abrir documento, abrir chamado, editar perfil e trocar tema).

**Falta confirmar num MySQL real** (`npm run db:setup`, `NODE_ENV=test npm test` e o `ROTEIRO-DE-TESTE.md`, seção 8) e o build com o Vite (`npm run build`).

## Limitações (dependem de integração externa)

- **Anexos** (atestados, materiais, comprovantes de ocorrência): não há armazenamento de arquivos. Atividades usam um link; justificativas orientam a entrega na secretaria.
- **E-mail:** a recuperação de senha usa link gerado pela coordenação; não há aviso por e-mail de boletim publicado ou mensagem nova.
- **Tempo real:** mensagens e contadores atualizam a cada 15–30 s (sem WebSocket).
- **PDF:** pelo "Imprimir / salvar como PDF" do navegador, com layout próprio de impressão (sem gerar arquivo no servidor).
- **Troca de professor** numa disciplina que já tem lançamentos/aulas/atividades é bloqueada (as chaves estrangeiras ligam os registros ao professor que os fez).
- **Ocorrências** não aparecem para as famílias (a escola entra em contato pelo mural), por escolha de privacidade.
- **Uma aula por turma/disciplina/dia** (aula dupla = um registro).
- Edição do texto e da média pela coordenação antes de publicar (RF06) e exportação CSV/XLSX (RF11) continuam pendentes.
