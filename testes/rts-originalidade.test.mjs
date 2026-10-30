// Originality guard for the RTS: no file name, text file, image or audio metadata, commit message of this branch, branch name or pull request text may carry the names of the series that inspired the game (title, abbreviation, series, factions, studio, publisher and the fan remake).
// The list is base64 so this file never spells the names out; decode it to read it:
// node -e "console.log(Buffer.from(process.argv[1], 'base64').toString())" <LISTA>
// Matching ignores case and accents and looks inside camelCase, snake_case, kebab-case and numeric suffixes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync, inflateSync } from 'node:zlib';

const LISTA = 'eyJ0cmVjaG9zIjpbImtrbmQiLCJrcm9zc2ZpcmUiLCJrcnVzaCIsInNjb3VyZ2UiLCJ6aWdndXJhdCJdLCJleHByZXNzb2VzIjpbWyJiZWFtIiwic29mdHdhcmUiXSxbIm1lbGJvdXJuZSIsImhvdXNlIl0sWyJzZXJpZXMiLCI5Il0sWyJzZXJpZSIsIjkiXV0sInBhbGF2cmFzIjpbInN1cnZpdm9ycyIsImV2b2x2ZWQiLCJldm9sdWlkb3MiXX0=';

// trechos are found anywhere inside a squashed run of non-space characters, which catches compound identifiers and suffixes.
// expressoes are consecutive words, or the words glued together inside a run.
// palavras count only as whole words, because they are also ordinary English or Portuguese words.
const { trechos: TRECHOS, expressoes: EXPRESSOES, palavras: PALAVRAS } = JSON.parse(Buffer.from(LISTA, 'base64').toString('utf8'));
const COLADOS = [...TRECHOS, ...EXPRESSOES.map((palavras) => palavras.join(''))];

const raiz = fileURLToPath(new URL('..', import.meta.url));
const git = (...argumentos) => execFileSync('git', ['-C', raiz, ...argumentos], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });

const normalizar = (texto) => texto.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();

// Words with their column, split at camelCase, letter-digit and punctuation boundaries.
function palavrasDaLinha(linha) {
  const palavras = [];
  for (const bloco of linha.matchAll(/[\p{L}\p{N}]+/gu)) {
    for (const parte of bloco[0].matchAll(/\p{Lu}+(?=\p{Lu}\p{Ll})|\p{Lu}?\p{Ll}+|\p{Lu}+|\p{N}+|\p{L}+/gu)) {
      palavras.push({ texto: normalizar(parte[0]), coluna: bloco.index + parte.index + 1 });
    }
  }
  return palavras;
}

function achadosNaLinha(linha) {
  const achados = new Map();
  const anotar = (coluna, termo) => achados.has(coluna) || achados.set(coluna, termo);
  const texto = linha.normalize('NFC');
  for (const sequencia of texto.matchAll(/\S+/gu)) {
    const colado = normalizar(sequencia[0]).replace(/[^a-z0-9]/g, '');
    COLADOS.forEach((termo, i) => colado.includes(termo) && anotar(sequencia.index + 1, `termo ${i + 1}`));
  }
  const palavras = palavrasDaLinha(texto);
  palavras.forEach(({ texto: palavra, coluna }, inicio) => {
    EXPRESSOES.forEach((expressao, i) => {
      if (expressao.every((parte, j) => palavras[inicio + j]?.texto === parte)) anotar(coluna, `termo ${TRECHOS.length + i + 1}`);
    });
    const i = PALAVRAS.indexOf(palavra);
    if (i >= 0) anotar(coluna, `termo ${COLADOS.length + i + 1}`);
  });
  return [...achados].map(([coluna, termo]) => ({ coluna, termo }));
}

function achadosNoTexto(texto) {
  return texto.split(/\r?\n/).flatMap((linha, i) => achadosNaLinha(linha).map((achado) => ({ linha: i + 1, ...achado })));
}

const comeca = (dados, assinatura, posicao = 0) => dados.subarray(posicao, posicao + assinatura.length).equals(Buffer.from(assinatura, 'latin1'));

