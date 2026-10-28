// Device profile on the home screen: the character, the nickname, the color (each color comes with a shape), a
// few numbers, and taking the profile to another device. The data lives in conta.js; this module only shows it.
// The color starts "automatic" (the room picks a free one, as before) until the person chooses one here.

import { obterPerfil, salvarPerfil, codigoDeRecuperacao, recuperar, ranking } from './conta.js';
import * as desenho from './pavio/desenho.js';
import { MAPAS } from './pavio/regras.js';

const CHAVE_COR_ESCOLHIDA = 'salinha:cor-escolhida';
const CORES_DA_SALA = desenho.CORES.length;

function lerCorEscolhida() {
  try {
    return localStorage.getItem(CHAVE_COR_ESCOLHIDA) === '1';
  } catch {
    return false;
  }
}

function gravarCorEscolhida() {
  try {
    localStorage.setItem(CHAVE_COR_ESCOLHIDA, '1');
  } catch {
    // Storage blocked (private mode): the choice holds until the page closes.
  }
}

function elemento(tag, atributos = {}, ...filhos) {
  const novo = document.createElement(tag);
  for (const [chave, valor] of Object.entries(atributos)) {
    if (chave === 'class') novo.className = valor;
    else if (chave.startsWith('on')) novo.addEventListener(chave.slice(2), valor);
    else if (valor !== false && valor != null) novo.setAttribute(chave, valor === true ? '' : valor);
  }
  novo.append(...filhos.filter(filho => filho != null && filho !== false));
  return novo;
}

function plural(n, um, varios) {
  return `${n} ${n === 1 ? um : varios}`;
}

function numeros(estatisticas) {
  if (!estatisticas?.partidas) return 'Seu perfil fica neste aparelho. Jogue uma partida para começar suas estatísticas.';
  const partes = [plural(estatisticas.partidas, 'partida', 'partidas'), plural(estatisticas.vitorias, 'vitória', 'vitórias'), plural(estatisticas.pontos, 'ponto', 'pontos')];
  const recorde = estatisticas.recordes?.pontos;
  return `${partes.join(' · ')}${recorde ? ` · recorde de ${plural(recorde, 'ponto', 'pontos')} numa partida` : ''}`;
}

const ULTIMAS_PARTIDAS = 5;
const TOPO_RANKING = 10;

function quandoFoi(em) {
  const minutos = Math.round((Date.now() - em) / 60000);
  if (minutos < 1) return 'agora';
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `há ${horas} h`;
  const dias = Math.round(horas / 24);
  return dias === 1 ? 'ontem' : `há ${dias} dias`;
}

function linhaDoHistorico(partida) {
  const mapa = MAPAS.find(item => item.tema === partida.mapa)?.nome ?? 'Partida';
  const com = partida.robos >= partida.jogadores - 1 ? `contra ${plural(partida.robos, 'robô', 'robôs')}` : `com ${plural(partida.jogadores - 1, 'pessoa', 'pessoas')}`;
  return elemento('li', { class: partida.venceu ? 'venceu' : '' },
    elemento('span', { class: 'perfil-lista-principal' }, `${partida.venceu ? '🏆 ' : ''}${mapa} · ${plural(partida.pontos, 'ponto', 'pontos')}`),
    elemento('span', { class: 'perfil-lista-detalhe' }, `${com} · ${quandoFoi(partida.em)}`));
}

