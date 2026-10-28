// First-time hints: a short tip at the bottom of the arena (how to walk, how to drop a bomb) that goes away once
// the player does it and never comes back on this device, plus a one-time note on the first power picked up.

const CHAVE = 'salinha:dicas';
const ORDEM = ['andar', 'bomba'];
const TEXTOS = {
  andar: { teclado: 'Ande com WASD ou as setas', toque: 'Arraste o dedo no lado esquerdo para andar' },
  bomba: { teclado: 'Espaço solta uma bomba: solte perto de caixas e saia de perto', toque: 'Toque no lado direito para soltar uma bomba e saia de perto' },
  poder: { teclado: 'Você pegou um poder! Os seus aparecem no topo da tela', toque: 'Você pegou um poder! Os seus aparecem no topo da tela' },
};
const DURACAO_PODER_MS = 3500;

function lerVistas() {
  try {
    const salvas = JSON.parse(localStorage.getItem(CHAVE) ?? '[]');
    return new Set(Array.isArray(salvas) ? salvas : []);
  } catch {
    return new Set();
  }
}

function gravarVistas(vistas) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify([...vistas]));
  } catch {
    // Storage blocked (private mode): the hints just show again next time.
  }
}

// arena: the element the tip sits on; toque: whether to word it for a touch screen.
export function criarDicas({ arena, toque }) {
  const vistas = lerVistas();
  const elemento = document.createElement('div');
  elemento.className = 'pavio-dica-jogo';
  elemento.setAttribute('role', 'status');
  elemento.hidden = true;
  arena.append(elemento);
  let jogando = false;
  let temporaria = null;
  let timer = 0;
  const modo = toque ? 'toque' : 'teclado';

  function mostrar() {
    if (temporaria) {
      elemento.textContent = TEXTOS[temporaria][modo];
      elemento.hidden = false;
      return;
    }
    const atual = jogando ? ORDEM.find(chave => !vistas.has(chave)) : null;
    elemento.hidden = !atual;
    if (atual) elemento.textContent = TEXTOS[atual][modo];
  }

  function concluir(chave) {
    if (vistas.has(chave)) return;
    vistas.add(chave);
    gravarVistas(vistas);
    mostrar();
  }

  return {
    // Tips show only while this device's player is in a match.
    definirJogando(valor) {
      jogando = Boolean(valor);
      if (!jogando) temporaria = null;
      mostrar();
    },
    andou() {
      if (jogando) concluir('andar');
    },
    soltouBomba() {
      if (jogando) concluir('bomba');
    },
    pegouPoder() {
      if (vistas.has('poder')) return;
      vistas.add('poder');
      gravarVistas(vistas);
      temporaria = 'poder';
      mostrar();
      clearTimeout(timer);
      timer = setTimeout(() => {
        temporaria = null;
        mostrar();
      }, DURACAO_PODER_MS);
    },
    destruir() {
      clearTimeout(timer);
      elemento.remove();
    },
  };
}
