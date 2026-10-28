// Site shell: home screen, room screen and member list. Games plug in through the room (Sala).

import { Sala, normalizarCodigo, limparNome, TOLERANCIA_MS, nivelConexao } from './sala.js';
import { criarPavio } from './pavio/pavio.js';
import { criarPerfil } from './perfil.js';
import { registrarPartida } from './conta.js';
import { marcaJogador } from './pavio/desenho.js';
import { som } from './som.js';

const MAX_MEMBROS = 8;
const DURACAO_AVISO_MS = 3200;
const TOLERANCIA_S = TOLERANCIA_MS / 1000;

const $ = seletor => document.querySelector(seletor);
const telas = { inicio: $('#inicio'), sala: $('#sala') };
const campoNome = $('#campo-nome');
const campoCodigo = $('#campo-codigo');
const mensagemInicio = $('#mensagem-inicio');

let salaAtual = null;
let jogoAtual = null;
const INFO_VAZIA = Object.freeze({ fase: 'lobby', cores: {}, prontos: [], pontos: {}, escalacao: [] });
let infoJogo = INFO_VAZIA;
let codigoConvite = null;
let ocupado = false;
let perfilAtual = null; // the device profile shown on the home screen (conta.js), with corPreferida
let versaoCarregada = null; // commit published when this page loaded (/versao.json), to spot an outdated page
let timerReconexao = 0;
const perfil = criarPerfil({ raiz: $('#inicio'), campoNome, aoMudar: novo => { perfilAtual = novo; } });

function codigoDoEndereco() {
  return normalizarCodigo(location.hash.slice(1)) ?? normalizarCodigo(new URLSearchParams(location.search).get('sala'));
}

function mostrarTela(nome) {
  for (const [chave, tela] of Object.entries(telas)) tela.hidden = chave !== nome;
  // The room screen is locked to the viewport: no page scroll, bounce or text selection while playing.
  document.documentElement.classList.toggle('em-sala', nome === 'sala');
  window.scrollTo(0, 0);
}

function mostrarMensagem(texto, tipo = 'erro') {
  mensagemInicio.textContent = texto ?? '';
  mensagemInicio.className = tipo === 'info' ? 'mensagem mensagem--info' : 'mensagem';
  mensagemInicio.hidden = !texto;
}

function definirOcupado(valor, texto = null) {
  ocupado = valor;
  for (const botao of document.querySelectorAll('#form-inicio button')) botao.disabled = valor;
  if (texto) mostrarMensagem(texto, 'info');
}

function lerNome() {
  const nome = limparNome(campoNome.value);
  campoNome.value = nome;
  perfil.confirmar(nome);
  return nome;
}

function prepararInicio() {
  codigoConvite = codigoDoEndereco();
  $('#convite').hidden = !codigoConvite;
  $('#sem-convite').hidden = Boolean(codigoConvite);
  $('#convite-codigo').textContent = codigoConvite ?? '';
  mostrarMensagem(null);
}

async function criarSala() {
  if (ocupado) return;
  const nome = lerNome();
  definirOcupado(true, 'Abrindo a sala…');
  try {
    const sala = await Sala.criar({ nome, maxMembros: MAX_MEMBROS });
    mostrarMensagem(null);
    abrirSala(sala);
  } catch (erro) {
    console.error('Failed to create room', erro);
    mostrarMensagem(erro.message || 'Não consegui criar a sala.');
  } finally {
    definirOcupado(false);
  }
}

async function entrarNaSala(codigo) {
  if (ocupado) return;
  const nome = lerNome();
  definirOcupado(true, `Entrando na sala ${codigo}…`);
  try {
    const sala = await Sala.entrar(codigo, { nome });
    mostrarMensagem(null);
    abrirSala(sala);
  } catch (erro) {
    console.error('Failed to join room', erro);
    if (erro?.tipo === 'inexistente' && await paginaDesatualizada()) {
      mostrarMensagem('Esta página está desatualizada: o site mudou depois que você a abriu. Recarregue e entre de novo pelo link.');
      return;
    }
    mostrarMensagem(erro.message || 'Não consegui entrar na sala.');
  } finally {
    definirOcupado(false);
  }
}

