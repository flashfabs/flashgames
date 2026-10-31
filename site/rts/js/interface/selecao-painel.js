// Selection panel of the bottom bar: for many entities, one button per kind with how many and their mean health
// (clicking one keeps only that kind); for one building, its queue with the progress of the item being made and a
// button per item that cancels it; for one unit, its name and health. Refreshed a few times a second and touched
// only when what it shows changes.
const VIDA_MAXIMA = 255;

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
      ordens.cancelar(Number(botao.dataset.predio), Number(botao.dataset.cancelar), e.timeStamp);
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
      g.vida += atual.vida[k] / VIDA_MAXIMA;
      grupos.set(tipo, g);
    }
    return [...grupos.values()];
  }

  const barraDeVida = fracao => `<span class="barra-vida"><i style="width:${Math.round(fracao * 100)}%"></i></span>`;

  function htmlDaFila(id) {
    const producao = leitura.producao(id);
    if (!producao) return '';
    const itens = [];
    if (producao.pronto >= 0) itens.push(`<span class="botao item-fila"><b>${catalogo().nome(producao.pronto)}</b><small>${texto('hud.pronto_posicionar')}</small></span>`);
    if (producao.obra) {
      itens.push(`<span class="botao item-fila"><b>${catalogo().nome(producao.obra.tipo)}</b><small>${Math.floor(producao.obra.progresso * 100)}%</small><span class="progresso"><i style="width:${Math.round(producao.obra.progresso * 100)}%"></i></span></span>`);
    }
    producao.fila.forEach((item, posicao) => {
      const pct = posicao === 0 ? Math.floor(item.progresso * 100) : 0;
      itens.push(`<button type="button" class="botao item-fila" data-predio="${id}" data-cancelar="${posicao}" title="${texto('comando.cancelar')}"><b>${catalogo().nome(item.tipo)}</b><small>${posicao === 0 ? `${pct}%` : texto('hud.fila')}</small>${posicao === 0 ? `<span class="progresso"><i style="width:${pct}%"></i></span>` : ''}</button>`);
    });
    return itens.length ? `<div class="selecao-fila">${itens.join('')}</div>` : `<div class="selecao-detalhe">${texto('hud.fila_vazia')}</div>`;
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
      const atual = estado.atual;
      const vida = Math.round((atual.vida[k] / VIDA_MAXIMA) * 100);
      const detalhe = catalogo().ehPredio(tipo)
        ? htmlDaFila(id)
        : `<div class="selecao-detalhe">${barraDeVida(atual.vida[k] / VIDA_MAXIMA)}</div>`;
      html = `<div class="selecao-titulo"><b>${catalogo().nome(tipo)}</b><span>${vida}%</span></div>${detalhe}`;
    } else {
      const titulo = texto('hud.selecionadas', { n: selecionadas.size });
      const tipos = grupos.map(g => `<button type="button" class="botao selecao-tipo" data-tipo="${g.tipo}" title="Só ${catalogo().nome(g.tipo)}"><b>${catalogo().nome(g.tipo)} ×${g.n}</b>${barraDeVida(g.vida / g.n)}</button>`).join('');
      html = `<div class="selecao-titulo"><b>${titulo}</b></div><div class="selecao-tipos">${tipos}</div>`;
    }
    if (html === anterior) return;
    anterior = html;
    raiz.innerHTML = html;
  }

  return { atualizar };
}
