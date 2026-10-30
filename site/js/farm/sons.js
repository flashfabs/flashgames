const caminhos = {
  inicio: '/audio/farm/inicio-corneta-final2.wav',
  vez: '/audio/farm/vez.wav',
  recurso: '/audio/farm/recebimento-deslize.wav',
  clique: '/audio/farm/clique.wav',
};

export function tocarSom(tipo) {
  if (!caminhos[tipo]) return Promise.resolve(false);
  try {
    const som = new Audio(caminhos[tipo]);
    som.volume = 1;
    return som.play().then(() => true).catch(erro => {
      console.warn('Não foi possível reproduzir o som.', erro);
      return false;
    });
  } catch (erro) {
    console.warn('Áudio indisponível neste navegador.', erro);
    return Promise.resolve(false);
  }
}
