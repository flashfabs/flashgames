// Turns the match events (from the rules on the host, or from snapshots on the members) into visual effects
// for the painter and sounds placed where they happened on the arena.

import { COLUNAS, PONTOS, ITEM } from './regras.js';

export const MAX_EFEITOS = 90;

// Stereo position of a sound from its column on the arena (-1 left, 1 right).
const panDe = x => (Number.isFinite(x) ? (x / (COLUNAS - 1)) * 2 - 1 : undefined);
const mediaDe = valores => (valores.length ? valores.reduce((soma, valor) => soma + valor, 0) / valores.length : undefined);

// efeitos: the list the painter draws (changed in place); eu: your index in the match (or -1);
// escalacao: the players of the match, for colors; mostrarFaixa(texto): the banner over the arena.
export function tratarEventos(eventos, { efeitos, som, eu, escalacao, mostrarFaixa }) {
  const agora = performance.now() / 1000;
  const explosoes = [];
  const caixas = [];
  const blocos = [];
  const efeito = (tipo, x, y, extra = {}) => efeitos.push({ tipo, x, y, inicio: agora, ...extra });
  for (const evento of eventos) {
    const pan = panDe(evento?.x);
    switch (evento?.e) {
      case 'bum':
        explosoes.push(evento.x);
        efeito('explosao', evento.x, evento.y);
        break;
      case 'bomba':
        som.tocar('bomba', { pan });
        break;
      case 'chute':
        som.tocar('chute', { pan });
        efeito('chute', evento.x, evento.y);
        break;
      case 'caixa':
        caixas.push(evento.x);
        efeito('caixa', evento.x, evento.y);
        if (evento.j === eu) efeito('ponto', evento.x, evento.y, { texto: `+${PONTOS.caixa}` });
        break;
      case 'item':
        som.tocar('item', { item: evento.item, pan });
        efeito('item', evento.x, evento.y, { item: evento.item });
        if (evento.j === eu && evento.item === ITEM.DETONADOR) mostrarFaixa('🎯 Detonador: bombas esperam até 10 s; aperte de novo para detonar.');
        if (evento.j === eu && evento.item === ITEM.MOLOTOV) mostrarFaixa('🍾 Molotov: pressione Q ou toque no botão para usar.');
        break;
      case 'escudo':
        som.tocar('escudo', { pan });
        efeito('escudo', evento.x, evento.y);
        break;
      case 'gelo':
        som.tocar('gelo', { pan });
        break;
      case 'congela':
        som.tocar('congela', { pan });
        efeito('congela', evento.x, evento.y);
        break;
      case 'atalho':
        som.tocar('atalho', { pan });
        efeito('atalho', evento.x, evento.y);
        efeito('atalho', evento.x2, evento.y2, { chegada: true });
        break;
      case 'morte':
        som.tocar('morte', { eu: evento.j === eu, pan });
        efeito('morte', evento.x, evento.y, { cor: escalacao[evento.j]?.cor ?? 0 });
        break;
      case 'subita':
        som.tocar('alarme');
        som.musica('subita');
        mostrarFaixa('Morte súbita! A arena está fechando.');
        break;
      case 'bloco':
        blocos.push(evento.x);
        efeito('bloco', evento.x, evento.y);
        break;
      default:
        break;
    }
  }
  if (explosoes.length) som.tocar('bum', { n: explosoes.length, pan: panDe(mediaDe(explosoes)) });
  if (caixas.length) som.tocar('caixa', { n: caixas.length, pan: panDe(mediaDe(caixas)) });
  if (blocos.length) som.tocar('bloco', { pan: panDe(mediaDe(blocos)) });
  if (efeitos.length > MAX_EFEITOS) efeitos.splice(0, efeitos.length - MAX_EFEITOS);
}