function textosDoPng(dados) {
  const textos = [];
  for (let i = 8; i + 12 <= dados.length;) {
    const tamanho = dados.readUInt32BE(i);
    const tipo = dados.toString('latin1', i + 4, i + 8);
    const corpo = dados.subarray(i + 8, i + 8 + tamanho);
    const nulo = corpo.indexOf(0);
    if (tipo === 'tEXt') textos.push(corpo.toString('latin1').replace('\0', ' '));
    if (tipo === 'zTXt') textos.push(`${corpo.toString('latin1', 0, nulo)} ${inflateSync(corpo.subarray(nulo + 2)).toString('latin1')}`);
    if (tipo === 'iTXt') {
      const comprimido = corpo[nulo + 1] === 1;
      const idioma = corpo.indexOf(0, nulo + 3);
      const traduzido = corpo.indexOf(0, idioma + 1);
      const valor = corpo.subarray(traduzido + 1);
      textos.push(`${corpo.toString('utf8', 0, traduzido).replaceAll('\0', ' ')} ${(comprimido ? inflateSync(valor) : valor).toString('utf8')}`);
    }
    if (tipo === 'eXIf') textos.push(corpo.toString('latin1'));
    if (tipo === 'IEND') break;
    i += 12 + tamanho;
  }
  return textos;
}

// RIFF covers WebP (EXIF, XMP) and WAV (LIST INFO, ID3, broadcast and iXML chunks).
function textosDoRiff(dados) {
  const textos = [];
  const comMetadados = new Set(['EXIF', 'XMP ', 'LIST', 'ID3 ', 'id3 ', 'bext', 'iXML']);
  for (let i = 12; i + 8 <= dados.length;) {
    const tipo = dados.toString('latin1', i, i + 4);
    const tamanho = dados.readUInt32LE(i + 4);
    if (comMetadados.has(tipo)) textos.push(dados.toString('utf8', i + 8, i + 8 + tamanho));
    i += 8 + tamanho + (tamanho % 2);
  }
  return textos;
}

function textosDoJpeg(dados) {
  const textos = [];
  for (let i = 2; i + 4 <= dados.length && dados[i] === 0xff;) {
    const marcador = dados[i + 1];
    if (marcador === 0xda || marcador === 0xd9) break;
    const tamanho = dados.readUInt16BE(i + 2);
    if ((marcador >= 0xe0 && marcador <= 0xef) || marcador === 0xfe) textos.push(dados.toString('utf8', i + 4, i + 2 + tamanho));
    i += 2 + tamanho;
  }
  return textos;
}

// Ogg header pages (granule 0) hold the Opus and Vorbis comment packets; the audio after them is not read.
function textosDoOgg(dados) {
  const cabecalhos = [];
  for (let i = 0; i + 27 <= dados.length && comeca(dados, 'OggS', i);) {
    const segmentos = dados[i + 26];
    const tamanho = dados.subarray(i + 27, i + 27 + segmentos).reduce((soma, n) => soma + n, 0);
    if (dados.readBigUInt64LE(i + 6) !== 0n) break;
    cabecalhos.push(dados.subarray(i + 27 + segmentos, i + 27 + segmentos + tamanho));
    i += 27 + segmentos + tamanho;
  }
  const juntos = Buffer.concat(cabecalhos).toString('latin1');
  const inicio = Math.max(juntos.indexOf('OpusTags'), juntos.indexOf('\x03vorbis'));
  if (inicio < 0) return [];
  const fim = juntos.indexOf('\x05vorbis', inicio);
  return [Buffer.from(juntos.slice(inicio, fim < 0 ? undefined : fim), 'latin1').toString('utf8')];
}

// MP4 and M4A (the AAC fallback) keep their tags in moov/udta.
function textosDoMp4(dados, inicio = 0, fim = dados.length) {
  const textos = [];
  for (let i = inicio; i + 8 <= fim;) {
    const tamanho = dados.readUInt32BE(i) || fim - i;
    const tipo = dados.toString('latin1', i + 4, i + 8);
    if (tamanho < 8) break;
    if (tipo === 'moov' || tipo === 'trak') textos.push(...textosDoMp4(dados, i + 8, i + tamanho));
    if (tipo === 'udta' || tipo === 'meta') textos.push(dados.toString('utf8', i + 8, i + tamanho));
    i += tamanho;
  }
  return textos;
}

function textosDoMp3(dados) {
  const tamanho = ((dados[6] & 0x7f) << 21) | ((dados[7] & 0x7f) << 14) | ((dados[8] & 0x7f) << 7) | (dados[9] & 0x7f);
  const etiqueta = dados.subarray(10, 10 + tamanho);
  return [etiqueta.toString('latin1'), etiqueta.toString('utf16le')];
}

// What to scan in a file: the whole text, or only the metadata of a known binary format.
// Compressed pixels and samples are skipped, because random bytes would match short terms by chance.
function textosParaVarrer(dados) {
  if (comeca(dados, '\x89PNG\r\n\x1a\n')) return textosDoPng(dados);
  if (comeca(dados, 'RIFF') && dados.length >= 12) return textosDoRiff(dados);
  if (comeca(dados, '\xff\xd8')) return textosDoJpeg(dados);
  if (comeca(dados, 'OggS')) return textosDoOgg(dados);
  if (comeca(dados, 'ftyp', 4)) return textosDoMp4(dados);
  if (comeca(dados, 'ID3') && dados.length >= 10) return textosDoMp3(dados);
  if (dados.subarray(0, 8000).includes(0)) return [];
  return [dados.toString('utf8')];
}

