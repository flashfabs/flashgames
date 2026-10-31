// Harness of the computer teams (front F6): plays a mission on its real map and data with its "equipes" block (or,
// for the design front's sandbox, which has none yet, a block made from its waves: each wave attacks along the route
// its trigger gives, the garrison guards the camp and the camp rebuilds), with nobody at the controls or with a
// defending army at the player's base, and measures what the teams cost: for each computer player, each decision
// timed inside the step, from the seam's ativo() through its context (the team's view) and decidir() to the commands
// applied, by wrapping the behaviours module (usarComportamentos), so the match plays exactly as without the
// measurement. Prints JSON: decisions, mean cost per step, p50, p99 and worst decision, commands, warnings and
// waves, and how the match ended. Wall time suffers when the machine is busy (other sessions' tests on the shared PC):
// the load average goes with the numbers, and the five worst decisions with their ticks, to tell a hard decision from
// a pause of the machine; the first decision, which also builds the seam's static map once per match, is apart.
// Run long or heavy measurements on the RTX 4090 PC: ferramentas/rts/rtx-node.sh -- ferramentas/rts/ia-harness.mjs ...
//   node ferramentas/rts/ia-harness.mjs [--missao caixa-de-areia] [--dificuldade normal] [--minutos 20]
//        [--exercito 0] (player infantry holding the base) [--reforco 0] (extra garrison units guarding the camp)
// The wave 5 harness of 100 computer-against-computer matches grows from this file.
import { readFileSync } from 'node:fs';
import { cpus, loadavg } from 'node:os';
import { pathToFileURL } from 'node:url';
import { criarSimulacao, passo, REGRAS_LIVRES } from '../../site/rts/js/sim/simulacao.js';
import { FP, EVENTO, TAMANHO_EVENTO, E_TIPO, CATEGORIA } from '../../site/rts/js/sim/contratos.js';
import { compilarDados } from '../../site/rts/js/sim/dados.js';
import { celulaLivreMaisProxima } from '../../site/rts/js/sim/mapa.js';
import { criarEntidade } from '../../site/rts/js/sim/entidades.js';
import { rotular, resultadoDaMissao, RESULTADO } from '../../site/rts/js/sim/gatilhos.js';
import { usarComportamentos } from '../../site/rts/js/sim/equipes.js';
import { equipesDaPartida } from '../../site/rts/js/sim/comportamentos/formato.js';
import * as comportamentos from '../../site/rts/js/sim/comportamentos/indice.js';

const dadosUrl = new URL('../../site/rts/dados/', import.meta.url);
const json = url => JSON.parse(readFileSync(url, 'utf8'));

/** The design data files (C5) as the simulation takes them. */
export function arquivosDeDados() {
  return Object.fromEntries(['unidades', 'predios', 'economia', 'pesquisas', 'armas'].map(nome => [nome, json(new URL(`${nome}.json`, dadosUrl))]));
}

/** A map's C6 files as criarSimulacao's arquivosMapa. */
export function arquivosDoMapa(id) {
  const pasta = new URL(`mapas/${id}/`, dadosUrl);
  const cabecalho = json(new URL('mapa.json', pasta));
  return { cabecalho, camadas: new Uint8Array(readFileSync(new URL(cabecalho.camadas.arquivo, pasta))), entidades: json(new URL('entidades.json', pasta)) };
}

export const lerMissao = id => json(new URL(`missoes/${id}.json`, dadosUrl));

/**
 * Teams for a mission without them, from its triggers: every group a trigger orders along a route attacks along it
 * to `destino` (the triggers warn), falling back to the camp when beaten; the `guarnicao` union guards the camp and
 * the `acampamento` union rebuilds. For measuring and trying the behaviours on the sandbox.
 */
export function equipesDasOndas(missao, { destino = 'base-jogador', campo = 'acampamento', jogador = 1 } = {}) {
  const rotaDe = new Map();
  for (const g of missao.gatilhos ?? []) {
    for (const a of g.acoes ?? g.faz ?? []) if (a.faz === 'ordenar' && a.rota && !rotaDe.has(a.grupo)) rotaDe.set(a.grupo, a.rota);
  }
  const equipes = [...rotaDe].map(([grupo, rota]) => ({ id: grupo, grupo, jogador, faz: 'atacar', rota, area: destino, aviso: 0, recuar: 25, recuo: campo }));
  const unioes = missao.grupos ?? {};
  if ('guarnicao' in unioes) equipes.push({ id: 'guarnicao', grupo: 'guarnicao', jogador, faz: 'guardar', area: campo, alcance: 4 });
  if ('acampamento' in unioes) equipes.push({ id: 'acampamento', grupo: 'acampamento', jogador, faz: 'reconstruir' });
  return equipes;
}

/**
 * A mission's match on its real map and data, its teams in place (`equipes`, else the mission's own, else
 * equipesDasOndas), with `exercito` player infantry around its headquarters and `reforco` more garrison units for the
 * computer player at the camp.
 */
