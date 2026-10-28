// Room layer shared by every game: WebRTC through PeerJS, in a star around the host.
// The host's PeerJS id carries the room code; it relays membership and games exchange their own messages.
// Each link has two channels: PeerJS's reliable one (room control, game events that must arrive) and a
// fast one, unordered and without retransmission, for state that is resent all the time (positions, snapshots),
// so a lost packet never holds back the newer ones.
// A member whose link drops (Wi-Fi switch, phone locked) keeps its place for TOLERANCIA_MS: it reconnects with the
// key the host handed it on joining, even from a new PeerJS id. Leaving on purpose sends a goodbye, so nobody waits.
// Room-level messages have a type starting with "$"; anything else is handed to the game.

import { criarTique } from './relogio.js';
import { configuracaoIce, modoDaRede } from './rede.js';

const VERSAO_PROTOCOLO = 7;
const PREFIXO_ID = `salinha-v${VERSAO_PROTOCOLO}-`;
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const TAMANHO_CODIGO = 5;
const TAMANHO_CHAVE = 16;
const INTERVALO_PING_MS = 1000;
const INTERVALO_REDE_MS = 6000;
const LIMITE_QUEDA_MS = 3500; // this long without hearing from the other end counts as a dropped link
export const TOLERANCIA_MS = 10000; // a dropped member keeps its place this long
const FOLGA_RECONEXAO_MS = 2000; // members try a little longer: the host started counting a bit earlier
const INTERVALO_TENTATIVA_MS = 800;
const TEMPO_ABRIR_MS = 15000;
const TEMPO_ENTRADA_MS = 15000;
const TEMPO_TENTATIVA_MS = 4000;
const ESPERA_DESPEDIDA_MS = 300;
const TAMANHO_NOME = 16;
const ID_CANAL_RAPIDO = 7;
const LIMITE_FILA_RAPIDA = 32 * 1024;
// Read once: the page drops the query string from the address after joining, and reconnections reuse the mode.
const MODO_REDE = modoDaRede(location.search);

export class ErroSala extends Error {
  constructor(tipo, mensagem) {
    super(mensagem);
    this.tipo = tipo;
  }
}

function sortear(alfabeto, tamanho) {
  const valores = crypto.getRandomValues(new Uint32Array(tamanho));
  return Array.from(valores, valor => alfabeto[valor % alfabeto.length]).join('');
}

export function gerarCodigo() {
  return sortear(ALFABETO, TAMANHO_CODIGO);
}

