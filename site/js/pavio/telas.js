// Pavio screens: the cards for the lobby, the countdown, a match result and the end of the round, plus the
// score table and the podium. They only read the state they are given and call back through `acoes`;
// pavio.js decides which one is on screen and when.

import { MAPAS, PONTOS } from './regras.js';
import { CORES, VISUAL_ITEM, DESCRICAO_ITEM, marcaJogador } from './desenho.js';
import { NIVEIS as NIVEIS_ROBO, ORDEM_NIVEIS } from './robo.js';

export const TOTAL_PARTIDAS = MAPAS.length;
export const ZERO = Object.freeze({ vitorias: 0, caixas: 0, eliminacoes: 0 });
const CONFETES = 26;

export function h(tag, atributos = {}, ...filhos) {
  const elemento = document.createElement(tag);
  for (const [chave, valor] of Object.entries(atributos)) {
    if (chave === 'class') elemento.className = valor;
    else if (chave.startsWith('on')) elemento.addEventListener(chave.slice(2), valor);
    else if (valor !== false && valor != null) elemento.setAttribute(chave, valor === true ? '' : valor);
  }
  elemento.append(...filhos.flat().filter(filho => filho != null && filho !== false));
  return elemento;
}

export function pontosDe(placar = ZERO) {
  return placar.caixas * PONTOS.caixa + placar.eliminacoes * PONTOS.eliminacao + placar.vitorias * PONTOS.vitoria;
}

// Lineup with the round score, best first (ties broken by wins).
export function linhasDoPlacar(estado) {
  return estado.escalacao
    .map(item => {
      const placar = { ...ZERO, ...estado.placar[item.id] };
      return { ...item, ...placar, pontos: pontosDe(placar) };
    })
    .sort((a, b) => b.pontos - a.pontos || b.vitorias - a.vitorias);
}

export function campeoes(estado) {
  const linhas = linhasDoPlacar(estado);
  if (!linhas.length) return [];
  return linhas.filter(linha => linha.pontos === linhas[0].pontos && linha.vitorias === linhas[0].vitorias);
}

export function legendaControles(toque) {
  if (toque) {
    return h('div', { class: 'pavio-legenda' },
      h('p', {}, 'Arraste o dedo no lado esquerdo da tela para andar e toque no lado direito para soltar bomba. Com gelo, aparece o botão ❄️.'),
      h('p', {}, 'Teclado e controle de videogame também funcionam.'),
    );
  }
  return h('div', { class: 'pavio-legenda' },
    h('p', {}, h('kbd', {}, 'WASD'), ' ou ', h('kbd', {}, 'setas'), ' andam · ', h('kbd', {}, 'Espaço'), ' solta bomba · ', h('kbd', {}, 'E'), ' joga gelo · controle de videogame também funciona'),
    h('p', {}, 'Segurando duas direções, você segue numa e vira na outra assim que der.'),
  );
}

export function nomeItem(item) {
  return `${VISUAL_ITEM[item].emoji} ${VISUAL_ITEM[item].nome}`;
}

export function linhasPoder(itens = []) {
  return itens.map(item => {
    const visual = VISUAL_ITEM[item];
    const icone = h('span', { class: 'pavio-poder-icone', 'aria-hidden': 'true' }, visual.emoji);
    icone.style.setProperty('--fundo', visual.fundo);
    return h('p', { class: 'pavio-poder' }, icone, h('span', {}, 'Poder novo: ', h('strong', {}, visual.nome), ` · ${DESCRICAO_ITEM[item]}`));
  });
}

export function confetes() {
  return h('div', { class: 'pavio-confete', 'aria-hidden': 'true' }, Array.from({ length: CONFETES }, (_, n) => {
    const peca = h('span');
    peca.style.setProperty('--x', `${(n * 37) % 100}%`);
    peca.style.setProperty('--atraso', `${((n * 0.13) % 1.2).toFixed(2)}s`);
    peca.style.setProperty('--giro', `${(n % 2 ? 1 : -1) * (240 + ((n * 53) % 360))}deg`);
    peca.style.setProperty('--cor', CORES[n % CORES.length].base);
    return peca;
  }));
}

function legendaPontos() {
  return h('p', { class: 'pavio-regra-pontos' },
    `📦 caixa destruída = ${PONTOS.caixa} ponto · 💀 eliminação = ${PONTOS.eliminacao} · 🏆 partida vencida = ${PONTOS.vitoria}`);
}