function abrirSala(sala) {
  salaAtual = sala;
  infoJogo = INFO_VAZIA;
  history.replaceState(null, '', `${location.pathname}#${sala.codigo}`);
  $('#sala-codigo').textContent = sala.codigo;
  $('#queda').hidden = true;
  mostrarTela('sala');
  sala.on('membros', desenharMembros);
  sala.on('qualidade', desenharMembros);
  sala.on('entrou', membro => {
    avisar(`${membro.nome} entrou na sala`);
    som.tocar('entrou');
  });
  sala.on('saiu', membro => {
    avisar(`${membro.nome} saiu da sala`);
    som.tocar('saiu');
  });
  sala.on('fora', membro => avisar(`${membro.nome} caiu; a vaga fica guardada por ${TOLERANCIA_S} s`));
  sala.on('voltou', membro => avisar(`${membro.nome} voltou`));
  sala.on('reconectando', info => mostrarReconexao(info));
  // The host left and handed the room over: the game starts over in the lobby with the new host.
  sala.on('trocaDeAnfitriao', ({ anfitriao }) => {
    pararContagemReconexao();
    $('#queda').hidden = true;
    avisar(anfitriao?.id === sala.meuId ? 'Agora você é o anfitrião da sala' : `${anfitriao?.nome ?? 'Outra pessoa'} agora é o anfitrião`);
    jogoAtual?.destruir();
    jogoAtual = montarJogo(sala);
    desenharMembros();
  });
  sala.on('reconectou', () => {
    pararContagemReconexao();
    $('#queda').hidden = true;
    avisar('Conexão de volta!');
  });
  sala.on('caiu', motivo => mostrarQueda(motivo));
  jogoAtual = montarJogo(sala);
  desenharMembros();
}

function montarJogo(sala) {
  return criarPavio({
    sala,
    palco: $('#palco'),
    som,
    corPreferida: perfilAtual?.corPreferida ?? null,
    aoMudarInfo: info => {
      infoJogo = info;
      desenharMembros();
    },
    // Each device records its own matches in its profile.
    aoTerminarPartida: resumo => {
      registrarPartida(resumo).catch(erro => console.warn('Could not record the match in the profile', erro));
    },
  });
}

function fecharSala() {
  pararContagemReconexao();
  $('#confirmar-saida').hidden = true;
  jogoAtual?.destruir();
  jogoAtual = null;
  salaAtual?.sair();
  salaAtual = null;
}

function voltarAoInicio({ manterEndereco = false } = {}) {
  fecharSala();
  if (!manterEndereco) history.replaceState(null, '', location.pathname);
  prepararInicio();
  mostrarTela('inicio');
  perfil.atualizar();
  paginaDesatualizada();
}

// The commit in production (site/versao.json, written at publication); null locally or offline.
async function lerVersaoPublicada() {
  try {
    const resposta = await fetch('versao.json', { cache: 'no-store' });
    if (!resposta.ok) return null;
    return (await resposta.json())?.commit ?? null;
  } catch {
    return null;
  }
}

// A page opened before the site was updated cannot find rooms made by the new one (the protocol version is part
// of the room id), so "room not found" may really mean "reload".
async function paginaDesatualizada() {
  if (!versaoCarregada) return false;
  const publicada = await lerVersaoPublicada();
  const desatualizada = Boolean(publicada && publicada !== versaoCarregada);
  $('#versao-nova').hidden = !desatualizada;
  return desatualizada;
}

function pararContagemReconexao() {
  clearInterval(timerReconexao);
  timerReconexao = 0;
}

function mostrarQueda(motivo) {
  pararContagemReconexao();
  $('#queda-titulo').textContent = 'Conexão perdida';
  $('#queda-motivo').textContent = motivo;
  $('#queda-acoes').hidden = false;
  $('#queda').hidden = false;
}

// Same dialog, without buttons: the room is trying to get this member back on its own, and the seconds left of
// the guarded place count down.
function mostrarReconexao({ troca = false } = {}) {
  const fim = performance.now() + TOLERANCIA_MS;
  const atualizar = () => {
    const resta = Math.ceil((fim - performance.now()) / 1000);
    if (troca) $('#queda-motivo').textContent = 'O anfitrião saiu. Passando a sala para quem chegou primeiro…';
    else $('#queda-motivo').textContent = resta > 0
      ? `A conexão caiu. Sua vaga fica guardada por mais ${resta} s enquanto a gente tenta voltar.`
      : 'A conexão caiu. Ainda tentando voltar…';
  };
  $('#queda-titulo').textContent = 'Reconectando…';
  $('#queda-acoes').hidden = true;
  $('#queda').hidden = false;
  pararContagemReconexao();
  atualizar();
  timerReconexao = setInterval(atualizar, 250);
}

