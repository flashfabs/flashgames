// Synthesized sound effects and an optional background loop (Web Audio), so the site ships no audio
// files. Everything goes through a limiter, so a chain of explosions never clips the speaker.

const CHAVE_MUDO = 'salinha:mudo';
const CHAVE_MUSICA = 'salinha:musica';
const VOLUME_EFEITOS = 0.9;
const VOLUME_MUSICA = 0.32;
const INTERVALO_MESMO_SOM_S = 0.035; // the same sound twice inside this window plays once
const AGENDAR_A_FRENTE_S = 0.15;

let contexto = null;
let saida = null;
let destinoEfeitos = null; // where effects go: the effects bus, or a stereo panner placed on it per sound
let barramentoMusica = null;
let ruido = null;
let mudo = lerPreferencia(CHAVE_MUDO, false);
let musicaLigada = lerPreferencia(CHAVE_MUSICA, true);
const ultimoTocado = new Map();

function lerPreferencia(chave, padrao) {
  try {
    const valor = localStorage.getItem(chave);
    return valor === null ? padrao : valor === '1';
  } catch {
    return padrao;
  }
}

function salvarPreferencia(chave, valor) {
  try {
    localStorage.setItem(chave, valor ? '1' : '0');
  } catch {
    // Storage may be blocked (private mode); the toggle still works for this visit.
  }
}

function montarMixagem(ctx) {
  const limitador = ctx.createDynamicsCompressor();
  limitador.threshold.value = -10;
  limitador.knee.value = 6;
  limitador.ratio.value = 8;
  limitador.attack.value = 0.003;
  limitador.release.value = 0.2;
  limitador.connect(ctx.destination);
  saida = ctx.createGain();
  saida.gain.value = VOLUME_EFEITOS;
  saida.connect(limitador);
  barramentoMusica = ctx.createGain();
  barramentoMusica.gain.value = 0;
  barramentoMusica.connect(limitador);
}

function garantirContexto() {
  if (!contexto) {
    const Contexto = window.AudioContext || window.webkitAudioContext;
    if (!Contexto) return null;
    // "ambient" mixes with other audio (a call, music) instead of fighting it for the speaker.
    if (navigator.audioSession) navigator.audioSession.type = 'ambient';
    contexto = new Contexto();
    montarMixagem(contexto);
    contexto.addEventListener('statechange', atualizarMusica);
  }
  // Safari reports "interrupted" while a call or another app holds the audio.
  if (contexto.state !== 'running') {
    contexto.resume().then(atualizarMusica, erro => console.warn('Audio resume failed', erro));
    tocarSilencio(contexto);
  }
  return contexto;
}

// iOS only unlocks Web Audio once something actually plays inside a user gesture.
function tocarSilencio(ctx) {
  try {
    const fonte = ctx.createBufferSource();
    fonte.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    fonte.connect(ctx.destination);
    fonte.start(0);
  } catch (erro) {
    console.warn('Silent unlock failed', erro);
  }
}

// Gestures that count as user activation on every browser: on touch screens that is the finger
// lifting (pointerup/touchend), not touching down, which is why the old pointerdown unlock failed on iPad.
const GESTOS_DE_DESBLOQUEIO = ['pointerup', 'touchend', 'click', 'keydown'];

function bufferDeRuido(ctx) {
  if (ruido) return ruido;
  ruido = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const dados = ruido.getChannelData(0);
  for (let i = 0; i < dados.length; i++) dados[i] = Math.random() * 2 - 1;
  return ruido;
}

// A value nudged by up to ±faixa (as a fraction), so repeated sounds are never identical.
const variar = (valor, faixa) => valor * (1 + (Math.random() * 2 - 1) * faixa);

