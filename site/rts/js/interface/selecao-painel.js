// Selection panel of the bottom bar: for many entities, one button per kind with how many and their mean health
// (clicking one keeps only that kind); for one building, its state (under construction, without power) and both
// queues with the progress of the head and a button per item that cancels it; for one unit, its health and, for a
// harvester, its load; for a resource pile, harvesters at it and what is left. Refreshed a few times a second and
// touched only when what it shows changes.
import { BANDEIRA, FAIXA, FAIXA_ESTADO } from '../sim/contratos.js';

const MAXIMO_DO_BYTE = 255;
/** Harvesters a node serves at once (the "3/3" of the panel); the design's saturation. */
const SATURACAO = 3;

export function criarPainelDeSelecao({ raiz, selecionadas, indice, estado, catalogo, leitura, texto, controles, ordens, canvasAlvo, aoMudar }) {
  let anterior = '';

  raiz.addEventListener('click', e => {
    const botao = e.target instanceof Element ? e.target.closest('button') : null;
    if (!botao) return;
    botao.blur();
    canvasAlvo.focus({ preventScroll: true });
    controles.marcarBotao();
    if (botao.dataset.tipo !== undefined) {
      const tipo = Number(botao.dataset.tipo);
      for (const id of [...selecionadas]) if (indice.tipo(id) !== tipo) selecionadas.delete(id);
      aoMudar();
    } else if (botao.dataset.cancelar !== undefined) {
      ordens.cancelar(Number(botao.dataset.predio), Number(botao.dataset.faixa), Number(botao.dataset.cancelar), e.timeStamp);
    }
  });

  // Mean health (0..1) per kind of the selected entities, in the order kinds first appear.
  function porTipo() {
    const atual = estado.atual;
    const grupos = new Map();
    for (const id of selecionadas) {
      const k = indice.k(id);
      if (k < 0) continue;
      const tipo = atual.tipo[k];
      const g = grupos.get(tipo) ?? { tipo, n: 0, vida: 0 };
      g.n += 1;
      g.vida += atual.vida[k] / MAXIMO_DO_BYTE;
      grupos.set(tipo, g);
    }
    return [...grupos.values()];
  }

  const barra = (fracao, classe = 'barra-vida') => `<span class="${classe}"><i style="width:${Math.round(fracao * 100)}%"></i></span>`;

  function itemDaFila(id, faixa, item, posicao, legenda) {
    const pct = Math.floor(item.progresso * 100);
    return `<button type="button" class="botao item-fila" data-predio="${id}" data-faixa="${faixa}" data-cancelar="${posicao}" title="${texto('comando.cancelar')}"><b>${catalogo().nomeDoItem(item.item)}</b><small>${legenda ?? (posicao === 0 ? `${pct}%` : texto('hud.fila'))}</small>${posicao === 0 ? barra(item.progresso, 'progresso') : ''}</button>`;
  }

  function htmlDaFila(id) {
    const producao = leitura.producao(id);
    if (!producao) return '';
    const itens = [];
    producao.obras.forEach((item, posicao) => {
      const legenda = posicao === 0 && producao.pronto >= 0 ? texto('hud.pronto_posicionar') : undefined;
      itens.push(itemDaFila(id, FAIXA.CONSTRUCAO, item, posicao, legenda));
    });
    producao.fila.forEach((item, posicao) => {
      const legenda = posicao === 0 && producao.estadoFila === FAIXA_ESTADO.ESPERA_LOTACAO ? texto('hud.lotacao_cheia') : undefined;
      itens.push(itemDaFila(id, FAIXA.UNIDADES, item, posicao, legenda));
    });
    return itens.length ? `<div class="selecao-fila">${itens.join('')}</div>` : `<div class="selecao-detalhe">${texto('hud.fila_vazia')}</div>`;
  }

  // The line under the name of one selected entity.
  function detalhe(id, k) {
    const atual = estado.atual;
    const tipo = atual.tipo[k];
    const cat = catalogo();
    const bandeiras = atual.bandeiras[k];
    if (cat.ehPredio(tipo)) {
      if (bandeiras & BANDEIRA.EM_OBRA) {
        const fracao = atual.progresso[k] / MAXIMO_DO_BYTE;
        return `<div class="selecao-detalhe">${texto('hud.em_construcao', { pct: Math.floor(fracao * 100) })}</div>${barra(fracao, 'progresso')}`;
      }
      const semEnergia = cat.info(tipo).precisaRede && !(bandeiras & BANDEIRA.ENERGIZADO) ? `<div class="selecao-detalhe selecao-alerta">${texto('hud.sem_energia', { nome: cat.nome(tipo) })}</div>` : '';
      return semEnergia + htmlDaFila(id);
    }
    if (cat.ehRecurso(tipo)) {
      const ocupacao = cat.categoria(tipo) === 'recurso' ? `${texto('hud.saturacao', { n: atual.ocupacao[k], max: SATURACAO })} · ` : '';
      return `<div class="selecao-detalhe">${ocupacao}${Math.round((atual.carga[k] / MAXIMO_DO_BYTE) * 100)}%</div>${barra(atual.carga[k] / MAXIMO_DO_BYTE, 'progresso')}`;
    }
    const vida = barra(atual.vida[k] / MAXIMO_DO_BYTE);
    if (cat.ehColetor(tipo)) return `${vida}<div class="selecao-detalhe">${texto('hud.carga')} ${Math.round((atual.carga[k] / MAXIMO_DO_BYTE) * 100)}%</div>`;
    return vida;
  }

  function atualizar() {
    if (!estado.atual) return;
    const grupos = porTipo();
    let html;
    if (grupos.length === 0) {
      html = `<div class="selecao-titulo"><span>${texto('hud.nada_selecionado')}</span></div>`;
    } else if (selecionadas.size === 1) {
      const [id] = selecionadas;
      const k = indice.k(id);
      const tipo = grupos[0].tipo;
      const vida = Math.round((estado.atual.vida[k] / MAXIMO_DO_BYTE) * 100);
      html = `<div class="selecao-titulo"><b>${catalogo().nome(tipo)}</b><span>${catalogo().ehRecurso(tipo) ? '' : `${vida}%`}</span></div>${detalhe(id, k)}`;
    } else {
      const titulo = texto('hud.selecionadas', { n: selecionadas.size });
      const tipos = grupos.map(g => `<button type="button" class="botao selecao-tipo" data-tipo="${g.tipo}" title="Só ${catalogo().nome(g.tipo)}"><b>${catalogo().nome(g.tipo)} ×${g.n}</b>${barra(g.vida / g.n)}</button>`).join('');
      html = `<div class="selecao-titulo"><b>${titulo}</b></div><div class="selecao-tipos">${tipos}</div>`;
    }
    if (html === anterior) return;
    anterior = html;
    raiz.innerHTML = html;
  }

  return { atualizar };
}
