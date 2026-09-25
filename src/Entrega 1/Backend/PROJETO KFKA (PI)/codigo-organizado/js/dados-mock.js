// dados-mock.js — base de dados simulada (sem back-end real)

const alunos = [
  {
    id: 1,
    nome: "Ana Silva",
    turma: "9º A",
    notas: { "1º Bim": 8.5, "2º Bim": 7.0, "3º Bim": null, "4º Bim": null },
    faltas: 2,
    status: "Validado"
  },
  {
    id: 2,
    nome: "Bruno Lima",
    turma: "9º A",
    notas: { "1º Bim": 6.0, "2º Bim": 9.0, "3º Bim": null, "4º Bim": null },
    faltas: 5,
    status: "Pendente"
  },
  {
    id: 3,
    nome: "Carla Souza",
    turma: "9º B",
    notas: { "1º Bim": 7.5, "2º Bim": 8.0, "3º Bim": null, "4º Bim": null },
    faltas: 0,
    status: "Validado"
  },
  {
    id: 4,
    nome: "Diego Alves",
    turma: "9º B",
    notas: { "1º Bim": 5.5, "2º Bim": 6.5, "3º Bim": null, "4º Bim": null },
    faltas: 8,
    status: "Pendente"
  },
  {
    id: 5,
    nome: "Elisa Prado",
    turma: "9º A",
    notas: { "1º Bim": 9.0, "2º Bim": 9.5, "3º Bim": null, "4º Bim": null },
    faltas: 1,
    status: "Validado"
  }
];

const mensagens = [
  {
    id: 1,
    contato: "Responsável — Ana Silva",
    ultimaMensagem: "Obrigada pelo retorno sobre a prova de matemática!",
    hora: "09:42",
    naoLida: false
  },
  {
    id: 2,
    contato: "Responsável — Bruno Lima",
    ultimaMensagem: "Ele vai poder repor a atividade essa semana?",
    hora: "08:15",
    naoLida: true
  },
  {
    id: 3,
    contato: "Coordenação Pedagógica",
    ultimaMensagem: "As notas do 2º bimestre já podem ser validadas.",
    hora: "Ontem",
    naoLida: true
  },
  {
    id: 4,
    contato: "Responsável — Diego Alves",
    ultimaMensagem: "Bom dia, gostaria de agendar uma conversa.",
    hora: "Ontem",
    naoLida: false
  }
];

// Resumo usado no Dashboard
function getResumoTurmas() {
  const totalAlunos = alunos.length;
  const pendentes = alunos.filter(a => a.status === "Pendente").length;
  const mediaFaltas = (alunos.reduce((s, a) => s + a.faltas, 0) / totalAlunos).toFixed(1);
  return { totalAlunos, pendentes, mediaFaltas };
}
