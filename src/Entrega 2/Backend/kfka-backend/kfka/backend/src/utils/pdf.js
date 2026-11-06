// pdf.js — gerador de PDF simples, sem dependências (texto, linhas e retângulos).
//
// Usa as fontes padrão do PDF (Helvetica e Helvetica-Bold), que todo leitor de PDF já tem,
// com codificação WinAnsi: acentos do português (á, ç, ã, º...) funcionam sem embutir fonte.
// Página A4 em pontos (595 x 842); a origem (0,0) aqui é o canto SUPERIOR esquerdo
// (a conversão para o sistema do PDF, que começa embaixo, é feita internamente).
//
//   const doc = new DocumentoPdf({ titulo: 'Boletim' });
//   doc.texto('Olá', 40, 60, { tamanho: 14, negrito: true });
//   doc.paragrafo('texto longo...', 40, 90, 515);   // quebra linhas e páginas
//   const buffer = doc.gerar();

const LARGURA = 595.28;
const ALTURA = 841.89;

// Larguras (1/1000 do tamanho da fonte) das métricas AFM padrão da Helvetica, ASCII 32..126
const W_NORMAL = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556,
  556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556,
  556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];
const W_NEGRITO = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556,
  556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611,
  611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

// Caracteres fora do Latin-1 que existem na WinAnsi
const WIN_ANSI = { '–': 0x96, '—': 0x97, '•': 0x95, '“': 0x93, '”': 0x94, '‘': 0x91, '’': 0x92, '…': 0x85, '€': 0x80 };

// Texto JS -> bytes WinAnsi (como string "latin1"); o que não existe vira "?"
function codificar(texto) {
  let saida = '';
  for (const c of String(texto ?? '').normalize('NFC')) {
    const cod = c.codePointAt(0);
    if (WIN_ANSI[c]) saida += String.fromCharCode(WIN_ANSI[c]);
    else if (cod === 9) saida += '    ';
    else if ((cod >= 32 && cod <= 126) || (cod >= 160 && cod <= 255)) saida += c;
    else if (cod === 10 || cod === 13) saida += ' ';
    else saida += '?';
  }
  return saida;
}

const escapar = (s) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

function larguraCaractere(c, negrito) {
  const tabela = negrito ? W_NEGRITO : W_NORMAL;
  const cod = c.charCodeAt(0);
  if (cod >= 32 && cod <= 126) return tabela[cod - 32];
  // Letra acentuada: mesma largura da letra base (á -> a)
  const base = c.normalize('NFD')[0];
  if (base && base !== c && base.charCodeAt(0) >= 32 && base.charCodeAt(0) <= 126) return tabela[base.charCodeAt(0) - 32];
  return 556;
}

function larguraTexto(texto, tamanho, negrito = false) {
  let total = 0;
  for (const c of String(texto)) total += larguraCaractere(c, negrito);
  return (total * tamanho) / 1000;
}

// Quebra em linhas que cabem na largura (palavras maiores que a linha são cortadas)
function quebrarLinhas(texto, largura, tamanho, negrito = false) {
  const linhas = [];
  for (const paragrafo of String(texto ?? '').split(/\r?\n/)) {
    let atual = '';
    for (const palavra of paragrafo.split(/\s+/).filter(Boolean)) {
      const tentativa = atual ? `${atual} ${palavra}` : palavra;
      if (larguraTexto(tentativa, tamanho, negrito) <= largura) {
        atual = tentativa;
        continue;
      }
      if (atual) linhas.push(atual);
      let resto = palavra;
      while (larguraTexto(resto, tamanho, negrito) > largura) {
        let n = resto.length;
        while (n > 1 && larguraTexto(resto.slice(0, n), tamanho, negrito) > largura) n -= 1;
        linhas.push(resto.slice(0, n));
        resto = resto.slice(n);
      }
      atual = resto;
    }
    linhas.push(atual);
  }
  return linhas;
}