function tom(ctx, { tipo = 'sine', de, ate = de, duracao, volume = 0.2, atraso = 0, destino = destinoEfeitos ?? saida, inicio = ctx.currentTime + atraso }) {
  const osc = ctx.createOscillator();
  const ganho = ctx.createGain();
  osc.type = tipo;
  osc.frequency.setValueAtTime(de, inicio);
  if (ate !== de) osc.frequency.exponentialRampToValueAtTime(ate, inicio + duracao);
  ganho.gain.setValueAtTime(0.0001, inicio);
  ganho.gain.exponentialRampToValueAtTime(volume, inicio + 0.005);
  ganho.gain.exponentialRampToValueAtTime(0.0001, inicio + duracao);
  osc.connect(ganho).connect(destino);
  osc.start(inicio);
  osc.stop(inicio + duracao + 0.02);
}

function ruidoFiltrado(ctx, { tipo = 'lowpass', freq, ate = freq, q = 1, duracao, volume = 0.2, atraso = 0, destino = destinoEfeitos ?? saida, inicio = ctx.currentTime + atraso }) {
  const fonte = ctx.createBufferSource();
  fonte.buffer = bufferDeRuido(ctx);
  const filtro = ctx.createBiquadFilter();
  filtro.type = tipo;
  filtro.Q.value = q;
  filtro.frequency.setValueAtTime(freq, inicio);
  if (ate !== freq) filtro.frequency.exponentialRampToValueAtTime(ate, inicio + duracao);
  const ganho = ctx.createGain();
  ganho.gain.setValueAtTime(volume, inicio);
  ganho.gain.exponentialRampToValueAtTime(0.0001, inicio + duracao);
  // A random offset into the noise buffer keeps back-to-back bursts from sounding the same.
  fonte.connect(filtro).connect(ganho).connect(destino);
  fonte.start(inicio, Math.random() * Math.max(0, 0.95 - duracao));
  fonte.stop(inicio + duracao);
}

function acorde(ctx, frequencias, { tipo = 'triangle', duracao, volume, atraso = 0 }) {
  for (const freq of frequencias) tom(ctx, { tipo, de: freq, duracao, volume, atraso });
}

function arpejo(ctx, frequencias, { tipo = 'triangle', passo, duracao, volume, atraso = 0 }) {
  frequencias.forEach((freq, i) => tom(ctx, { tipo, de: freq, duracao, volume, atraso: atraso + i * passo }));
}

// Each power-up has its own little jingle.
const JINGLES_ITEM = {
  b: ctx => arpejo(ctx, [392, 523, 784], { tipo: 'square', passo: 0.06, duracao: 0.1, volume: 0.06 }),
  f: ctx => {
    tom(ctx, { tipo: 'sawtooth', de: 260, ate: 1100, duracao: 0.18, volume: 0.07 });
    tom(ctx, { tipo: 'triangle', de: 1047, duracao: 0.16, volume: 0.14, atraso: 0.14 });
  },
  t: ctx => arpejo(ctx, [659, 784, 988, 1319], { passo: 0.045, duracao: 0.09, volume: 0.13 }),
  e: ctx => {
    acorde(ctx, [880, 1320], { tipo: 'sine', duracao: 0.4, volume: 0.1 });
    tom(ctx, { tipo: 'triangle', de: 1760, duracao: 0.25, volume: 0.05, atraso: 0.05 });
  },
  p: ctx => {
    tom(ctx, { tipo: 'square', de: 1500, ate: 380, duracao: 0.12, volume: 0.06 });
    tom(ctx, { tipo: 'square', de: 600, ate: 1800, duracao: 0.12, volume: 0.05, atraso: 0.11 });
  },
  g: ctx => {
    tom(ctx, { tipo: 'sine', de: 420, ate: 880, duracao: 0.28, volume: 0.13 });
    tom(ctx, { tipo: 'sine', de: 880, ate: 520, duracao: 0.3, volume: 0.1, atraso: 0.24 });
  },
};

