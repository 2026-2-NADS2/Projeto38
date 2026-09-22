# PI Entrega 01 - Estrutura de Dados
## Simulação de Listagem de Alunos (Paginação)

### Descrição
Aplicação console em C# que simula a paginação de uma listagem de alunos,
utilizando uma lista (`List<Aluno>`) populada a partir de um banco de dados
relacional SQLite.

### Tecnologias utilizadas
- C# (.NET)
- Microsoft.Data.Sqlite
- SQLite (banco de dados relacional, arquivo `alunos.db`)

### Estrutura do projeto

PIEstruturaDeDados/
├── Data/
│ └── AlunoDB.cs # Acesso ao banco de dados (CRUD)
├── Models/
│ └── Aluno.cs # Classe de domínio Aluno
└── Program.cs # Ponto de entrada e lógica de paginação


### Como executar
1. Certifique-se de ter o .NET SDK instalado (versão 6.0 ou superior).
2. Clone o repositório ou extraia o arquivo `.zip`.
3. Abra um terminal na pasta do projeto.
4. Execute:

dotnet restore
dotnet run

5. O banco de dados `alunos.db` é criado automaticamente na primeira
   execução, já populado com 15 alunos fictícios.

### Como usar
Ao rodar a aplicação, um menu interativo é exibido no console:
- `1` - Próxima página
- `2` - Página anterior
- `3` - Primeira página
- `4` - Última página
- `5` - Sair

Cada página exibe 4 alunos por vez (Nome, Turma e Média).

### Aplicação do conhecimento de Estrutura de Dados
- Uso de `List<Aluno>` como coleção principal para armazenar os dados
  carregados do banco.
- Implementação de paginação manual sobre a lista, calculando os índices
  de início e fim de cada página (`inicio` e `fim`).
- Cálculo do total de páginas com `Math.Ceiling`, garantindo navegação
  consistente independentemente do tamanho da lista.

### Disciplina
Estrutura de Dados - 2º Semestre ADS - FECAP - 2026
