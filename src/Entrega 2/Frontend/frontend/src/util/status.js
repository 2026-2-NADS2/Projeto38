// status.js — rótulo e "tom" (cor + ícone) de cada situação dos módulos novos.
// O tom nunca é a única pista: o <Badge> sempre mostra o texto e um ícone.
//   tons: ok (concluído) · pending (aguardando) · warn (atenção) · danger (problema) · neutral · info

export const STATUS = {
  bimestre: { futuro: ['Futuro', 'neutral'], em_andamento: ['Em andamento', 'info'], encerrado: ['Encerrado', 'neutral'] },
  digitacao: { agendada: ['Digitação agendada', 'pending'], aberta: ['Digitação aberta', 'ok'], encerrada: ['Digitação encerrada', 'neutral'] },
  aula: { rascunho: ['Rascunho', 'neutral'], finalizada: ['Finalizada', 'ok'] },
  atividade: {
    rascunho: ['Rascunho', 'neutral'],
    publicada: ['Publicada', 'info'],
    encerrada: ['Encerrada', 'ok'],
    cancelada: ['Cancelada', 'neutral'],
  },
  situacaoAluno: { pendente: ['Pendente', 'pending'], concluida: ['Concluída', 'ok'], atrasada: ['Atrasada', 'danger'] },
  entrega: {
    pendente: ['Não registrada', 'neutral'],
    entregue: ['Entregue', 'ok'],
    entregue_atraso: ['Entregue com atraso', 'warn'],
    nao_entregue: ['Não entregue', 'danger'],
  },
  chamado: {
    aberto: ['Aberto', 'pending'],
    em_atendimento: ['Em atendimento', 'info'],
    aguardando_usuario: ['Aguardando você', 'warn'],
    resolvido: ['Resolvido', 'ok'],
    fechado: ['Fechado', 'neutral'],
  },
  justificativa: {
    pendente: ['Pendente', 'pending'],
    em_analise: ['Em análise', 'info'],
    aprovada: ['Aprovada', 'ok'],
    recusada: ['Recusada', 'danger'],
    necessita_info: ['Necessita de informações', 'warn'],
  },
  documento: {
    solicitado: ['Solicitado', 'pending'],
    em_analise: ['Em análise', 'info'],
    disponivel: ['Disponível', 'ok'],
    recusado: ['Recusado', 'danger'],
  },
  ocorrencia: {
    aberta: ['Aberta', 'pending'],
    em_acompanhamento: ['Em acompanhamento', 'info'],
    resolvida: ['Resolvida', 'ok'],
    arquivada: ['Arquivada', 'neutral'],
  },
  prioridade: { alta: ['Prioridade alta', 'danger'], media: ['Prioridade média', 'warn'], baixa: ['Prioridade baixa', 'neutral'] },
  conta: { true: ['Ativo', 'ok'], false: ['Inativo', 'neutral'] },
  situacaoBoletim: {
    satisfatoria: ['Satisfatória', 'ok'],
    aprovado: ['Aprovado', 'ok'],
    atencao: ['Em atenção', 'warn'],
    recuperacao: ['Em recuperação', 'danger'],
    sem_dados: ['Sem notas publicadas', 'neutral'],
  },
};

export const rotuloStatus = (tipo, valor) => STATUS[tipo]?.[String(valor)]?.[0] || String(valor ?? '—');
export const tomStatus = (tipo, valor) => STATUS[tipo]?.[String(valor)]?.[1] || 'neutral';

export const CATEGORIAS_CHAMADO = {
  acesso: 'Acesso e senha',
  boletim: 'Boletim e notas',
  comunicacao: 'Mural de conversas',
  cadastro: 'Dados cadastrais',
  documentos: 'Documentos',
  sugestao: 'Sugestão',
  lgpd: 'Dados pessoais / LGPD',
  outro: 'Outro assunto',
};

export const MOTIVOS_FALTA = {
  saude: 'Saúde (doença)',
  consulta: 'Consulta ou exame',
  familiar: 'Motivo familiar',
  transporte: 'Problema de transporte',
  luto: 'Luto',
  outro: 'Outro motivo',
};

export const CATEGORIAS_OCORRENCIA = {
  comportamento: 'Comportamento',
  disciplina: 'Disciplina',
  convivencia: 'Convivência',
  saude: 'Saúde ou bem-estar',
  administrativa: 'Questões administrativas',
  outra: 'Outra',
};

export const TIPOS_EVENTO = {
  EVENTO: { rotulo: 'Evento', classe: 'cat-evento' },
  PROVA: { rotulo: 'Prova', classe: 'cat-prova' },
  ATIVIDADE: { rotulo: 'Atividade', classe: 'cat-atividade' },
  REUNIAO: { rotulo: 'Reunião', classe: 'cat-reuniao' },
  FERIADO: { rotulo: 'Feriado', classe: 'cat-feriado' },
  PRAZO: { rotulo: 'Prazo', classe: 'cat-prazo' },
  BIMESTRE: { rotulo: 'Bimestre', classe: 'cat-bimestre' },
  ENTREGA: { rotulo: 'Entrega de atividade', classe: 'cat-entrega' },
};

export const DIAS_SEMANA = ['', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
