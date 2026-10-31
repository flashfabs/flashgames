#!/usr/bin/env node
// Plays a mission of the repository in Node with a scripted player and fills the real play-test log (C15) the way
// the page does, from every snapshot and every command, then runs the pacing checker on it. It shows, without a
// browser, whether the mission ends, how, and what its log says (attack warnings, pacing, lessons once the design
// front lists them) in each difficulty. Long matches belong on the RTX 4090 PC: ferramentas/rts/rtx-node.sh -- <this>.
//
// node ferramentas/rts/ritmo/jogar-roteiro.mjs [--missao caixa-de-areia] [--dificuldade normal] [--minutos 30]
//   [--roteiro testes/e2e/rts-roteiro.mjs] [--saida registro.json] [--json]
// The script module exports criarRoteiro(), decidir(retrato, roteiro, mapa) and DECISAO_SEGUNDOS.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { criarSimulacao, passo, agendarComando } from '../../../site/rts/js/sim/simulacao.js';
import { TIPO_COMANDO, PASSOS_POR_SEGUNDO, VERSAO_SIMULACAO, VERSAO_COMANDOS, EVENTO, TAMANHO_EVENTO, E_TIPO } from '../../../site/rts/js/sim/contratos.js';
import { montarRetrato, montarMapaEstatico } from '../../../site/rts/js/sim/retrato.js';
import { criarRegistro } from '../../../site/rts/js/telemetria/registro.js';
import { decodificarRetrato } from '../../../site/rts/js/teste/gancho.js';
import { conferirRegistro } from './ritmo.mjs';

const RAIZ = new URL('../../../', import.meta.url);

function argumentos(lista) {
  const opcoes = { missao: 'caixa-de-areia', dificuldade: 'normal', minutos: 30, roteiro: 'testes/e2e/rts-roteiro.mjs', saida: null, json: false };
  for (let k = 0; k < lista.length; k++) {
    const chave = lista[k].replace(/^--/, '');
    if (chave === 'json') opcoes.json = true;
    else if (chave in opcoes) opcoes[chave] = chave === 'minutos' ? Number(lista[++k]) : lista[++k];
    else throw new Error(`opção desconhecida: ${lista[k]}`);
  }
  return opcoes;
}

/** The mission, its map and the game data, read from site/rts/dados the way the page loads them. */
export function carregarPartida(missaoId) {
  const pasta = new URL('site/rts/dados/', RAIZ);
  const ler = caminho => readFileSync(new URL(caminho, pasta));
  const json = caminho => JSON.parse(ler(caminho).toString('utf8'));
  const dados = Object.fromEntries(['unidades', 'predios', 'economia', 'pesquisas', 'armas'].map(nome => [nome, json(`${nome}.json`)]));
  const missao = json(`missoes/${missaoId}.json`);
  const pastaMapa = `mapas/${missao.mapa}/`;
  const cabecalho = json(`${pastaMapa}mapa.json`);
  const arquivosMapa = { cabecalho, camadas: new Uint8Array(ler(pastaMapa + cabecalho.camadas.arquivo)), entidades: json(`${pastaMapa}entidades.json`) };
  return { dados, missao, arquivosMapa };
}

/**
 * Plays one match and returns { resultado, minutos, registro (exported C15), conferido (checker result) }.
 * @param {{ missao: string, dificuldade: string, minutos: number, roteiro: { criarRoteiro, decidir, DECISAO_SEGUNDOS } }} opcoes
 */
export function jogar({ missao: missaoId, dificuldade, minutos, roteiro: modulo }) {
  const { dados, missao, arquivosMapa } = carregarPartida(missaoId);
  const sim = criarSimulacao({ dados, arquivosMapa, missao, dificuldade });
  const mapa = montarMapaEstatico(sim, 0);
  const registro = criarRegistro({
    missao: missao.id,
    jogadorLocal: 0,
    dificuldade,
    tipos: mapa.tipos.map(t => ({ nome: t.nome, coletor: t.coletor })),
    mapa: arquivosMapa.entidades,
    missaoDados: missao,
    versoes: { simulacao: VERSAO_SIMULACAO, comandos: VERSAO_COMANDOS },
    agora: () => 'node',
  });
  const roteiro = modulo.criarRoteiro();
  const passosPorDecisao = modulo.DECISAO_SEGUNDOS * PASSOS_POR_SEGUNDO;
  const fim = minutos * 60 * PASSOS_POR_SEGUNDO;
  let seq = 0;
  let terminou = false;
  registro.anotarRetrato(montarRetrato(sim, { jogadorLocal: 0 }));
  while (sim.tick < fim && !terminou) {
    if (sim.tick % passosPorDecisao === 0) {
      const retrato = decodificarRetrato(montarRetrato(sim, { jogadorLocal: 0 }), mapa);
      for (const ordem of modulo.decidir(retrato, roteiro, mapa)) {
        const comando = { tick: sim.tick + 1, jogador: 0, seq: seq++, unidades: [], alvo: -1, x: 0, y: 0, arg: 0, fila: 0, ...ordem, tipo: TIPO_COMANDO[ordem.tipo] };
        registro.anotarComando(comando, 'teste');
        agendarComando(sim, comando);
      }
    }
    passo(sim);
    registro.anotarRetrato(montarRetrato(sim, { jogadorLocal: 0 }));
    for (let k = 0; k + TAMANHO_EVENTO <= sim.eventos.length; k += TAMANHO_EVENTO) {
      if (sim.eventos[k + E_TIPO] === EVENTO.VITORIA || sim.eventos[k + E_TIPO] === EVENTO.DERROTA) terminou = true;
    }
  }
  const exportado = registro.exportar();
  return { resultado: exportado.resultado, minutos: +(sim.tick / (60 * PASSOS_POR_SEGUNDO)).toFixed(2), registro: exportado, conferido: conferirRegistro(exportado) };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const opcoes = argumentos(process.argv.slice(2));
  const roteiro = await import(pathToFileURL(resolve(fileURLToPath(RAIZ), opcoes.roteiro)).href);
  const partida = jogar({ ...opcoes, roteiro });
  if (opcoes.saida) writeFileSync(opcoes.saida, JSON.stringify(partida.registro));
  if (opcoes.json) {
    console.log(JSON.stringify({ missao: opcoes.missao, dificuldade: opcoes.dificuldade, resultado: partida.resultado, minutos: partida.minutos, criterios: partida.conferido.criterios }, null, 1));
  } else {
    console.log(`${opcoes.missao}, ${opcoes.dificuldade}: ${partida.resultado ?? 'sem fim'} aos ${partida.minutos} min`);
    for (const c of partida.conferido.criterios) console.log(`  ${c.nome}: ${c.texto} (meta ${c.meta}) ${c.passou === null ? 'sem dado' : c.passou ? 'passou' : 'NÃO passou'}`);
  }
}
