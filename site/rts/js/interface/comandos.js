// On-screen command bar: every keyboard command also has a button (attack-move, move, stop, hold, patrol, pause, zoom,
// full screen) and the nine control groups show their size; a group button recalls the group, with Shift adds the
// selection to it, and after "Guardar" stores the selection in it. Buttons give focus back so keys keep working.
import { ACAO, ATALHOS_PADRAO, E_MAC as eMac, rotuloDoAtalho } from '../entrada/teclas.js';

const BOTOES = [
  { acao: ACAO.ATACAR_MOVENDO, rotulo: 'Atacar-mover' },
  { acao: ACAO.MOVER, rotulo: 'Mover' },
  { acao: ACAO.PARAR, rotulo: 'Parar' },
  { acao: ACAO.SEGURAR, rotulo: 'Segurar' },
  { acao: ACAO.PATRULHAR, rotulo: 'Patrulhar' },
  { acao: ACAO.PAUSAR, rotulo: 'Pausa' },
  { acao: ACAO.ZOOM_MENOS, rotulo: 'Afastar' },
  { acao: ACAO.ZOOM_MAIS, rotulo: 'Aproximar' },
];

const MODOS = { [ACAO.ATACAR_MOVENDO]: 'atacar-movendo', [ACAO.MOVER]: 'mover', [ACAO.PATRULHAR]: 'patrulhar' };

function teclaDe(acao, mods = '') {
  const atalho = ATALHOS_PADRAO.find(a => a.acao === acao && a.mods === mods);
  return atalho ? rotuloDoAtalho(atalho, eMac) : '';
}

export function criarBarraDeComandos({ raiz, controles, grupos, indice, selecionadas, canvasAlvo, telaCheia }) {
  let guardarNoProximo = false;
  const modoGuardar = eMac ? 'alt' : 'ctrl';

  raiz.innerHTML = `
    <div class="comandos-linha">
      ${BOTOES.map(({ acao, rotulo }) => `<button type="button" data-acao="${acao}" title="${rotulo} (${teclaDe(acao)})">${rotulo}<kbd>${teclaDe(acao)}</kbd></button>`).join('')}
      <button type="button" data-tela-cheia title="Tela cheia (Esc sai)">Tela cheia</button>
    </div>
    <div class="comandos-linha comandos-grupos">
      <button type="button" data-guardar title="Guardar a seleção no próximo grupo tocado (${rotuloDoAtalho({ code: 'Digit1', mods: modoGuardar }, eMac)})">Guardar</button>
      ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button type="button" data-grupo="${n}" title="Grupo ${n}: ${n} chama; Shift + ${n} soma; ${rotuloDoAtalho({ code: `Digit${n}`, mods: modoGuardar }, eMac)} guarda">${n}<span data-tamanho></span></button>`).join('')}
    </div>
    <div class="comandos-aviso" role="status" aria-live="polite"></div>`;

  const aviso = raiz.querySelector('.comandos-aviso');

  raiz.addEventListener('click', e => {
    const botao = e.target instanceof Element ? e.target.closest('button') : null;
    if (!botao) return;
    botao.blur();
    canvasAlvo.focus({ preventScroll: true });
    if (botao.dataset.acao) {
      controles.executar({ acao: botao.dataset.acao, fila: e.shiftKey }, e.timeStamp);
    } else if (botao.hasAttribute('data-tela-cheia')) {
      telaCheia();
    } else if (botao.hasAttribute('data-guardar')) {
      guardarNoProximo = !guardarNoProximo;
    } else if (botao.dataset.grupo) {
      const grupo = Number(botao.dataset.grupo);
      const acao = guardarNoProximo ? ACAO.GUARDAR_GRUPO : e.shiftKey ? ACAO.SOMAR_GRUPO : ACAO.CHAMAR_GRUPO;
      guardarNoProximo = false;
      controles.executar({ acao, grupo }, e.timeStamp);
    }
    atualizar();
  });

  function atualizar() {
    const semSelecao = selecionadas.size === 0;
    for (const botao of raiz.querySelectorAll('[data-acao]')) {
      const acao = botao.dataset.acao;
      botao.setAttribute('aria-pressed', String(controles.modo === acao || (acao === ACAO.PAUSAR && controles.pausado)));
      botao.disabled = semSelecao && [ACAO.ATACAR_MOVENDO, ACAO.MOVER, ACAO.PARAR, ACAO.SEGURAR, ACAO.PATRULHAR].includes(acao);
    }
    raiz.querySelector('[data-guardar]').setAttribute('aria-pressed', String(guardarNoProximo));
    for (const botao of raiz.querySelectorAll('[data-grupo]')) {
      const tamanho = grupos.tamanho(Number(botao.dataset.grupo), indice.existe);
      botao.querySelector('[data-tamanho]').textContent = tamanho ? `·${tamanho}` : '';
      botao.dataset.vazio = String(tamanho === 0);
    }
    const modo = MODOS[controles.modo];
    aviso.textContent = controles.pausado
      ? 'Pausado. P ou o botão Pausa continua.'
      : modo
        ? `Clique no chão para ${modo}; Shift mantém para enfileirar; Esc ou clique direito cancela.`
        : guardarNoProximo
          ? 'Toque no número do grupo para guardar a seleção.'
          : `${selecionadas.size} selecionada${selecionadas.size === 1 ? '' : 's'}`;
  }

  atualizar();
  return { atualizar };
}
