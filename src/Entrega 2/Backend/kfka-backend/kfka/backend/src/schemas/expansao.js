// schemas/expansao.js — validação dos módulos novos (perfil, calendário, aulas,
// atividades, SAC, justificativas, documentos, ocorrências, gestão escolar).
// Recebe os blocos básicos do schemas/index.js para manter as mesmas mensagens.

const { z } = require('zod');
const { hoje: hojeLocal } = require('../utils/datas');

module.exports = ({ texto, senhaForte, telefone, idPositivo, opcional, documento }) => {
  // Data no formato AAAA-MM-DD que existe de verdade (rejeita 2026-02-31)
  const data = (campo) =>
    z
      .string({ required_error: `${campo} é obrigatória.`, invalid_type_error: `${campo} deve ser texto.` })
      .regex(/^\d{4}-\d{2}-\d{2}$/, `${campo} deve estar no formato AAAA-MM-DD.`)
      .refine((v) => {
        const d = new Date(`${v}T12:00:00Z`);
        return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
      }, `${campo} inválida.`);

  const hora = (campo) =>
    z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, `${campo} deve estar no formato HH:MM.`)
      .nullish()
      .transform((v) => (v ? v.slice(0, 5) : null));

  // "2026-11-10T23:59" (campo datetime-local do HTML)
  const dataHora = (campo) =>
    z
      .string({ required_error: `${campo} é obrigatório.` })
      .regex(/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/, `${campo} deve ter data e hora.`)
      .refine((v) => !Number.isNaN(Date.parse(v.replace(' ', 'T'))), `${campo} inválido.`)
      .transform((v) => `${v.replace('T', ' ').slice(0, 16)}:00`);

  const idOpcional = (campo) => idPositivo(campo).nullish().transform((v) => v ?? null);

  const url = z
    .string()
    .trim()
    .max(500, 'O link deve ter no máximo 500 caracteres.')
    .refine((v) => !v || /^https?:\/\/[^\s]+$/i.test(v), 'Informe um link que comece com http:// ou https://.')
    .nullish()
    .transform((v) => v || null);

  // -------------------------------------------------------------------------
  // Perfil e conta
  // -------------------------------------------------------------------------
  // Foto: data URL de imagem pequena (o navegador redimensiona antes de enviar)
  const foto = z
    .string()
    .max(90000, 'A foto é grande demais. Escolha outra imagem.')
    .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/, 'Formato de imagem inválido.')
    .nullable()
    .optional();

  const perfil = z.object({
    nome: texto('Nome', 3, 120).optional(),
    telefone,
    foto,
  });

  const trocaSenha = z
    .object({
      senha_atual: z.string({ required_error: 'Informe a senha atual.' }).min(1, 'Informe a senha atual.'),
      nova_senha: senhaForte,
    })
    .refine((d) => d.senha_atual !== d.nova_senha, {
      path: ['nova_senha'],
      message: 'A nova senha deve ser diferente da atual.',
    });

  const redefinirSenha = z.object({
    token: z.string({ required_error: 'Link inválido.' }).regex(/^[a-f0-9]{48}$/, 'Link inválido ou incompleto.'),
    senha: senhaForte,
  });

  // -------------------------------------------------------------------------
  // Gestão escolar (admin)
  // -------------------------------------------------------------------------
  const edicaoUsuario = z.object({
    nome: texto('Nome', 3, 120),
    email: z.string().trim().toLowerCase().email('Informe um e-mail válido.').max(150),
    telefone,
    registro: z.string().trim().max(20, 'Registro deve ter no máximo 20 caracteres.').nullish(),
    documento,
  });

  const disciplina = z.object({
    nome: texto('Nome da disciplina', 2, 80),
    area_id: idPositivo('area_id'),
    ativo: z.boolean().optional().default(true),
  });

  const edicaoTurma = z.object({
    nome: texto('Nome da turma', 2, 20),
    serie: z.coerce.number().int().min(1, 'Série de 1 a 9.').max(9, 'Série de 1 a 9.'),
    turno: z.enum(['MANHA', 'TARDE', 'INTEGRAL'], { errorMap: () => ({ message: 'Turno inválido.' }) }),
    ativo: z.boolean().optional().default(true),
  });

  const vinculo = z.object({
    turma_id: idPositivo('turma_id'),
    disciplina_id: idPositivo('disciplina_id'),
    professor_id: idPositivo('professor_id'),
    dias: z
      .array(z.number().int().min(1).max(6), { invalid_type_error: 'Dias da semana deve ser uma lista.' })
      .max(6)
      .default([])
      .transform((l) => [...new Set(l)].sort()),
  });

  const bimestre = z
    .object({
      data_inicio: data('Início do bimestre'),
      data_fim: data('Fim do bimestre'),
      digitacao_inicio: dataHora('Início da digitação'),
      digitacao_fim: dataHora('Fim da digitação'),
    })
    .superRefine((d, ctx) => {
      if (d.data_fim < d.data_inicio) {
        ctx.addIssue({ code: 'custom', path: ['data_fim'], message: 'O fim do bimestre deve ser depois do início.' });
      }
      if (d.digitacao_fim <= d.digitacao_inicio) {
        ctx.addIssue({ code: 'custom', path: ['digitacao_fim'], message: 'O fim da digitação deve ser depois do início.' });
      }
    });

  // -------------------------------------------------------------------------
  // Calendário
  // -------------------------------------------------------------------------
  const TIPOS_EVENTO = ['EVENTO', 'PROVA', 'ATIVIDADE', 'REUNIAO', 'FERIADO', 'PRAZO'];

  const evento = z
    .object({
      titulo: texto('Título', 3, 120),
      descricao: opcional('Descrição', 1000),
      tipo: z.enum(TIPOS_EVENTO, { errorMap: () => ({ message: 'Tipo de evento inválido.' }) }),
      data_inicio: data('Data'),
      data_fim: data('Data final').nullish().transform((v) => v || null),
      hora_inicio: hora('Hora de início'),
      hora_fim: hora('Hora de término'),
      turma_id: idOpcional('turma_id'),
      disciplina_id: idOpcional('disciplina_id'),
      publico: z.enum(['TODOS', 'EQUIPE']).default('TODOS'),
    })
    .superRefine((d, ctx) => {
      if (d.data_fim && d.data_fim < d.data_inicio) {
        ctx.addIssue({ code: 'custom', path: ['data_fim'], message: 'A data final deve ser igual ou depois da inicial.' });
      }
      if (d.hora_inicio && d.hora_fim && (!d.data_fim || d.data_fim === d.data_inicio) && d.hora_fim <= d.hora_inicio) {
        ctx.addIssue({ code: 'custom', path: ['hora_fim'], message: 'O horário de término deve ser depois do início.' });
      }
    });

  const filtroEventos = z
    .object({
      inicio: data('Início do período'),
      fim: data('Fim do período'),
      turma_id: idPositivo('turma_id').optional(),
      aluno_id: idPositivo('aluno_id').optional(),
      tipo: z.string().max(80).optional(), // lista separada por vírgula
    })
    .refine((d) => d.fim >= d.inicio, { path: ['fim'], message: 'Período inválido.' })
    .refine((d) => (Date.parse(d.fim) - Date.parse(d.inicio)) / 86400000 <= 62, {
      path: ['fim'],
      message: 'Consulte no máximo dois meses por vez.',
    });

  // -------------------------------------------------------------------------
  // Relatório por aula
  // -------------------------------------------------------------------------
  const aula = z.object({
    turma_id: idPositivo('turma_id'),
    disciplina_id: idPositivo('disciplina_id'),
    data: data('Data da aula').refine((v) => v <= hojeLocal(), 'A data da aula não pode estar no futuro.'),
    conteudo: texto('Conteúdo ministrado', 3, 300),
    descricao: opcional('Descrição', 5000),
    atividades: opcional('Atividades realizadas', 5000),
    observacoes: opcional('Observações', 5000),
    presencas: z
      .array(
        z.object({
          aluno_id: idPositivo('aluno_id'),
          presente: z.boolean({ invalid_type_error: 'Presença deve ser verdadeiro ou falso.' }),
          observacao: opcional('Observação', 200),
        })
      )
      .max(80)
      .default([]),
    finalizar: z.boolean().default(false),
  });

  const filtroAulas = z.object({
    turma_id: idPositivo('turma_id').optional(),
    disciplina_id: idPositivo('disciplina_id').optional(),
    status: z.enum(['RASCUNHO', 'FINALIZADA']).optional(),
  });

  // -------------------------------------------------------------------------
  // Atividades
  // -------------------------------------------------------------------------
  const atividade = z.object({
    turma_id: idPositivo('turma_id'),
    disciplina_id: idPositivo('disciplina_id'),
    titulo: texto('Título', 3, 150),
    descricao: texto('Descrição', 5, 5000),
    link_material: url,
    prazo: dataHora('Prazo de entrega'),
    publicar: z.boolean().default(false),
  });

  const statusAtividade = z.object({
    status: z.enum(['PUBLICADA', 'ENCERRADA', 'CANCELADA'], { errorMap: () => ({ message: 'Situação inválida.' }) }),
  });

  const entregas = z.object({
    entregas: z
      .array(
        z.object({
          aluno_id: idPositivo('aluno_id'),
          situacao: z.enum(['PENDENTE', 'ENTREGUE', 'ENTREGUE_ATRASO', 'NAO_ENTREGUE']),
        })
      )
      .min(1, 'Informe ao menos um aluno.')
      .max(80),
  });

  const filtroAtividades = z.object({
    turma_id: idPositivo('turma_id').optional(),
    aluno_id: idPositivo('aluno_id').optional(),
    situacao: z.enum(['todas', 'pendentes', 'concluidas', 'atrasadas', 'rascunhos', 'encerradas']).default('todas'),
  });

  // -------------------------------------------------------------------------
  // SAC
  // -------------------------------------------------------------------------
  const CATEGORIAS_CHAMADO = ['ACESSO', 'BOLETIM', 'COMUNICACAO', 'CADASTRO', 'DOCUMENTOS', 'SUGESTAO', 'LGPD', 'OUTRO'];
  const chamado = z.object({
    categoria: z.enum(CATEGORIAS_CHAMADO, { errorMap: () => ({ message: 'Escolha a categoria do problema.' }) }),
    assunto: texto('Assunto', 5, 120),
    descricao: texto('Descrição', 10, 3000),
  });
  const interacaoChamado = z.object({
    texto: texto('Mensagem', 2, 3000),
    status: z.enum(['ABERTO', 'EM_ATENDIMENTO', 'AGUARDANDO_USUARIO', 'RESOLVIDO', 'FECHADO']).optional(),
  });
  const statusChamado = z.object({
    status: z.enum(['ABERTO', 'EM_ATENDIMENTO', 'AGUARDANDO_USUARIO', 'RESOLVIDO', 'FECHADO'], {
      errorMap: () => ({ message: 'Situação inválida.' }),
    }),
  });

  // -------------------------------------------------------------------------
  // Justificativas de faltas
  // -------------------------------------------------------------------------
  const MOTIVOS = ['SAUDE', 'CONSULTA', 'FAMILIAR', 'TRANSPORTE', 'LUTO', 'OUTRO'];
  const justificativa = z
    .object({
      aluno_id: idPositivo('aluno_id'),
      data_inicio: data('Data da falta').refine((v) => v <= hojeLocal(), 'A data da falta não pode estar no futuro.'),
      data_fim: data('Data final').nullish(),
      motivo: z.enum(MOTIVOS, { errorMap: () => ({ message: 'Escolha o motivo da ausência.' }) }),
      descricao: texto('Descrição', 5, 1000),
    })
    .transform((d) => ({ ...d, data_fim: d.data_fim || d.data_inicio }))
    .superRefine((d, ctx) => {
      if (d.data_fim < d.data_inicio) {
        ctx.addIssue({ code: 'custom', path: ['data_fim'], message: 'A data final deve ser igual ou depois da inicial.' });
      }
      if (d.data_fim > hojeLocal()) {
        ctx.addIssue({ code: 'custom', path: ['data_fim'], message: 'A data final não pode estar no futuro.' });
      }
      if ((Date.parse(d.data_fim) - Date.parse(d.data_inicio)) / 86400000 > 30) {
        ctx.addIssue({ code: 'custom', path: ['data_fim'], message: 'Para mais de 30 dias, procure a secretaria.' });
      }
    });

  const analiseJustificativa = z
    .object({
      status: z.enum(['EM_ANALISE', 'APROVADA', 'RECUSADA', 'NECESSITA_INFO'], {
        errorMap: () => ({ message: 'Escolha a decisão.' }),
      }),
      parecer: opcional('Parecer', 500),
    })
    .superRefine((d, ctx) => {
      if (['RECUSADA', 'NECESSITA_INFO'].includes(d.status) && (!d.parecer || d.parecer.length < 5)) {
        ctx.addIssue({ code: 'custom', path: ['parecer'], message: 'Explique o motivo para a família (mínimo 5 caracteres).' });
      }
    });

  // -------------------------------------------------------------------------
  // Documentos
  // -------------------------------------------------------------------------
  const TIPOS_DOC = ['DECLARACAO_MATRICULA', 'DECLARACAO_FREQUENCIA', 'HISTORICO_ESCOLAR', 'BOLETIM', 'OUTRO'];
  const solicitacaoDocumento = z
    .object({
      aluno_id: idPositivo('aluno_id'),
      tipo: z.enum(TIPOS_DOC, { errorMap: () => ({ message: 'Escolha o documento.' }) }),
      finalidade: opcional('Finalidade', 300),
    })
    .superRefine((d, ctx) => {
      if (d.tipo === 'OUTRO' && (!d.finalidade || d.finalidade.length < 5)) {
        ctx.addIssue({ code: 'custom', path: ['finalidade'], message: 'Descreva qual documento você precisa.' });
      }
    });

  const atendimentoDocumento = z
    .object({
      status: z.enum(['EM_ANALISE', 'DISPONIVEL', 'RECUSADO'], { errorMap: () => ({ message: 'Situação inválida.' }) }),
      justificativa: opcional('Justificativa', 500),
    })
    .superRefine((d, ctx) => {
      if (d.status === 'RECUSADO' && (!d.justificativa || d.justificativa.length < 5)) {
        ctx.addIssue({ code: 'custom', path: ['justificativa'], message: 'Informe o motivo da recusa (mínimo 5 caracteres).' });
      }
    });

  // -------------------------------------------------------------------------
  // Ocorrências
  // -------------------------------------------------------------------------
  const CATEGORIAS_OC = ['COMPORTAMENTO', 'DISCIPLINA', 'CONVIVENCIA', 'SAUDE', 'ADMINISTRATIVA', 'OUTRA'];
  const STATUS_OC = ['ABERTA', 'EM_ACOMPANHAMENTO', 'RESOLVIDA', 'ARQUIVADA'];
  const ocorrencia = z.object({
    aluno_id: idPositivo('aluno_id'),
    data_hora: dataHora('Data e horário').refine(
      (v) => v.slice(0, 10) <= hojeLocal(),
      'A data da ocorrência não pode estar no futuro.'
    ),
    categoria: z.enum(CATEGORIAS_OC, { errorMap: () => ({ message: 'Escolha a categoria.' }) }),
    descricao: texto('Descrição', 10, 5000),
    providencias: opcional('Providências', 5000),
    restrita: z.boolean().default(false),
  });
  const atualizacaoOcorrencia = z.object({
    texto: texto('Atualização', 3, 2000),
    status: z.enum(STATUS_OC).optional(),
    providencias: z.string().trim().max(5000, 'Providências deve ter no máximo 5000 caracteres.').optional(),
  });
  const filtroOcorrencias = z.object({
    status: z.enum(STATUS_OC).optional(),
    categoria: z.enum(CATEGORIAS_OC).optional(),
    aluno_id: idPositivo('aluno_id').optional(),
  });

  return {
    perfil,
    trocaSenha,
    redefinirSenha,
    edicaoUsuario,
    disciplina,
    edicaoTurma,
    vinculo,
    bimestre,
    evento,
    filtroEventos,
    aula,
    filtroAulas,
    atividade,
    statusAtividade,
    entregas,
    filtroAtividades,
    chamado,
    interacaoChamado,
    statusChamado,
    justificativa,
    analiseJustificativa,
    solicitacaoDocumento,
    atendimentoDocumento,
    ocorrencia,
    atualizacaoOcorrencia,
    filtroOcorrencias,
    TIPOS_EVENTO,
    _aux: { data, dataHora }, // reaproveitados por schemas/adequacao.js
  };
};