const num = (n) => Number(n.toFixed(2)).toString();

function cor(hex = '#000000') {
  const v = hex.replace('#', '');
  return [0, 2, 4].map((i) => num(parseInt(v.slice(i, i + 2), 16) / 255)).join(' ');
}

class DocumentoPdf {
  constructor({ titulo = 'Documento', autor = 'Plataforma KFKA', margem = 40 } = {}) {
    this.titulo = titulo;
    this.autor = autor;
    this.margem = margem;
    this.paginas = [];
    this.aoNovaPagina = null; // função (doc) chamada no topo de cada página nova (cabeçalho)
    this.novaPagina();
  }

  get largura() {
    return LARGURA;
  }
  get altura() {
    return ALTURA;
  }
  get areaUtil() {
    return LARGURA - this.margem * 2;
  }

  novaPagina() {
    this.paginas.push([]);
    this.indice = this.paginas.length - 1;
    this.y = this.margem;
    if (this.aoNovaPagina) this.aoNovaPagina(this);
    return this;
  }

  get atual() {
    return this.paginas[this.indice];
  }

  // Garante espaço vertical; se não couber, abre outra página
  reservar(altura, rodape = 40) {
    if (this.y + altura > ALTURA - this.margem - rodape) this.novaPagina();
    return this;
  }

  texto(conteudo, x, y, { tamanho = 10, negrito = false, cor: c = '#1f2937', alinhar = 'esquerda', largura } = {}) {
    let px = x;
    if (alinhar !== 'esquerda' && largura) {
      const w = larguraTexto(conteudo, tamanho, negrito);
      px = alinhar === 'direita' ? x + largura - w : x + (largura - w) / 2;
    }
    const base = ALTURA - y - tamanho; // y = topo da linha
    this.atual.push(
      `BT /${negrito ? 'F2' : 'F1'} ${num(tamanho)} Tf ${cor(c)} rg ${num(px)} ${num(base)} Td (${escapar(codificar(conteudo))}) Tj ET`
    );
    return this;
  }

  linha(x1, y1, x2, y2, { cor: c = '#d1d5db', espessura = 0.6 } = {}) {
    this.atual.push(`${cor(c)} RG ${num(espessura)} w ${num(x1)} ${num(ALTURA - y1)} m ${num(x2)} ${num(ALTURA - y2)} l S`);
    return this;
  }

  retangulo(x, y, w, h, { preenchimento = '#f3f4f6', borda = null } = {}) {
    const cmd = `${num(x)} ${num(ALTURA - y - h)} ${num(w)} ${num(h)} re`;
    if (preenchimento) this.atual.push(`${cor(preenchimento)} rg ${cmd} f`);
    if (borda) this.atual.push(`${cor(borda)} RG 0.6 w ${cmd} S`);
    return this;
  }

  // Texto com quebra automática a partir de this.y; avança this.y e muda de página se preciso
  paragrafo(conteudo, x, largura, { tamanho = 10, negrito = false, cor: c, entrelinha = 1.35 } = {}) {
    const altura = tamanho * entrelinha;
    for (const l of quebrarLinhas(conteudo, largura, tamanho, negrito)) {
      this.reservar(altura);
      this.texto(l, x, this.y, { tamanho, negrito, cor: c });
      this.y += altura;
    }
    return this;
  }

