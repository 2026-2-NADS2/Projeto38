# Banco de Dados — Entrega 2

**KFKA — Plataforma de Acompanhamento Escolar** · Equipe AlphaTech · FECAP · 2º semestre de ADS · 2026

## Sobre a entrega

A atividade pede um documento com a **criação de pelo menos uma view englobando consultas**.

O banco MySQL do projeto tem **seis views**, criadas no script da equipe. Elas reúnem as junções entre as tabelas do acompanhamento escolar e aplicam regras de negócio direto no banco. As views são usadas pela API do sistema.

📄 **Documento da entrega:** [KFKA_AlphaTech_BancoDeDados_Entrega2.pdf](KFKA_AlphaTech_BancoDeDados_Entrega2.pdf)

## Views implementadas

| View | O que faz |
| --- | --- |
| `vw_acompanhamento_completo` | Junta as tabelas do acompanhamento (aluno, turma, disciplina, área, professor, bimestre, revisor e tags) em uma visão completa. É a base das outras views |
| `vw_relatorio_responsavel` | Boletim do responsável: só registros **publicados** e só de alunos com **vínculo autorizado** |
| `vw_fila_revisao` | Registros aguardando a coordenação e há quantas horas foram enviados |
| `vw_indicadores_turma_disciplina` | Médias, menor e maior nota, alunos abaixo de 6 e total de faltas por turma, disciplina e bimestre |
| `vw_frequencia_tags` | Quantas vezes cada tag de desempenho foi usada por turma e bimestre |
| `vw_retornos_responsaveis` | Confirmações de ciência e observações enviadas pelas famílias |

## Exemplo de consulta

```sql
SELECT aluno, bimestre, disciplina, professor, media, faltas, tags
  FROM vw_relatorio_responsavel
 WHERE responsavel_id = 1 AND ano_letivo = 2026
 ORDER BY aluno, bimestre, disciplina;
```

A consulta devolve só o que a família pode ver, sem precisar repetir os filtros de status e de vínculo. Os resultados de exemplo estão no documento da entrega.

## Uso no sistema

- `vw_relatorio_responsavel`: boletim, PDF e confirmação de ciência do responsável.
- `vw_acompanhamento_completo`: fila de revisão, histórico, documentos e pendências.
- `vw_indicadores_turma_disciplina` e `vw_frequencia_tags`: painel da coordenação e do professor.

## Onde está o código

O código SQL das views está em [`kfka_banco.sql`](../../../src/Entrega%202/Backend/kfka-backend/kfka/backend/database/kfka_banco.sql), seção 5 ("VIEWS"), a partir da linha 418.

## Equipe

Igor Araujo · Matheus Teixeira · Daniel Camara · Enzo Lemos