const SONS = {
  bum: (ctx, { n = 1 } = {}) => {
    const forca = Math.min(1 + (n - 1) * 0.25, 1.8);
    ruidoFiltrado(ctx, { freq: variar(1100, 0.25), ate: 80, duracao: 0.5 + 0.12 * forca, volume: 0.42 * forca });
    tom(ctx, { de: variar(120, 0.15), ate: 38, duracao: 0.4, volume: 0.38 });
    for (let i = 0; i < 3; i++) {
      ruidoFiltrado(ctx, { tipo: 'highpass', freq: 2600, duracao: 0.03, volume: 0.05, atraso: 0.08 + Math.random() * 0.25 });
    }
  },
  bomba: ctx => {
    tom(ctx, { de: variar(190, 0.08), ate: 90, duracao: 0.09, volume: 0.25 });
    ruidoFiltrado(ctx, { tipo: 'highpass', freq: 4200, duracao: 0.22, volume: 0.03, atraso: 0.03 });
  },
  caixa: (ctx, { n = 1 } = {}) => {
    const volume = Math.min(0.15 + n * 0.03, 0.3);
    ruidoFiltrado(ctx, { tipo: 'bandpass', freq: variar(1500, 0.2), q: 2.5, duracao: 0.09, volume });
    tom(ctx, { tipo: 'triangle', de: variar(240, 0.12), ate: 110, duracao: 0.1, volume: 0.14, atraso: 0.01 });
    if (n > 1) ruidoFiltrado(ctx, { tipo: 'bandpass', freq: variar(1100, 0.2), q: 2, duracao: 0.07, volume: volume * 0.8, atraso: 0.05 });
  },
  item: (ctx, { item } = {}) => (JINGLES_ITEM[item] ?? JINGLES_ITEM.t)(ctx),
  escudo: ctx => {
    tom(ctx, { tipo: 'square', de: 1250, ate: 1150, duracao: 0.18, volume: 0.05 });
    tom(ctx, { tipo: 'triangle', de: 1870, duracao: 0.3, volume: 0.09 });
    ruidoFiltrado(ctx, { tipo: 'highpass', freq: 3000, duracao: 0.05, volume: 0.1 });
  },
  morte: (ctx, { eu = false } = {}) => {
    ruidoFiltrado(ctx, { freq: 900, duracao: 0.08, volume: 0.2 });
    tom(ctx, { tipo: 'sawtooth', de: variar(420, 0.1), ate: 60, duracao: 0.6, volume: 0.12 });
    if (eu) arpejo(ctx, [392, 311], { passo: 0.22, duracao: 0.3, volume: 0.12, atraso: 0.2 });
  },
  bip: (ctx, { n = 3 } = {}) => {
    const freq = { 3: 523, 2: 659, 1: 784 }[n] ?? 660;
    tom(ctx, { de: freq, duracao: 0.18, volume: 0.16 });
    tom(ctx, { tipo: 'square', de: freq, duracao: 0.08, volume: 0.04 });
  },
  vai: ctx => {
    tom(ctx, { de: 523, ate: 1047, duracao: 0.12, volume: 0.12 });
    acorde(ctx, [1047, 1319, 1568], { duracao: 0.4, volume: 0.1, atraso: 0.08 });
  },
  bloco: ctx => {
    tom(ctx, { de: 95, ate: 45, duracao: 0.2, volume: 0.28 });
    ruidoFiltrado(ctx, { freq: 420, duracao: 0.15, volume: 0.14 });
  },
  pronto: ctx => tom(ctx, { tipo: 'triangle', de: 660, ate: 880, duracao: 0.12, volume: 0.14 }),
  cancelar: ctx => tom(ctx, { tipo: 'triangle', de: 660, ate: 440, duracao: 0.12, volume: 0.12 }),
  entrou: ctx => arpejo(ctx, [880, 1175], { tipo: 'sine', passo: 0.09, duracao: 0.16, volume: 0.1 }),
  saiu: ctx => arpejo(ctx, [1175, 880], { tipo: 'sine', passo: 0.09, duracao: 0.16, volume: 0.08 }),
  alarme: ctx => {
    for (let i = 0; i < 2; i++) {
      tom(ctx, { tipo: 'square', de: 600, ate: 1000, duracao: 0.25, volume: 0.06, atraso: i * 0.5 });
      tom(ctx, { tipo: 'square', de: 1000, ate: 600, duracao: 0.25, volume: 0.06, atraso: i * 0.5 + 0.25 });
    }
  },
  vitoria: ctx => {
    arpejo(ctx, [523, 659, 784, 1047], { passo: 0.11, duracao: 0.22, volume: 0.15 });
    acorde(ctx, [784, 1047, 1319], { duracao: 0.5, volume: 0.08, atraso: 0.46 });
  },
  campeao: ctx => {
    arpejo(ctx, [523, 659, 784, 1047], { passo: 0.1, duracao: 0.2, volume: 0.14 });
    arpejo(ctx, [988, 1047], { passo: 0.15, duracao: 0.2, volume: 0.14, atraso: 0.5 });
    acorde(ctx, [784, 1047, 1319, 1568], { duracao: 0.8, volume: 0.07, atraso: 0.8 });
  },
  fim: ctx => arpejo(ctx, [392, 330, 262], { passo: 0.14, duracao: 0.25, volume: 0.14 }),
};

