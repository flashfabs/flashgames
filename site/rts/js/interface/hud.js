// Top bar and minimap shortcuts: Carga and population against the ceiling (red when full, a pulse when Carga drops),
// and the buttons for the next idle harvester (with how many there are), the last alert and the base. Values are
// written only when they change.

export function criarHud({ topo, atalhos, texto, controles, canvasAlvo, acoes }) {
  const carga = topo.querySelector('[data-recurso="carga"]');
  const lotacao = topo.querySelector('[data-recurso="lotacao"]');
  const valorCarga = carga.querySelector('[data-valor]');
  const valorLotacao = lotacao.querySelector('[data-valor]');
  const botaoOcioso = atalhos.querySelector('[data-atalho="ocioso"]');
  const rotuloOcioso = botaoOcioso.querySelector('[data-rotulo]');
  const botaoAlerta = atalhos.querySelector('[data-atalho="alerta"]');
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

  /** @param {{carga: number, lotacao: {usada: number, teto: number}, ociosos: number[], temAlerta: boolean}} valores */
  function atualizar({ carga: c, lotacao: l, ociosos, temAlerta }) {
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
