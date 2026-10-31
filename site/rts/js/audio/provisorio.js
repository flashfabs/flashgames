// Provisional synthesized sounds for the grey slice, so the first playtests already sound like a game: interface
// clicks, order answers, shots, explosions, finished production and construction, and the under-attack alarm.
// Written by the interface front as a stated exception: this folder belongs to the audio front, whose engine (buses,
// voice budget, recorded answers) replaces this module in wave 3.
// Audio starts only from the Começar click (ligar), never before; every sound before that is silently skipped.

/** Sound names the game asks for; anything else is ignored. */
export const SOM = Object.freeze({
  CLIQUE: 'clique',
  SELECAO: 'selecao',
  ORDEM: 'ordem',
  ATAQUE: 'ataque',
  RECUSA: 'recusa',
  TIRO: 'tiro',
  EXPLOSAO: 'explosao',
  PRODUCAO: 'producao',
  CONSTRUCAO: 'construcao',
  SOB_ATAQUE: 'sobAtaque',
  ALERTA: 'alerta',
});

const VOLUME_GERAL = 0.8;
// Per sound: how many may ring at once and the shortest gap between two starts, in seconds, so a big fight is a
// texture instead of a wall of clicks.
const LIMITES = {
  [SOM.TIRO]: { vozes: 6, intervalo: 0.03 },
  [SOM.EXPLOSAO]: { vozes: 4, intervalo: 0.06 },
  [SOM.SOB_ATAQUE]: { vozes: 1, intervalo: 2.5 },
  [SOM.PRODUCAO]: { vozes: 2, intervalo: 0.25 },
  [SOM.CONSTRUCAO]: { vozes: 1, intervalo: 0.4 },
  [SOM.ALERTA]: { vozes: 1, intervalo: 0.5 },
};
const LIMITE_PADRAO = { vozes: 3, intervalo: 0.02 };

// A value nudged by up to ±faixa (as a fraction), so repeated sounds are never identical.
const variar = (valor, faixa) => valor * (1 + (Math.random() * 2 - 1) * faixa);