// ---- Background music: a small step sequencer over original 8-bar loops. ----

const midi = nota => 440 * 2 ** ((nota - 69) / 12);
// Each map theme gives the loop its own chords (MIDI triads, one bar each), lead colour and a tempo nudge.
const PERFIS = {
  padrao: { progressao: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], bpm: 0 },
  patio: { progressao: [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]], bpm: 0, timbre: 'triangle', volumeMelodia: 0.07 },
  deposito: { progressao: [[62, 65, 69], [58, 62, 65], [60, 64, 67], [57, 61, 64]], bpm: 4 },
  muralhas: { progressao: [[52, 55, 59], [50, 54, 57], [48, 52, 55], [50, 54, 57]], bpm: -6, timbre: 'triangle', volumeMelodia: 0.08 },
  labirinto: { progressao: [[57, 60, 64], [52, 55, 59], [53, 57, 60], [52, 56, 59]], bpm: -10, timbre: 'sine', volumeMelodia: 0.1 },
  fornalha: { progressao: [[60, 63, 67], [56, 60, 63], [58, 62, 65], [55, 59, 62]], bpm: 8 },
};
// 16 steps per bar. Bass and lead patterns index the chord: 0 root, 1 third, 2 fifth, 3 root an octave up.
const MODOS_MUSICA = {
  lobby: {
    bpm: 92,
    baixo: [0, -1, -1, -1, -1, -1, -1, -1, 2, -1, -1, -1, -1, -1, -1, -1],
    melodia: [0, -1, -1, -1, 2, -1, -1, -1, 1, -1, -1, -1, 3, -1, 2, -1],
    timbre: 'triangle',
    volumeMelodia: 0.11,
    bumbo: [],
    caixa: [],
    chimbal: [],
  },
  resultado: {
    bpm: 100,
    baixo: [0, -1, -1, -1, 2, -1, -1, -1, 0, -1, -1, -1, 1, -1, 2, -1],
    melodia: [3, -1, 2, -1, -1, -1, 1, -1, 3, -1, -1, 2, -1, -1, 0, -1],
    timbre: 'triangle',
    volumeMelodia: 0.09,
    bumbo: [0, 8],
    caixa: [],
    chimbal: [4, 12],
  },
  jogo: {
    bpm: 128,
    baixo: [0, -1, -1, 0, -1, -1, 0, -1, 0, -1, -1, 0, -1, 2, -1, 1],
    melodia: [0, -1, 1, 2, -1, 3, 2, -1, 1, -1, 2, 3, -1, 2, 1, -1],
    timbre: 'square',
    volumeMelodia: 0.035,
    bumbo: [0, 8, 10],
    caixa: [4, 12],
    chimbal: [2, 6, 10, 14],
    usaPerfil: true,
  },
  subita: {
    bpm: 148,
    baixo: [0, -1, 0, -1, 0, -1, 0, -1, 0, -1, 0, -1, 2, -1, 1, -1],
    melodia: [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 2, 3, 1, 2, 3, 2],
    timbre: 'square',
    volumeMelodia: 0.03,
    bumbo: [0, 4, 8, 12],
    caixa: [4, 12, 14],
    chimbal: [0, 2, 4, 6, 8, 10, 12, 14],
    usaPerfil: true,
  },
};
const musica = { modo: null, tema: 'padrao', timer: 0, passo: 0, tempo: 0, pausaAte: 0 };