export function normalizarCodigo(texto) {
  const codigo = String(texto ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const valido = codigo.length === TAMANHO_CODIGO && [...codigo].every(letra => ALFABETO.includes(letra));
  return valido ? codigo : null;
}

export function limparNome(texto) {
  const nome = String(texto ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, TAMANHO_NOME);
  return nome || 'Sem nome';
}

function traduzirErro(erro) {
  if (erro instanceof ErroSala) return erro;
  switch (erro?.type) {
    case 'browser-incompatible':
      return new ErroSala('navegador', 'Este navegador não suporta WebRTC. Tente o Chrome, o Edge, o Firefox ou o Safari atualizados.');
    case 'peer-unavailable':
      return new ErroSala('inexistente', 'Essa sala não existe mais ou o código está errado. Peça um link novo para quem criou a sala.');
    case 'network':
    case 'server-error':
    case 'socket-error':
    case 'socket-closed':
      return new ErroSala('rede', 'Sem conexão com o servidor de salas. Confira a internet e tente de novo.');
    default:
      return new ErroSala('desconhecido', erro?.message || 'Algo deu errado na conexão.');
  }
}

const esperar = ms => new Promise(resolve => setTimeout(resolve, ms));

function enviarSeguro(conexao, mensagem) {
  if (!conexao?.open) return;
  try {
    conexao.send(mensagem);
  } catch (erro) {
    console.warn('Failed to send message', mensagem?.t, erro);
  }
}

// Both ends create the same pre-negotiated channel on PeerJS's own RTCPeerConnection.
function abrirCanalRapido(conexao, aoMensagem) {
  const conexaoPar = conexao.peerConnection;
  if (!conexaoPar?.createDataChannel) return null;
  try {
    const canal = conexaoPar.createDataChannel('salinha-rapido', {
      negotiated: true,
      id: ID_CANAL_RAPIDO,
      ordered: false,
      maxRetransmits: 0,
    });
    canal.onmessage = evento => {
      let mensagem;
      try {
        mensagem = JSON.parse(evento.data);
      } catch (erro) {
        console.warn('Ignoring malformed fast message', erro);
        return;
      }
      aoMensagem(mensagem);
    };
    return canal;
  } catch (erro) {
    console.warn('Fast channel unavailable, using the reliable one', erro);
    return null;
  }
}

function enviar(conexao, canal, mensagem, rapido) {
  if (rapido && canal?.readyState === 'open') {
    // When the link is congested, drop this one: a newer state follows shortly.
    if (canal.bufferedAmount > LIMITE_FILA_RAPIDA) return;
    try {
      canal.send(JSON.stringify(mensagem));
      return;
    } catch (erro) {
      console.warn('Fast send failed, falling back to the reliable channel', erro);
    }
  }
  enviarSeguro(conexao, mensagem);
}

// True when the selected ICE pair goes through a TURN relay (slower, usually a far-away server).
async function usaRetransmissor(conexao) {
  const conexaoPar = conexao.peerConnection;
  if (!conexaoPar?.getStats) return false;
  const relatorio = await conexaoPar.getStats();
  let par = null;
  relatorio.forEach(item => {
    if (item.type === 'transport' && item.selectedCandidatePairId) par = relatorio.get(item.selectedCandidatePairId);
  });
  if (!par) {
    relatorio.forEach(item => {
      if (item.type === 'candidate-pair' && (item.selected || (item.nominated && item.state === 'succeeded'))) par = item;
    });
  }
  if (!par) return false;
  const local = relatorio.get(par.localCandidateId);
  const remoto = relatorio.get(par.remoteCandidateId);
  return local?.candidateType === 'relay' || remoto?.candidateType === 'relay';
}

class Emissor {
  #ouvintes = new Map();

  on(evento, funcao) {
    if (!this.#ouvintes.has(evento)) this.#ouvintes.set(evento, new Set());
    this.#ouvintes.get(evento).add(funcao);
    return () => this.#ouvintes.get(evento)?.delete(funcao);
  }

  emitir(evento, ...args) {
    for (const funcao of this.#ouvintes.get(evento) ?? []) {
      try {
        funcao(...args);
      } catch (erro) {
        console.error(`Listener for "${evento}" failed`, erro);
      }
    }
  }
}

// Events: membros, qualidade, entrou, saiu, fora (a member's link dropped), voltou (it is back), mensagem,
// caiu (this member lost the room for good) and, on members only, reconectando and reconectou.
export class Sala extends Emissor {
  codigo = null;
  meuId = null;
  idAnfitriao = null;
  membros = new Map(); // id -> { id, nome, ordem, ping, relay, fora }

  #peer = null;
  #conexoes = new Map(); // host only: member id -> its current DataConnection
  #donos = new WeakMap(); // host only: DataConnection -> member id, once its hello was accepted
  #chaves = new Map(); // host only: member id -> key that lets it take its place back
  #canais = new WeakMap(); // DataConnection -> fast RTCDataChannel
  #anfitriao = null; // members only: DataConnection to the host
  #chave = null; // members only: my key, from the host's welcome
  #reconectando = false;
  #ultimoContato = new Map();
  #proximaOrdem = 0;
  #maxMembros = 8;
  #vigia = null;
  #ultimaChecagemRede = 0;
  #aoFalharEntrada = null;
  #encerrada = false;

  get souAnfitriao() {
    return this.meuId !== null && this.meuId === this.idAnfitriao;
  }

  // Members only see the room while their link to the host is up.
  get conectada() {
    return this.souAnfitriao || (!this.#reconectando && Boolean(this.#anfitriao?.open));
  }

  get link() {
    return `${location.origin}${location.pathname}#${this.codigo}`;
  }

  static async criar({ nome, maxMembros = 8 }) {
    const sala = new Sala();
    sala.#maxMembros = maxMembros;
    for (let tentativa = 0; tentativa < 5 && !sala.codigo; tentativa++) {
      const codigo = gerarCodigo();
      try {
        await sala.#abrirPeer(PREFIXO_ID + codigo);
        sala.codigo = codigo;
      } catch (erro) {
        if (erro?.type !== 'unavailable-id') throw traduzirErro(erro);
      }
    }
    if (!sala.codigo) throw new ErroSala('codigo', 'Não consegui reservar um código de sala. Tente de novo.');
    sala.meuId = sala.#peer.id;
    sala.idAnfitriao = sala.meuId;
    sala.#adicionarMembro(sala.meuId, nome);
    sala.#peer.on('connection', conexao => sala.#aceitar(conexao));
    sala.#iniciarVigia();
    return sala;
  }

  static async entrar(codigo, { nome }) {
    const sala = new Sala();
    sala.codigo = codigo;
    sala.idAnfitriao = PREFIXO_ID + codigo;
    try {
      await sala.#abrirPeer(null);
      await sala.#conectarAoAnfitriao({ nome });
    } catch (erro) {
      sala.sair();
      throw traduzirErro(erro);
    }
    sala.#iniciarVigia();
    return sala;
  }

  membrosOrdenados() {
    return [...this.membros.values()].sort((a, b) => a.ordem - b.ordem);
  }

  // Members send to the host; on the host this loops back so game code has a single path.
  enviarAoAnfitriao(mensagem, { rapido = false } = {}) {
    if (this.souAnfitriao) queueMicrotask(() => this.emitir('mensagem', this.meuId, mensagem));
    else enviar(this.#anfitriao, this.#canais.get(this.#anfitriao), mensagem, rapido);
  }

  // Host only: sends to every member except the host itself.
  transmitir(mensagem, { rapido = false } = {}) {
    for (const conexao of this.#conexoes.values()) enviar(conexao, this.#canais.get(conexao), mensagem, rapido);
  }

  enviarPara(id, mensagem, { rapido = false } = {}) {
    if (id === this.meuId) {
      queueMicrotask(() => this.emitir('mensagem', this.meuId, mensagem));
      return;
    }
    const conexao = this.#conexoes.get(id);
    enviar(conexao, this.#canais.get(conexao), mensagem, rapido);
  }

  sair() {
    if (this.#encerrada) return;
    this.#encerrada = true;
    this.#vigia?.parar();
    if (this.souAnfitriao) this.transmitir({ t: '$tchau' });
    else enviarSeguro(this.#anfitriao, { t: '$tchau' });
    // Give the goodbye a moment to leave before the links are torn down.
    setTimeout(() => this.#desligar(), ESPERA_DESPEDIDA_MS);
  }

  #desligar() {
    for (const conexao of this.#conexoes.values()) {
      this.#canais.get(conexao)?.close();
      conexao.close();
    }
    if (this.#anfitriao) {
      this.#canais.get(this.#anfitriao)?.close();
      this.#anfitriao.close();
    }
    this.#peer?.destroy();
  }

  async #abrirPeer(id, limiteMs = TEMPO_ABRIR_MS) {
    if (typeof Peer === 'undefined') {
      throw new ErroSala('biblioteca', 'A biblioteca de conexão não carregou. Recarregue a página.');
    }
    const config = await configuracaoIce(MODO_REDE);
    return new Promise((resolve, reject) => {
      const opcoes = { debug: 1, ...(config ? { config } : {}) };
      const peer = id ? new Peer(id, opcoes) : new Peer(opcoes);
      const limite = setTimeout(() => falhar(new ErroSala('rede', 'O servidor de salas não respondeu. Tente de novo.')), limiteMs);
      const falhar = erro => {
        clearTimeout(limite);
        peer.destroy();
        reject(erro);
      };
      peer.once('error', falhar);
      peer.once('open', () => {
        clearTimeout(limite);
        peer.off('error', falhar);
        this.#peer = peer;
        peer.on('error', erro => this.#aoErroPeer(erro));
        peer.on('disconnected', () => this.#religarSinalizacao());
        resolve();
      });
    });
  }

  // Losing the signaling socket keeps open data channels alive; reconnecting lets new people join again.
  #religarSinalizacao() {
    setTimeout(() => {
      const peer = this.#peer;
      if (this.#encerrada || !peer || peer.destroyed || !peer.disconnected) return;
      peer.reconnect();
    }, 1500);
  }

  #aoErroPeer(erro) {
    if (erro?.type === 'peer-unavailable' && this.#aoFalharEntrada) {
      this.#aoFalharEntrada(traduzirErro(erro));
      return;
    }
    console.warn('PeerJS error', erro?.type, erro);
  }

  // Joins for the first time, or takes the old place back when `volta` ({ id, chave }) is given.
  #conectarAoAnfitriao({ nome = null, volta = null, limiteMs = TEMPO_ENTRADA_MS }) {
    return new Promise((resolve, reject) => {
      const conexao = this.#peer.connect(this.idAnfitriao, { reliable: true, serialization: 'json' });
      let pronto = false;
      let decidido = false;
      const terminar = erro => {
        if (decidido) return;
        decidido = true;
        clearTimeout(limite);
        if (this.#aoFalharEntrada === terminar) this.#aoFalharEntrada = null;
        if (erro) {
          conexao.close();
          reject(erro);
          return;
        }
        pronto = true;
        resolve();
      };
      const limite = setTimeout(
        () => terminar(new ErroSala('tempo', 'A sala não respondeu. Confira o link ou peça um novo.')),
        limiteMs,
      );
      this.#aoFalharEntrada = terminar;

      const aoMensagem = mensagem => {
        if (pronto) {
          if (conexao !== this.#anfitriao) return; // a link that was already replaced
          this.#ultimoContato.set(this.idAnfitriao, performance.now());
          this.#aoMensagemDoAnfitriao(mensagem);
        } else if (mensagem?.t === '$bemvindo') {
          this.#anfitriao = conexao;
          this.meuId = String(mensagem.voce ?? this.#peer.id);
          this.#chave = typeof mensagem.chave === 'string' ? mensagem.chave : null;
          this.#ultimoContato.set(this.idAnfitriao, performance.now());
          this.#aplicarMembros(mensagem.membros);
          terminar();
        } else if (mensagem?.t === '$recusado') {
          terminar(new ErroSala('recusado', String(mensagem.motivo || 'A sala recusou a entrada.')));
        }
      };
      conexao.on('open', () => {
        this.#canais.set(conexao, abrirCanalRapido(conexao, aoMensagem));
        conexao.send({ t: '$ola', v: VERSAO_PROTOCOLO, nome: limparNome(nome), ...(volta ? { volta } : {}) });
      });
      conexao.on('data', aoMensagem);
      conexao.on('close', () => {
        if (!pronto) terminar(new ErroSala('fechada', 'A sala fechou a conexão.'));
        else if (conexao === this.#anfitriao) this.#reconectar();
      });
      conexao.on('error', erro => {
        if (!pronto) terminar(traduzirErro(erro));
        else console.warn('Host connection error', erro);
      });
    });
  }

  // Members only: the link to the host dropped. Try to take the same place back until the tolerance runs out.
  async #reconectar() {
    if (this.#reconectando || this.#encerrada) return;
    this.#reconectando = true;
    const antiga = this.#anfitriao;
    this.#anfitriao = null;
    antiga?.close();
    this.emitir('reconectando');
    const prazo = (this.#ultimoContato.get(this.idAnfitriao) ?? performance.now()) + TOLERANCIA_MS + FOLGA_RECONEXAO_MS;
    const volta = { id: this.meuId, chave: this.#chave };
    const nome = this.membros.get(this.meuId)?.nome;
    for (let tentativa = 1; !this.#encerrada; tentativa++) {
      try {
        // The signaling socket usually dies with the network; after a failed try, start from a fresh PeerJS id.
        if (tentativa > 1 || !this.#peer?.open) await this.#trocarPeer();
        await this.#conectarAoAnfitriao({ nome, volta, limiteMs: TEMPO_TENTATIVA_MS });
        this.#reconectando = false;
        if (!this.#encerrada) this.emitir('reconectou');
        return;
      } catch (erro) {
        if (this.#encerrada) return;
        const recusado = erro?.tipo === 'recusado';
        if (recusado || performance.now() > prazo) {
          this.#reconectando = false;
          this.#perderAnfitriao(recusado ? erro.message : 'A conexão com o anfitrião caiu e não voltou a tempo.');
          return;
        }
        console.warn(`Reconnection attempt ${tentativa} failed`, erro);
        await esperar(INTERVALO_TENTATIVA_MS);
      }
    }
  }

  async #trocarPeer() {
    const anterior = this.#peer;
    this.#peer = null;
    anterior?.destroy();
    await this.#abrirPeer(null, TEMPO_TENTATIVA_MS);
  }

  #aoMensagemDoAnfitriao(mensagem) {
    if (typeof mensagem?.t !== 'string') return;
    switch (mensagem.t) {
      case '$membros':
        this.#aplicarMembros(mensagem.membros);
        break;
      case '$ping':
        enviarSeguro(this.#anfitriao, { t: '$pong', h: mensagem.h });
        break;
      case '$qualidade':
        this.#aplicarQualidade(mensagem.q);
        break;
      case '$tchau':
        this.#perderAnfitriao('O anfitrião saiu da sala.');
        break;
      default:
        if (!mensagem.t.startsWith('$')) this.emitir('mensagem', this.idAnfitriao, mensagem);
    }
  }

  #aplicarMembros(lista) {
    if (!Array.isArray(lista)) return;
    const anteriores = this.membros;
    this.membros = new Map(lista.map(m => {
      const id = String(m.id);
      const antes = anteriores.get(id);
      const membro = {
        id,
        nome: limparNome(m.nome),
        ordem: Number(m.ordem) || 0,
        ping: antes?.ping ?? null,
        relay: antes?.relay ?? false,
        fora: Boolean(m.fora),
      };
      return [id, membro];
    }));
    if (anteriores.size) {
      for (const membro of this.membros.values()) {
        if (membro.id === this.meuId) continue;
        const antes = anteriores.get(membro.id);
        if (!antes) this.emitir('entrou', membro);
        else if (antes.fora !== membro.fora) this.emitir(membro.fora ? 'fora' : 'voltou', membro);
      }
      for (const membro of anteriores.values()) {
        if (!this.membros.has(membro.id)) this.emitir('saiu', membro);
      }
    }
    this.emitir('membros', this.membrosOrdenados());
  }

  #aplicarQualidade(qualidade) {
    if (!qualidade || typeof qualidade !== 'object') return;
    for (const [id, [ping, relay]] of Object.entries(qualidade)) {
      const membro = this.membros.get(id);
      if (!membro) continue;
      membro.ping = Number.isFinite(ping) ? ping : null;
      membro.relay = Boolean(relay);
    }
    this.emitir('qualidade', this.membrosOrdenados());
  }

  #aceitar(conexao) {
    const aoMensagem = mensagem => this.#aoMensagemDoMembro(conexao, mensagem);
    conexao.on('open', () => this.#canais.set(conexao, abrirCanalRapido(conexao, aoMensagem)));
    conexao.on('data', aoMensagem);
    conexao.on('close', () => this.#aoCairLigacao(conexao));
    conexao.on('error', erro => {
      console.warn('Member connection error', erro);
      this.#aoCairLigacao(conexao);
    });
  }

  // A dropped link does not remove the member yet: it may come back within the tolerance.
  #aoCairLigacao(conexao) {
    const id = this.#donos.get(conexao);
    if (this.#encerrada || !id || this.#conexoes.get(id) !== conexao) return;
    this.#marcarFora(id, true);
  }

  #aoMensagemDoMembro(conexao, mensagem) {
    if (typeof mensagem?.t !== 'string') return;
    if (mensagem.t === '$ola') {
      this.#receberOla(conexao, mensagem);
      return;
    }
    const id = this.#donos.get(conexao);
    if (!id || this.#conexoes.get(id) !== conexao) return;
    this.#ultimoContato.set(id, performance.now());
    this.#marcarFora(id, false);
    if (mensagem.t === '$pong') this.#registrarPing(id, performance.now() - Number(mensagem.h));
    else if (mensagem.t === '$tchau') this.#removerMembro(id, conexao);
    else if (!mensagem.t.startsWith('$')) this.emitir('mensagem', id, mensagem);
  }

  #receberOla(conexao, mensagem) {
    if (this.#donos.has(conexao)) return;
    const recusar = motivo => {
      enviarSeguro(conexao, { t: '$recusado', motivo });
      setTimeout(() => conexao.close(), 500);
    };
    if (mensagem.v !== VERSAO_PROTOCOLO) {
      recusar('Esta página está desatualizada. Recarregue e entre de novo pelo link.');
      return;
    }
    if (mensagem.volta) {
      this.#receberVolta(conexao, mensagem.volta, recusar);
      return;
    }
    const id = conexao.peer;
    if (this.membros.has(id)) return;
    if (this.membros.size >= this.#maxMembros) {
      recusar(`A sala está cheia (máximo de ${this.#maxMembros}).`);
      return;
    }
    const chave = sortear(ALFABETO, TAMANHO_CHAVE);
    this.#chaves.set(id, chave);
    this.#ligar(id, conexao);
    const membro = this.#adicionarMembro(id, mensagem.nome);
    enviarSeguro(conexao, { t: '$bemvindo', voce: id, chave, membros: this.membrosOrdenados() });
    this.#anunciarMembros();
    this.emitir('entrou', membro);
  }

  // A member that dropped comes back, maybe from a new PeerJS id, and takes its old place.
  #receberVolta(conexao, volta, recusar) {
    const id = String(volta?.id ?? '');
    const chave = this.#chaves.get(id);
    if (!this.membros.has(id) || !chave || volta?.chave !== chave) {
      recusar(`Você ficou fora por mais de ${TOLERANCIA_MS / 1000} segundos e a sala seguiu sem você. Entre de novo pelo link.`);
      return;
    }
    const antiga = this.#conexoes.get(id);
    this.#ligar(id, conexao);
    if (antiga && antiga !== conexao) antiga.close();
    const membro = this.membros.get(id);
    const estavaFora = membro.fora;
    membro.fora = false;
    enviarSeguro(conexao, { t: '$bemvindo', voce: id, chave, membros: this.membrosOrdenados() });
    this.#anunciarMembros();
    if (estavaFora) this.emitir('voltou', membro);
  }

  #ligar(id, conexao) {
    this.#conexoes.set(id, conexao);
    this.#donos.set(conexao, id);
    this.#ultimoContato.set(id, performance.now());
  }

  #marcarFora(id, fora) {
    const membro = this.membros.get(id);
    if (!membro || membro.fora === fora) return;
    membro.fora = fora;
    this.#anunciarMembros();
    this.emitir(fora ? 'fora' : 'voltou', membro);
  }

  #registrarPing(id, amostra) {
    const membro = this.membros.get(id);
    if (!membro || !Number.isFinite(amostra) || amostra < 0) return;
    // Smoothed so one slow sample does not make the list jump around.
    membro.ping = membro.ping === null ? amostra : membro.ping * 0.6 + amostra * 0.4;
  }

  #adicionarMembro(id, nome) {
    const membro = { id, nome: limparNome(nome), ordem: this.#proximaOrdem++, ping: null, relay: false, fora: false };
    this.membros.set(id, membro);
    return membro;
  }

  #removerMembro(id, conexao) {
    if (this.#encerrada || this.#conexoes.get(id) !== conexao) return;
    this.#conexoes.delete(id);
    this.#chaves.delete(id);
    this.#ultimoContato.delete(id);
    this.#canais.get(conexao)?.close();
    conexao.close();
    const membro = this.membros.get(id);
    if (!membro) return;
    this.membros.delete(id);
    this.#anunciarMembros();
    this.emitir('saiu', membro);
  }

  #anunciarMembros() {
    const membros = this.membrosOrdenados().map(({ id, nome, ordem, fora }) => ({ id, nome, ordem, ...(fora ? { fora: 1 } : {}) }));
    this.transmitir({ t: '$membros', membros });
    this.emitir('membros', this.membrosOrdenados());
  }

  #perderAnfitriao(motivo) {
    if (this.#encerrada) return;
    this.emitir('caiu', motivo);
    this.sair();
  }

  #iniciarVigia() {
    this.#vigia = criarTique(INTERVALO_PING_MS, () => this.#vigiar());
  }

  // The host pings everyone (round trip time shows in the member list). A short silence marks a member as away;
  // one longer than the tolerance removes it. Members start reconnecting after the same short silence.
  #vigiar() {
    const agora = performance.now();
    if (!this.souAnfitriao) {
      const ultimo = this.#ultimoContato.get(this.idAnfitriao) ?? agora;
      if (!this.#reconectando && agora - ultimo > LIMITE_QUEDA_MS) this.#reconectar();
      return;
    }
    for (const [id, conexao] of this.#conexoes) {
      const silencio = agora - (this.#ultimoContato.get(id) ?? agora);
      if (silencio > TOLERANCIA_MS) {
        this.#removerMembro(id, conexao);
        continue;
      }
      if (silencio > LIMITE_QUEDA_MS) this.#marcarFora(id, true);
      enviarSeguro(conexao, { t: '$ping', h: agora });
    }
    if (agora - this.#ultimaChecagemRede >= INTERVALO_REDE_MS) {
      this.#ultimaChecagemRede = agora;
      this.#checarRetransmissores();
    }
    this.#publicarQualidade();
  }

  async #checarRetransmissores() {
    for (const [id, conexao] of this.#conexoes) {
      try {
        const relay = await usaRetransmissor(conexao);
        const membro = this.membros.get(id);
        if (membro) membro.relay = relay;
      } catch (erro) {
        console.warn('Could not read connection stats', erro);
      }
    }
  }

  #publicarQualidade() {
    const qualidade = {};
    for (const membro of this.membros.values()) {
      qualidade[membro.id] = [membro.ping === null ? null : Math.round(membro.ping), membro.relay ? 1 : 0];
    }
    this.transmitir({ t: '$qualidade', q: qualidade });
    this.emitir('qualidade', this.membrosOrdenados());
  }
}
