// Small synthesized sound effects (Web Audio), so the site ships no audio files.

const CHAVE_MUDO = 'salinha:mudo';

let contexto = null;
let ruido = null;
let mudo = lerMudo();

function lerMudo() {
  try {
    return localStorage.getItem(CHAVE_MUDO) === '1';
  } catch {
    return false;
  }
}

function garantirContexto() {
  if (!contexto) {
    const Contexto = window.AudioContext || window.webkitAudioContext;
    if (!Contexto) return null;
    // "ambient" mixes with other audio (a call, music) instead of fighting it for the speaker.
    if (navigator.audioSession) navigator.audioSession.type = 'ambient';
    contexto = new Contexto();
  }
  // Safari reports "interrupted" while a call or another app holds the audio.
  if (contexto.state !== 'running') {
    contexto.resume().catch(erro => console.warn('Audio resume failed', erro));
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

function tom(ctx, { tipo = 'sine', de, ate = de, duracao, volume = 0.2, atraso = 0 }) {
  const inicio = ctx.currentTime + atraso;
  const osc = ctx.createOscillator();
  const ganho = ctx.createGain();
  osc.type = tipo;
  osc.frequency.setValueAtTime(de, inicio);
  osc.frequency.exponentialRampToValueAtTime(ate, inicio + duracao);
  ganho.gain.setValueAtTime(volume, inicio);
  ganho.gain.exponentialRampToValueAtTime(0.0001, inicio + duracao);
  osc.connect(ganho).connect(ctx.destination);
  osc.start(inicio);
  osc.stop(inicio + duracao + 0.02);
}

function explosao(ctx, { duracao = 0.55, volume = 0.5, corte = 1100 } = {}) {
  const inicio = ctx.currentTime;
  const fonte = ctx.createBufferSource();
  fonte.buffer = bufferDeRuido(ctx);
  const filtro = ctx.createBiquadFilter();
  filtro.type = 'lowpass';
  filtro.frequency.setValueAtTime(corte, inicio);
  filtro.frequency.exponentialRampToValueAtTime(80, inicio + duracao);
  const ganho = ctx.createGain();
  ganho.gain.setValueAtTime(volume, inicio);
  ganho.gain.exponentialRampToValueAtTime(0.0001, inicio + duracao);
  fonte.connect(filtro).connect(ganho).connect(ctx.destination);
  fonte.start(inicio);
  fonte.stop(inicio + duracao);
}

const SONS = {
  bum: ctx => {
    explosao(ctx);
    tom(ctx, { tipo: 'sine', de: 120, ate: 40, duracao: 0.35, volume: 0.35 });
  },
  bomba: ctx => tom(ctx, { tipo: 'square', de: 260, ate: 180, duracao: 0.06, volume: 0.08 }),
  item: ctx => {
    tom(ctx, { tipo: 'triangle', de: 520, ate: 780, duracao: 0.08, volume: 0.18 });
    tom(ctx, { tipo: 'triangle', de: 780, ate: 1180, duracao: 0.1, volume: 0.16, atraso: 0.07 });
  },
  escudo: ctx => tom(ctx, { tipo: 'sine', de: 900, ate: 300, duracao: 0.3, volume: 0.2 }),
  morte: ctx => tom(ctx, { tipo: 'sawtooth', de: 420, ate: 60, duracao: 0.6, volume: 0.14 }),
  bip: ctx => tom(ctx, { tipo: 'sine', de: 660, duracao: 0.12, volume: 0.18 }),
  vai: ctx => tom(ctx, { tipo: 'sine', de: 990, duracao: 0.3, volume: 0.2 }),
  bloco: ctx => explosao(ctx, { duracao: 0.12, volume: 0.12, corte: 500 }),
  pronto: ctx => tom(ctx, { tipo: 'triangle', de: 660, ate: 880, duracao: 0.12, volume: 0.14 }),
  alarme: ctx => {
    for (let i = 0; i < 3; i++) tom(ctx, { tipo: 'square', de: 880, ate: 440, duracao: 0.18, volume: 0.08, atraso: i * 0.22 });
  },
  vitoria: ctx => {
    [523, 659, 784, 1047].forEach((freq, i) => tom(ctx, { tipo: 'triangle', de: freq, duracao: 0.22, volume: 0.16, atraso: i * 0.11 }));
  },
  fim: ctx => {
    [392, 330, 262].forEach((freq, i) => tom(ctx, { tipo: 'triangle', de: freq, duracao: 0.25, volume: 0.14, atraso: i * 0.14 }));
  },
};

export const som = {
  // Keeps unlocking (and resuming after a call ends) on any later gesture anywhere on the page.
  instalar() {
    const aoGesto = () => {
      if (!mudo) garantirContexto();
    };
    for (const evento of GESTOS_DE_DESBLOQUEIO) window.addEventListener(evento, aoGesto, { capture: true, passive: true });
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
    try {
      localStorage.setItem(CHAVE_MUDO, mudo ? '1' : '0');
    } catch {
      // Storage may be blocked (private mode); the toggle still works for this visit.
    }
    if (!mudo) garantirContexto();
    return mudo;
  },
  tocar(nome) {
    if (mudo || !SONS[nome]) return;
    const ctx = garantirContexto();
    if (!ctx || ctx.state !== 'running') return;
    try {
      SONS[nome](ctx);
    } catch (erro) {
      console.warn(`Sound "${nome}" failed`, erro);
    }
  },
};