function tocarPasso(modo, perfil, passo, inicio, duracaoPasso) {
  const ctx = contexto;
  const destino = barramentoMusica;
  const compasso = Math.floor(passo / 16);
  const p = passo % 16;
  const notas = perfil.progressao[compasso % perfil.progressao.length];
  const tons = [notas[0], notas[1], notas[2], notas[0] + 12];
  // The second half of the loop plays the lead an octave up, so it does not feel like a short loop.
  const oitava = compasso % 8 >= 4 ? 24 : 12;
  const timbre = (modo.usaPerfil && perfil.timbre) || modo.timbre;
  const volumeMelodia = (modo.usaPerfil && perfil.volumeMelodia) || modo.volumeMelodia;
  if (modo.baixo[p] >= 0) {
    tom(ctx, { tipo: 'triangle', de: midi(tons[modo.baixo[p]] - 12), duracao: duracaoPasso * 1.8, volume: 0.22, destino, inicio });
  }
  if (modo.melodia[p] >= 0) {
    tom(ctx, { tipo: timbre, de: midi(tons[modo.melodia[p]] + oitava), duracao: duracaoPasso * 1.3, volume: volumeMelodia, destino, inicio });
  }
  if (modo.bumbo.includes(p)) tom(ctx, { de: 150, ate: 45, duracao: 0.13, volume: 0.35, destino, inicio });
  if (modo.caixa.includes(p)) ruidoFiltrado(ctx, { tipo: 'bandpass', freq: 1800, q: 0.8, duracao: 0.1, volume: 0.12, destino, inicio });
  if (modo.chimbal.includes(p)) ruidoFiltrado(ctx, { tipo: 'highpass', freq: 7000, duracao: 0.03, volume: 0.05, destino, inicio });
}

function agendarMusica() {
  const modo = MODOS_MUSICA[musica.modo];
  if (!modo || !contexto) return;
  const agora = contexto.currentTime;
  // A change of music leaves a short gap (and room for a jingle) before the new loop starts.
  if (agora < musica.pausaAte) {
    musica.tempo = musica.pausaAte;
    return;
  }
  // After a stall (busy main thread), skip ahead instead of playing the missed notes all at once.
  if (musica.tempo < agora) musica.tempo = agora + 0.05;
  const perfil = PERFIS[musica.tema] ?? PERFIS.padrao;
  const duracaoPasso = 60 / (modo.bpm + (modo.usaPerfil ? perfil.bpm : 0)) / 4;
  while (musica.tempo < agora + AGENDAR_A_FRENTE_S) {
    tocarPasso(modo, perfil, musica.passo, musica.tempo, duracaoPasso);
    musica.passo = (musica.passo + 1) % (16 * 8);
    musica.tempo += duracaoPasso;
  }
}

// Fades the current loop out and the new one in after a short gap. pausa is how long the gap lasts.
function trocarMusica(modo, tema, { reiniciar, pausa }) {
  musica.modo = modo;
  musica.tema = tema;
  if (reiniciar) musica.passo = 0;
  if (!musica.timer || !modo) {
    atualizarMusica();
    return;
  }
  const agora = contexto.currentTime;
  barramentoMusica.gain.cancelScheduledValues(agora);
  barramentoMusica.gain.setTargetAtTime(0, agora, 0.06);
  barramentoMusica.gain.setTargetAtTime(VOLUME_MUSICA, agora + pausa, 0.25);
  musica.pausaAte = agora + pausa;
}

// Explosions push the music down for a moment, so the blast is what you hear.
function abaixarMusica() {
  if (!musica.timer) return;
  const agora = contexto.currentTime;
  barramentoMusica.gain.cancelScheduledValues(agora);
  barramentoMusica.gain.setTargetAtTime(VOLUME_MUSICA * 0.5, agora, 0.02);
  barramentoMusica.gain.setTargetAtTime(VOLUME_MUSICA, agora + 0.18, 0.3);
}