const descrever = (lugar, achados) => achados.map(({ linha, coluna, termo }) => `${lugar}:${linha}:${coluna} (${termo})`);

function arquivosDoRepositorio() {
  return git('ls-files', '-z', '--cached', '--others', '--exclude-standard').split('\0').filter(Boolean);
}

function varrerArquivo(caminho) {
  const problemas = descrever(`nome de ${caminho}`, achadosNoTexto(caminho.split('/').join(' ')));
  const completo = join(raiz, caminho);
  let informacao;
  try {
    informacao = statSync(completo);
  } catch (erro) {
    if (erro.code === 'ENOENT') return problemas; // tracked but deleted in the working tree
    throw erro;
  }
  if (!informacao.isFile()) return problemas;
  for (const texto of textosParaVarrer(readFileSync(completo))) problemas.push(...descrever(caminho, achadosNoTexto(texto)));
  return problemas;
}

// Commits of this branch that main does not have yet; without origin/main (a shallow clone), only the last one.
function intervaloDeCommits() {
  const base = process.env.RTS_BASE_COMMITS ?? 'origin/main';
  try {
    git('rev-parse', '--verify', '--quiet', `${base}^{commit}`);
    return [`${base}..HEAD`];
  } catch {
    return ['-1', 'HEAD'];
  }
}

const capitalizar = (palavra) => palavra[0].toUpperCase() + palavra.slice(1);

test('the forbidden list decodes into the three kinds of term', () => {
  assert.ok(TRECHOS.length >= 3 && TRECHOS.every((termo) => /^[a-z0-9]+$/.test(termo)));
  assert.ok(EXPRESSOES.length >= 2 && EXPRESSOES.every((partes) => partes.length >= 2));
  assert.ok(PALAVRAS.length >= 2 && PALAVRAS.every((termo) => /^[a-z]+$/.test(termo)));
});