// raiz: the profile section of the home screen; campoNome: the nickname input (inside the home form).
// aoMudar(perfil) runs whenever the shown profile changes; perfil.corPreferida is null while the color is automatic.
export function criarPerfil({ raiz, campoNome, aoMudar = () => {} }) {
  const boneco = raiz.querySelector('#perfil-boneco');
  const textoNumeros = raiz.querySelector('#perfil-numeros');
  const cores = raiz.querySelector('#perfil-cores');
  const outroAparelho = raiz.querySelector('#perfil-outro-aparelho');
  const historicoLista = raiz.querySelector('#perfil-historico-lista');
  const rankingSecao = raiz.querySelector('#perfil-ranking');
  const rankingLista = raiz.querySelector('#perfil-ranking-lista');
  let perfil = null;
  let corEscolhida = lerCorEscolhida();
  let nomeMostrado = '';

  const corMostrada = () => (corEscolhida && perfil ? desenho.indiceCor(perfil.cor) : 0);

  function avisarMudanca() {
    aoMudar({ ...perfil, corPreferida: corEscolhida ? desenho.indiceCor(perfil.cor) : null });
  }

  function desenharBoneco() {
    const cor = corMostrada();
    if (typeof desenho.retratoSolto === 'function') {
      const quadro = elemento('canvas', { class: 'perfil-retrato', 'aria-hidden': 'true' });
      const marca = desenho.marcaJogador(cor);
      marca.classList.add('perfil-marca-canto');
      boneco.replaceChildren(desenho.retratoSolto(quadro, { cor, pose: 'jogo' }), marca);
    } else {
      const marca = desenho.marcaJogador(cor);
      marca.classList.add('perfil-marca');
      boneco.replaceChildren(marca);
    }
  }

  function desenharCores() {
    const atual = corEscolhida ? desenho.indiceCor(perfil.cor) : null;
    cores.replaceChildren(
      elemento('span', { class: 'perfil-cores-rotulo', id: 'perfil-cores-rotulo' }, 'Sua cor'),
      ...Array.from({ length: CORES_DA_SALA }, (_, n) => {
        const marca = desenho.marcaJogador(n);
        // One tab stop for the group (the chosen color, or the first): the arrow keys move between colors.
        return elemento('button', {
          type: 'button',
          class: 'perfil-cor',
          role: 'radio',
          'aria-checked': String(atual === n),
          'aria-label': `${desenho.SIMBOLOS[n].nome}`,
          title: `Jogar com o ${desenho.SIMBOLOS[n].nome}`,
          tabindex: n === (atual ?? 0) ? '0' : '-1',
          onclick: () => escolherCor(n),
          onkeydown: evento => moverPelasSetas(evento, n),
        }, marca);
      }),
      elemento('span', { class: 'perfil-cores-dica' }, atual === null ? 'automática: a sala escolhe uma livre' : 'se estiver livre na sala, é sua'),
    );
  }

  function moverPelasSetas(evento, n) {
    const passo = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[evento.key];
    if (!passo) return;
    evento.preventDefault();
    const proxima = (n + passo + CORES_DA_SALA) % CORES_DA_SALA;
    escolherCor(proxima).finally(() => cores.querySelectorAll('.perfil-cor')[proxima]?.focus());
    cores.querySelectorAll('.perfil-cor')[proxima]?.focus();
  }

  function mostrar(novo) {
    perfil = novo;
    // Never overwrite what someone already typed: only an empty field or the name shown last gets updated.
    if (campoNome.value === '' || campoNome.value === nomeMostrado) campoNome.value = perfil.nome;
    if (campoNome.value === perfil.nome) nomeMostrado = perfil.nome;
    textoNumeros.textContent = numeros(perfil.estatisticas);
    const ultimas = (perfil.historico ?? []).slice(0, ULTIMAS_PARTIDAS);
    historicoLista.replaceChildren(...(ultimas.length
      ? ultimas.map(linhaDoHistorico)
      : [elemento('li', { class: 'perfil-lista-vazia' }, 'Nenhuma partida ainda.')]));
    desenharBoneco();
    desenharCores();
    avisarMudanca();
  }

  async function escolherCor(n) {
    corEscolhida = true;
    gravarCorEscolhida();
    perfil = { ...perfil, cor: n };
    desenharBoneco();
    desenharCores();
    avisarMudanca();
    try {
      mostrar(await salvarPerfil({ cor: n }));
    } catch (erro) {
      console.warn('Could not save the color', erro);
    }
  }

  async function salvarNome(nome) {
    if (!perfil || nome === perfil.nome) return;
    try {
      mostrar(await salvarPerfil({ nome }));
    } catch (erro) {
      console.warn('Could not save the nickname', erro);
    }
  }

  // Taking the profile elsewhere: the code is a password, so it shows only on request and never goes in a link.
  function montarOutroAparelho() {
    const saida = elemento('div', { class: 'perfil-codigo', hidden: true });
    const mensagem = elemento('p', { class: 'mensagem', role: 'status', hidden: true });
    const campo = elemento('input', { id: 'campo-recuperar', placeholder: 'XXXXX-XXXXX-…', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'characters', 'aria-label': 'Código de recuperação' });
    const avisar = (texto, tipo = 'erro') => {
      mensagem.textContent = texto;
      mensagem.className = tipo === 'info' ? 'mensagem mensagem--info' : 'mensagem';
      mensagem.hidden = !texto;
    };
    outroAparelho.append(
      elemento('p', {}, 'O código leva seu perfil (nome, cor e estatísticas) para outro celular ou computador. Guarde como uma senha: quem tiver o código usa o seu perfil.'),
      elemento('button', {
        type: 'button',
        class: 'botao botao--secundario botao--pequeno',
        onclick: async () => {
          const codigo = await codigoDeRecuperacao();
          avisar(null);
          if (!codigo) {
            avisar('Seu perfil ainda está só neste aparelho. O código aparece quando ele for salvo no servidor, o que acontece sozinho com internet.', 'info');
            return;
          }
          saida.replaceChildren(
            elemento('code', {}, codigo),
            elemento('button', {
              type: 'button',
              class: 'botao botao--secundario botao--pequeno',
              onclick: async () => {
                try {
                  await navigator.clipboard.writeText(codigo);
                  avisar('Código copiado.', 'info');
                } catch {
                  avisar('Não deu para copiar: selecione o código e copie à mão.');
                }
              },
            }, 'Copiar'),
          );
          saida.hidden = false;
        },
      }, 'Mostrar meu código'),
      saida,
      elemento('label', { for: 'campo-recuperar' }, 'Tem um código de outro aparelho?'),
      elemento('div', { class: 'linha-codigo' },
        campo,
        elemento('button', {
          type: 'button',
          class: 'botao botao--secundario',
          onclick: async () => {
            const codigo = campo.value.trim();
            if (!codigo) {
              avisar('Cole o código do outro aparelho.');
              return;
            }
            if (!window.confirm('Isso troca o perfil deste aparelho pelo perfil do código. Continuar?')) return;
            try {
              avisar('Buscando o perfil…', 'info');
              mostrar(await recuperar(codigo));
              campo.value = '';
              avisar('Pronto: este aparelho agora usa o perfil do código.', 'info');
            } catch (erro) {
              console.warn('Profile recovery failed', erro);
              avisar(erro.message || 'Não consegui recuperar o perfil.');
            }
          },
        }, 'Usar'),
      ),
      mensagem,
    );
  }

  // The ranking comes from the server: it loads only when someone opens it.
  async function mostrarRanking() {
    rankingLista.replaceChildren(elemento('li', { class: 'perfil-lista-vazia' }, 'Carregando…'));
    try {
      const linhas = (await ranking()).slice(0, TOPO_RANKING);
      rankingLista.replaceChildren(...(linhas.length
        ? linhas.map(linha => elemento('li', { class: linha.eu ? 'eu' : '' },
          elemento('span', { class: 'perfil-lista-principal' }, `${linha.posicao}º `, desenho.marcaJogador(linha.cor), ` ${linha.nome}${linha.eu ? ' (você)' : ''}`),
          elemento('span', { class: 'perfil-lista-detalhe' }, `${plural(linha.pontos, 'ponto', 'pontos')} · ${plural(linha.vitorias, 'vitória', 'vitórias')}`)))
        : [elemento('li', { class: 'perfil-lista-vazia' }, 'Ninguém no ranking ainda: ele conta partidas com outras pessoas.')]));
    } catch (erro) {
      console.warn('Ranking unavailable', erro);
      rankingLista.replaceChildren(elemento('li', { class: 'perfil-lista-vazia' }, 'Não consegui carregar o ranking agora.'));
    }
  }

  rankingSecao.addEventListener('toggle', () => {
    if (rankingSecao.open) mostrarRanking();
  });
  campoNome.addEventListener('change', () => salvarNome(campoNome.value));
  montarOutroAparelho();
  obterPerfil().then(mostrar).catch(erro => {
    console.error('Could not read the device profile', erro);
    textoNumeros.textContent = 'Não consegui ler seu perfil neste aparelho; dá para jogar assim mesmo.';
  });

  return {
    // Saves the nickname typed so far and returns the profile to join a room with.
    async confirmar(nome) {
      await salvarNome(nome);
      return perfil;
    },
    // Fresh numbers after a match (the home screen shows again when the room closes).
    async atualizar() {
      try {
        mostrar(await obterPerfil());
      } catch (erro) {
        console.warn('Could not refresh the device profile', erro);
      }
    },
  };
}