// Remaining time of the current screen as a shrinking bar (hidden when motion is reduced).
function barraTempo(estado) {
  const restante = Math.max(0, (estado.fimFaseEm - performance.now()) / 1000);
  const barra = h('div', { class: 'pavio-tempo', 'aria-hidden': 'true' }, h('span'));
  barra.style.setProperty('--duracao', `${restante.toFixed(2)}s`);
  return barra;
}

// The screens of one game. Each card gets the screen context (`tela`) built by pavio.js:
// { estado, meuId, souAnfitriao, membros, toque, placarInicio, nivelNovoRobo, vagasRobos, acoes }, where acoes
// holds pronto(valor), voltarAoLobby(), adicionarRobo(), removerRobo(id), trocarNivelRobo(id) and
// escolherNivelRobo(nivel). A card returns { conteudo, contagem }: the elements to show and, when the card has
// one, the element whose text pavio.js keeps updated with the seconds left.
export function criarTelas({ pintor }) {
  function retratoDe(cor, pose, classe = '') {
    return pintor.retrato(h('canvas', { class: `pavio-retrato ${classe}`.trim(), 'aria-hidden': 'true' }), { cor, pose });
  }

  function tabelaPlacar({ estado, meuId, placarInicio }, { comGanho = false } = {}) {
    const linhas = linhasDoPlacar(estado);
    const inicio = comGanho && placarInicio.idPartida === estado.idPartida ? placarInicio.placar : null;
    const coluna = (icone, rotulo, titulo) => h('th', { scope: 'col', title: titulo },
      h('span', { 'aria-hidden': 'true' }, icone), h('span', { class: 'pavio-placar-rotulo' }, rotulo));
    return h('table', { class: 'pavio-placar' },
      h('thead', {}, h('tr', {},
        h('th', { scope: 'col' }, '#'), h('th', { scope: 'col', class: 'pavio-placar-nome' }, 'Jogador'),
        coluna('🏆', 'Vitórias', `Partidas vencidas, ${PONTOS.vitoria} pontos cada`),
        coluna('📦', 'Caixas', `Caixas destruídas, ${PONTOS.caixa} ponto cada`),
        coluna('💀', 'Eliminações', `Eliminações, ${PONTOS.eliminacao} pontos cada`),
        coluna('⭐', 'Pontos', 'Pontos na rodada'),
      )),
      h('tbody', {}, linhas.map((linha, posicao) => {
        const ganho = inicio?.[linha.id] ? linha.pontos - pontosDe(inicio[linha.id]) : 0;
        return h('tr', { class: linha.id === meuId ? 'pavio-placar-eu' : '' },
          h('td', { class: 'pavio-placar-posicao' }, String(posicao + 1)),
          h('td', { class: 'pavio-placar-nome' }, marcaJogador(linha.cor), h('span', {}, linha.nome)),
          h('td', {}, String(linha.vitorias)),
          h('td', {}, String(linha.caixas)),
          h('td', {}, String(linha.eliminacoes)),
          h('td', { class: 'pavio-placar-pontos' }, String(linha.pontos),
            ganho > 0 && h('span', { class: 'pavio-placar-ganho', title: 'Pontos nesta partida' }, `+${ganho}`)),
        );
      })),
    );
  }

  // Robots are always ready; the host sees buttons to change their level and to take them out.
  function linhaRobo({ estado, souAnfitriao, acoes }, robo, n) {
    const nivel = NIVEIS_ROBO[robo.nivel]?.nome ?? robo.nivel;
    const cor = estado.cores[robo.id] ?? n;
    return h('li', { class: 'pronto pavio-prontos-robo' },
      h('span', { class: 'pavio-prontos-retrato' }, retratoDe(cor, 'pronto'), marcaJogador(cor)),
      h('span', { class: 'pavio-prontos-texto' },
        h('span', { class: 'pavio-prontos-nome' }, robo.nome),
        souAnfitriao
          ? h('button', {
            class: 'pavio-robo-nivel',
            type: 'button',
            title: 'Trocar a dificuldade',
            'aria-label': `${robo.nome}: ${nivel}. Trocar a dificuldade`,
            onclick: () => acoes.trocarNivelRobo(robo.id),
          }, nivel)
          : h('span', { class: 'pavio-prontos-estado' }, `robô ${nivel.toLowerCase()}`)),
      souAnfitriao && h('button', {
        class: 'pavio-robo-tirar',
        type: 'button',
        title: 'Tirar o robô',
        'aria-label': `Tirar ${robo.nome}`,
        onclick: () => acoes.removerRobo(robo.id),
      }, '✕'));
  }

  // Host only: pick the level of the next robot and add it.
  function controlesRobos({ estado, souAnfitriao, nivelNovoRobo, vagasRobos, acoes }) {
    if (!souAnfitriao) return null;
    return h('div', { class: 'pavio-robos' },
      h('span', {}, 'Robôs:'),
      ORDEM_NIVEIS.map(nivel => h('button', {
        class: 'pavio-robo-nivel',
        type: 'button',
        'aria-pressed': String(nivel === nivelNovoRobo),
        onclick: () => acoes.escolherNivelRobo(nivel),
      }, NIVEIS_ROBO[nivel].nome)),
      h('button', {
        class: 'botao botao--secundario botao--pequeno',
        type: 'button',
        disabled: estado.robos.length >= vagasRobos,
        onclick: () => acoes.adicionarRobo(),
      }, '+ Robô'));
  }

  function cartaoLobby(tela) {
    const { estado, meuId, membros, toque, acoes } = tela;
    const prontos = new Set(estado.prontos);
    const estouPronto = prontos.has(meuId);
    const faltam = membros.filter(membro => !prontos.has(membro.id)).length;
    const lista = h('ul', { class: 'pavio-prontos' }, membros.map((membro, n) => {
      const pronto = prontos.has(membro.id);
      const eu = membro.id === meuId;
      const cor = estado.cores[membro.id] ?? n;
      return h('li', { class: [pronto && 'pronto', eu && 'eu'].filter(Boolean).join(' ') },
        h('span', { class: 'pavio-prontos-retrato' }, retratoDe(cor, pronto ? 'pronto' : 'jogo'), marcaJogador(cor)),
        h('span', { class: 'pavio-prontos-texto' },
          h('span', { class: 'pavio-prontos-nome' }, membro.nome, eu && h('span', { class: 'pavio-prontos-voce' }, ' (você)')),
          h('span', { class: 'pavio-prontos-estado' }, pronto ? '✅ pronto' : '⏳ esperando')),
      );
    }), estado.robos.map((robo, n) => linhaRobo(tela, robo, membros.length + n)));
    let situacao = 'Todo mundo pronto!';
    if (faltam) situacao = faltam === 1 && !estouPronto ? 'Só falta você.' : `Esperando ${faltam} ${faltam === 1 ? 'pessoa ficar pronta' : 'pessoas ficarem prontas'}.`;
    const robos = estado.robos.length;
    let dica = situacao;
    if (membros.length === 1 && robos) dica = `Você contra ${robos} ${robos === 1 ? 'robô' : 'robôs'}. Fique pronto para começar.`;
    else if (membros.length === 1) dica = 'Mande o link lá de cima pra galera ou chame robôs. Sozinho vira treino.';
    return {
      conteudo: [
        h('h2', { class: 'pavio-titulo' }, 'Pavio'),
        h('p', { class: 'pavio-subtitulo' }, `Rodada de ${TOTAL_PARTIDAS} partidas: cada uma num mapa mais fechado e com poderes novos.`),
        lista,
        controlesRobos(tela),
        h('button', {
          class: estouPronto ? 'botao botao--secundario' : 'botao botao--grande',
          type: 'button',
          onclick: () => acoes.pronto(!estouPronto),
        }, estouPronto ? 'Cancelar pronto' : 'Estou pronto'),
        h('p', { class: 'pavio-dica' }, dica),
        legendaControles(toque),
      ],
      contagem: null,
    };
  }

  function cartaoContagem({ estado }, { jogando, segundos }) {
    const mapa = MAPAS[estado.mapa];
    const contagem = h('div', { class: 'pavio-numero pavio-numero--pop', 'data-n': String(segundos) }, String(segundos));
    return {
      conteudo: [
        h('p', { class: 'pavio-sobretitulo' }, `Partida ${estado.numero} de ${TOTAL_PARTIDAS}`),
        h('h2', { class: 'pavio-mapa' }, mapa.nome),
        h('p', {}, mapa.descricao),
        ...linhasPoder(mapa.novos),
        contagem,
        !jogando && h('p', { class: 'pavio-pilula' }, 'Você entra na próxima rodada.'),
      ],
      contagem,
    };
  }

  function cartaoResultado(tela, { segundos }) {
    const { estado, meuId } = tela;
    const vencedor = estado.resultado?.vencedor ?? null;
    const campeao = estado.escalacao.find(item => item.id === vencedor);
    let titulo = estado.escalacao.length > 1 ? 'Empate! Ninguém sobrou.' : 'Fim da partida';
    if (vencedor === meuId) titulo = 'Você venceu a partida! 🏆';
    else if (vencedor) titulo = `${campeao?.nome ?? 'Alguém'} venceu a partida! 🏆`;
    const proximo = MAPAS[Math.min(estado.numero, TOTAL_PARTIDAS - 1)];
    const poderes = proximo.novos.length
      ? ` · ${proximo.novos.length > 1 ? 'poderes novos' : 'poder novo'} ${proximo.novos.map(nomeItem).join(' e ')}`
      : '';
    const contagem = h('strong', {}, String(segundos));
    return {
      conteudo: [
        h('p', { class: 'pavio-sobretitulo' }, `Partida ${estado.numero} de ${TOTAL_PARTIDAS} · ${MAPAS[estado.mapa].nome}`),
        campeao && retratoDe(campeao.cor, 'festa', 'pavio-retrato--vencedor'),
        h('h2', {}, titulo),
        tabelaPlacar(tela, { comGanho: true }),
        legendaPontos(),
        h('p', { class: 'pavio-proximo' }, `Próxima: ${proximo.nome}`, poderes, ' · começa em ', contagem, ' s'),
        barraTempo(estado),
      ],
      contagem,
    };
  }

  // Top three on steps: the DOM keeps the ranking order (1st, 2nd, 3rd) and CSS puts 1st in the middle.
  function podio(estado) {
    const linhas = linhasDoPlacar(estado).slice(0, 3);
    if (!linhas.length) return null;
    const topo = new Set(campeoes(estado).map(linha => linha.id));
    return h('ol', { class: 'pavio-podio', 'aria-label': 'Pódio' }, linhas.map((linha, n) => h('li', { class: `pavio-podio-lugar pavio-podio-lugar--${n + 1}` },
      retratoDe(linha.cor, topo.has(linha.id) ? 'festa' : 'jogo', 'pavio-retrato--podio'),
      h('span', { class: 'pavio-podio-nome' }, marcaJogador(linha.cor), h('span', {}, linha.nome)),
      h('span', { class: 'pavio-podio-pontos' }, `${linha.pontos} ${linha.pontos === 1 ? 'ponto' : 'pontos'}`),
      h('span', { class: 'pavio-podio-degrau' }, `${n + 1}º`),
    )));
  }

  function cartaoFinal(tela, { segundos }) {
    const { estado, meuId, souAnfitriao, acoes } = tela;
    const topo = campeoes(estado);
    const varios = estado.escalacao.length > 1;
    let titulo = 'Fim do treino';
    if (varios && topo.length === 1) {
      titulo = topo[0].id === meuId ? 'Você é o campeão da rodada! 🏆' : `${topo[0].nome} é o campeão da rodada! 🏆`;
    } else if (varios) {
      titulo = `Empate entre ${topo.map(linha => linha.nome).join(' e ')}`;
    }
    const contagem = h('strong', {}, String(segundos));
    return {
      conteudo: [
        varios && !estado.motivo && confetes(),
        h('p', { class: 'pavio-sobretitulo' }, estado.motivo ? 'Rodada interrompida' : 'Fim da rodada'),
        estado.motivo && h('p', { class: 'pavio-motivo' }, estado.motivo),
        h('h2', {}, titulo),
        varios && podio(estado),
        tabelaPlacar(tela),
        legendaPontos(),
        h('p', {}, 'Voltando ao lobby em ', contagem, ' s'),
        souAnfitriao && h('button', { class: 'botao botao--secundario', type: 'button', onclick: () => acoes.voltarAoLobby() }, 'Voltar ao lobby agora'),
      ],
      contagem,
    };
  }

  return { cartaoLobby, cartaoContagem, cartaoResultado, cartaoFinal };
}
