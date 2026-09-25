
# KFKA – Plataforma de Acompanhamento Escolar

Projeto Interdisciplinar desenvolvido pelos alunos do curso de **Análise e Desenvolvimento de Sistemas (ADS)** da **FECAP**.

## 📚 Sobre o projeto

O **KFKA** é uma plataforma web responsiva desenvolvida para auxiliar no acompanhamento do desempenho de alunos do Ensino Fundamental.

O sistema permite o gerenciamento de informações escolares, acompanhamento de alunos, disciplinas, turmas, professores e resultados por bimestre.

## 🎯 Objetivo

Desenvolver uma plataforma que facilite o acompanhamento escolar, permitindo que professores registrem informações sobre o desempenho dos alunos e que responsáveis possam consultar essas informações.

## 🗄️ Banco de Dados

O banco de dados foi desenvolvido em **Oracle SQL** e possui as principais entidades necessárias para o funcionamento da plataforma:

* Turma
* Aluno
* Professor
* Disciplina
* Bimestre
* Acompanhamento

Foram utilizadas:

* Tabelas e relacionamentos
* Chaves primárias e estrangeiras
* Constraints para integridade dos dados
* Sequences para geração dos identificadores
* Índices para melhorar o desempenho das consultas
* View para consultas de desempenho
* Dados de teste para validação do banco

## 🔎 Consultas

Foram desenvolvidas consultas SQL para:

* Buscar alunos pelo nome;
* Consultar alunos de uma turma;
* Consultar o acompanhamento de um aluno;
* Consultar acompanhamentos por disciplina;
* Identificar alunos em recuperação;
* Consultar acompanhamentos por bimestre.

## 📁 Estrutura do projeto

```text
KFKA/
│
├── Banco de Dados/
│   ├── criacao_tabelas.sql
│   ├── insercao_dados.sql
│   ├── consultas.sql
│   ├── indices.sql
│   └── views.sql
│
├── Documentação/
│   └── N1_Banco_de_Dados.pdf
│
└── README.md
```

## 🛠️ Tecnologias

* Oracle Database
* SQL
* Git
* GitHub

## 👨‍💻 Projeto Acadêmico

Projeto desenvolvido como parte da disciplina de **Banco de Dados** do Projeto Interdisciplinar do curso de **ADS – FECAP**.

**Ano:** 2026
**Semestre:** 2º semestre

* **Igor Araújo**
* **Enzo Lemos**	 
* **Matheus Teixeira Lima**
* **Daniel Câmara**
