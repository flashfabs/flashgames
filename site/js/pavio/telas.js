// Pavio screens: the cards for the lobby, the countdown, a match result and the end of the round, plus the
// score table and the podium. They only read the state they are given and call back through `acoes`;
// pavio.js decides which one is on screen and when.

import { MAPAS, PONTOS, MAX_JOGADORES } from './regras.js';
import { CORES, VISUAL_ITEM, DESCRICAO_ITEM, marcaJogador } from './desenho.js';
import { NIVEIS as NIVEIS_ROBO, ORDEM_NIVEIS } from './robo.js';
import * as salas from '../sala.js';
import { desenharQr } from '../qr.js';
import { destaquesDaPartida, linhaDoTempo, textoDaMorte, conquistasDaRodada, formatarDuracao } from './resumo.js';

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
    return h('p', { class: 'pavio-poder' }, icone, h('span', {},
      'Poder novo: ', h('strong', {}, visual.nome), h('span', { class: 'pavio-poder-descricao' }, ` · ${DESCRICAO_ITEM[item]}`)));
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

// Connection to the host: 'boa', 'media' or 'ruim' (the room's own rule when it has one), or null while measuring.
function nivelDaConexao(membro) {
  if (typeof salas.nivelConexao === 'function') return salas.nivelConexao(membro);
  if (membro.ping == null) return null;
  return membro.ping < 80 ? 'boa' : membro.ping < 160 ? 'media' : 'ruim';
}

// Fills a connection badge in place: the lobby card is not rebuilt for every ping (once a second).
function preencherConexao(selo, membro) {
  const nivel = nivelDaConexao(membro);
  const ping = membro.ping == null ? null : Math.round(membro.ping);
  selo.className = `pavio-conexao${nivel ? ` pavio-conexao--${nivel}` : ''}`;
  selo.textContent = ping === null ? '…' : `${membro.relay ? '🐢 ' : ''}${ping} ms`;
  selo.title = ping === null
    ? 'Medindo a conexão'
    : `${ping} ms até o anfitrião${membro.relay ? ', via retransmissor (a conexão direta não funcionou)' : ''}`;
}

// Updates the badges of an on-screen lobby card with fresh room data.
export function atualizarConexoes(raiz, membros) {
  for (const membro of membros) {
    const selo = raiz.querySelector(`[data-conexao="${CSS.escape(membro.id)}"]`);
    if (selo) preencherConexao(selo, membro);
  }
}

async function compartilharLink(link, botao) {
  try {
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      await navigator.share({ title: 'Bora jogar Pavio?', text: 'Entra na minha sala:', url: link });
      return;
    }
    await navigator.clipboard.writeText(link);
    botao.textContent = 'Link copiado!';
  } catch (erro) {
    if (erro?.name === 'AbortError') return;
    console.warn('Sharing the link failed, showing it instead', erro);
    window.prompt('Copie o link da sala:', link);
  }
}

