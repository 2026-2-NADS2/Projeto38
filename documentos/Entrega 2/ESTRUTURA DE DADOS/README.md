# Estrutura de Dados — Entrega 2

**KFKA — Plataforma de Acompanhamento Escolar** · Equipe AlphaTech · FECAP · 2º semestre de ADS · 2026

## Sobre a entrega

A atividade pede um **mini-relatório** que mostre como o conhecimento de estrutura de dados foi aplicado na solução para otimizar a aplicação, com **trechos de código** que exemplifiquem esse conhecimento.

📄 **Documento da entrega:** [Relatorio de Estrutura de Dados PI.pdf](Relatorio%20de%20Estrutura%20de%20Dados%20PI.pdf)

## O que foi desenvolvido

A aplicação console em C# da Entrega 1 lia os alunos do banco (`AlunoDB`) e exibia uma `List` paginada, sem busca, filtro ou ordenação.

Na Entrega 2, os alunos continuam sendo lidos do banco **uma única vez**. Depois, ficam organizados em memória na estrutura mais adequada a cada operação do menu:

| Estrutura | Uso na aplicação | Custo |
| --- | --- | --- |
| `List` com paginação por índice | Exibir qualquer lista por páginas (`GetRange`) | O(1) para localizar a página |
| Listas pré-ordenadas | Alternar entre a ordem por nome e por média, sem reordenar | O(n log n) uma vez; troca em O(1) |
| Busca binária | Encontrar um aluno pelo nome e abrir a página em que ele está | O(log n) |
| `Dictionary` por ID e por turma | Buscar um aluno pelo ID e filtrar por turma | O(1) em média |
| `Stack` (pilha) | Opção "Voltar" para a tela anterior (LIFO) | O(1) por `Push`/`Pop` |

O relatório traz os principais trechos do `Program.cs`, cada um com a explicação do que foi feito:
1. paginação reutilizável;
2. montagem dos dicionários;
3. busca binária;
4. busca no menu;
5. filtro por turma e alternância de ordenação;
6. histórico com pilha.

## Relação com o projeto KFKA

A aplicação trabalha com os mesmos dados centrais da plataforma de acompanhamento escolar: alunos, turmas e médias. A paginação e a busca otimizadas correspondem às listagens de alunos que a plataforma exibe para a coordenação e os professores.

## Entrega anterior

Entrega 1 (simulação da listagem de alunos com paginação): [documentos/Entrega 1/ESTRUTURA DE DADOS](../../Entrega%201/ESTRUTURA%20DE%20DADOS)

## Equipe

Igor Araujo · Matheus Teixeira · Daniel Camara · Enzo Lemos
