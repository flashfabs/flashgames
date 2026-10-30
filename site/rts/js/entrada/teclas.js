// Default key bindings and the translation from a KeyboardEvent to a game action. Bindings follow the physical key
// (event.code), because Option and Shift change event.key on the Mac (Option+1 is "¡"); remapping only edits the table.
// The browser owns its shortcuts: no binding ever uses Ctrl or Cmd with the keys in RESERVADAS_DO_NAVEGADOR, and Esc
// only cancels, because it also leaves full screen.

export const ACAO = Object.freeze({
  ATACAR_MOVENDO: 'atacarMovendo',
  MOVER: 'mover',
  PARAR: 'parar',
  SEGURAR: 'segurar',
  PATRULHAR: 'patrulhar',
  PAUSAR: 'pausar',
  CANCELAR: 'cancelar',
  SELECIONAR_TUDO: 'selecionarTudo',
  CHAMAR_GRUPO: 'chamarGrupo',
  GUARDAR_GRUPO: 'guardarGrupo',
  SOMAR_GRUPO: 'somarGrupo',
  ZOOM_MAIS: 'zoomMais',
  ZOOM_MENOS: 'zoomMenos',
});

/** Actions that wait for a click on the map; Shift held on that click appends to the order queue. */
export const ACOES_COM_ALVO = new Set([ACAO.ATACAR_MOVENDO, ACAO.MOVER, ACAO.PATRULHAR]);

/** Held keys that move the camera, read every frame: [dx, dy] in screen directions. */
export const SETAS = Object.freeze({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] });

/** Keys that never become game shortcuts with Ctrl or Cmd: the browser closes, opens or reloads with them. */
export const RESERVADAS_DO_NAVEGADOR = Object.freeze(['KeyW', 'KeyT', 'KeyN', 'KeyQ', 'KeyR', 'KeyL', 'Tab', 'F5', 'F11', 'F12']);

const DIGITOS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

// Storing a group accepts both Ctrl and Option/Alt with the digit: Chrome on Windows may keep Ctrl+digit for its tabs
// and the Mac may keep Control+digit for its desktops, and the key battery decides which one the interface shows.
// Shift on a command key is not part of the binding: it marks the order for the queue.
export const ATALHOS_PADRAO = Object.freeze([
  { acao: ACAO.ATACAR_MOVENDO, code: 'KeyA', mods: '', aceitaShift: true },
  { acao: ACAO.MOVER, code: 'KeyM', mods: '', aceitaShift: true },
  { acao: ACAO.PARAR, code: 'KeyS', mods: '' },
  { acao: ACAO.SEGURAR, code: 'KeyH', mods: '' },
  { acao: ACAO.PATRULHAR, code: 'KeyR', mods: '', aceitaShift: true },
  { acao: ACAO.PAUSAR, code: 'KeyP', mods: '' },
  { acao: ACAO.CANCELAR, code: 'Escape', mods: '' },
  { acao: ACAO.SELECIONAR_TUDO, code: 'KeyA', mods: 'ctrl' },
  { acao: ACAO.ZOOM_MAIS, code: 'Equal', mods: '', aceitaShift: true },
  { acao: ACAO.ZOOM_MAIS, code: 'NumpadAdd', mods: '' },
  { acao: ACAO.ZOOM_MENOS, code: 'Minus', mods: '' },
  { acao: ACAO.ZOOM_MENOS, code: 'NumpadSubtract', mods: '' },
  ...DIGITOS.flatMap(digito => [
    { acao: ACAO.CHAMAR_GRUPO, code: `Digit${digito}`, mods: '', grupo: Number(digito) },
    { acao: ACAO.SOMAR_GRUPO, code: `Digit${digito}`, mods: 'shift', grupo: Number(digito) },
    { acao: ACAO.GUARDAR_GRUPO, code: `Digit${digito}`, mods: 'ctrl', grupo: Number(digito) },
    { acao: ACAO.GUARDAR_GRUPO, code: `Digit${digito}`, mods: 'alt', grupo: Number(digito) },
  ]),
]);

/** Modifiers of a key event as 'ctrl+meta+alt+shift', in that order, without the absent ones. */
export function modificadores(e) {
  return [e.ctrlKey && 'ctrl', e.metaKey && 'meta', e.altKey && 'alt', e.shiftKey && 'shift'].filter(Boolean).join('+');
}

/**
 * The action bound to a key event, or null when the key is not the game's (the caller then leaves the event alone,
 * so the browser keeps its own shortcuts).
 * @returns {{acao: string, grupo?: number, fila: boolean} | null}
 */
export function acaoDaTecla(e, atalhos = ATALHOS_PADRAO) {
  const mods = modificadores(e);
  const semShift = mods.replace(/\+?shift$/, '');
  for (const atalho of atalhos) {
    if (atalho.code !== e.code) continue;
    const exato = atalho.mods === mods;
    const comShift = atalho.aceitaShift && e.shiftKey && atalho.mods === semShift;
    if (!exato && !comShift) continue;
    return { acao: atalho.acao, grupo: atalho.grupo, fila: e.shiftKey };
  }
  return null;
}

/** How a binding is written for the player on this system ("Option + 1", "Ctrl + 1", "A"). */
export function rotuloDoAtalho(atalho, eMac) {
  const nomes = { ctrl: eMac ? 'Control' : 'Ctrl', meta: 'Cmd', alt: eMac ? 'Option' : 'Alt', shift: 'Shift' };
  const tecla = atalho.code.replace(/^(Key|Digit|Numpad)/, '').replace('Equal', '+').replace('Minus', '−').replace('Escape', 'Esc').replace('Add', '+').replace('Subtract', '−');
  return [...atalho.mods.split('+').filter(Boolean).map(mod => nomes[mod]), tecla].join(' + ');
}