  // Tabela simples: colunas [{ titulo, largura, alinhar }], linhas [[...valores]]
  tabela(colunas, linhas, { x = this.margem, tamanho = 9, alturaLinha = 18 } = {}) {
    const total = colunas.reduce((s, c) => s + c.largura, 0);
    const cabecalho = () => {
      this.reservar(alturaLinha * 2);
      this.retangulo(x, this.y, total, alturaLinha, { preenchimento: '#e8eefc' });
      let cx = x;
      for (const c of colunas) {
        this.texto(c.titulo, cx + 5, this.y + (alturaLinha - tamanho) / 2, {
          tamanho,
          negrito: true,
          cor: '#1e3a8a',
          alinhar: c.alinhar,
          largura: c.largura - 10,
        });
        cx += c.largura;
      }
      this.y += alturaLinha;
    };
    cabecalho();
    linhas.forEach((valores, i) => {
      if (this.y + alturaLinha > ALTURA - this.margem - 40) {
        this.novaPagina();
        cabecalho();
      }
      if (i % 2 === 1) this.retangulo(x, this.y, total, alturaLinha, { preenchimento: '#f8fafc' });
      let cx = x;
      colunas.forEach((c, j) => {
        let v = String(valores[j] ?? '');
        while (v.length > 1 && larguraTexto(v, tamanho) > c.largura - 10) v = `${v.slice(0, -2)}…`;
        this.texto(v, cx + 5, this.y + (alturaLinha - tamanho) / 2, { tamanho, alinhar: c.alinhar, largura: c.largura - 10 });
        cx += c.largura;
      });
      this.linha(x, this.y + alturaLinha, x + total, this.y + alturaLinha, { cor: '#e5e7eb' });
      this.y += alturaLinha;
    });
    return this;
  }

  // Monta o arquivo: objetos, tabela xref e trailer
  gerar({ rodape } = {}) {
    const total = this.paginas.length;
    if (rodape) {
      const voltar = this.indice;
      for (let i = 0; i < total; i++) {
        this.indice = i; // escreve o rodapé na página i ("Página 1 de 3" só é conhecido no fim)
        this.linha(this.margem, ALTURA - 34, LARGURA - this.margem, ALTURA - 34, { cor: '#e5e7eb' });
        this.texto(rodape(i + 1, total), this.margem, ALTURA - 28, { tamanho: 8, cor: '#6b7280' });
      }
      this.indice = voltar;
    }

    const objetos = [];
    const adicionar = (conteudo) => objetos.push(conteudo) && objetos.length;

    const catalogo = adicionar(null);
    const paginasObj = adicionar(null);
    const f1 = adicionar('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    const f2 = adicionar('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const filhos = [];
    for (const cmds of this.paginas) {
      const fluxo = cmds.join('\n');
      const conteudo = adicionar(`<< /Length ${Buffer.byteLength(fluxo, 'latin1')} >>\nstream\n${fluxo}\nendstream`);
      filhos.push(
        adicionar(
          `<< /Type /Page /Parent ${paginasObj} 0 R /MediaBox [0 0 ${num(LARGURA)} ${num(ALTURA)}] ` +
            `/Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${conteudo} 0 R >>`
        )
      );
    }
    objetos[catalogo - 1] = `<< /Type /Catalog /Pages ${paginasObj} 0 R >>`;
    objetos[paginasObj - 1] = `<< /Type /Pages /Kids [${filhos.map((f) => `${f} 0 R`).join(' ')}] /Count ${filhos.length} >>`;
    const agora = new Date();
    const data = agora.toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const info = adicionar(
      `<< /Title (${escapar(codificar(this.titulo))}) /Author (${escapar(codificar(this.autor))}) ` +
        `/Producer (KFKA) /CreationDate (D:${data}Z) >>`
    );

    let saida = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
    const posicoes = [];
    objetos.forEach((o, i) => {
      posicoes.push(Buffer.byteLength(saida, 'latin1'));
      saida += `${i + 1} 0 obj\n${o}\nendobj\n`;
    });
    const xref = Buffer.byteLength(saida, 'latin1');
    saida += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
    saida += posicoes.map((p) => `${String(p).padStart(10, '0')} 00000 n \n`).join('');
    saida += `trailer\n<< /Size ${objetos.length + 1} /Root ${catalogo} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return Buffer.from(saida, 'latin1');
  }
}

module.exports = { DocumentoPdf, larguraTexto, quebrarLinhas, codificar };
