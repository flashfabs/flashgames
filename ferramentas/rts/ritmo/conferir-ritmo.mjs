#!/usr/bin/env node
// Command line of the pacing checker: node ferramentas/rts/ritmo/conferir-ritmo.mjs <registro.json>... [--json]
// Prints each log's numbers and, with several logs (one per person), the median per criterion; logs named
// novato-*.json and veterano-*.json also get the stage E4 numbers, and the lessons of the mission come from its
// "licoes" field (or site/rts/dados/missoes/<missao>.licoes.json) when the design front wrote them.
// Exit code: 0 when every criterion with data passed, 1 when one failed, 2 when a file could not be read.
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { conferirVarios, conferirE4, grupoDoArquivo, relogio } from './ritmo.mjs';
import { conferirLicoesVarias, validarLicoes } from './licoes.mjs';

const argumentos = process.argv.slice(2);
const comoJson = argumentos.includes('--json');
const arquivos = argumentos.filter(a => a !== '--json');
if (arquivos.length === 0) {
  console.error('uso: node ferramentas/rts/ritmo/conferir-ritmo.mjs <registro.json>... [--json]');
  process.exit(2);
}

const registros = [];
for (const arquivo of arquivos) {
  try {
    registros.push(JSON.parse(await readFile(arquivo, 'utf8')));
  } catch (erro) {
    console.error(`${arquivo}: não deu para ler (${erro.message})`);
    process.exit(2);
  }
}

const { individuais, resumo } = conferirVarios(registros);
const marca = passou => (passou === null ? 'sem dado' : passou ? 'passou' : 'NÃO passou');
const formatar = (id, valor) => {
  if (valor === null) return '—';
  if (id === 'duracao' || id === 'primeiroTiro' || id === 'primeiroCemiterio') return relogio(valor);
  if (id === 'luta10contra10') return `${valor.toFixed(1)} s`;
  if (id === 'janelasSemComando') return `${(valor * 100).toFixed(1)}%`;
  if (id === 'avisoDeAtaque') return valor < 0 ? 'onda sem aviso' : `pior aviso ${valor.toFixed(1)} s`;
  if (id === 'diversao') return `${valor} de 5`;
  if (id === 'jogariaDeNovo') return valor === 1 ? 'sim' : 'não de alguém';
  return String(valor);
};

if (!comoJson) {
  individuais.forEach((resultado, k) => {
    console.log(`\n${arquivos[k]}`);
    if (!resultado.valido) {
      for (const problema of resultado.problemas) console.log(`  inválido: ${problema}`);
      return;
    }
    for (const c of resultado.criterios) console.log(`  ${c.nome}: ${c.texto} (meta ${c.meta}) ${marca(c.passou)}`);
  });
  if (individuais.filter(r => r.valido).length > 1) {
    console.log('\nMediana das partidas (aviso de ataque: o pior de todas)');
    for (const c of resumo) console.log(`  ${c.nome}: ${formatar(c.id, c.valor)} em ${c.comDado} de ${c.total} (meta ${c.meta}) ${marca(c.passou)}`);
  }
}

// logs named novato-*.json and veterano-*.json are the stage E4 play test (marco M4)
const e4 = arquivos.some(arquivo => grupoDoArquivo(arquivo) !== null) ? conferirE4(arquivos.map((nome, k) => ({ nome, registro: registros[k] }))) : null;
if (e4 && !comoJson) {
  console.log('\nE4: novatos e veteranos');
  for (const c of e4.criterios) console.log(`  ${c.nome}: ${c.texto} (meta ${c.meta}) ${marca(c.passou)}`);
  if (e4.semGrupo.length > 0) console.log(`  sem grupo no nome (novato-... ou veterano-...): ${e4.semGrupo.join(', ')}`);
}

// lessons of the mission the logs played: the mission's own "licoes" field, else a <missao>.licoes.json next to it
const missoes = [...new Set(registros.map(r => r?.missao).filter(Boolean))];
const pastaMissoes = new URL('../../../site/rts/dados/missoes/', import.meta.url);
function listaDeLicoes(missao) {
  const arquivoMissao = new URL(`${missao}.json`, pastaMissoes);
  const dentro = existsSync(arquivoMissao) ? JSON.parse(readFileSync(arquivoMissao, 'utf8')).licoes : undefined;
  if (dentro) return Array.isArray(dentro) ? { versao: 1, licoes: dentro } : dentro;
  const separado = new URL(`${missao}.licoes.json`, pastaMissoes);
  return existsSync(separado) ? JSON.parse(readFileSync(separado, 'utf8')) : null;
}
let resultadoLicoes = null;
const lista = missoes.length === 1 ? listaDeLicoes(missoes[0]) : null;
if (lista) {
  const problemas = validarLicoes(lista);
  if (problemas.length > 0) console.error(`lista de lições inválida: ${problemas.join('; ')}`);
  else {
    resultadoLicoes = conferirLicoesVarias(registros.filter(r => individuais[registros.indexOf(r)].valido), lista);
    if (!comoJson) {
      console.log(`\nLições de ${missoes[0]} (pelo menos ${resultadoLicoes[0]?.minimo ?? 0} de ${resultadoLicoes[0]?.total ?? 0} registros)`);
      for (const l of resultadoLicoes) console.log(`  ${l.texto}${l.momento ? ` (${l.momento})` : ''}: ${l.pessoas} de ${l.total} ${marca(l.passou)}`);
    }
  }
}

if (comoJson) console.log(JSON.stringify({ arquivos, individuais, resumo, e4, licoes: resultadoLicoes }, null, 2));

const invalido = individuais.some(r => !r.valido);
const reprovado = (individuais.length > 1 ? resumo : individuais[0]?.criterios ?? []).some(c => c.passou === false) || (e4?.criterios ?? []).some(c => c.passou === false) || (resultadoLicoes ?? []).some(l => l.passou === false);
process.exit(invalido ? 2 : reprovado ? 1 : 0);
