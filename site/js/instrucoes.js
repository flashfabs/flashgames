import { VISUAL_ITEM, DESCRICAO_ITEM, desenharSpriteItem } from './pavio/desenho.js';
import { ITEM, PONTOS } from './pavio/regras.js';
import { TAM } from './pavio/cenario.js';

const pontos = document.querySelector('#pontos');
for (const [icone, texto, valor] of [['📦', 'Caixa destruída', PONTOS.caixa], ['💀', 'Eliminação', PONTOS.eliminacao], ['🏆', 'Vitória', PONTOS.vitoria]]) {
  const item = document.createElement('div');
  item.className = 'ponto';
  const nome = document.createElement('span'); nome.textContent = `${icone} ${texto}`;
  const numero = document.createElement('strong'); numero.textContent = `${valor} ${valor === 1 ? 'ponto' : 'pontos'}`;
  item.append(nome, numero); pontos.append(item);
}
const lista = document.querySelector('#lista-boosters');
for (const item of Object.values(ITEM)) {
  const visual = VISUAL_ITEM[item];
  const artigo = document.createElement('article'); artigo.className = 'booster';
  const icone = document.createElement('canvas'); icone.width = icone.height = TAM; icone.setAttribute('aria-hidden', 'true');
  desenharSpriteItem(icone.getContext('2d'), item);
  const texto = document.createElement('div');
  const titulo = document.createElement('h3'); titulo.textContent = item === ITEM.BANANA ? 'Banana' : visual.rotulo;
  const descricao = document.createElement('p'); descricao.textContent = DESCRICAO_ITEM[item];
  texto.append(titulo, descricao); artigo.append(icone, texto); lista.append(artigo);
}
