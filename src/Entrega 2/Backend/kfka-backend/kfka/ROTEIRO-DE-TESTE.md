# Roteiro de teste — KFKA com MySQL

Use este roteiro na primeira execução com o MySQL de vocês e como ensaio da apresentação.
Marque cada item. Se algo falhar, anote a mensagem do terminal e da tela.

## 0. Preparação

- [ ] `npm install` terminou sem erros
- [ ] `.env` criado a partir do `backend/.env.example`, com `DB_USER`/`DB_PASSWORD` do seu MySQL (ou `DATABASE_URL`)
- [ ] `npm run db:setup` mostrou **"Script executado (152 comandos)"** (81 do `kfka_banco.sql` + 57 do `kfka_expansao.sql` + 14 do `kfka_adequacao.sql`) e **"Senha de demonstração gravada em 8 usuário(s)"**
- [ ] No Workbench: `SHOW TRIGGERS FROM kfka;` lista 6 triggers (4 do fluxo + 2 da auditoria), `SHOW FULL TABLES IN kfka WHERE Table_type = 'VIEW';` lista 6 views e `SHOW FULL TABLES IN kfka WHERE Table_type = 'BASE TABLE';` lista 33 tabelas
- [ ] `npm run dev` mostrou **"Servidor rodando em http://localhost:3000"**
- [ ] Em outro terminal, `npm run dev:web` abriu o React em **http://localhost:5173** (use este endereço no navegador)
- [ ] `npm run build` termina sem erros e, depois dele, `npm start` serve o site em http://localhost:3000
- [ ] http://localhost:3000/api/saude responde `"banco":"conectado"`
- [ ] A data de hoje está entre 01/11 e 15/12/2026 (se não, ajuste a tabela `bimestre`)

Senha de todos os usuários: `Senha@123`

## 1. Professor — lançamento (carlos.menezes@kfka.edu.br)

- [ ] O menu mostra Painel, Pendências, Calendário, Notas e avaliações, Aulas e frequência, Atividades, Ocorrências, Mural e Ajuda (sem Revisão nem Cadastros)
- [ ] Painel: cartões de rascunhos, devolvidos e aguardando, e a tabela de indicadores só com as disciplinas dele
- [ ] Notas e avaliações (/notas): escolha **6º A**, **Língua Portuguesa**, **4º bimestre** → aviso verde "Digitação do 4º bimestre aberta até 15/12/2026"
- [ ] Lucas aparece como **Rascunho** (veio da carga do script)
- [ ] No Gabriel, clique em "Enviar para revisão" sem preencher → aparece "Informe a média."
- [ ] Preencha média 6,5, faltas 2, um parecer e marque 2 tags → "Salvar rascunho" → status **Rascunho**
- [ ] "Enviar para revisão" → status **Enviado** e os campos ficam bloqueados
- [ ] "Histórico" mostra: criou como Rascunho → Rascunho → Enviado, com o nome do Carlos
- [ ] Troque para o **1º bimestre** → aviso amarelo "Digitação do 1º bimestre fechada" e nada editável

## 2. Coordenação — revisão (admin@kfka.edu.br)

- [ ] O menu mostra Revisão de boletins e Cadastros (Alunos, Professores, Turmas e disciplinas) e não mostra Notas e avaliações
- [ ] Painel: indicadores por turma/disciplina (view `vw_indicadores_turma_disciplina`) e barras de tags (view `vw_frequencia_tags`)
- [ ] Revisão → "Aguardando revisão": aparecem o Pedro (Matemática) e o Gabriel (Língua Portuguesa)
- [ ] No Gabriel, "Devolver" sem motivo → erro; com o motivo "Conferir o número de faltas." → o cartão some da lista
- [ ] Filtro "Devolvidos" → Gabriel e Beatriz (a Beatriz já veio devolvida na carga)
- [ ] "Histórico" do Gabriel mostra a devolução com o motivo e o nome da Marina

## 3. Professor corrige → Coordenação publica

- [ ] (Carlos) O Gabriel mostra a caixa "Devolvido pela coordenação: Conferir o número de faltas."
- [ ] Mude faltas para 1 → "Enviar para revisão"
- [ ] (Marina) Revisão → Gabriel → "Publicar" → o cartão some e aparece "Publicado: a família já pode ver."
- [ ] O histórico mostra Devolvido → Enviado (Carlos), Enviado → Em revisão e Em revisão → Publicado (Marina), e "Faltas: 2 → 1"

## 4. Responsável — boletim (luciana.andrade@email.com)

- [ ] Painel: "Meus filhos" com Gabriel e Laura
- [ ] Boletim: Gabriel tem 1º bimestre (Língua Portuguesa e Matemática, com ciência já confirmada na carga) e o 4º bimestre com a nota publicada no passo 3
- [ ] "Confirmar ciência" → escreva um retorno → o botão vira "✓ Ciente em …" com o texto
- [ ] "Imprimir / salvar PDF" abre a impressão sem menu, botões ou banners
- [ ] (Marina) Revisão → Publicados → Gabriel → "Retificar" com motivo → (Luciana) o 4º bimestre some do boletim

