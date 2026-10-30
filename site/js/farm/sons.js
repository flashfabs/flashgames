const caminhos = {
  inicio: '/audio/farm/inicio-corneta-final2.wav',
  vez: '/audio/farm/vez-prolongado.wav',
  recurso: '/audio/farm/recebimento-caixa-registradora.wav',
  clique: '/audio/farm/clique-destaque.wav',
  construcao: '/audio/farm/construcao-britadeira.wav',
  dados: '/audio/farm/dados-madeira-real.flac',
};

const sons = new Map();

export function tocarSom(tipo) {
  if (tipo === 'urgencia') {
    try {
      const Contexto = window.AudioContext || window.webkitAudioContext;
      const ctx = new Contexto();
      for (let i = 0; i < 3; i++) {
        const oscilador = ctx.createOscillator(), ganho = ctx.createGain(), inicio = ctx.currentTime + i * 0.19;
        oscilador.type = 'square'; oscilador.frequency.value = i === 2 ? 880 : 660;
        ganho.gain.setValueAtTime(0.0001, inicio); ganho.gain.exponentialRampToValueAtTime(0.12, inicio + 0.02); ganho.gain.exponentialRampToValueAtTime(0.0001, inicio + 0.14);
        oscilador.connect(ganho); ganho.connect(ctx.destination); oscilador.start(inicio); oscilador.stop(inicio + 0.15);
      }
      setTimeout(() => ctx.close(), 1000); return Promise.resolve(true);
    } catch { return Promise.resolve(false); }
  }
  if (!caminhos[tipo]) return Promise.resolve(false);
  try {
    let som = sons.get(tipo);
    if (!som) { som = new Audio(caminhos[tipo]); som.preload = 'auto'; sons.set(tipo, som); }
    som.pause(); som.currentTime = 0; som.volume = 1;
    return som.play().then(() => true).catch(erro => {
      console.warn('Não foi possível reproduzir o som.', erro);
      return false;
    });
  } catch (erro) {
    console.warn('Áudio indisponível neste navegador.', erro);
    return Promise.resolve(false);
  }
}