// Leaving needs a confirmation only when it costs the others something: the host closes the room, a player in
// the middle of a round ends it for everyone.
function custoDeSair() {
  const sala = salaAtual;
  if (!sala || sala.membros.size <= 1) return null;
  const outros = sala.membros.size - 1;
  if (sala.souAnfitriao) {
    const sucessor = sala.membrosOrdenados().find(membro => membro.id !== sala.meuId && !membro.fora);
    const emRodada = ['contagem', 'jogo', 'resultado'].includes(infoJogo.fase);
    if (sucessor) return `Você é o anfitrião: se sair, a sala passa para ${sucessor.nome}${emRodada ? ' e a rodada em andamento acaba' : ''}.`;
    return `Você é o anfitrião: se sair, a sala fecha para ${outros === 1 ? 'a outra pessoa' : `as outras ${outros} pessoas`}.`;
  }
  const naRodada = ['contagem', 'jogo', 'resultado'].includes(infoJogo.fase) && infoJogo.escalacao.some(item => item.id === sala.meuId);
  const outrasPessoas = infoJogo.escalacao.some(item => item.id !== sala.meuId && !item.robo);
  if (naRodada && outrasPessoas) return 'A rodada está rolando: se você sair agora, ela acaba para todo mundo.';
  return null;
}

function pedirSaida() {
  const custo = custoDeSair();
  if (!custo) {
    voltarAoInicio();
    return;
  }
  $('#confirmar-texto').textContent = custo;
  $('#confirmar-saida').hidden = false;
  $('#botao-ficar').focus();
}

function etiqueta(texto, classe = '', titulo = null) {
  const elemento = document.createElement('span');
  elemento.className = `etiqueta ${classe}`.trim();
  elemento.textContent = texto;
  if (titulo) elemento.title = titulo;
  return elemento;
}

function desenharMembros() {
  const sala = salaAtual;
  if (!sala) return;
  const membros = sala.membrosOrdenados();
  const naRodada = new Set(infoJogo.escalacao.map(item => item.id));
  const prontos = new Set(infoJogo.prontos);
  $('#contagem-membros').textContent = `${membros.length}/${MAX_MEMBROS}`;
  $('#lista-membros').replaceChildren(...membros.map((membro, n) => {
    const item = document.createElement('li');
    const cor = marcaJogador(infoJogo.cores[membro.id] ?? n);
    const nome = document.createElement('span');
    nome.className = 'membro-nome';
    nome.textContent = membro.nome;
    item.append(cor, nome);
    if (membro.id === sala.idAnfitriao) item.append(etiqueta('👑', 'etiqueta--icone', 'Anfitrião da sala'));
    if (membro.id === sala.meuId) item.append(etiqueta('você', 'etiqueta--eu'));
    if (infoJogo.fase === 'lobby') {
      item.append(etiqueta(prontos.has(membro.id) ? '✅' : '⏳', 'etiqueta--icone', prontos.has(membro.id) ? 'Pronto' : 'Ainda não está pronto'));
    } else if (!naRodada.has(membro.id)) {
      item.append(etiqueta('assistindo'));
    } else {
      item.append(etiqueta(`⭐ ${infoJogo.pontos[membro.id] ?? 0}`, 'etiqueta--pontos', 'Pontos na rodada'));
    }
    if (membro.fora) item.append(etiqueta('📶 reconectando', 'etiqueta--ping etiqueta--ruim', `A conexão caiu; a vaga fica guardada por ${TOLERANCIA_S} s`));
    else if (membro.id !== sala.idAnfitriao) item.append(etiquetaDeConexao(membro));
    return item;
  }));
}

// Round trip to the host. "via retransmissor" means the direct link failed and traffic goes through TURN.
function etiquetaDeConexao(membro) {
  if (membro.ping === null || membro.ping === undefined) return etiqueta('…', 'etiqueta--ping', 'Medindo a conexão');
  const ping = Math.round(membro.ping);
  const perda = membro.perda ? Math.round(membro.perda * 100) : 0;
  const nivel = nivelConexao(membro);
  const titulo = `${ping} ms até o anfitrião${perda ? `, ${perda}% dos pacotes perdidos` : ''}${membro.relay ? ', via retransmissor (a conexão direta não funcionou)' : ''}`;
  return etiqueta(`${membro.relay ? '🐢 ' : ''}${ping} ms${perda >= 2 ? ` · ${perda}%` : ''}`, `etiqueta--ping etiqueta--${nivel}`, titulo);
}

function avisar(texto) {
  const lista = $('#avisos');
  const aviso = document.createElement('div');
  aviso.className = 'aviso-toast';
  aviso.textContent = texto;
  lista.append(aviso);
  while (lista.children.length > 4) lista.firstElementChild.remove();
  setTimeout(() => aviso.remove(), DURACAO_AVISO_MS);
}

