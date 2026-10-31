// Harness of the computer teams (front F6): plays a mission on its real map and data with its "equipes" block (or,
// for the design front's sandbox, which has none yet, a block made from its waves: each wave attacks along the route
// its trigger gives, the garrison guards the camp and the camp rebuilds), with nobody at the controls or with a
// defending army at the player's base, and measures what the teams cost: for each computer player, the decision
// (vistaDoTime plus the behaviours) timed on the state the step is about to decide on, then restored, so the match
// plays exactly as without the measurement. Prints JSON: decisions, mean cost per step, p50, p99 and worst decision,
// the view's share, commands, warnings and waves, and how the match ended.
// Run long or heavy measurements on the RTX 4090 PC: ferramentas/rts/rtx-node.sh -- ferramentas/rts/ia-harness.mjs ...
//   node ferramentas/rts/ia-harness.mjs [--missao caixa-de-areia] [--dificuldade normal] [--minutos 20]
//        [--exercito 0] (player infantry holding the base) [--reforco 0] (extra garrison units guarding the camp)
// The wave 5 harness of 100 computer-against-computer matches grows from this file.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { criarSimulacao, passo, REGRAS_LIVRES } from '../../site/rts/js/sim/simulacao.js';
import { FP, EVENTO, TAMANHO_EVENTO, E_TIPO, CATEGORIA } from '../../site/rts/js/sim/contratos.js';
import { compilarDados } from '../../site/rts/js/sim/dados.js';
import { celulaLivreMaisProxima } from '../../site/rts/js/sim/mapa.js';
import { criarEntidade } from '../../site/rts/js/sim/entidades.js';
import { rotular, resultadoDaMissao, RESULTADO } from '../../site/rts/js/sim/gatilhos.js';
import { vistaDoTime } from '../../site/rts/js/sim/vista.js';
import { equipesDe, decisaoDoJogador, INTERVALO_DECISAO } from '../../site/rts/js/sim/comportamentos/equipes.js';

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

// The arrays of the teams' state, copied, so a measured decision can be undone.
const copiarEstado = sim => Object.fromEntries(Object.entries(sim.extras.equipes).map(([nome, a]) => [nome, a.slice()]));
const restaurarEstado = (sim, copia) => {
  for (const [nome, a] of Object.entries(copia)) sim.extras.equipes[nome].set(a);
};

/** Plays `minutos` of the match and measures each computer player's decisions. */
export function medir(sim, minutos) {
  const c = equipesDe(sim);
  if (!c) throw new Error('a missão não tem equipes');
  const porJogador = new Map(c.jogadores.map(j => [j, { decisoes: [], vistas: [], comandos: 0 }]));
  const eventos = { avisos: 0, ondas: 0 };
  const passos = minutos * 60 * 30;
  const relogio = () => performance.now();
  let fim = null;
  for (let k = 0; k < passos; k++) {
    // the decisions the next step makes, timed on the state it starts from, then undone
    const proximo = sim.tick + 1;
    for (const j of c.jogadores) {
      if ((proximo + 3 * j) % INTERVALO_DECISAO !== 0) continue;
      const copia = copiarEstado(sim);
      sim.tick = proximo;
      const t0 = relogio();
      vistaDoTime(sim, j);
      const t1 = relogio();
      decisaoDoJogador(sim, j);
      const t2 = relogio();
      sim.tick = proximo - 1;
      restaurarEstado(sim, copia);
      porJogador.get(j).vistas.push(t1 - t0);
      porJogador.get(j).decisoes.push(t2 - t1);
    }
    const antes = sim.comandos.length;
    passo(sim);
    for (const cmd of sim.comandos.slice(antes)) if (porJogador.has(cmd.jogador)) porJogador.get(cmd.jogador).comandos++;
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
  const unidades = time => {
    let n = 0;
    for (let i = 0; i < sim.capacidade; i++) if (sim.ativo[i] && sim.time[i] === time && sim.categoriaPorTipo[sim.tipo[i]] === CATEGORIA.UNIDADE) n++;
    return n;
  };
  const jogadores = [...porJogador].map(([jogador, m]) => {
    // the view is built once per decision: its share counts once, inside the decision's total
    const totais = m.decisoes;
    const soma = totais.reduce((a, b) => a + b, 0);
    return {
      jogador,
      decisoes: totais.length,
      msPorPassoMedia: ms(soma / Math.max(1, sim.tick)),
      msDecisaoP50: ms(percentil(totais, 50)),
      msDecisaoP99: ms(percentil(totais, 99)),
      msDecisaoMaximo: ms(Math.max(0, ...totais)),
      msVistaP50: ms(percentil(m.vistas, 50)),
      comandos: m.comandos,
      unidadesNoFim: unidades(jogador),
    };
  });
  return { passos: sim.tick, fim, eventos, jogadores, unidadesDoJogadorNoFim: unidades(0) };
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
