// planilha.js — exportação em CSV e XLSX (Excel), sem dependências.
//
//   csv(colunas, linhas)            -> Buffer (UTF-8 com BOM, separador ";" — abre certo no Excel em português)
//   xlsx([{ nome, colunas, linhas }]) -> Buffer (.xlsx: pacote ZIP com as partes XML do Office Open XML)
//
// colunas: [{ chave, titulo, tipo: 'texto' | 'numero' | 'data' }]   linhas: objetos com as chaves
//
// Segurança: no CSV, textos que começam com = + - @ (fórmulas) recebem um apóstrofo na frente,
// para o Excel não executar nada ao abrir ("CSV injection"). No XLSX todo texto é gravado como
// texto (inlineStr), nunca como fórmula.

const zlib = require('zlib');

// ------------------------------------------------------------------- valores
function valorData(v) {
  if (!v) return '';
  if (v instanceof Date) return v.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  return String(v);
}

function normalizar(valor, tipo) {
  if (valor === null || valor === undefined) return null;
  if (tipo === 'numero') {
    const n = Number(valor);
    return Number.isFinite(n) ? n : null;
  }
  if (tipo === 'data') return valorData(valor);
  if (Array.isArray(valor)) return valor.join(', ');
  return String(valor);
}

// ------------------------------------------------------------------- CSV
function celulaCsv(valor, tipo) {
  const v = normalizar(valor, tipo);
  if (v === null) return '';
  if (typeof v === 'number') return String(v).replace('.', ',');
  let s = v.replace(/\r?\n/g, ' ');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[";\n]/.test(s) || s !== s.trim() ? `"${s.replace(/"/g, '""')}"` : s;
}

function csv(colunas, linhas) {
  const texto = [
    colunas.map((c) => celulaCsv(c.titulo)).join(';'),
    ...linhas.map((l) => colunas.map((c) => celulaCsv(l[c.chave], c.tipo)).join(';')),
  ].join('\r\n');
  return Buffer.from(`﻿${texto}\r\n`, 'utf8');
}

// ------------------------------------------------------------------- XLSX
const xml = (s) =>
  String(s)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const letraColuna = (i) => {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

function folha(colunas, linhas) {
  const cel = (ref, valor, tipo, estilo = 0) => {
    const v = normalizar(valor, tipo);
    if (v === null || v === '') return '';
    if (typeof v === 'number') return `<c r="${ref}"${estilo ? ` s="${estilo}"` : ''}><v>${v}</v></c>`;
    return `<c r="${ref}" t="inlineStr"${estilo ? ` s="${estilo}"` : ''}><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
  };
  const larguras = colunas.map((c) =>
    Math.min(60, Math.max(10, String(c.titulo).length + 2, ...linhas.slice(0, 200).map((l) => String(normalizar(l[c.chave], c.tipo) ?? '').length + 2)))
  );
  const linhasXml = [
    `<row r="1">${colunas.map((c, j) => cel(`${letraColuna(j)}1`, c.titulo, 'texto', 1)).join('')}</row>`,
    ...linhas.map(
      (l, i) => `<row r="${i + 2}">${colunas.map((c, j) => cel(`${letraColuna(j)}${i + 2}`, l[c.chave], c.tipo, c.tipo === 'numero' ? 2 : 0)).join('')}</row>`
    ),
  ];
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    `<cols>${larguras.map((w, j) => `<col min="${j + 1}" max="${j + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` +
    `<sheetData>${linhasXml.join('')}</sheetData>` +
    (linhas.length ? `<autoFilter ref="A1:${letraColuna(colunas.length - 1)}${linhas.length + 1}"/>` : '') +
    '</worksheet>'
  );
}

function xlsx(abas) {
  // Nome de aba: até 31 caracteres, sem : \ / ? * [ ]
  const nomes = abas.map((a, i) => (String(a.nome || `Planilha${i + 1}`).replace(/[:\\/?*[\]]/g, ' ').slice(0, 31) || `Planilha${i + 1}`));
  const arquivos = [
    [
      '[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        abas
          .map(
            (_, i) =>
              `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
          )
          .join('') +
        '</Types>',
    ],
    [
      '_rels/.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>',
    ],
    [
      'xl/workbook.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        `<sheets>${nomes.map((n, i) => `<sheet name="${xml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>` +
        '</workbook>',
    ],
    [
      'xl/_rels/workbook.xml.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        abas
          .map(
            (_, i) =>
              `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
          )
          .join('') +
        `<Relationship Id="rId${abas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        '</Relationships>',
    ],
    [
      'xl/styles.xml',
      // 0 = padrão · 1 = cabeçalho em negrito com fundo · 2 = número com 2 casas
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        '<numFmts count="1"><numFmt numFmtId="164" formatCode="0.##"/></numFmts>' +
        '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
        '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
        '<fill><patternFill patternType="solid"><fgColor rgb="FFE8EEFC"/></patternFill></fill></fills>' +
        '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
        '<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
        '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
        '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>' +
        '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
        '</styleSheet>',
    ],
    ...abas.map((a, i) => [`xl/worksheets/sheet${i + 1}.xml`, folha(a.colunas, a.linhas)]),
  ];
  return zip(arquivos.map(([nome, conteudo]) => [nome, Buffer.from(conteudo, 'utf8')]));
}

// ------------------------------------------------------------------- ZIP (deflate)
const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = TABELA_CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zip(arquivos) {
  const agora = new Date();
  const hora = (agora.getHours() << 11) | (agora.getMinutes() << 5) | Math.floor(agora.getSeconds() / 2);
  const dia = ((agora.getFullYear() - 1980) << 9) | ((agora.getMonth() + 1) << 5) | agora.getDate();
  const locais = [];
  const centrais = [];
  let deslocamento = 0;

  for (const [nome, dados] of arquivos) {
    const nomeBuf = Buffer.from(nome, 'utf8');
    const comprimido = zlib.deflateRawSync(dados);
    const crc = crc32(dados);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // versão necessária
    local.writeUInt16LE(0x0800, 6); // nomes em UTF-8
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(hora, 10);
    local.writeUInt16LE(dia, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comprimido.length, 18);
    local.writeUInt32LE(dados.length, 22);
    local.writeUInt16LE(nomeBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locais.push(local, nomeBuf, comprimido);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(hora, 12);
    central.writeUInt16LE(dia, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(comprimido.length, 20);
    central.writeUInt32LE(dados.length, 24);
    central.writeUInt16LE(nomeBuf.length, 28);
    central.writeUInt32LE(deslocamento, 42);
    centrais.push(central, nomeBuf);

    deslocamento += local.length + nomeBuf.length + comprimido.length;
  }

  const tamanhoCentral = centrais.reduce((s, b) => s + b.length, 0);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(arquivos.length, 8);
  fim.writeUInt16LE(arquivos.length, 10);
  fim.writeUInt32LE(tamanhoCentral, 12);
  fim.writeUInt32LE(deslocamento, 16);
  return Buffer.concat([...locais, ...centrais, fim]);
}

module.exports = { csv, xlsx, crc32 };
