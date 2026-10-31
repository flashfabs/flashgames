// Alert list at the top right: each alert is a line for a few seconds, newest at the bottom, at most a handful at
// once; clicking one brings the camera to where it happened. Danger alerts are marked for the eye and the alarm.
import { ALERTA, ALERTAS_DE_PERIGO } from './alertas.js';

const DURACAO_MS = 6000;
const MAXIMO = 4;

const TEXTO_DO_ALERTA = {
  [ALERTA.SOB_ATAQUE]: 'alerta.sob_ataque',
  [ALERTA.BASE_SOB_ATAQUE]: 'alerta.base_sob_ataque',
  [ALERTA.COLETOR_SOB_ATAQUE]: 'alerta.coletor_sob_ataque',
  [ALERTA.PRODUCAO]: 'alerta.producao_concluida',
  [ALERTA.CONSTRUCAO]: 'alerta.construcao_concluida',
  [ALERTA.RECURSO_ESGOTADO]: 'alerta.recurso_esgotado',
};

export function criarAvisos({ lista, texto, catalogo, aoEscolher }) {
  const vivos = [];

  lista.addEventListener('click', e => {
    const item = e.target instanceof Element ? e.target.closest('li') : null;
    const alerta = item && vivos.find(v => v.item === item)?.alerta;
    if (alerta) aoEscolher(alerta);
  });

  function remover(vivo) {
    const i = vivos.indexOf(vivo);
    if (i >= 0) vivos.splice(i, 1);
    vivo.item.dataset.saindo = 'true';
    setTimeout(() => vivo.item.remove(), 400);
  }

  /** The line an alert shows. */
  function textoDe(alerta) {
    const id = TEXTO_DO_ALERTA[alerta.tipo];
    if (!id) return '';
    return texto(id, { nome: catalogo().nome(alerta.arg) });
  }

  /** Shows an alert; refusals are not listed here (the command bar says them). */
  function mostrar(alerta) {
    const conteudo = textoDe(alerta);
    if (!conteudo) return;
    const item = document.createElement('li');
    item.textContent = conteudo;
    item.dataset.perigo = String(ALERTAS_DE_PERIGO.has(alerta.tipo));
    item.dataset.tipo = alerta.tipo;
    lista.append(item);
    const vivo = { item, alerta };
    vivos.push(vivo);
    setTimeout(() => remover(vivo), DURACAO_MS);
    while (vivos.length > MAXIMO) remover(vivos[0]);
  }

  return { mostrar, textoDe };
}
