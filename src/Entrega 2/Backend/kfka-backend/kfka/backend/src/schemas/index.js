// schemas/index.js — regras de validação dos dados recebidos pela API (Zod).
// Os limites espelham as colunas do kfka_banco.sql (VARCHAR, CHECK, ENUM).

const { z } = require('zod');

const texto = (campo, min, max) =>
  z
    .string({ required_error: `${campo} é obrigatório.`, invalid_type_error: `${campo} deve ser texto.` })
    .trim()
    .min(min, `${campo} deve ter pelo menos ${min} caractere(s).`)
    .max(max, `${campo} deve ter no máximo ${max} caracteres.`);

const email = z
  .string({ required_error: 'E-mail é obrigatório.' })
  .trim()
  .toLowerCase()
  .email('Informe um e-mail válido.')
  .max(150, 'E-mail deve ter no máximo 150 caracteres.');

const senhaForte = z
  .string({ required_error: 'Senha é obrigatória.' })
  .min(8, 'A senha deve ter pelo menos 8 caracteres.')
  .max(72, 'A senha deve ter no máximo 72 caracteres.')
  .regex(/[A-Za-z]/, 'A senha deve conter pelo menos uma letra.')
  .regex(/[0-9]/, 'A senha deve conter pelo menos um número.');

const telefone = z
  .string()
  .trim()
  .max(20, 'Telefone deve ter no máximo 20 caracteres.')
  .regex(/^[0-9()+\-\s]*$/, 'Telefone deve ter apenas números, espaços, parênteses, + e -.')
  .nullish()
  .transform((v) => v || null);

// Converte "12" -> 12 e rejeita valores que não são inteiros positivos
const idPositivo = (campo = 'id') =>
  z.coerce
    .number({ invalid_type_error: `${campo} deve ser um número.`, required_error: `${campo} é obrigatório.` })
    .int(`${campo} deve ser inteiro.`)
    .positive(`${campo} deve ser positivo.`);

