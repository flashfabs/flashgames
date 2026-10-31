// Top bar and minimap shortcuts: Carga and population against the ceiling (red when full, a pulse when Carga drops),
// the match clock, and the buttons for the next idle harvester (with how many there are), the last alert and the
// base. Values are written only when they change.
import { PASSOS_POR_SEGUNDO } from '../sim/contratos.js';

/** Game time of a tick as m:ss (or h:mm:ss past an hour). */
export function relogio(tick) {
  const total = Math.floor(tick / PASSOS_POR_SEGUNDO);
  const dois = n => String(n).padStart(2, '0');
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return h ? `${h}:${dois(m)}:${dois(total % 60)}` : `${m}:${dois(total % 60)}`;
}

export function criarHud({ topo, atalhos, texto, controles, canvasAlvo, acoes }) {
  const carga = topo.querySelector('[data-recurso="carga"]');
  const lotacao = topo.querySelector('[data-recurso="lotacao"]');
  const valorCarga = carga.querySelector('[data-valor]');
  const valorLotacao = lotacao.querySelector('[data-valor]');
  const botaoOcioso = atalhos.querySelector('[data-atalho="ocioso"]');
  const rotuloOcioso = botaoOcioso.querySelector('[data-rotulo]');
  const botaoAlerta = atalhos.querySelector('[data-atalho="alerta"]');
  const estado = topo.querySelector('.topo-estado');
  let cargaAnterior = null;
  let textoLotacao = '';
  let ociososAnterior = -1;

  atalhos.addEventListener('click', e => {
    const botao = e.target instanceof Element ? e.target.closest('[data-atalho]') : null;
    if (!botao) return;
    botao.blur();
    canvasAlvo.focus({ preventScroll: true });
    controles.marcarBotao();
    acoes[botao.dataset.atalho]?.(e.timeStamp);
  });

  /** @param {{carga: number, lotacao: {usada: number, teto: number}, ociosos: number[], temAlerta: boolean, tick: number}} valores */
  function atualizar({ carga: c, lotacao: l, ociosos, temAlerta, tick }) {
    const tempo = relogio(tick);
    if (estado.textContent !== tempo) estado.textContent = tempo;
    if (c !== cargaAnterior) {
      if (cargaAnterior !== null && c < cargaAnterior) {
        carga.dataset.pulso = 'false';
        // restart the animation on the next frame
        requestAnimationFrame(() => (carga.dataset.pulso = 'true'));
      }
      cargaAnterior = c;
      valorCarga.textContent = String(c);
    }
    const novo = `${l.usada}/${l.teto}`;
    if (novo !== textoLotacao) {
      textoLotacao = novo;
      valorLotacao.textContent = novo;
      lotacao.dataset.cheio = String(l.usada >= l.teto);
    }
    if (ociosos.length !== ociososAnterior) {
      ociososAnterior = ociosos.length;
      rotuloOcioso.textContent = ociosos.length > 1 ? texto('hud.coletores_ociosos', { n: ociosos.length }) : texto('hud.coletor_ocioso');
      botaoOcioso.disabled = ociosos.length === 0;
      botaoOcioso.dataset.tem = String(ociosos.length > 0);
    }
    botaoAlerta.disabled = !temAlerta;
  }

  return { atualizar };
}
