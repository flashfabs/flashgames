// Short-lived public-room directory; the peer-to-peer room remains the authority on who may join.
import { createHash, timingSafeEqual } from 'node:crypto';
import { getStore } from '@netlify/blobs';

const VALIDADE_MS = 60_000;
const ALFABETO = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/;
const tokenHash = token => createHash('sha256').update(token).digest('hex');
const seguro = (a, b) => { const x = Buffer.from(a || '', 'hex'), y = Buffer.from(b || '', 'hex'); return x.length === y.length && x.length > 0 && timingSafeEqual(x, y); };
const resposta = (dados, status = 200) => Response.json(dados, { status, headers: { 'cache-control': 'no-store' } });
export function criarApiSalas({ armazem, agora = () => Date.now() }) {
  return async requisicao => {
    try {
      if (requisicao.method === 'GET') {
        const lista = await armazem.list({ prefix: 'farm/' });
        const entradas = await Promise.all((lista.blobs || []).map(x => armazem.get(x.key, { type: 'json' })));
        return resposta({ salas: entradas.filter(x => x && x.expira > agora() && x.aberta && x.ocupadas - x.bots < x.limite).map(({ codigo, nome, ocupadas, limite, bots }) => ({ codigo, nome, ocupadas, limite, bots })) });
      }
      if (requisicao.method !== 'POST') return resposta({ erro: 'Método não permitido.' }, 405);
      const origem = requisicao.headers.get('origin');
      if (!origem || !/^https:\/\/([a-z0-9]+--)?salinha-jogos\.netlify\.app$|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origem)) return resposta({ erro: 'Origem não permitida.' }, 403);
      const texto = await requisicao.text(); if (texto.length > 2048) return resposta({ erro: 'Pedido grande demais.' }, 413);
      const d = JSON.parse(texto), codigo = String(d.codigo || ''), token = String(d.token || ''), nome = String(d.nome || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 30);
      if (!ALFABETO.test(codigo) || !/^[a-f0-9-]{36}$/i.test(token) || !nome || !Number.isInteger(d.limite) || d.limite < 1 || d.limite > 6 || !Number.isInteger(d.ocupadas) || d.ocupadas < 1 || d.ocupadas > d.limite || !Number.isInteger(d.bots) || d.bots < 0 || d.bots >= d.limite || typeof d.aberta !== 'boolean') return resposta({ erro: 'Dados inválidos.' }, 400);
      const key = `farm/${codigo}`, anterior = await armazem.getWithMetadata(key, { type: 'json' });
      if (anterior?.data && anterior.data.expira > agora() && !seguro(anterior.data.tokenHash, tokenHash(token))) return resposta({ erro: 'Sala já registrada.' }, 409);
      const registro = { codigo, nome, limite: d.limite, ocupadas: d.ocupadas, bots: d.bots, aberta: d.aberta, expira: agora() + VALIDADE_MS, tokenHash: tokenHash(token) };
      const condicao = anterior?.etag ? { onlyIfMatch: anterior.etag } : { onlyIfNew: true };
      if (!(await armazem.setJSON(key, registro, condicao)).modified) return resposta({ erro: 'A sala mudou. Tente novamente.' }, 409);
      return resposta({ ok: true });
    } catch (erro) { console.error('Public room directory failed', erro); return resposta({ erro: 'Não foi possível acessar as salas públicas.' }, 500); }
  };
}
export default async function salasFarm(requisicao, contexto) {
  const nome = contexto?.deploy?.context === 'production' ? 'salas-farm' : 'salas-farm-teste';
  return criarApiSalas({ armazem: getStore({ name: nome, consistency: 'strong' }) })(requisicao);
}
export const config = { path: '/api/salas-farm', rateLimit: { windowLimit: 120, windowSize: 60, aggregateBy: ['ip', 'domain'] } };
