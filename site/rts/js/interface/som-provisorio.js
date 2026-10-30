// Provisional answer sounds until the audio front ships its engine: short synthesized blips for selection, orders and
// refusals. Browsers only let audio start after a user gesture, so the AudioContext is created on the first click or
// key press (destravar) and every sound before that is silently skipped.

const TIMBRES = {
  selecao: { frequencia: 660, fim: 880, duracao: 0.05, volume: 0.05, forma: 'triangle' },
  ordem: { frequencia: 440, fim: 520, duracao: 0.07, volume: 0.06, forma: 'square' },
  ataque: { frequencia: 300, fim: 180, duracao: 0.09, volume: 0.07, forma: 'sawtooth' },
  recusa: { frequencia: 200, fim: 140, duracao: 0.12, volume: 0.05, forma: 'square' },
};

export function criarSomProvisorio() {
  let contexto = null;
  let falhou = false;

  function destravar() {
    if (falhou) return;
    try {
      contexto ??= new AudioContext();
      if (contexto.state === 'suspended') contexto.resume().catch(erro => console.warn('provisional sound could not resume', erro));
    } catch (erro) {
      falhou = true;
      console.warn('provisional sound unavailable', erro);
    }
  }

  function tocar(nome) {
    const timbre = TIMBRES[nome];
    if (!timbre || !contexto || contexto.state !== 'running') return;
    const agora = contexto.currentTime;
    const oscilador = contexto.createOscillator();
    const ganho = contexto.createGain();
    oscilador.type = timbre.forma;
    oscilador.frequency.setValueAtTime(timbre.frequencia, agora);
    oscilador.frequency.exponentialRampToValueAtTime(timbre.fim, agora + timbre.duracao);
    ganho.gain.setValueAtTime(timbre.volume, agora);
    ganho.gain.exponentialRampToValueAtTime(0.0001, agora + timbre.duracao);
    oscilador.connect(ganho).connect(contexto.destination);
    oscilador.start(agora);
    oscilador.stop(agora + timbre.duracao + 0.01);
  }

  return { destravar, tocar };
}