test('the matcher catches case, accents, camelCase, snake_case, kebab-case, numeric suffixes and glued phrases', () => {
  for (const termo of TRECHOS) {
    for (const linha of [`const meu${capitalizar(termo)}Teste = 1;`, `x_${termo}_y`, `rota-${termo.toUpperCase()}-2`, `${termo}2`, `"${capitalizar(termo)}"`]) {
      assert.equal(achadosNaLinha(linha).length, 1, linha);
    }
  }
  for (const [primeira, ...resto] of EXPRESSOES) {
    for (const linha of [`a ${primeira} ${resto.join(' ')} b`, `${primeira}_${resto.join('_')}`, `${primeira}${resto.map(capitalizar).join('')}`, `${capitalizar(primeira)}  ${resto.join(' ').toUpperCase()}`]) {
      assert.ok(achadosNaLinha(linha).length >= 1, linha);
    }
  }
  for (const palavra of PALAVRAS) {
    for (const linha of [`the ${palavra} faction`, `faccao${capitalizar(palavra)}`, `${palavra.toUpperCase()}_TIME`]) {
      assert.equal(achadosNaLinha(linha).length, 1, linha);
    }
  }
  const acento = { a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú' };
  const comAcento = TRECHOS.find((termo) => /[aeiou]/.test(termo)).replace(/[aeiou]/, (vogal) => acento[vogal]);
  assert.equal(achadosNaLinha(comAcento).length, 1);
  assert.equal(achadosNaLinha(comAcento.normalize('NFD')).length, 1);
  assert.deepEqual(achadosNoTexto(`ok\n  ${TRECHOS[0]}`), [{ linha: 2, coluna: 3, termo: 'termo 1' }]);
});

test('the matcher leaves ordinary text alone', () => {
  for (const linha of [
    'Religadores contra Desligados no Morro Aceso, com Carga nos cemitérios de baterias.',
    'An attack rush across the bridge; units evolve and survive.',
    'série de testes 9, serie_de_9, house of software',
    'const proximoPasso = simulacao.passo(estado, comandos);',
  ]) {
    assert.deepEqual(achadosNaLinha(linha), [], linha);
  }
});

test('metadata of PNG, WebP, WAV, JPEG, Ogg, MP4 and MP3 files is read, and other binary bytes are not', () => {
  const termo = capitalizar(TRECHOS[1]);
  const pedaco = (tipo, corpo) => {
    const cabecalho = Buffer.alloc(8);
    cabecalho.writeUInt32BE(corpo.length);
    cabecalho.write(tipo, 4, 'latin1');
    return Buffer.concat([cabecalho, corpo, Buffer.alloc(4)]);
  };
  const png = (tipo, corpo) => Buffer.concat([Buffer.from('\x89PNG\r\n\x1a\n', 'latin1'), pedaco(tipo, corpo), pedaco('IEND', Buffer.alloc(0))]);
  const riff = (formato, tipo, corpo) => {
    const filho = Buffer.alloc(8);
    filho.write(tipo, 0, 'latin1');
    filho.writeUInt32LE(corpo.length, 4);
    return Buffer.concat([Buffer.from(`RIFF\0\0\0\0${formato}`, 'latin1'), filho, corpo]);
  };
  const caixa = (tipo, corpo) => {
    const cabecalho = Buffer.alloc(8);
    cabecalho.writeUInt32BE(8 + corpo.length);
    cabecalho.write(tipo, 4, 'latin1');
    return Buffer.concat([cabecalho, corpo]);
  };
  const ogg = (pacote) => Buffer.concat([Buffer.from('OggS', 'latin1'), Buffer.alloc(22), Buffer.from([1, pacote.length]), pacote]);
  const arquivos = {
    'PNG tEXt': png('tEXt', Buffer.from(`Title\0${termo}`, 'latin1')),
    'PNG zTXt': png('zTXt', Buffer.concat([Buffer.from('Comment\0\0', 'latin1'), deflateSync(termo)])),
    'PNG iTXt': png('iTXt', Buffer.concat([Buffer.from('XML:com.adobe.xmp\0\x01\0pt\0\0', 'latin1'), deflateSync(`<dc:title>${termo}</dc:title>`)])),
    'WebP XMP': riff('WEBP', 'XMP ', Buffer.from(`<x>${termo}</x>`)),
    'WAV LIST': riff('WAVE', 'LIST', Buffer.from(`INFOINAM\x06\0\0\0${termo}`, 'latin1')),
    'JPEG COM': Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xfe, 0, termo.length + 2]), Buffer.from(termo), Buffer.from([0xff, 0xd9])]),
    'Ogg Opus': ogg(Buffer.from(`OpusTags\x07\0\0\0libopus\x01\0\0\0\x0b\0\0\0TITLE=${termo}`, 'latin1')),
    'MP4 udta': caixa('moov', caixa('udta', Buffer.from(`\xa9nam${termo}`, 'latin1'))),
    'MP3 ID3': Buffer.concat([Buffer.from([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, termo.length]), Buffer.from(termo)]),
  };
  arquivos['MP4 udta'] = Buffer.concat([caixa('ftyp', Buffer.from('M4A \0\0\0\0', 'latin1')), arquivos['MP4 udta']]);
  for (const [formato, dados] of Object.entries(arquivos)) {
    assert.ok(textosParaVarrer(dados).some((texto) => achadosNoTexto(texto).length > 0), formato);
  }
  const binario = Buffer.concat([Buffer.from([0, 1, 2, 3]), Buffer.from(termo)]);
  assert.deepEqual(textosParaVarrer(binario), []);
  assert.deepEqual(textosParaVarrer(Buffer.from(`texto com ${termo}`)), [`texto com ${termo}`]);
});

test('no tracked or new file has a forbidden term in its path, text or metadata', () => {
  const arquivos = arquivosDoRepositorio();
  assert.ok(arquivos.includes('testes/rts-originalidade.test.mjs'));
  const problemas = arquivos.flatMap(varrerArquivo);
  assert.deepEqual(problemas, [], `forbidden terms found:\n${problemas.join('\n')}`);
});

test('no commit message of this branch, branch or tag name, or pull request text has a forbidden term', () => {
  const problemas = [];
  const registro = git('log', '--format=%H%n%B%x00', ...intervaloDeCommits());
  for (const bloco of registro.split('\0')) {
    const [hash, ...mensagem] = bloco.trim().split('\n');
    if (hash) problemas.push(...descrever(`commit ${hash.slice(0, 12)}`, achadosNoTexto(mensagem.join('\n'))));
  }
  for (const referencia of git('for-each-ref', '--format=%(refname)', 'refs/heads', 'refs/remotes', 'refs/tags').split('\n').filter(Boolean)) {
    problemas.push(...descrever(`ref ${referencia}`, achadosNoTexto(referencia.split('/').join(' '))));
  }
  // The Action passes the pull request title and body here.
  problemas.push(...descrever('pull request', achadosNoTexto(process.env.RTS_TEXTO_EXTRA ?? '')));
  assert.deepEqual(problemas, [], `forbidden terms found:\n${problemas.join('\n')}`);
});
