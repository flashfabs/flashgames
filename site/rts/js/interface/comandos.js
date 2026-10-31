// Command area of the bottom bar: the Q W E R / A S D F grid with what the card offers for the selection (orders,
// training with cost and queue count, buildings to start or place), the nine control groups with their sizes beside
// it, one status line, and the utility buttons (pause, zoom, full screen) up in the top bar. A group button recalls the group, with Shift adds
// the selection to it, and after "Guardar" stores the selection in it. Buttons give focus back so keys keep working.
import { ACAO, ATALHOS_PADRAO, E_MAC as eMac, rotuloDoAtalho } from '../entrada/teclas.js';
import { LETRAS_DA_GRADE } from './cartao.js';

const UTILIDADES = [
  { acao: ACAO.PAUSAR, rotulo: 'Pausa' },
  { acao: ACAO.ZOOM_MENOS, rotulo: 'Afastar' },
  { acao: ACAO.ZOOM_MAIS, rotulo: 'Aproximar' },
];

const MODOS = { [ACAO.ATACAR_MOVENDO]: 'atacar-movendo', [ACAO.MOVER]: 'mover', [ACAO.PATRULHAR]: 'patrulhar' };
/** Why a command is refused, as the status line says it. */
export const MOTIVOS = {
  carga: 'hud.sem_carga',
  lotacao: 'hud.lotacao_cheia',
  fila: 'hud.fila_cheia',
  posicao: 'hud.posicao_invalida',
  fora_da_area: 'hud.fora_da_area',
  terreno_ocupado: 'hud.terreno_ocupado',
  terreno_improprio: 'hud.terreno_improprio',
  celula_nao_ventosa: 'hud.celula_nao_ventosa',
  bloqueado: 'hud.bloqueado',
  nada_pronto: 'hud.nada_pronto',
  limite: 'hud.limite',
};
const DURACAO_DO_MOTIVO_MS = 2200;

function teclaDe(acao, mods = '') {
  const atalho = ATALHOS_PADRAO.find(a => a.acao === acao && a.mods === mods);
  return atalho ? rotuloDoAtalho(atalho, eMac) : '';
}

