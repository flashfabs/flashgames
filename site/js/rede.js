// Which STUN/TURN servers the WebRTC links use.
// "cloudflare" (the default) asks the site's Netlify Function for short-lived Cloudflare TURN credentials, so people
// on closed networks (symmetric NAT, some mobile carriers) still connect, through a relay near them; when the
// function is missing or fails, it keeps PeerJS's built-in setup, which is what "peerjs" always uses.
// The address can override the default for testing: ?rede=peerjs, or ?rede=retransmissor to force every link
// through TURN.

const ENDERECO_ICE = '/api/ice';
const TEMPO_ICE_MS = 3000;
const MARGEM_VALIDADE_MS = 10 * 60 * 1000; // fetch new credentials this long before the old ones expire
const ESPERA_APOS_FALHA_MS = 60 * 1000; // after a failure, reconnection attempts do not wait on the function again
export const MODOS_REDE = Object.freeze(['cloudflare', 'peerjs', 'retransmissor']);
export const MODO_PADRAO = 'cloudflare';

export function modoDaRede(busca = '') {
  const pedido = new URLSearchParams(busca).get('rede');
  return MODOS_REDE.includes(pedido) ? pedido : MODO_PADRAO;
}

// Returns configuracaoIce(modo): the RTCPeerConnection config to hand PeerJS, or null to keep PeerJS's own.
export function criarFonteIce({ buscar = (...args) => fetch(...args), agora = () => Date.now() } = {}) {
  let credenciais = null; // { iceServers (null after a failure), validoAte }

  async function servidoresTurn() {
    if (credenciais && agora() < credenciais.validoAte) return credenciais.iceServers;
    try {
      const resposta = await buscar(ENDERECO_ICE, { cache: 'no-store', signal: AbortSignal.timeout(TEMPO_ICE_MS) });
      if (!resposta.ok) throw new Error(`TURN credentials endpoint answered ${resposta.status}`);
      const dados = await resposta.json();
      if (!Array.isArray(dados?.iceServers) || !dados.iceServers.length) throw new Error('No ICE servers in the answer');
      const validadeMs = (Number(dados.validade) || 0) * 1000;
      credenciais = { iceServers: dados.iceServers, validoAte: agora() + Math.max(0, validadeMs - MARGEM_VALIDADE_MS) };
      return credenciais.iceServers;
    } catch (erro) {
      console.warn('Cloudflare TURN unavailable, using the PeerJS defaults', erro);
      credenciais = { iceServers: null, validoAte: agora() + ESPERA_APOS_FALHA_MS };
      return null;
    }
  }

  return async function configuracaoIce(modo = MODO_PADRAO) {
    if (modo === 'peerjs') return null;
    const turn = await servidoresTurn();
    if (modo === 'retransmissor') return { iceServers: turn ?? [], iceTransportPolicy: 'relay' };
    return turn ? { iceServers: turn } : null;
  };
}

export const configuracaoIce = criarFonteIce();
