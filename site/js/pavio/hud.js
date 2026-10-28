// HUD above the arena: your powers as chips (the timed ones with a ring showing the time left), your
// points and the match clock. It only touches the DOM when something it shows changes.

import { AJUSTES } from './regras.js';

// [field in the player view, icon, name, kind]. 'contador' shows a number, 'liga' just the icon while on,
// 'tempo' the icon with a ring that empties over the power's duration.
const PODERES = [
  ['b', '💣', 'Bombas', 'contador'],
  ['f', '🔥', 'Alcance', 'contador'],
  ['t', '👟', 'Tênis', 'contador'],
  ['e', '🛡️', 'Escudo', 'liga'],
  ['p', '💥', 'Fogo perfurante', 'liga'],
  ['k', '🦶', 'Chute', 'liga'],
  ['r', '🎯', 'Detonador', 'liga'],
  ['gl', '❄️', 'Gelo', 'contador'],
  ['at', '🌀', 'Atalhos', 'contador'],
  ['g', '👻', 'Fantasma', 'tempo', AJUSTES.fantasmaS],
  ['m', '🧲', 'Ímã', 'tempo', AJUSTES.imaS],
];
// Always shown, even at zero, so the basics never jump around.
const SEMPRE = new Set(['b', 'f', 't']);
const ALERTA_SUBITA_S = 10;
// Optional frames-per-second readout (for a settings screen), remembered on this device.
const CHAVE_DESEMPENHO = 'salinha:mostrar-desempenho';
let mostrarDesempenho = lerMostrarDesempenho();

export function lerMostrarDesempenho() {
  try {
    return localStorage.getItem(CHAVE_DESEMPENHO) === '1';
  } catch {
    return false;
  }
}

export function definirMostrarDesempenho(mostrar) {
  mostrarDesempenho = Boolean(mostrar);
  try {
    localStorage.setItem(CHAVE_DESEMPENHO, mostrarDesempenho ? '1' : '0');
  } catch {
    // Storage may be blocked (private mode); it still applies for this visit.
  }
}

function formatarTempo(segundos) {
  const total = Math.max(0, Math.ceil(segundos));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function reiniciarAnimacao(elemento, classe) {
  elemento.classList.remove(classe);
  void elemento.offsetWidth;
  elemento.classList.add(classe);
}

// raiz: the HUD row; itens, pontos and tempo: its three parts (already in the page).
export function criarHud({ raiz, itens, pontos, tempo }) {
  const chips = new Map(); // field -> { elemento, valor, ligadoEm }
  let presentes = '';
  let ultimoTotal = null;
  let ultimoTempo = '';
  let visivel = null;
  let desempenho = null;
  let desempenhoEm = 0;

  const chip = (campo, icone, nome, tipo) => {
    if (!chips.has(campo)) {
      const elemento = document.createElement('span');
      elemento.className = `pavio-chip pavio-chip--${tipo}`;
      elemento.title = nome;
      const simbolo = document.createElement('span');
      simbolo.className = 'pavio-chip-icone';
      simbolo.setAttribute('aria-hidden', 'true');
      simbolo.textContent = icone;
      const valor = document.createElement('b');
      elemento.append(simbolo, valor);
      chips.set(campo, { elemento, valor: null, ligadoEm: 0 });
    }
    return chips.get(campo);
  };

  const atualizarPoderes = jogador => {
    const agora = performance.now() / 1000;
    const visiveis = [];
    for (const [campo, icone, nome, tipo, duracao] of PODERES) {
      const valor = Number(jogador?.[campo]) || 0;
      if (!jogador || (!valor && !SEMPRE.has(campo))) {
        if (chips.has(campo)) chips.get(campo).valor = null;
        continue;
      }
      const dados = chip(campo, icone, nome, tipo);
      if (dados.valor !== valor) {
        if (tipo === 'tempo' && !dados.valor) dados.ligadoEm = agora;
        const texto = tipo === 'contador' ? String(valor) : '';
        if (dados.elemento.lastChild.textContent !== texto) dados.elemento.lastChild.textContent = texto;
        dados.elemento.setAttribute('aria-label', tipo === 'contador' ? `${nome}: ${valor}` : nome);
        // A new or bigger power pops; losing one (a used shield, spent ice) does not.
        if (dados.valor !== null && valor > dados.valor) reiniciarAnimacao(dados.elemento, 'pavio-chip--novo');
        else if (dados.valor === null && !SEMPRE.has(campo)) reiniciarAnimacao(dados.elemento, 'pavio-chip--novo');
        dados.valor = valor;
      }
      if (tipo === 'tempo') {
        const resta = Math.max(0, 1 - (agora - dados.ligadoEm) / duracao);
        dados.elemento.style.setProperty('--resta', resta.toFixed(3));
      }
      visiveis.push(campo);
    }
    const chave = visiveis.join(',');
    if (chave !== presentes) {
      presentes = chave;
      itens.replaceChildren(...visiveis.map(campo => chips.get(campo).elemento));
      // Many powers at once: tighter chips, so they still fit next to the points and the clock.
      itens.classList.toggle('pavio-hud-itens--compacto', visiveis.length > 5);
    }
  };

  // Frames per second and the canvas scale, refreshed twice a second while the readout is on.
  const atualizarDesempenho = qualidade => {
    if (!mostrarDesempenho || !qualidade) {
      desempenho?.remove();
      desempenho = null;
      return;
    }
    if (!desempenho) {
      desempenho = document.createElement('div');
      desempenho.className = 'pavio-hud-desempenho';
      raiz.append(desempenho);
    }
    const agora = performance.now();
    if (agora - desempenhoEm < 500) return;
    desempenhoEm = agora;
    desempenho.textContent = `${Math.round(1000 / qualidade.quadroMs)} qps · ${qualidade.escala}x`;
  };

  // estado: null hides the HUD; otherwise { jogador (your view, or undefined while watching), pontos
  // (your total, or null), paraSubita (seconds until sudden death), fase, qualidade (from the painter) }.
  const atualizar = estado => {
    const mostrar = Boolean(estado);
    if (mostrar !== visivel) {
      visivel = mostrar;
      raiz.style.visibility = mostrar ? 'visible' : 'hidden';
    }
    if (!mostrar) return;
    const { jogador, pontos: total, paraSubita, fase, qualidade } = estado;
    atualizarPoderes(jogador);
    atualizarDesempenho(qualidade);
    const textoPontos = total === null ? '' : `⭐ ${total}`;
    if (pontos.textContent !== textoPontos) pontos.textContent = textoPontos;
    if (total !== null && ultimoTotal !== null && total > ultimoTotal && fase === 'jogo') reiniciarAnimacao(pontos, 'pavio-hud-pontos--sobe');
    ultimoTotal = total;
    const textoTempo = paraSubita > 0 ? `⏱ ${formatarTempo(paraSubita)}` : '☠ Morte súbita';
    if (textoTempo !== ultimoTempo) {
      ultimoTempo = textoTempo;
      tempo.textContent = textoTempo;
      tempo.classList.toggle('pavio-hud-tempo--subita', paraSubita <= 0);
      tempo.classList.toggle('pavio-hud-tempo--alerta', paraSubita > 0 && paraSubita <= ALERTA_SUBITA_S && fase === 'jogo');
    }
  };

  return { atualizar };
}