// Music plays only when wanted, unmuted, unlocked and visible; this reconciles all of that.
function atualizarMusica() {
  const tocar = !mudo && musicaLigada && Boolean(musica.modo) && contexto?.state === 'running' && !document.hidden;
  if (tocar && !musica.timer) {
    musica.tempo = Math.max(contexto.currentTime + 0.08, musica.pausaAte);
    barramentoMusica.gain.cancelScheduledValues(contexto.currentTime);
    barramentoMusica.gain.setTargetAtTime(VOLUME_MUSICA, contexto.currentTime, 0.3);
    musica.timer = setInterval(agendarMusica, 40);
    agendarMusica();
  } else if (!tocar && musica.timer) {
    clearInterval(musica.timer);
    musica.timer = 0;
    barramentoMusica.gain.cancelScheduledValues(contexto.currentTime);
    barramentoMusica.gain.setTargetAtTime(0, contexto.currentTime, 0.08);
  }
}

export const som = {
  // Keeps unlocking (and resuming after a call ends) on any later gesture anywhere on the page.
  instalar() {
    const aoGesto = () => {
      if (!mudo) garantirContexto();
    };
    for (const evento of GESTOS_DE_DESBLOQUEIO) window.addEventListener(evento, aoGesto, { capture: true, passive: true });
    document.addEventListener('visibilitychange', atualizarMusica);
  },
  // Browsers only allow audio after a user gesture; also called from input handlers.
  destravar() {
    if (!mudo) garantirContexto();
  },
  get mudo() {
    return mudo;
  },
  alternar() {
    mudo = !mudo;
    salvarPreferencia(CHAVE_MUDO, mudo);
    if (!mudo) garantirContexto();
    atualizarMusica();
    return mudo;
  },
  get musicaLigada() {
    return musicaLigada;
  },
  alternarMusica() {
    musicaLigada = !musicaLigada;
    salvarPreferencia(CHAVE_MUSICA, musicaLigada);
    if (musicaLigada && !mudo) garantirContexto();
    atualizarMusica();
    return musicaLigada;
  },
  // Background loop for the current screen: 'lobby', 'jogo', 'subita', 'resultado' or null for silence.
  // tema (a map theme key) colours the match loops; leaving it out keeps the current one.
  musica(modo, { tema } = {}) {
    const novo = MODOS_MUSICA[modo] ? modo : null;
    const novoTema = PERFIS[tema] ? tema : musica.tema;
    if (novo === musica.modo && novoTema === musica.tema) return;
    const anterior = musica.modo;
    // Sudden death keeps the beat going; any other change starts its loop from the top.
    const continua = anterior === 'jogo' && novo === 'subita';
    trocarMusica(novo, novoTema, { reiniciar: !continua, pausa: novo === 'resultado' ? 1.6 : continua ? 0.25 : 0.35 });
  },
  // opcoes.pan (-1 left to 1 right) places the sound where it happened on the arena.
  tocar(nome, opcoes) {
    if (mudo || !SONS[nome]) return;
    const ctx = garantirContexto();
    if (!ctx || ctx.state !== 'running') return;
    if (ctx.currentTime - (ultimoTocado.get(nome) ?? -1) < INTERVALO_MESMO_SOM_S) return;
    ultimoTocado.set(nome, ctx.currentTime);
    try {
      if (Number.isFinite(opcoes?.pan) && ctx.createStereoPanner) {
        destinoEfeitos = ctx.createStereoPanner();
        destinoEfeitos.pan.value = Math.max(-1, Math.min(1, opcoes.pan)) * 0.75;
        destinoEfeitos.connect(saida);
      }
      SONS[nome](ctx, opcoes);
      if (nome === 'bum') abaixarMusica();
    } catch (erro) {
      console.warn(`Sound "${nome}" failed`, erro);
    } finally {
      destinoEfeitos = null;
    }
  },
};
