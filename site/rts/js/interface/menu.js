// Start screen, the F10 menu and the notices in the middle of the screen. The match waits paused (reason 'inicio')
// until Começar, and that click is the only thing that turns the audio on. F10 opens and closes the menu; Esc only
// closes it, never opens it (Esc belongs to the browser's full screen). The single-player match pauses while the menu
// is open and, through the simulation bridge, while the tab is hidden; coming back says so for a moment.

const AVISO_DA_ABA_MS = 3000;

export function criarMenu({ inicio, menu, avisoCentro, botaoMenu, botaoComecar, texto, simulacao, som, telaCheia, obterRegistro = () => null, mostrarInicio, aoComecar = () => {}, aoEncerrar = () => {}, podeAbrir = () => true }) {
  let aberto = false;
  let comecou = !mostrarInicio;
  let pronto = false;
  let avisoDaAbaAte = 0;
  let velocidade = 100;

  for (const elemento of document.querySelectorAll('[data-texto]')) elemento.textContent = texto(elemento.dataset.texto);

  // The playtest log loads on its own; its button shows once it is there.
  const copiar = document.createElement('button');
  copiar.type = 'button';
  copiar.className = 'botao';
  copiar.dataset.menu = 'registro';
  copiar.hidden = true;
  copiar.textContent = texto('menu.copiar_registro');
  menu.querySelector('[data-menu="recomecar"]').before(copiar);

  if (mostrarInicio) {
    inicio.hidden = false;
    simulacao.pausar(true, 'inicio');
  }

  function marcarPronto() {
    if (pronto) return;
    pronto = true;
    botaoComecar.disabled = false;
    botaoComecar.textContent = texto('menu.comecar');
    if (!inicio.hidden) botaoComecar.focus();
  }

  function comecar() {
    if (comecou || !pronto) return;
    comecou = true;
    // The click on Começar is the user gesture the browser needs before any sound.
    som.ligar();
    inicio.hidden = true;
    simulacao.pausar(false, 'inicio');
    aoComecar();
  }

  function abrir() {
    if (aberto || !comecou || !podeAbrir()) return;
    aberto = true;
    menu.hidden = false;
    simulacao.pausar(true, 'menu');
    atualizarBotoes();
    menu.querySelector('[data-menu="continuar"]').focus();
  }

  function fechar() {
    if (!aberto) return;
    aberto = false;
    menu.hidden = true;
    simulacao.pausar(false, 'menu');
    document.getElementById('tela')?.focus({ preventScroll: true });
  }

  function atualizarBotoes() {
    for (const botao of menu.querySelectorAll('[data-velocidade]')) botao.setAttribute('aria-pressed', String(Number(botao.dataset.velocidade) === velocidade));
    menu.querySelector('[data-menu="som"]').setAttribute('aria-pressed', String(!som.mudo));
    copiar.hidden = !obterRegistro();
  }

  botaoComecar.addEventListener('click', comecar);
  botaoMenu.addEventListener('click', () => (aberto ? fechar() : abrir()));

  menu.addEventListener('click', e => {
    const botao = e.target instanceof Element ? e.target.closest('[data-menu], [data-velocidade]') : null;
    if (!botao) return;
    if (botao.dataset.velocidade) {
      velocidade = Number(botao.dataset.velocidade);
      simulacao.velocidade(velocidade);
    } else if (botao.dataset.menu === 'continuar') {
      fechar();
    } else if (botao.dataset.menu === 'som') {
      som.definirMudo(!som.mudo);
    } else if (botao.dataset.menu === 'tela-cheia') {
      telaCheia();
    } else if (botao.dataset.menu === 'encerrar') {
      fechar();
      aoEncerrar();
      return;
    } else if (botao.dataset.menu === 'recomecar') {
      location.reload();
    } else if (botao.dataset.menu === 'registro') {
      const registro = obterRegistro();
      if (registro) Promise.resolve(registro.copiar()).catch(erro => console.error('playtest log not copied', erro));
    }
    atualizarBotoes();
  });

  // F10 toggles the menu wherever the focus is; Esc closes it. Both stop here so the game keys never see them.
  addEventListener('keydown', e => {
    if (e.code === 'F10' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat) (aberto ? fechar() : abrir());
    } else if (e.code === 'Escape' && aberto) {
      e.preventDefault();
      e.stopPropagation();
      fechar();
    } else if (aberto && !menu.contains(e.target)) {
      e.stopPropagation();
    }
  }, { capture: true });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && comecou) avisoDaAbaAte = Infinity;
    else if (avisoDaAbaAte === Infinity) avisoDaAbaAte = performance.now() + AVISO_DA_ABA_MS;
  });

  /** Middle-of-the-screen notice: the hidden-tab pause for a moment after coming back, else the player's pause. */
  function atualizarAviso(pausado) {
    const agora = performance.now();
    const mensagem = agora < avisoDaAbaAte ? texto('menu.aba_oculta') : pausado && !aberto ? texto('hud.pausado') : '';
    if (avisoCentro.textContent !== mensagem) avisoCentro.textContent = mensagem;
    avisoCentro.hidden = mensagem === '';
  }

  return {
    marcarPronto,
    comecar,
    abrir,
    fechar,
    atualizarAviso,
    /** While the start screen or the menu is up, the battlefield takes no input. */
    get bloqueado() {
      return aberto || !comecou;
    },
    get aberto() {
      return aberto;
    },
    get comecou() {
      return comecou;
    },
  };
}
