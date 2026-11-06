// cliente.js — comunicação com a API (fetch) + sessão do usuário.
//
// Uso nos componentes:
//   import { api } from '../api/cliente';
//   const alunos = await api.get('/alunos');
//
// Erros da API viram ApiError com { status, codigo, message, detalhes[] },
// no mesmo formato padronizado do back-end.

// Em produção o React é servido pelo próprio Express (mesmo domínio).
// Se o front for hospedado em outro lugar, defina VITE_API_URL no build.
const BASE = `${(import.meta.env?.VITE_API_URL || '').replace(/\/$/, '')}/api`;

const CHAVE_TOKEN = 'kfka_token';
const CHAVE_USUARIO = 'kfka_usuario';

const MSG_SEM_API =
  'A API não respondeu. Inicie o servidor com "npm run dev" e use o endereço do Vite ' +
  '(http://localhost:5173) ou do servidor (http://localhost:3000).';

// ---------------------------------------------------------------------------
// Sessão — "Lembrar de mim" usa localStorage; senão, sessionStorage
// (a sessão termina ao fechar o navegador).
// ---------------------------------------------------------------------------
export const sessao = {
  salvar(token, usuario, lembrar) {
    sessao.limpar();
    const armazenamento = lembrar ? localStorage : sessionStorage;
    armazenamento.setItem(CHAVE_TOKEN, token);
    armazenamento.setItem(CHAVE_USUARIO, JSON.stringify(usuario));
  },
  token() {
    return sessionStorage.getItem(CHAVE_TOKEN) || localStorage.getItem(CHAVE_TOKEN);
  },
  usuario() {
    try {
      return JSON.parse(sessionStorage.getItem(CHAVE_USUARIO) || localStorage.getItem(CHAVE_USUARIO));
    } catch {
      return null;
    }
  },
  // Atualiza os dados do usuário salvos (ex.: trocou a foto no perfil), no mesmo armazenamento do token
  atualizarUsuario(usuario) {
    const armazenamento = sessionStorage.getItem(CHAVE_TOKEN) ? sessionStorage : localStorage;
    try {
      armazenamento.setItem(CHAVE_USUARIO, JSON.stringify(usuario));
    } catch {
      /* armazenamento cheio: mantém só em memória */
    }
  },
  // Token novo para a mesma sessão (ex.: depois de trocar a senha, os tokens antigos deixam de valer)
  trocarToken(token) {
    const armazenamento = sessionStorage.getItem(CHAVE_TOKEN) ? sessionStorage : localStorage;
    armazenamento.setItem(CHAVE_TOKEN, token);
  },
  limpar() {
    [localStorage, sessionStorage].forEach((s) => {
      s.removeItem(CHAVE_TOKEN);
      s.removeItem(CHAVE_USUARIO);
    });
  },
};

export class ApiError extends Error {
  constructor(status, codigo, mensagem, detalhes) {
    super(mensagem);
    this.status = status;
    this.codigo = codigo;
    this.detalhes = detalhes || [];
  }
}

async function requisicao(metodo, rota, corpo, { completo = false, arquivo = false } = {}) {
  const headers = {};
  if (corpo !== undefined) headers['Content-Type'] = 'application/json';
  const token = sessao.token();
  if (token) headers.Authorization = `Bearer ${token}`;

  let resposta;
  try {
    resposta = await fetch(BASE + rota, {
      method: metodo,
      headers,
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
    });
  } catch {
    throw new ApiError(0, 'SEM_CONEXAO', 'Não foi possível conectar ao servidor. Verifique sua internet.');
  }

  if (resposta.status === 204) return null;

  // Download (PDF, CSV, XLSX, JSON): devolve o arquivo e o nome sugerido pelo servidor
  if (arquivo && resposta.ok) {
    const disposicao = resposta.headers.get('Content-Disposition') || '';
    const nome = (disposicao.match(/filename="([^"]+)"/) || [])[1] || 'arquivo';
    return { blob: await resposta.blob(), nome };
  }

  let json = null;
  try {
    json = await resposta.json();
  } catch {
    /* resposta sem JSON */
  }

  // Resposta fora do formato da API (ex.: página HTML de outro servidor)
  if (!json && !resposta.ok) throw new ApiError(resposta.status, 'SEM_SERVIDOR', MSG_SEM_API);

  if (!resposta.ok) {
    const erro = json?.erro || {};
    // Token expirado/inválido: avisa o AuthProvider, que leva de volta ao login
    if (resposta.status === 401 && token) {
      sessao.limpar();
      window.dispatchEvent(new CustomEvent('kfka:sessao-expirada'));
    }
    // Conta de responsável sem o aceite do termo (LGPD): leva à tela de aceite
    if (resposta.status === 403 && erro.codigo === 'ACEITE_PENDENTE') {
      window.dispatchEvent(new CustomEvent('kfka:aceite-pendente'));
    }
    // Erro 500: em desenvolvimento o servidor manda o motivo real como texto em "detalhes".
    // Mostra na tela (só no npm run dev:web) para não ficar só "erro inesperado".
    const detalheTexto = typeof erro.detalhes === 'string' ? erro.detalhes : '';
    const mensagem = erro.mensagem || 'Ocorreu um erro inesperado. Tente novamente.';
    throw new ApiError(
      resposta.status,
      erro.codigo || 'ERRO',
      detalheTexto && import.meta.env?.DEV ? `${mensagem} (${detalheTexto})` : mensagem,
      Array.isArray(erro.detalhes) ? erro.detalhes : []
    );
  }

  if (completo) return json || { dados: null };
  return json ? json.dados : null;
}

// Salva o arquivo recebido da API no computador (link temporário)
export function salvarArquivo({ blob, nome }) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const api = {
  get: (rota) => requisicao('GET', rota),
  // Lista paginada: devolve { dados, meta: { total, pagina, por_pagina, paginas } }
  pagina: (rota) => requisicao('GET', rota, undefined, { completo: true }),
  // Baixa um arquivo gerado pelo servidor (com o token, que um <a href> não enviaria)
  baixar: async (rota) => salvarArquivo(await requisicao('GET', rota, undefined, { arquivo: true })),
  post: (rota, corpo) => requisicao('POST', rota, corpo ?? {}),
  put: (rota, corpo) => requisicao('PUT', rota, corpo ?? {}),
  patch: (rota, corpo) => requisicao('PATCH', rota, corpo ?? {}),
  del: (rota) => requisicao('DELETE', rota),
};

// Junta as mensagens de erro por campo (422) numa frase só
export const mensagemDeErro = (err) =>
  err.detalhes?.length ? err.detalhes.map((d) => d.mensagem).join(' ') : err.message;