## 5. Cadastro e segurança

- [ ] /cadastro sem marcar a LGPD → "É preciso aceitar para criar a conta."
- [ ] Cadastro completo → entra no painel com "Nenhum aluno vinculado…"
- [ ] No Workbench: `SELECT * FROM responsavel ORDER BY id DESC LIMIT 1;` mostra telefone e `aceite_lgpd_em` preenchidos
- [ ] Sem login, abrir /painel → volta para o login; depois de entrar, volta para a tela pedida
- [ ] Professor abrindo /revisao → volta para o painel
- [ ] /qualquer-coisa mostra a página 404 do React; /api/qualquer-coisa responde JSON 404
- [ ] Botões Voltar/Avançar do navegador funcionam entre as telas
- [ ] Link “Política de Privacidade” (cadastro e aviso de cookies) abre /privacidade

## 6. Comunicação

- [ ] (Carlos) A conversa com a Ana aparece como "Resp. de Beatriz Ribeiro, Lucas Ribeiro" com 1 mensagem não lida
- [ ] Enviar mensagem com Enter funciona; Shift+Enter quebra a linha
- [ ] (Ana) Em "+ Nova conversa" só aparecem a coordenação e os professores

## 7. Celular (DevTools → modo responsivo, ou celular na mesma rede)

- [ ] O menu ☰ abre a gaveta; tocar fora ou apertar Esc fecha
- [ ] Os cartões de lançamento ficam em uma coluna e os campos não dão zoom ao tocar (iPhone)
- [ ] No chat, a lista e a conversa se alternam com o botão ←

## 8. Módulos novos (expansão)

As datas da carga da expansão são relativas ao dia em que o `db:setup` rodou ("semana passada", "daqui a 3 dias").

**Coordenação (admin@kfka.edu.br)**
- [ ] Painel mostra a faixa "N pendências"; Pendências lista revisões, cadastro incompleto do **Rafael Souza** (sem turma e sem responsável), chamados, justificativas, documentos e ocorrências — cada item abre a tela certa
- [ ] Alunos: "Novo aluno" sem preencher → erros embaixo dos campos; preencha → abre a aba Responsáveis; vincule `ana.ribeiro@email.com` (Mãe); "Desativar cadastro" pede confirmação; filtro "Inativos" mostra o aluno; "Reativar"
- [ ] Professores: abra Carlos → Disciplinas e turmas (com os dias da grade) → Histórico de vínculos → Acesso → "Gerar link de redefinição" → copie o link
- [ ] Abra o link numa janela anônima → defina a senha → entre com ela; abrir o link de novo → "Link inválido ou expirado"
- [ ] Turmas e disciplinas: nova turma, nova disciplina, "Professores e grade" (trocar o professor de Língua Portuguesa no 6º A é recusado porque já há lançamentos), Bimestres (edite as datas da digitação)
- [ ] Calendário: "Novo evento" com término antes do início → erro; salve; o evento aparece na grade e na agenda; "Somente equipe" não aparece para as famílias
- [ ] Justificativas: analise a do Lucas → "Pedir mais informações" sem mensagem → erro; com mensagem → salva
- [ ] Documentos: atenda o histórico da Beatriz → "Emitir e disponibilizar" → código de validação
- [ ] SAC: responda o chamado "Aviso por e-mail" com a situação "Aguardando o usuário"

**Professor (carlos.menezes@kfka.edu.br)**
- [ ] Pendências: "Aulas sem registro", "Registros de frequência incompletos" (aula de quarta em rascunho), "Relatórios não enviados"
- [ ] Aulas e frequência: abra a aula em rascunho → "Finalizar registro" sem marcar todos → aviso; "Todos presentes" → marque falta no Lucas (a justificativa da mãe aparece) → Finalizar → a aula fica bloqueada
- [ ] Atividades: "Nova atividade" com "Publicar agora" → Entregas → marque uma entrega → a barra de progresso muda
- [ ] Ocorrências: registre uma de "Saúde ou bem-estar" → fica restrita automaticamente; a do Gabriel (registrada por você) recebe uma atualização, mas a situação só muda pela coordenação
- [ ] Mural: nova conversa com a Ana, "Sobre o aluno: Lucas" → a etiqueta aparece na mensagem
- [ ] Ricardo (ricardo.tanaka@kfka.edu.br) não vê a ocorrência de saúde do Pedro

