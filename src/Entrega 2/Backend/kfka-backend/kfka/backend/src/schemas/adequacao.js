// schemas/adequacao.js — validação das funções da adequação aos requisitos:
// edição/cancelamento pela coordenação (RF06), áreas e tags (RF02), ano letivo com
// 4 bimestres (RF04), relatórios e exportação (RF10/RF11), auditoria (RNF06) e LGPD (RNF03).

const { z } = require('zod');

module.exports = ({ texto, idPositivo, opcional, data, dataHora }) => {
  const idOpcional = (campo) => idPositivo(campo).optional();

  // Paginação padrão das listas extensas (RNF05)
  const paginacao = {
    pagina: z.coerce.number().int().min(1, 'Página deve ser 1 ou mais.').default(1),
    por_pagina: z.coerce.number().int().min(1).max(100, 'Use no máximo 100 itens por página.').default(25),
  };

  const aceiteLgpd = z.object({
    aceite: z.literal(true, { errorMap: () => ({ message: 'É preciso aceitar o termo para continuar.' }) }),
  });

  // Mesmos limites do lançamento do professor (schemas.lancamento)
  const edicaoCoordenacao = z.object({
    media: z
      .number({ required_error: 'Média é obrigatória.', invalid_type_error: 'Média deve ser um número.' })
      .min(0, 'A média mínima é 0.')
      .max(10, 'A média máxima é 10.')
      .multipleOf(0.01, 'Use no máximo duas casas decimais.'),
    faltas: z
      .number({ invalid_type_error: 'Faltas deve ser um número.' })
      .int('Faltas deve ser um número inteiro.')
      .min(0, 'Faltas não pode ser negativo.')
      .max(200, 'Número de faltas muito alto.'),
    descricao: texto('Descrição', 5, 5000),
    tags: z
      .array(idPositivo('tag'), { invalid_type_error: 'Tags deve ser uma lista.' })
      .max(10, 'Use no máximo 10 tags.')
      .default([])
      .transform((l) => [...new Set(l)]),
    motivo: texto('Motivo da alteração', 5, 300),
    versao: z.number().int().positive().optional(),
  });

  const cancelamento = z.object({ motivo: texto('Motivo do cancelamento', 5, 500) });

  const area = z.object({ nome: texto('Nome da área', 2, 80) });

  const tag = z.object({
    nome: texto('Nome da tag', 2, 50),
    descricao: opcional('Descrição', 200),
    ativo: z.boolean().optional().default(true),
  });

  // Novo ano letivo: exatamente 4 bimestres, em ordem, sem sobreposição, dentro do ano
  const periodo = z.object({
    numero: z.coerce.number().int().min(1).max(4),
    data_inicio: data('Início do bimestre'),
    data_fim: data('Fim do bimestre'),
    digitacao_inicio: dataHora('Início da digitação'),
    digitacao_fim: dataHora('Fim da digitação'),
  });

  const anoLetivo = z
    .object({
      ano_letivo: z.coerce.number().int().min(2000, 'Ano inválido.').max(2100, 'Ano inválido.'),
      bimestres: z.array(periodo).length(4, 'Informe exatamente os 4 bimestres do ano.'),
    })
    .superRefine((d, ctx) => {
      const ordenados = [...d.bimestres].sort((a, b) => a.numero - b.numero);
      if (ordenados.map((b) => b.numero).join() !== '1,2,3,4') {
        ctx.addIssue({ code: 'custom', path: ['bimestres'], message: 'Os bimestres devem ser o 1º, 2º, 3º e 4º, sem repetir.' });
        return;
      }
      ordenados.forEach((b, i) => {
        const caminho = ['bimestres', i];
        if (b.data_fim < b.data_inicio) {
          ctx.addIssue({ code: 'custom', path: [...caminho, 'data_fim'], message: `${b.numero}º bimestre: o fim deve ser depois do início.` });
        }
        if (b.digitacao_fim <= b.digitacao_inicio) {
          ctx.addIssue({
            code: 'custom',
            path: [...caminho, 'digitacao_fim'],
            message: `${b.numero}º bimestre: o fim da digitação deve ser depois do início.`,
          });
        }
        if (!b.data_inicio.startsWith(String(d.ano_letivo)) || !b.data_fim.startsWith(String(d.ano_letivo))) {
          ctx.addIssue({ code: 'custom', path: [...caminho, 'data_inicio'], message: `${b.numero}º bimestre: as datas devem ser de ${d.ano_letivo}.` });
        }
        if (i > 0 && b.data_inicio <= ordenados[i - 1].data_fim) {
          ctx.addIssue({
            code: 'custom',
            path: [...caminho, 'data_inicio'],
            message: `${b.numero}º bimestre deve começar depois do fim do ${ordenados[i - 1].numero}º.`,
          });
        }
      });
    });

  const STATUS = ['rascunho', 'enviado', 'em_revisao', 'devolvido', 'publicado', 'cancelado'];

  const filtrosRelatorio = {
    ano_letivo: z.coerce.number().int().min(2000).max(2100).optional(),
    turma_id: idOpcional('turma_id'),
    disciplina_id: idOpcional('disciplina_id'),
    professor_id: idOpcional('professor_id'),
    bimestre: z.coerce.number().int().min(1, 'Bimestre de 1 a 4.').max(4, 'Bimestre de 1 a 4.').optional(),
    aluno_id: idOpcional('aluno_id'),
    tag_id: idOpcional('tag_id'),
    status: z.enum(STATUS, { errorMap: () => ({ message: 'Status inválido.' }) }).optional(),
  };

  const filtroRelatorio = z.object({ ...filtrosRelatorio, ...paginacao });

  const exportacao = z.object({
    ...filtrosRelatorio,
    formato: z.enum(['csv', 'xlsx'], { errorMap: () => ({ message: 'Formato deve ser csv ou xlsx.' }) }),
    conteudo: z
      .enum(['registros', 'indicadores', 'retornos'], { errorMap: () => ({ message: 'Conteúdo inválido.' }) })
      .default('registros'),
    com_observacao: z.enum(['0', '1']).optional(),
  });

  const filtroRetornos = z.object({
    ...filtrosRelatorio,
    com_observacao: z.enum(['0', '1']).optional(),
    ...paginacao,
  });

  const filtroAuditoria = z
    .object({
      usuario_id: idOpcional('usuario_id'),
      entidade: z.string().trim().max(60).regex(/^[a-z_]*$/, 'Entidade inválida.').optional(),
      acao: z.string().trim().max(60).optional(),
      resultado: z.enum(['SUCESSO', 'NEGADO', 'FALHA']).optional(),
      de: data('Data inicial').optional(),
      ate: data('Data final').optional(),
      ...paginacao,
    })
    .refine((d) => !d.de || !d.ate || d.de <= d.ate, { path: ['ate'], message: 'A data final deve ser depois da inicial.' });

  const pdfBoletim = z.object({
    aluno_id: idPositivo('aluno_id'),
    bimestre: z.coerce.number().int().min(1, 'Bimestre de 1 a 4.').max(4, 'Bimestre de 1 a 4.').optional(),
    ano_letivo: z.coerce.number().int().min(2000).max(2100).optional(),
  });

  return {
    paginacao: z.object(paginacao),
    aceiteLgpd,
    edicaoCoordenacao,
    cancelamento,
    area,
    tag,
    anoLetivo,
    filtroRelatorio,
    exportacao,
    filtroRetornos,
    filtroAuditoria,
    pdfBoletim,
  };
};