export function criarBarraDeComandos({ raiz, utilidades, controles, grupos, indice, selecionadas, canvasAlvo, telaCheia, texto, catalogo, cartao }) {
  let guardarNoProximo = false;
  let motivo = null;
  let motivoAte = 0;
  const modoGuardar = eMac ? 'alt' : 'ctrl';

  raiz.innerHTML = `
    <div class="grade" role="group" aria-label="Grade de comandos">
      ${LETRAS_DA_GRADE.map((letra, slot) => `<button type="button" class="botao" data-slot="${slot}" data-vazio="true"><kbd>${letra}</kbd><span data-nome></span><small data-info></small><i class="progresso" hidden></i></button>`).join('')}
    </div>
    <div class="comandos-grupos" role="group" aria-label="Grupos">
      ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button type="button" class="botao" data-grupo="${n}" title="Grupo ${n}: ${n} chama; Shift + ${n} soma; ${rotuloDoAtalho({ code: `Digit${n}`, mods: modoGuardar }, eMac)} guarda">${n}<span data-tamanho></span></button>`).join('')}
      <button type="button" class="botao comandos-guardar" data-guardar title="Guardar a seleção no próximo grupo tocado (${rotuloDoAtalho({ code: 'Digit1', mods: modoGuardar }, eMac)})">Guardar</button>
    </div>
    <div class="comandos-aviso" role="status" aria-live="polite"></div>`;
  utilidades.innerHTML = `
    ${UTILIDADES.map(({ acao, rotulo }) => `<button type="button" class="botao" data-acao="${acao}" title="${rotulo} (${teclaDe(acao)})">${rotulo}<kbd>${teclaDe(acao)}</kbd></button>`).join('')}
    <button type="button" class="botao" data-tela-cheia title="Tela cheia (Esc sai)">Tela cheia</button>`;

  const aviso = raiz.querySelector('.comandos-aviso');
  const botoesDaGrade = [...raiz.querySelectorAll('[data-slot]')];
  const assinaturas = new Array(botoesDaGrade.length).fill('');

  function aoClicar(e) {
    const botao = e.target instanceof Element ? e.target.closest('button') : null;
    if (!botao) return;
    botao.blur();
    canvasAlvo.focus({ preventScroll: true });
    controles.marcarBotao();
    if (botao.dataset.slot !== undefined) {
      controles.executarSlot(cartao().slots[Number(botao.dataset.slot)], { fila: e.shiftKey }, e.timeStamp);
    } else if (botao.dataset.acao) {
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
  }
  raiz.addEventListener('click', aoClicar);
  utilidades.addEventListener('click', aoClicar);

  function desenharSlot(botao, slot, i) {
    let nome = '';
    let info = '';
    let progresso = -1;
    if (slot?.acao) {
      nome = texto(slot.texto);
    } else if (slot) {
      nome = slot.modo === 'pesquisar' ? catalogo().pesquisa(slot.pesquisa)?.nomeVisivel ?? '?' : catalogo().nome(slot.tipo);
      if (slot.modo === 'posicionar') info = 'pronto';
      else if (slot.progresso >= 0) info = `${Math.floor(slot.progresso * 100)}%`;
      else info = `${slot.custo} C`;
      if (slot.quantidade > 1) info += ` ·${slot.quantidade}`;
      progresso = slot.progresso;
    }
    const assinatura = slot ? `${nome}|${info}|${slot.falta ?? ''}|${slot.modo ?? ''}|${Math.round(progresso * 50)}` : '';
    if (assinatura === assinaturas[i]) return;
    assinaturas[i] = assinatura;
    botao.dataset.vazio = String(!slot);
    botao.querySelector('[data-nome]').textContent = nome;
    botao.querySelector('[data-info]').textContent = info;
    botao.dataset.falta = String(Boolean(slot?.falta));
    botao.dataset.pronto = String(slot?.modo === 'posicionar');
    botao.disabled = false;
    botao.title = slot ? `${nome} (${LETRAS_DA_GRADE[i]})${slot.falta ? ` · ${texto(MOTIVOS[slot.falta])}` : ''}` : '';
    const barra = botao.querySelector('.progresso');
    barra.hidden = !(progresso >= 0 && progresso < 1);
    barra.style.width = `${Math.max(0, progresso) * 100}%`;
  }

  /** Refreshes buttons and the status line; a refusal reason ('carga', 'lotacao', 'fila', 'posicao') shows for a moment. */
  function atualizar(novoMotivo) {
    if (typeof novoMotivo === 'string' && MOTIVOS[novoMotivo]) {
      motivo = novoMotivo;
      motivoAte = performance.now() + DURACAO_DO_MOTIVO_MS;
    }
    const atual = cartao();
    botoesDaGrade.forEach((botao, i) => {
      const slot = atual.slots[i];
      desenharSlot(botao, slot, i);
      if (slot?.acao) botao.setAttribute('aria-pressed', String(controles.modo === slot.acao));
      else botao.removeAttribute('aria-pressed');
    });
    for (const botao of utilidades.querySelectorAll('[data-acao]')) botao.setAttribute('aria-pressed', String(botao.dataset.acao === ACAO.PAUSAR && controles.pausado));
    raiz.querySelector('[data-guardar]').setAttribute('aria-pressed', String(guardarNoProximo));
    for (const botao of raiz.querySelectorAll('[data-grupo]')) {
      const tamanho = grupos.tamanho(Number(botao.dataset.grupo), indice.existe);
      botao.querySelector('[data-tamanho]').textContent = tamanho ? `·${tamanho}` : '';
      botao.dataset.vazio = String(tamanho === 0);
    }
    const modo = MODOS[controles.modo];
    const agora = performance.now();
    aviso.textContent = motivo && agora < motivoAte
      ? texto(MOTIVOS[motivo])
      : controles.pausado
        ? texto('hud.pausado')
        : controles.modo === 'colocar'
          ? texto('hud.posicionar', { nome: catalogo().nome(controles.colocando ?? -1) })
          : modo
            ? `Clique no chão para ${modo}; Shift mantém para enfileirar; Esc ou clique direito cancela.`
            : guardarNoProximo
              ? 'Toque no número do grupo para guardar a seleção.'
              : selecionadas.size === 0
                ? texto('hud.nada_selecionado')
                : selecionadas.size === 1
                  ? texto('hud.selecionada')
                  : texto('hud.selecionadas', { n: selecionadas.size });
  }

  atualizar();
  return { atualizar };
}