const dataISO = (campo) =>
  z
    .string({ required_error: `${campo} é obrigatória.` })
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${campo} deve estar no formato AAAA-MM-DD.`)
    .refine((v) => !Number.isNaN(Date.parse(v)) && new Date(v) <= new Date(), `${campo} inválida.`);

const opcional = (campo, max) =>
  z
    .string({ invalid_type_error: `${campo} deve ser texto.` })
    .trim()
    .max(max, `${campo} deve ter no máximo ${max} caracteres.`)
    .nullish()
    .transform((v) => v || null);

// CPF (com ou sem pontuação) ou outro documento: 5 a 20 caracteres, letras, números, ponto, hífen e barra
const documento = z
  .string()
  .trim()
  .max(20, 'Documento deve ter no máximo 20 caracteres.')
  .regex(/^[0-9A-Za-z.\-/ ]*$/, 'Documento deve ter apenas letras, números, ponto, hífen ou barra.')
  .refine((v) => !v || v.replace(/[^0-9A-Za-z]/g, '').length >= 5, 'Documento muito curto.')
  .nullish()
  .transform((v) => v || null);

const emailOpcional = z
  .string()
  .trim()
  .toLowerCase()
  .max(150, 'E-mail deve ter no máximo 150 caracteres.')
  .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Informe um e-mail válido.')
  .nullish()
  .transform((v) => v || null);

// ---------------------------------------------------------------------------
// Autenticação e usuários
// ---------------------------------------------------------------------------
const cadastro = z.object({
  nome: texto('Nome', 3, 120),
  email,
  senha: senhaForte,
  telefone,
  aceite_lgpd: z.literal(true, {
    errorMap: () => ({ message: 'É preciso aceitar o uso dos dados (LGPD) para criar a conta.' }),
  }),
});

const login = z.object({
  email,
  senha: z.string({ required_error: 'Senha é obrigatória.' }).min(1, 'Senha é obrigatória.'),
});

const novoUsuario = z
  .object({
    nome: texto('Nome', 3, 120),
    email,
    senha: senhaForte,
    perfil: z.enum(['admin', 'professor', 'responsavel'], {
      errorMap: () => ({ message: 'Perfil deve ser admin, professor ou responsavel.' }),
    }),
    registro: z.string().trim().max(20, 'Registro deve ter no máximo 20 caracteres.').optional(),
    telefone,
    documento,
  })
  .superRefine((d, ctx) => {
    if (d.perfil === 'professor' && !d.registro) {
      ctx.addIssue({ code: 'custom', path: ['registro'], message: 'Registro funcional é obrigatório para professor.' });
    }
  });

// ---------------------------------------------------------------------------
// Turmas e alunos
// ---------------------------------------------------------------------------
const turma = z.object({
  nome: texto('Nome da turma', 2, 20),
  serie: z.coerce.number().int().min(1, 'Série de 1 a 9.').max(9, 'Série de 1 a 9.'),
  ano_letivo: z.coerce.number().int().min(2000).max(2100).optional(), // padrão: ANO_LETIVO do servidor
  turno: z.enum(['MANHA', 'TARDE', 'INTEGRAL'], { errorMap: () => ({ message: 'Turno deve ser MANHA, TARDE ou INTEGRAL.' }) }),
});

const aluno = z.object({
  nome: texto('Nome', 3, 120),
  matricula: texto('Matrícula', 1, 20),
  data_nascimento: dataISO('Data de nascimento'),
  turma_id: idPositivo('turma_id'),
  documento,
  email: emailOpcional,
  telefone,
  endereco: opcional('Endereço', 200),
});

const vinculoResponsavel = z.object({
  email,
  parentesco: texto('Parentesco', 2, 30),
  autorizado: z.boolean().optional().default(true),
});

const filtroAlunos = z.object({
  turma_id: idPositivo('turma_id').optional(),
  busca: z.string().trim().max(60).optional(),
  situacao: z.enum(['ativos', 'inativos', 'todos']).default('ativos'),
  // Paginação opcional (a tela de alunos usa; as listas curtas dos outros módulos não)
  pagina: z.coerce.number().int().min(1).optional(),
  por_pagina: z.coerce.number().int().min(1).max(100).default(25),
});

const ativacao = z.object({ ativo: z.boolean({ required_error: 'Informe ativo: true ou false.' }) });

const paramId = z.object({ id: idPositivo() });

// ---------------------------------------------------------------------------
// Acompanhamento bimestral
// ---------------------------------------------------------------------------
const filtroLancamentos = z.object({
  turma_id: idPositivo('turma_id'),
  disciplina_id: idPositivo('disciplina_id'),
  bimestre_id: idPositivo('bimestre_id'),
});

const lancamento = z.object({
  aluno_id: idPositivo('aluno_id'),
  disciplina_id: idPositivo('disciplina_id'),
  bimestre_id: idPositivo('bimestre_id'),
  media: z
    .number({ required_error: 'Média é obrigatória.', invalid_type_error: 'Média deve ser um número.' })
    .min(0, 'A média mínima é 0.')
    .max(10, 'A média máxima é 10.')
    .multipleOf(0.01, 'Use no máximo duas casas decimais.'),
  faltas: z
    .number({ invalid_type_error: 'Faltas deve ser um número.' })
    .int('Faltas deve ser um número inteiro.')
    .min(0, 'Faltas não pode ser negativo.')
    .max(200, 'Número de faltas muito alto.')
    .default(0),
  descricao: texto('Descrição', 5, 5000),
  tags: z
    .array(idPositivo('tag'), { invalid_type_error: 'Tags deve ser uma lista.' })
    .max(10, 'Use no máximo 10 tags.')
    .default([])
    .transform((lista) => [...new Set(lista)]),
  enviar: z.boolean().default(false),
});

const filtroFila = z.object({
  status: z.enum(['pendentes', 'devolvidos', 'publicados', 'rascunhos', 'cancelados']).default('pendentes'),
});

const devolucao = z.object({ motivo: texto('Motivo', 5, 500) });

const retificacao = z.object({ motivo: texto('Motivo', 5, 500) });

const ciencia = z.object({
  observacao: z
    .string()
    .trim()
    .max(1000, 'O retorno deve ter no máximo 1000 caracteres.')
    .optional()
    .transform((v) => v || null),
});

// ---------------------------------------------------------------------------
// Mensagens
// ---------------------------------------------------------------------------
const mensagem = z.object({
  destinatario_id: idPositivo('destinatario_id'),
  texto: texto('Mensagem', 1, 2000),
  aluno_id: idPositivo('aluno_id').nullish().transform((v) => v ?? null),
});

const paramContato = z.object({ usuarioId: idPositivo('usuarioId') });

const expansao = require('./expansao')({ texto, email, senhaForte, telefone, idPositivo, opcional, documento });
const { _aux, ...schemasExpansao } = expansao;

module.exports = {
  ...schemasExpansao,
  ...require('./adequacao')({ texto, idPositivo, opcional, ..._aux }),
  ativacao,
  cadastro,
  login,
  novoUsuario,
  turma,
  aluno,
  vinculoResponsavel,
  filtroAlunos,
  paramId,
  filtroLancamentos,
  lancamento,
  filtroFila,
  devolucao,
  retificacao,
  ciencia,
  mensagem,
  paramContato,
};