**Responsável (ana.ribeiro@email.com)**
- [ ] Pendências: boletim da Beatriz "não visualizado"; ao abrir o boletim dela, a pendência some
- [ ] Boletim: abas por filho, seleção do bimestre, quadro anual, situação acadêmica, indicadores (tags), "Imprimir / salvar PDF" com cabeçalho da escola
- [ ] Atividades: Lucas com "Crônica" pendente e "Lista de frações" concluída
- [ ] Justificativas: a escola pediu informações → "Complementar" → volta para Pendente
- [ ] Documentos: abra a declaração de matrícula disponível → imprimir/salvar PDF; solicite uma declaração de frequência
- [ ] Ajuda e suporte: busque "senha" nas perguntas frequentes; abra um chamado e acompanhe a conversa
- [ ] Meu perfil: trocar foto, telefone, senha (senha atual errada → erro no campo) e tema claro/escuro
- [ ] Mural: a Ana não vê outros responsáveis nem professores que não dão aula aos filhos dela
- [ ] Ana abrindo /alunos ou /ocorrencias → volta para o painel

## 9. Adequação aos requisitos (RF01–RF12 / RNF01–RNF07)

**Coordenação (admin@kfka.edu.br)**
- [ ] Revisão → Pedro → "Alterar": sem motivo aparece erro; com motivo, o cartão vira **Em revisão** com versão nova; o Histórico mostra a alteração e o motivo (RF06/RF07)
- [ ] Revisão → "Devolvidos" → Beatriz → "Cancelar registro" com motivo → aparece em "Cancelados"; não dá para publicar nem editar (RF06)
- [ ] Relatórios gerenciais: filtre a turma 6º A → os números mudam; aba Registros (paginada); aba Retornos das famílias mostra as observações com autor e data (RF10/RF12)
- [ ] "Exportar CSV" e "Exportar Excel" baixam os arquivos com os filtros da tela; abrem no Excel/LibreOffice com acentos corretos (RF11)
- [ ] Turmas e disciplinas → Bimestres: situação "Encerrado / Em andamento" e "Digitação aberta/encerrada"; "Novo ano letivo" cria 2027 com os 4 bimestres (RF04)
- [ ] Turmas e disciplinas → Áreas e tags: criar área e tag; tag usada não exclui (só desativa); área com disciplinas não exclui (RF02)
- [ ] Auditoria: aparecem login, alteração, cancelamento, exportação, ano letivo...; "Detalhes" mostra valor anterior → novo; nenhum registro tem senha (RNF06)
- [ ] Professores → Responsáveis → criar conta nova; desativar uma conta com a pessoa logada em outro navegador → a outra sessão cai na hora (RNF02)
- [ ] "Sair" e tentar usar o mesmo token (ex.: aba antiga) → volta para o login

**Responsável (ana.ribeiro@email.com)**
- [ ] Boletim → aba Lucas → "Baixar PDF": o arquivo tem só o que foi publicado (sem o rascunho do 4º bimestre) (RF09)
- [ ] Selecionar 4º bimestre (não publicado) → o botão "Baixar PDF" some
- [ ] Meu perfil → "Baixar meus dados": JSON com conta, alunos e relatórios publicados, sem senha (RNF03)
- [ ] Entrar com a conta criada pela coordenação → aparece "Antes de continuar" (termo LGPD); só depois do aceite o painel abre (RNF03)

**Professor (fernanda.lopes@kfka.edu.br)**
- [ ] Relatórios e retornos: só registros da Fernanda, sem botão de exportar; digitar /auditoria volta ao painel
- [ ] Só com o teclado: Tab (aparece "Pular para o conteúdo"), Tab até o menu, Enter abre a tela; nas abas, setas ← → trocam (RNF01)
- [ ] Em tablet (768 px) e celular (390 px) as telas não rolam para o lado (RNF01)

## Consultas úteis para mostrar na apresentação (Workbench)

```sql
SELECT * FROM vw_fila_revisao;
SELECT * FROM vw_relatorio_responsavel WHERE responsavel_id = 3;
SELECT acao, status_anterior, status_novo, faltas_anterior, faltas_nova, observacao, data_hora
  FROM historico_acompanhamento WHERE acompanhamento_id = (SELECT MAX(id) FROM acompanhamento)
 ORDER BY id;
-- Expansão
SELECT a.data, t.nome AS turma, d.nome AS disciplina, a.status,
       SUM(p.presente = FALSE) AS faltas, COUNT(p.aluno_id) AS marcados
  FROM aula a JOIN turma t ON t.id = a.turma_id JOIN disciplina d ON d.id = a.disciplina_id
  LEFT JOIN aula_presenca p ON p.aula_id = a.id GROUP BY a.id ORDER BY a.data DESC;
-- Adequação: auditoria (somente inclusão — UPDATE/DELETE são recusados pelo trigger)
SELECT data_hora, usuario_nome, acao, entidade, entidade_id, resultado, detalhes FROM auditoria ORDER BY id DESC LIMIT 20;
UPDATE auditoria SET acao = 'X' WHERE id = 1;   -- erro: "Registros de auditoria não podem ser alterados."
SELECT * FROM vw_retornos_responsaveis;
SELECT h.acao, t.nome, d.nome, u.nome AS por, h.data_hora FROM historico_vinculo h
  JOIN turma t ON t.id = h.turma_id JOIN disciplina d ON d.id = h.disciplina_id JOIN usuario u ON u.id = h.usuario_id
 ORDER BY h.data_hora DESC;
```
