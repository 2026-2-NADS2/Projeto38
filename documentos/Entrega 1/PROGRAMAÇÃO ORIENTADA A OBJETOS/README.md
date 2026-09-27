Web API em C# (.NET) que estrutura o backend do sistema com classes, banco de dados relacional (SQLite) e disponibilização via servidor local, atendendo ao requisito de "upload para servidor local" da disciplina.

Reaproveita as classes de domínio desenvolvidas na Entrega 1 de Estrutura de Dados (Aluno e AlunoDB), agora expostas como uma API funcional em vez de uma aplicação console.

Tecnologias utilizadas
C# (.NET / ASP.NET Core Web API)
Microsoft.Data.Sqlite
SQLite (banco de dados relacional, arquivo alunos.db)
Swagger / Swashbuckle (documentação e testes dos endpoints)
Estrutura do projeto

PIpoo/
├── Models/
│   └── Aluno.cs            # Classe de domínio Aluno
├── Data/
│   └── AlunoDB.cs           # Acesso ao banco de dados (CRUD)
├── Controllers/
│   └── AlunoController.cs   # Classe orquestradora: integra o acesso a
│                             # dados com as requisições HTTP
└── Program.cs                # Configura e inicia o servidor local

Como executar
Certifique-se de ter o .NET SDK instalado (versão 8.0 ou superior).
Clone o repositório ou extraia o arquivo .zip.
Abra a solução no Visual Studio (ou um terminal na pasta do projeto).

Execute:
   dotnet restore
   dotnet run
   
O servidor sobe localmente e abre automaticamente em:
   https://localhost:<porta>/swagger
   
O banco de dados alunos.db é criado automaticamente na primeira execução, com a tabela Aluno já estruturada.
Endpoints disponíveis
Método	Rota	Descrição
GET	/api/Aluno	Lista todos os alunos
GET	/api/Aluno/{id}	Busca um aluno pelo Id
POST	/api/Aluno	Cadastra um novo aluno
PUT	/api/Aluno/{id}	Atualiza os dados de um aluno
DELETE	/api/Aluno/{id}	Remove um aluno

Todos os endpoints podem ser testados diretamente pela interface do Swagger (/swagger), usando o botão "Try it out".

A classe principal do sistema

O AlunoController cumpre o papel de classe orquestradora exigido pela disciplina: integra a camada de acesso a dados (AlunoDB) às requisições HTTP recebidas pelo servidor, garantindo o fluxo correto de cada operação (consultar, criar, atualizar e excluir alunos). O Program.cs complementa essa orquestração ao registrar as dependências (injeção do AlunoDB) e inicializar o servidor.

Aplicação do conhecimento de POO
Encapsulamento: propriedades com get/set na classe Aluno, com validação de regra de negócio no construtor (média entre 0 e 10).
Separação de responsabilidades: Models (dado), Data (acesso ao banco) e Controllers (orquestração das requisições) em camadas distintas.
Injeção de dependência: o AlunoDB é criado uma única vez e entregue ao AlunoController pelo próprio framework, em vez do Controller instanciá-lo diretamente.
Servidor local: a aplicação roda como um serviço via Kestrel, acessível em localhost, diferente de uma aplicação console que encerra após a execução.

Disciplina

Programação Orientada a Objetos - 2º Semestre ADS - FECAP - 2026