export function criarSomProvisorio() {
  let contexto = null;
  let saida = null;
  let ruido = null;
  let falhou = false;
  let mudo = false;
  const vozes = new Map();
  const ultimoInicio = new Map();

  function montar() {
    const Contexto = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Contexto) throw new Error('Web Audio unavailable');
    contexto = new Contexto();
    const limitador = contexto.createDynamicsCompressor();
    limitador.threshold.value = -10;
    limitador.knee.value = 6;
    limitador.ratio.value = 8;
    limitador.attack.value = 0.003;
    limitador.release.value = 0.2;
    limitador.connect(contexto.destination);
    saida = contexto.createGain();
    saida.gain.value = mudo ? 0 : VOLUME_GERAL;
    saida.connect(limitador);
    ruido = contexto.createBuffer(1, contexto.sampleRate, contexto.sampleRate);
    const dados = ruido.getChannelData(0);
    for (let i = 0; i < dados.length; i++) dados[i] = Math.random() * 2 - 1;
  }

  /** Creates or resumes the audio; call it only from the Começar click (a user gesture). */
  function ligar() {
    if (falhou) return;
    try {
      if (!contexto) montar();
      if (contexto.state !== 'running') contexto.resume().catch(erro => console.warn('provisional sound could not resume', erro));
    } catch (erro) {
      falhou = true;
      console.warn('provisional sound unavailable', erro);
    }
  }

  function tom(inicio, { forma = 'sine', de, ate = de, duracao, volume }) {
    const osc = contexto.createOscillator();
    const ganho = contexto.createGain();
    osc.type = forma;
    osc.frequency.setValueAtTime(de, inicio);
    if (ate !== de) osc.frequency.exponentialRampToValueAtTime(ate, inicio + duracao);
    ganho.gain.setValueAtTime(0.0001, inicio);
    ganho.gain.exponentialRampToValueAtTime(volume, inicio + 0.004);
    ganho.gain.exponentialRampToValueAtTime(0.0001, inicio + duracao);
    osc.connect(ganho).connect(saida);
    osc.start(inicio);
    osc.stop(inicio + duracao + 0.02);
    return inicio + duracao;
  }

  function chiado(inicio, { filtro = 'lowpass', freq, ate = freq, q = 1, duracao, volume }) {
    const fonte = contexto.createBufferSource();
    fonte.buffer = ruido;
    const f = contexto.createBiquadFilter();
    f.type = filtro;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, inicio);
    if (ate !== freq) f.frequency.exponentialRampToValueAtTime(ate, inicio + duracao);
    const ganho = contexto.createGain();
    ganho.gain.setValueAtTime(volume, inicio);
    ganho.gain.exponentialRampToValueAtTime(0.0001, inicio + duracao);
    fonte.connect(f).connect(ganho).connect(saida);
    // A random offset into the noise keeps back-to-back bursts from sounding the same.
    fonte.start(inicio, Math.random() * Math.max(0, 0.95 - duracao));
    fonte.stop(inicio + duracao);
    return inicio + duracao;
  }

  // Each recipe schedules its parts from t and returns when the sound ends; v scales the loudness (distance).
  const RECEITAS = {
    [SOM.CLIQUE]: (t, v) => tom(t, { forma: 'triangle', de: 1250, ate: 900, duracao: 0.025, volume: 0.05 * v }),
    [SOM.SELECAO]: (t, v) => tom(t, { forma: 'triangle', de: 660, ate: 880, duracao: 0.05, volume: 0.05 * v }),
    [SOM.ORDEM]: (t, v) => tom(t, { forma: 'square', de: 440, ate: 520, duracao: 0.07, volume: 0.05 * v }),
    [SOM.ATAQUE]: (t, v) => tom(t, { forma: 'sawtooth', de: 300, ate: 180, duracao: 0.09, volume: 0.06 * v }),
    [SOM.RECUSA]: (t, v) => tom(t, { forma: 'square', de: 200, ate: 140, duracao: 0.12, volume: 0.05 * v }),
    [SOM.TIRO]: (t, v) => {
      tom(t, { forma: 'triangle', de: variar(160, 0.15), ate: 70, duracao: 0.06, volume: 0.06 * v });
      return chiado(t, { filtro: 'bandpass', freq: variar(2200, 0.2), ate: 900, q: 1.4, duracao: 0.07, volume: 0.14 * v });
    },
    [SOM.EXPLOSAO]: (t, v) => {
      tom(t, { forma: 'sine', de: variar(90, 0.1), ate: 38, duracao: 0.45, volume: 0.22 * v });
      return chiado(t, { filtro: 'lowpass', freq: variar(1400, 0.2), ate: 110, q: 0.7, duracao: 0.7, volume: 0.32 * v });
    },
    [SOM.PRODUCAO]: (t, v) => {
      tom(t, { forma: 'sine', de: 523, duracao: 0.12, volume: 0.09 * v });
      return tom(t + 0.1, { forma: 'sine', de: 784, duracao: 0.18, volume: 0.09 * v });
    },
    [SOM.CONSTRUCAO]: (t, v) => {
      tom(t, { forma: 'triangle', de: 392, duracao: 0.12, volume: 0.09 * v });
      tom(t + 0.1, { forma: 'triangle', de: 523, duracao: 0.12, volume: 0.09 * v });
      return tom(t + 0.2, { forma: 'triangle', de: 659, duracao: 0.22, volume: 0.1 * v });
    },
    [SOM.SOB_ATAQUE]: (t, v) => {
      let fim = t;
      for (let i = 0; i < 3; i++) {
        tom(t + i * 0.2, { forma: 'square', de: 880, duracao: 0.09, volume: 0.06 * v });
        fim = tom(t + i * 0.2 + 0.1, { forma: 'square', de: 660, duracao: 0.09, volume: 0.06 * v });
      }
      return fim;
    },
    [SOM.ALERTA]: (t, v) => tom(t, { forma: 'triangle', de: 990, ate: 1320, duracao: 0.14, volume: 0.07 * v }),
  };

  /**
   * Plays a sound now; volume (0 to 1) attenuates it, for example by distance from the camera.
   * Over the voice limit or inside the minimum gap of that sound, the call is dropped.
   */
  function tocar(nome, { volume = 1 } = {}) {
    const receita = RECEITAS[nome];
    if (!receita || !contexto || contexto.state !== 'running' || mudo || volume <= 0.01) return false;
    const agora = contexto.currentTime;
    const limite = LIMITES[nome] ?? LIMITE_PADRAO;
    const ativas = (vozes.get(nome) ?? []).filter(fim => fim > agora);
    if (ativas.length >= limite.vozes || agora - (ultimoInicio.get(nome) ?? -Infinity) < limite.intervalo) {
      vozes.set(nome, ativas);
      return false;
    }
    ativas.push(receita(agora, Math.min(1, volume)));
    vozes.set(nome, ativas);
    ultimoInicio.set(nome, agora);
    return true;
  }

  function definirMudo(valor) {
    mudo = Boolean(valor);
    if (saida) saida.gain.setTargetAtTime(mudo ? 0 : VOLUME_GERAL, contexto.currentTime, 0.02);
  }

  return {
    ligar,
    tocar,
    definirMudo,
    get ligado() {
      return Boolean(contexto) && contexto.state === 'running';
    },
    get mudo() {
      return mudo;
    },
  };
}