export function partidaReal({ missao: id = 'caixa-de-areia', dificuldade = 'normal', equipes, exercito = 0, reforco = 0, capacidade = 1200 } = {}) {
  const base = lerMissao(id);
  const missao = { ...base, equipes: equipes ?? base.equipes ?? equipesDasOndas(base) };
  const arquivosMapa = arquivosDoMapa(missao.mapa);
  const sim = criarSimulacao({ dados: arquivosDeDados(), arquivosMapa, missao, dificuldade, regras: REGRAS_LIVRES, capacidade });
  const tipo = nome => sim.tipos.findIndex(t => t.nome === nome);
  const perto = (rotulo, n, tipoNome, time, aoCriar) => {
    const k = sim.etiquetas[rotulo];
    if (k === undefined) return;
    const cx = sim.x[k] >> 10;
    const cy = sim.y[k] >> 10;
    for (let j = 0; j < n; j++) {
      const c = celulaLivreMaisProxima(sim.mapa, cx + ((j * 7) % 13) - 6, cy + ((j * 5) % 11) - 5);
      if (c < 0) continue;
      const i = criarEntidade(sim, tipo(tipoNome), time, (c % sim.mapa.largura) * FP + (FP >> 1), Math.trunc(c / sim.mapa.largura) * FP + (FP >> 1));
      if (i >= 0) aoCriar?.(i);
    }
  };
  perto('qg-jogador', exercito, 'turma-de-linha', 0);
  perto('acampamento-carrocao-mae', reforco, 'chapa', 1, i => rotular(sim, i, 'guarnicao-chapa-1'));
  return sim;
}

const percentil = (lista, p) => {
  if (lista.length === 0) return 0;
  const ordenada = lista.slice().sort((a, b) => a - b);
  return ordenada[Math.min(ordenada.length - 1, Math.floor((ordenada.length * p) / 100))];
};
const ms = v => Math.round(v * 1000) / 1000;

/** Plays `minutos` of the match and measures each computer player's decisions. */
export function medir(sim, minutos) {
  const c = equipesDaPartida(sim);
  if (!c) throw new Error('a missão não tem equipes');
  const porJogador = new Map(c.jogadores.map(j => [j, { decisoes: [], ticks: [], comandos: 0 }]));
  const cargaAntes = loadavg()[0];
  const eventos = { avisos: 0, ondas: 0 };
  const passos = minutos * 60 * 30;
  const relogio = () => performance.now();

  // a decision runs from ativo() returning true, through the context the seam builds, to decidir() returning
  let inicio = 0;
  const anterior = usarComportamentos({
    ativo(s, time) {
      const ativo = comportamentos.ativo(s, time);
      if (ativo) inicio = relogio();
      return ativo;
    },
    decidir(ctx) {
      const saida = comportamentos.decidir(ctx);
      const m = porJogador.get(ctx.time);
      m.decisoes.push(relogio() - inicio);
      m.ticks.push(ctx.tick);
      m.comandos += saida.comandos.length;
    },
  });
  let fim = null;
  for (let k = 0; k < passos; k++) {
    passo(sim);
    for (let o = 0; o < sim.eventos.length; o += TAMANHO_EVENTO) {
      if (sim.eventos[o + E_TIPO] === EVENTO.AVISO_ATAQUE) eventos.avisos++;
      if (sim.eventos[o + E_TIPO] === EVENTO.ONDA) eventos.ondas++;
    }
    const resultado = resultadoDaMissao(sim);
    if (resultado.some(r => r !== RESULTADO.JOGANDO)) {
      fim = { passo: sim.tick, minutos: Math.round((sim.tick / 1800) * 10) / 10, resultado: [...resultado].map(r => Object.keys(RESULTADO).find(n => RESULTADO[n] === r)) };
      break;
    }
  }
  usarComportamentos(anterior);
  const unidades = time => {
    let n = 0;
    for (let i = 0; i < sim.capacidade; i++) if (sim.ativo[i] && sim.time[i] === time && sim.categoriaPorTipo[sim.tipo[i]] === CATEGORIA.UNIDADE) n++;
    return n;
  };
  const jogadores = [...porJogador].map(([jogador, m]) => {
    // the first decision also builds the seam's static map, once per match: reported apart
    const totais = m.decisoes.slice(1);
    const soma = m.decisoes.reduce((a, b) => a + b, 0);
    const piores = totais.map((t, k) => [t, m.ticks[k + 1]]).sort((a, b) => b[0] - a[0]).slice(0, 5);
    return {
      jogador,
      decisoes: m.decisoes.length,
      msPorPassoMedia: ms(soma / Math.max(1, sim.tick)),
      msPrimeiraDecisao: ms(m.decisoes[0] ?? 0),
      msDecisaoP50: ms(percentil(totais, 50)),
      msDecisaoP99: ms(percentil(totais, 99)),
      msDecisaoMaximo: ms(Math.max(0, ...totais)),
      pioresDecisoes: piores.map(([t, tick]) => ({ ms: ms(t), tick })),
      comandos: m.comandos,
      unidadesNoFim: unidades(jogador),
    };
  });
  return { passos: sim.tick, fim, eventos, jogadores, unidadesDoJogadorNoFim: unidades(0), cpu: cpus()[0]?.model, nucleos: cpus().length, cargaMedia: [Math.round(cargaAntes * 10) / 10, Math.round(loadavg()[0] * 10) / 10] };
}

function argumentos(lista) {
  const valor = (nome, padrao) => {
    const k = lista.indexOf(`--${nome}`);
    return k >= 0 ? lista[k + 1] : padrao;
  };
  return {
    missao: valor('missao', 'caixa-de-areia'),
    dificuldade: valor('dificuldade', 'normal'),
    minutos: Number(valor('minutos', 20)),
    exercito: Number(valor('exercito', 0)),
    reforco: Number(valor('reforco', 0)),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const a = argumentos(process.argv.slice(2));
  const sim = partidaReal(a);
  const resultado = medir(sim, a.minutos);
  console.log(JSON.stringify({ ...a, node: process.version, ...resultado }, null, 2));
}
