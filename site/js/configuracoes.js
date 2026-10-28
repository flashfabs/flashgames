// Settings dialog: sound effects and music volumes, touch sensitivity, the performance counter in the match,
// and showing the first-time tips again. Each setting is kept on this device by the module that owns it (som.js,
// controles.js, hud.js); a control shows only when that module offers it.

import * as controles from './pavio/controles.js';
import * as hud from './pavio/hud.js';

const CHAVE_DICAS = 'salinha:dicas';
const INTERVALO_AMOSTRA_MS = 250;

function porcento(valor) {
  return `${Math.round(valor * 100)}%`;
}

// som: the sound module (som.js); raiz: the dialog element.
export function criarConfiguracoes({ som, raiz }) {
  const $ = seletor => raiz.querySelector(seletor);
  const efeitos = $('#config-efeitos');
  const musica = $('#config-musica');
  const toque = $('#config-toque');
  const desempenho = $('#config-desempenho');
  let ultimaAmostra = 0;
  let quemAbriu = null;

  const temVolumes = typeof som.definirVolumes === 'function' && som.volumes;
  const temToque = typeof controles.definirSensibilidadeToque === 'function' && controles.SENSIBILIDADE_TOQUE;
  const temDesempenho = typeof hud.definirMostrarDesempenho === 'function';
  $('#config-linha-efeitos').hidden = !temVolumes;
  $('#config-linha-musica').hidden = !temVolumes;
  $('#config-linha-toque').hidden = !temToque;
  $('#config-linha-desempenho').hidden = !temDesempenho;

  function mostrarValores() {
    if (temVolumes) {
      const { efeitos: volumeEfeitos, musica: volumeMusica } = som.volumes;
      efeitos.value = String(Math.round(volumeEfeitos * 100));
      musica.value = String(Math.round(volumeMusica * 100));
      $('#config-efeitos-valor').textContent = porcento(volumeEfeitos);
      $('#config-musica-valor').textContent = porcento(volumeMusica);
    }
    if (temToque) {
      const { min, max } = controles.SENSIBILIDADE_TOQUE;
      toque.min = String(Math.round(min * 100));
      toque.max = String(Math.round(max * 100));
      toque.value = String(Math.round(controles.lerSensibilidadeToque() * 100));
      $('#config-toque-valor').textContent = porcento(controles.lerSensibilidadeToque());
    }
    if (temDesempenho) desempenho.checked = Boolean(hud.lerMostrarDesempenho());
  }

  efeitos.addEventListener('input', () => {
    som.destravar?.();
    som.definirVolumes({ efeitos: Number(efeitos.value) / 100 });
    $('#config-efeitos-valor').textContent = porcento(Number(efeitos.value) / 100);
    // A short sample so the level can be heard while sliding.
    const agora = performance.now();
    if (agora - ultimaAmostra > INTERVALO_AMOSTRA_MS) {
      ultimaAmostra = agora;
      som.tocar('item');
    }
  });
  musica.addEventListener('input', () => {
    som.definirVolumes({ musica: Number(musica.value) / 100 });
    $('#config-musica-valor').textContent = porcento(Number(musica.value) / 100);
  });
  toque.addEventListener('input', () => {
    controles.definirSensibilidadeToque(Number(toque.value) / 100);
    $('#config-toque-valor').textContent = porcento(Number(toque.value) / 100);
  });
  desempenho.addEventListener('change', () => hud.definirMostrarDesempenho(desempenho.checked));
  $('#config-dicas').addEventListener('click', () => {
    try {
      localStorage.removeItem(CHAVE_DICAS);
      $('#config-dicas-aviso').textContent = 'As dicas aparecem de novo na próxima partida.';
    } catch {
      $('#config-dicas-aviso').textContent = 'Não deu para apagar as dicas vistas neste navegador.';
    }
  });

  function fechar() {
    raiz.hidden = true;
    quemAbriu?.focus();
  }
  $('#botao-fechar-config').addEventListener('click', fechar);
  raiz.addEventListener('click', evento => {
    if (evento.target === raiz) fechar();
  });
  document.addEventListener('keydown', evento => {
    if (evento.key === 'Escape' && !raiz.hidden) fechar();
  });

  return {
    abrir(botao = null) {
      quemAbriu = botao;
      mostrarValores();
      $('#config-dicas-aviso').textContent = '';
      raiz.hidden = false;
      $('#botao-fechar-config').focus();
    },
  };
}
