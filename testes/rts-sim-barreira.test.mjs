// Determinism barrier: everything under site/rts/js/sim/ (the computer teams' behaviours included) runs in lockstep
// and in replays, so it must not touch floats, clocks, randomness or the DOM. This test reads the source and fails on
// any of them outside comments and strings.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const pastaSim = join(raiz, 'site/rts/js/sim');

const PROIBIDOS = [
  [/\bMath\.(random|sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|asinh|acosh|atanh|exp|expm1|log|log2|log10|log1p|pow|hypot|sqrt|cbrt|fround)\b/, 'Math transcendental or random'],
  [/\bDate\b/, 'Date'],
  [/\bperformance\b/, 'performance'],
  [/\bFloat(32|64)Array\b/, 'float typed array'],
  [/\b(setTimeout|setInterval|requestAnimationFrame|document|window|navigator|crypto|localStorage|fetch)\b/, 'clock, DOM or browser API'],
  [/(^|[^\w.])\d*\.\d+/, 'decimal literal'],
  [/(^|[^\w.])\d+[eE][+-]?\d/, 'exponent literal'],
  [/\*\*/, 'exponentiation'],
  [/\b(toFixed|toPrecision|parseFloat)\b/, 'float formatting or parsing'],
  [/\bNumber\.(EPSILON|MIN_VALUE)\b/, 'float constant'],
];

function arquivos(pasta) {
  return readdirSync(pasta).flatMap(nome => {
    const caminho = join(pasta, nome);
    if (statSync(caminho).isDirectory()) return arquivos(caminho);
    return nome.endsWith('.js') || nome.endsWith('.mjs') ? [caminho] : [];
  });
}

/** Source with comments, strings, template literals and regex literals blanked, keeping line numbers. */
export function semComentariosNemTextos(fonte) {
  let saida = '';
  let i = 0;
  const branco = trecho => trecho.replace(/[^\n]/g, ' ');
  while (i < fonte.length) {
    const c = fonte[i];
    const proximo = fonte[i + 1];
    if (c === '/' && proximo === '/') {
      const fim = fonte.indexOf('\n', i);
      const ate = fim < 0 ? fonte.length : fim;
      saida += branco(fonte.slice(i, ate));
      i = ate;
    } else if (c === '/' && proximo === '*') {
      const ate = fonte.indexOf('*/', i + 2) + 2;
      saida += branco(fonte.slice(i, ate));
      i = ate;
    } else if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      while (j < fonte.length && fonte[j] !== c) j += fonte[j] === '\\' ? 2 : 1;
      saida += c + branco(fonte.slice(i + 1, j)) + c;
      i = j + 1;
    } else if (c === '/' && /[(,=:!&|?{};\n]\s*$/.test(saida.slice(-20))) {
      // a regex literal: where a division cannot start
      let j = i + 1;
      let classe = false;
      while (j < fonte.length && (fonte[j] !== '/' || classe)) {
        if (fonte[j] === '[') classe = true;
        else if (fonte[j] === ']') classe = false;
        j += fonte[j] === '\\' ? 2 : 1;
      }
      saida += '/' + branco(fonte.slice(i + 1, j)) + '/';
      i = j + 1;
    } else {
      saida += c;
      i++;
    }
  }
  return saida;
}

test('the simulation code has no float, clock, randomness or DOM', () => {
  const lista = arquivos(pastaSim);
  assert.ok(lista.length >= 10, 'found the simulation files');
  const problemas = [];
  for (const arquivo of lista) {
    const linhas = semComentariosNemTextos(readFileSync(arquivo, 'utf8')).split('\n');
    linhas.forEach((linha, n) => {
      for (const [padrao, motivo] of PROIBIDOS) if (padrao.test(linha)) problemas.push(`${relative(raiz, arquivo)}:${n + 1}: ${motivo}: ${linha.trim()}`);
    });
  }
  assert.deepEqual(problemas, []);
});

test('the barrier catches what it must and skips comments and strings', () => {
  const pega = fonte => PROIBIDOS.some(([padrao]) => semComentariosNemTextos(fonte).split('\n').some(linha => padrao.test(linha)));
  for (const ruim of ['const a = Math.sin(x);', 'let v = 0.5;', 'const t = Date.now();', 'x = performance.now()', 'new Float32Array(4)', 'y = 2 ** 3', 'a = .25', 'k = 1e3']) assert.ok(pega(ruim), ruim);
  for (const bom of ['const h = 0x6a09e667;', '// Math.random() is not allowed', "const s = 'a 0.5 text';", 'const r = /0.5/;', 'const q = a / b / 3;', 'x = obj.v1', '/* Date */ const k = 3;']) assert.ok(!pega(bom), bom);
});