// Points counting up from what the round had before this match (instantly when motion is reduced).
function contarAte(elemento, de, ate) {
  if (de >= ate || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const inicio = performance.now();
  const duracao = 700;
  elemento.textContent = String(de);
  const passo = agora => {
    if (!elemento.isConnected) return;
    const k = Math.min(1, (agora - inicio) / duracao);
    elemento.textContent = String(Math.round(de + (ate - de) * (1 - (1 - k) ** 3)));
    if (k < 1) requestAnimationFrame(passo);
  };
  requestAnimationFrame(passo);
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
  let qrAberto = false; // survives the lobby card being rebuilt

  // Invitation: the room code, a button to share (phone) or copy the link, and a QR code for a phone nearby.
  function convite({ link, codigo, membros }) {
    if (!link || membros.length >= MAX_JOGADORES) return null;
    const toque = matchMedia('(pointer: coarse)').matches && Boolean(navigator.share);
    const qr = h('canvas', { class: 'pavio-convite-qr', role: 'img', 'aria-label': `QR code com o link da sala ${codigo}`, hidden: !qrAberto });
    const erroQr = h('p', { class: 'pavio-convite-erro', hidden: true }, 'Não consegui gerar o QR code agora; use o link.');
    const mostrarQr = async () => {
      qr.hidden = false;
      try {
        await desenharQr(qr, link);
      } catch (erro) {
        console.warn('QR code unavailable', erro);
        qr.hidden = true;
        erroQr.hidden = false;
      }
    };
    if (qrAberto) mostrarQr();
    return h('div', { class: 'pavio-convite' },
      h('p', { class: 'pavio-convite-titulo' }, 'Chame a galera · sala ', h('strong', {}, codigo)),
      h('div', { class: 'pavio-convite-acoes' },
        h('button', {
          class: 'botao botao--secundario botao--pequeno',
          type: 'button',
          onclick: evento => compartilharLink(link, evento.currentTarget),
        }, toque ? 'Compartilhar link' : 'Copiar link do convite'),
        h('button', {
          class: 'botao botao--secundario botao--pequeno',
          type: 'button',
          'aria-expanded': String(qrAberto),
          onclick: evento => {
            qrAberto = !qrAberto;
            evento.currentTarget.setAttribute('aria-expanded', String(qrAberto));
            if (qrAberto) mostrarQr();
            else qr.hidden = true;
          },
        }, 'QR code'),
      ),
      qr,
      erroQr,
    );
  }

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
        const numero = h('span', { class: 'pavio-placar-numero' }, String(linha.pontos));
        if (ganho > 0) contarAte(numero, linha.pontos - ganho, linha.pontos);
        return h('tr', { class: linha.id === meuId ? 'pavio-placar-eu' : '' },
          h('td', { class: 'pavio-placar-posicao' }, String(posicao + 1)),
          h('td', { class: 'pavio-placar-nome' }, marcaJogador(linha.cor), h('span', {}, linha.nome)),
          h('td', {}, String(linha.vitorias)),
          h('td', {}, String(linha.caixas)),
          h('td', {}, String(linha.eliminacoes)),
          h('td', { class: 'pavio-placar-pontos' }, numero,
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
    // Someone whose link dropped holds the start back until they are back (or the room lets them go).
    const caidos = membros.filter(membro => membro.fora);
    const lista = h('ul', { class: 'pavio-prontos' }, membros.map((membro, n) => {
      const pronto = prontos.has(membro.id) && !membro.fora;
      const eu = membro.id === meuId;
      const cor = estado.cores[membro.id] ?? n;
      let situacaoMembro = pronto ? '✅ pronto' : '⏳ esperando';
      if (membro.fora) situacaoMembro = '📶 reconectando';
      // Everyone but the host shows their connection to the host.
      let conexao = null;
      if (membro.id !== tela.idAnfitriao && !membro.fora) {
        conexao = h('span', { 'data-conexao': membro.id });
        preencherConexao(conexao, membro);
      }
      return h('li', { class: [pronto && 'pronto', eu && 'eu', membro.fora && 'fora'].filter(Boolean).join(' ') },
        h('span', { class: 'pavio-prontos-retrato' }, retratoDe(cor, pronto ? 'pronto' : 'jogo'), marcaJogador(cor)),
        h('span', { class: 'pavio-prontos-texto' },
          h('span', { class: 'pavio-prontos-nome' }, membro.nome, eu && h('span', { class: 'pavio-prontos-voce' }, ' (você)')),
          h('span', { class: 'pavio-prontos-estado' }, situacaoMembro)),
        conexao,
      );
    }), estado.robos.map((robo, n) => linhaRobo(tela, robo, membros.length + n)));
    let situacao = 'Todo mundo pronto!';
    if (faltam) situacao = faltam === 1 && !estouPronto ? 'Só falta você.' : `Esperando ${faltam} ${faltam === 1 ? 'pessoa ficar pronta' : 'pessoas ficarem prontas'}.`;
    else if (caidos.length) situacao = caidos.length === 1 ? `Esperando ${caidos[0].nome} reconectar.` : `Esperando ${caidos.length} pessoas reconectarem.`;
    const robos = estado.robos.length;
    let dica = situacao;
    if (membros.length === 1 && robos) dica = `Você contra ${robos} ${robos === 1 ? 'robô' : 'robôs'}. Fique pronto para começar.`;
    else if (membros.length === 1) dica = 'Mande o link pra galera ou chame robôs. Sozinho vira treino.';
    return {
      conteudo: [
        h('h2', { class: 'pavio-titulo' }, 'Pavio'),
        h('p', { class: 'pavio-subtitulo' }, `Rodada de ${TOTAL_PARTIDAS} partidas: cada uma num mapa mais fechado e com poderes novos.`),
        lista,
        controlesRobos(tela),
        convite(tela),
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
        destaques(estado),
        tabelaPlacar(tela, { comGanho: true }),
        comoFoi(estado),
        legendaPontos(),
        h('p', { class: 'pavio-proximo' }, `Próxima: ${proximo.nome}`, poderes, ' · começa em ', contagem, ' s'),
        botaoPular(tela),
        barraTempo(estado),
      ],
      contagem,
    };
  }

  // Someone of the lineup as a small badge and name, for the summaries.
  function quem(estado, ids) {
    return ids.flatMap((id, n) => {
      const item = estado.escalacao.find(pessoa => pessoa.id === id);
      return item ? [n ? ', ' : '', marcaJogador(item.cor), ' ', h('span', {}, item.nome)] : [];
    });
  }

  // Up to four highlights of the match that just ended.
  function destaques(estado) {
    const lista = destaquesDaPartida(estado.estatisticas).slice(0, 4);
    if (!lista.length) return null;
    return h('ul', { class: 'pavio-destaques', 'aria-label': 'Destaques da partida' }, lista.map(destaque => h('li', { class: 'pavio-destaque' },
      h('span', { class: 'pavio-destaque-icone', 'aria-hidden': 'true' }, destaque.icone),
      h('span', { class: 'pavio-destaque-texto' },
        h('span', { class: 'pavio-destaque-titulo' }, destaque.titulo, ` · ${destaque.texto}`),
        h('span', { class: 'pavio-destaque-quem' }, quem(estado, destaque.ids))),
    )));
  }

  // The eliminations in order, folded so the result fits on a phone.
  function comoFoi(estado) {
    const mortes = linhaDoTempo(estado.estatisticas);
    if (!mortes.length) return null;
    const nomeDe = id => estado.escalacao.find(item => item.id === id)?.nome ?? 'alguém';
    return h('details', { class: 'pavio-linha-tempo' },
      h('summary', {}, `Como a partida foi (${mortes.length} ${mortes.length === 1 ? 'eliminação' : 'eliminações'})`),
      h('ol', {}, mortes.map(morte => h('li', {},
        h('span', { class: 'pavio-linha-tempo-hora' }, formatarDuracao(morte.tempo)),
        h('span', {}, quem(estado, [morte.id]), ` ${textoDaMorte(morte, nomeDe)}`),
      ))));
  }

  // Everyone in the match can vote to skip the wait; when all the people did, the next match starts.
  function botaoPular({ estado, meuId, acoes }) {
    const pessoas = estado.escalacao.filter(item => !item.robo);
    if (!pessoas.some(item => item.id === meuId) || pessoas.length < 1) return null;
    const votos = (estado.pulos ?? []).filter(id => pessoas.some(item => item.id === id)).length;
    const votei = (estado.pulos ?? []).includes(meuId);
    const contagem = pessoas.length > 1 ? ` (${votos}/${pessoas.length})` : '';
    return h('button', {
      class: 'botao botao--secundario botao--pequeno pavio-pular',
      type: 'button',
      disabled: votei,
      onclick: () => acoes.pular(),
    }, votei ? `Esperando os outros${contagem}` : `Pular para a próxima${contagem}`);
  }

  // Round achievements, shown at the end of a round played to the last match.
  function conquistas(estado) {
    const lista = conquistasDaRodada(estado.estatisticasRodada);
    if (!lista.length) return null;
    return h('ul', { class: 'pavio-conquistas', 'aria-label': 'Conquistas da rodada' }, lista.map(conquista => h('li', { class: 'pavio-conquista' },
      h('span', { class: 'pavio-destaque-icone', 'aria-hidden': 'true' }, conquista.icone),
      h('span', { class: 'pavio-destaque-texto' },
        h('span', { class: 'pavio-destaque-titulo' }, conquista.titulo, ` · ${conquista.texto}`),
        h('span', { class: 'pavio-destaque-quem' }, quem(estado, conquista.ids))),
    )));
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
        !estado.motivo && conquistas(estado),
        tabelaPlacar(tela),
        legendaPontos(),
        h('p', {}, 'Voltando ao lobby em ', contagem, ' s'),
        h('div', { class: 'pavio-final-acoes' },
          h('button', {
            class: 'botao',
            type: 'button',
            disabled: tela.queroJogarDeNovo,
            onclick: () => acoes.jogarDeNovo(),
          }, tela.queroJogarDeNovo ? 'Combinado: você volta pronto' : 'Jogar de novo'),
          souAnfitriao && h('button', { class: 'botao botao--secundario', type: 'button', onclick: () => acoes.voltarAoLobby() }, 'Voltar ao lobby agora')),
      ],
      contagem,
    };
  }

  return { cartaoLobby, cartaoContagem, cartaoResultado, cartaoFinal };
}