async function compartilharLink() {
  if (!salaAtual) return;
  const link = salaAtual.link;
  try {
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      await navigator.share({ title: 'Bora jogar Pavio?', text: 'Entra na minha sala:', url: link });
      return;
    }
    await navigator.clipboard.writeText(link);
    avisar('Link copiado! Manda pra galera.');
  } catch (erro) {
    if (erro?.name === 'AbortError') return;
    console.warn('Copying the link failed, showing it instead', erro);
    window.prompt('Copie o link da sala:', link);
  }
}

function atualizarBotaoSom() {
  const botao = $('#botao-som');
  botao.textContent = som.mudo ? '🔇' : '🔊';
  botao.setAttribute('aria-label', som.mudo ? 'Ligar o som' : 'Desligar o som');
  const musica = $('#botao-musica');
  musica.setAttribute('aria-pressed', String(som.musicaLigada));
  musica.title = som.musicaLigada ? 'Desligar a música' : 'Ligar a música';
  musica.disabled = som.mudo;
}

$('#form-inicio').addEventListener('submit', evento => {
  evento.preventDefault();
  if (codigoConvite) entrarNaSala(codigoConvite);
  else criarSala();
});

$('#botao-ignorar-convite').addEventListener('click', () => {
  history.replaceState(null, '', location.pathname);
  prepararInicio();
});

function entrarPeloCampo() {
  const codigo = normalizarCodigo(campoCodigo.value);
  if (!codigo) {
    mostrarMensagem('Código inválido: são 5 letras e números, como K7Q2M.');
    campoCodigo.focus();
    return;
  }
  entrarNaSala(codigo);
}

$('#botao-entrar-codigo').addEventListener('click', entrarPeloCampo);
campoCodigo.addEventListener('keydown', evento => {
  if (evento.key !== 'Enter') return;
  evento.preventDefault();
  entrarPeloCampo();
});

$('#botao-copiar').addEventListener('click', compartilharLink);
$('#botao-sair').addEventListener('click', pedirSaida);
$('#botao-confirmar-saida').addEventListener('click', () => voltarAoInicio());
$('#botao-ficar').addEventListener('click', () => {
  $('#confirmar-saida').hidden = true;
});
$('#botao-recarregar').addEventListener('click', () => location.reload());
document.addEventListener('keydown', evento => {
  if (evento.key === 'Escape' && !$('#confirmar-saida').hidden) $('#confirmar-saida').hidden = true;
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !salaAtual) paginaDesatualizada();
});
$('#botao-som').addEventListener('click', () => {
  som.alternar();
  atualizarBotaoSom();
});
$('#botao-musica').addEventListener('click', () => {
  som.alternarMusica();
  atualizarBotaoSom();
});
$('#botao-reconectar').addEventListener('click', () => {
  const codigo = salaAtual?.codigo ?? codigoConvite;
  voltarAoInicio({ manterEndereco: true });
  if (codigo) entrarNaSala(codigo);
});
$('#botao-nova-sala').addEventListener('click', () => {
  voltarAoInicio();
  criarSala();
});

window.addEventListener('hashchange', () => {
  if (!salaAtual) prepararInicio();
});
window.addEventListener('beforeunload', evento => {
  // Warn the host: closing the tab closes the room for everyone.
  if (salaAtual?.souAnfitriao && salaAtual.membros.size > 1) {
    evento.preventDefault();
    evento.returnValue = '';
  }
});
window.addEventListener('pagehide', () => salaAtual?.sair());

// Safari on iPad ignores user-scalable=no, so pinch and double-tap zoom are blocked here.
for (const tipo of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(tipo, evento => evento.preventDefault(), { passive: false });
}
document.addEventListener('touchmove', evento => {
  if (evento.touches.length > 1) evento.preventDefault();
}, { passive: false });
let ultimoToque = 0;
document.addEventListener('touchend', evento => {
  const agora = performance.now();
  const interativo = evento.target instanceof Element && evento.target.closest('input, textarea, select, button, a');
  if (!interativo && agora - ultimoToque < 320) evento.preventDefault();
  ultimoToque = agora;
}, { passive: false });

// Read-only hook for the end-to-end tests (testes/e2e), only when the address has ?teste=1.
if (new URLSearchParams(location.search).has('teste')) {
  window.__salinha = Object.freeze({
    sala: () => salaAtual && {
      codigo: salaAtual.codigo,
      link: salaAtual.link,
      meuId: salaAtual.meuId,
      souAnfitriao: salaAtual.souAnfitriao,
      membros: salaAtual.membrosOrdenados().map(({ id, nome, fora }) => ({ id, nome, fora: Boolean(fora) })),
    },
    jogo: () => jogoAtual?.espiar() ?? null,
  });
}

som.instalar();
atualizarBotaoSom();
prepararInicio();
mostrarTela('inicio');
lerVersaoPublicada().then(versao => {
  versaoCarregada = versao;
});
