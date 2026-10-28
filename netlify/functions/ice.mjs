// GET /api/ice: short-lived Cloudflare TURN credentials for the browser, so the TURN key never leaves Netlify.
// Setup: in the Cloudflare dashboard (Realtime → TURN Server) create a TURN key, then set CLOUDFLARE_TURN_KEY_ID
// and CLOUDFLARE_TURN_API_TOKEN in the Netlify project's environment variables.
// No CORS headers on purpose: other sites cannot read these credentials from a browser.

const VALIDADE_S = 24 * 60 * 60;
const TEMPO_LIMITE_MS = 5000;
const SEM_CACHE = { 'cache-control': 'no-store' };

export function enderecoCloudflare(idChave) {
  return `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(idChave)}/credentials/generate-ice-servers`;
}

// Browsers block port 53, so a TURN URL on it only makes the connection wait for a timeout.
export function semPorta53(servidores) {
  return servidores
    .map(servidor => {
      const urls = [servidor.urls].flat().filter(url => typeof url === 'string' && !/:53(\?|$)/.test(url));
      return { ...servidor, urls };
    })
    .filter(servidor => servidor.urls.length);
}

export async function gerarServidoresIce({ idChave, token, buscar = (...args) => fetch(...args) }) {
  const resposta = await buscar(enderecoCloudflare(idChave), {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ ttl: VALIDADE_S }),
    signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
  });
  if (!resposta.ok) throw new Error(`Cloudflare answered ${resposta.status}`);
  const dados = await resposta.json();
  if (!Array.isArray(dados?.iceServers)) throw new Error('Cloudflare answer has no iceServers');
  return semPorta53(dados.iceServers);
}

export default async function ice(requisicao) {
  if (requisicao.method !== 'GET') return new Response(null, { status: 405, headers: { allow: 'GET' } });
  const idChave = Netlify.env.get('CLOUDFLARE_TURN_KEY_ID');
  const token = Netlify.env.get('CLOUDFLARE_TURN_API_TOKEN');
  if (!idChave || !token) return Response.json({ erro: 'TURN não configurado' }, { status: 503, headers: SEM_CACHE });
  try {
    const iceServers = await gerarServidoresIce({ idChave, token });
    return Response.json({ iceServers, validade: VALIDADE_S }, { headers: SEM_CACHE });
  } catch (erro) {
    console.error('Could not get TURN credentials from Cloudflare:', erro.message);
    return Response.json({ erro: 'Falha ao gerar credenciais de TURN' }, { status: 502, headers: SEM_CACHE });
  }
}

export const config = { path: '/api/ice' };
