// Device profiles API, stored in Netlify Blobs. No password, e-mail or personal data: nickname, color, symbol
// and match statistics only.
//   POST /api/perfil             create                          → 201 { perfil, credencial: { id, segredo } }
//   GET  /api/perfil             my profile, with history        → { perfil }
//   PUT  /api/perfil             nickname, color or symbol       → { perfil }
//   POST /api/perfil/partidas    finished matches, 1 to 10       → { perfil }
//   POST /api/perfil/recuperar   { codigo } from another device  → { perfil, credencial }
//   GET  /api/ranking            best profiles in matches with friends → { linhas, atualizadoEm }
// Calls about my profile send "Authorization: Perfil <id>.<secret>"; the store keeps only a SHA-256 of the secret.
// Writes must come from the site's own origin, bodies are capped, matches are checked for plausibility and
// Netlify limits each IP to 60 calls a minute. The ranking is a cache rebuilt from profiles as they change.
// Known limit: each player registers its own matches, so a determined cheater can inflate its own numbers.

import { createHash, getRandomValues, timingSafeEqual } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import {
  ErroConta, novoPerfil, aplicarPartida, normalizarResumo, camposEditaveis, perfilPublico, atualizarRanking,
  lerCodigo, idValido, ALFABETO_CONTA, TAMANHO_ID, TAMANHO_SEGREDO, MAX_LOTE,
} from '../../site/js/conta-regras.js';

const MAX_CORPO = 8 * 1024;
const INTERVALO_REGISTRO_MS = 3000; // one match registration per profile every few seconds
const TENTATIVAS_ESCRITA = 4;
const CHAVE_RANKING = 'ranking/geral';
const ORIGENS = [/^https:\/\/([a-z0-9]+--)?salinha-jogos\.netlify\.app$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];
const PRIVADO = { 'cache-control': 'no-store' };

const chavePerfil = id => `perfil/${id}`;

function sortear(tamanho) {
  const valores = getRandomValues(new Uint32Array(tamanho));
  return Array.from(valores, valor => ALFABETO_CONTA[valor % ALFABETO_CONTA.length]).join('');
}

function hashDoSegredo(id, segredo) {
  return createHash('sha256').update(`${id}:${segredo}`).digest('hex');
}

function segredoConfere(perfil, id, segredo) {
  const esperado = Buffer.from(perfil.segredoHash ?? '', 'hex');
  const recebido = Buffer.from(hashDoSegredo(id, segredo), 'hex');
  return esperado.length === recebido.length && timingSafeEqual(esperado, recebido);
}

function responder(dados, status = 200, cabecalhos = PRIVADO) {
  return Response.json(dados, { status, headers: cabecalhos });
}

function origemPermitida(requisicao) {
  const origem = requisicao.headers.get('origin');
  return Boolean(origem) && ORIGENS.some(padrao => padrao.test(origem));
}

async function lerCorpo(requisicao) {
  const tamanho = Number(requisicao.headers.get('content-length') ?? 0);
  if (tamanho > MAX_CORPO) throw new ErroConta('Pedido grande demais.', 413);
  const texto = await requisicao.text();
  if (texto.length > MAX_CORPO) throw new ErroConta('Pedido grande demais.', 413);
  try {
    const dados = JSON.parse(texto || '{}');
    if (!dados || typeof dados !== 'object' || Array.isArray(dados)) throw new Error('not an object');
    return dados;
  } catch {
    throw new ErroConta('Pedido mal formado.');
  }
}

function lerCredencial(requisicao) {
  const [esquema, valor] = (requisicao.headers.get('authorization') ?? '').split(' ');
  const [id, segredo] = (valor ?? '').split('.');
  if (esquema !== 'Perfil' || !idValido(id) || typeof segredo !== 'string' || segredo.length !== TAMANHO_SEGREDO) {
    throw new ErroConta('Perfil não identificado.', 401);
  }
  return { id, segredo };
}

// The store handle is injected so tests can run against an in-memory copy.
export function criarApi({ armazem, agora = () => Date.now() }) {
  async function lerPerfil(id) {
    const entrada = await armazem.getWithMetadata(chavePerfil(id), { type: 'json' });
    return entrada?.data ? { perfil: entrada.data, etag: entrada.etag } : null;
  }

  async function autenticar(requisicao) {
    const { id, segredo } = lerCredencial(requisicao);
    const lido = await lerPerfil(id);
    if (!lido || !segredoConfere(lido.perfil, id, segredo)) throw new ErroConta('Perfil não encontrado.', 401);
    return lido;
  }

  // Read, change, write only if nobody wrote in between; retries a few times.
  async function alterarPerfil(id, lido, mudar) {
    let atual = lido;
    for (let tentativa = 0; tentativa < TENTATIVAS_ESCRITA; tentativa++) {
      const novo = mudar(atual.perfil);
      const { modified } = await armazem.setJSON(chavePerfil(id), novo, { onlyIfMatch: atual.etag });
      if (modified) return novo;
      atual = await lerPerfil(id);
      if (!atual) throw new ErroConta('Perfil não encontrado.', 404);
    }
    throw new ErroConta('O perfil está sendo alterado em outro lugar. Tente de novo.', 409);
  }

  async function atualizarNoRanking(perfil) {
    for (let tentativa = 0; tentativa < TENTATIVAS_ESCRITA; tentativa++) {
      const entrada = await armazem.getWithMetadata(CHAVE_RANKING, { type: 'json' });
      const linhas = atualizarRanking(entrada?.data?.linhas ?? [], perfil);
      const novo = { atualizadoEm: agora(), linhas };
      const condicao = entrada ? { onlyIfMatch: entrada.etag } : { onlyIfNew: true };
      if ((await armazem.setJSON(CHAVE_RANKING, novo, condicao)).modified) return;
    }
    // The ranking is a cache: the next match of this profile puts it right.
    console.warn(`Ranking not updated for ${perfil.id} after ${TENTATIVAS_ESCRITA} tries`);
  }

  async function criar(requisicao) {
    const campos = camposEditaveis(await lerCorpo(requisicao));
    for (let tentativa = 0; tentativa < TENTATIVAS_ESCRITA; tentativa++) {
      const id = sortear(TAMANHO_ID);
      const segredo = sortear(TAMANHO_SEGREDO);
      const perfil = { ...novoPerfil({ id, ...campos, agora: agora() }), segredoHash: hashDoSegredo(id, segredo) };
      if ((await armazem.setJSON(chavePerfil(id), perfil, { onlyIfNew: true })).modified) {
        return responder({ perfil: { ...perfilPublico(perfil), historico: [] }, credencial: { id, segredo } }, 201);
      }
    }
    throw new ErroConta('Não consegui criar o perfil. Tente de novo.', 503);
  }

  async function editar(requisicao) {
    const lido = await autenticar(requisicao);
    const campos = camposEditaveis(await lerCorpo(requisicao));
    const perfil = await alterarPerfil(lido.perfil.id, lido, atual => ({ ...atual, ...campos, atualizadoEm: agora() }));
    if (perfil.estatisticas?.partidasComAmigos > 0) await atualizarNoRanking(perfil);
    return responder({ perfil: { ...perfilPublico(perfil), historico: perfil.historico } });
  }

  async function registrar(requisicao) {
    const lido = await autenticar(requisicao);
    const { partidas } = await lerCorpo(requisicao);
    if (!Array.isArray(partidas) || !partidas.length || partidas.length > MAX_LOTE) {
      throw new ErroConta(`Mande de 1 a ${MAX_LOTE} partidas por vez.`);
    }
    const momento = agora();
    const normalizadas = partidas.map(partida => normalizarResumo(partida, momento)).sort((a, b) => a.em - b.em);
    const perfil = await alterarPerfil(lido.perfil.id, lido, atual => {
      if (momento - (atual.ultimoRegistroEm ?? 0) < INTERVALO_REGISTRO_MS) {
        throw new ErroConta('Partidas registradas rápido demais. Espere um pouco.', 429);
      }
      return { ...normalizadas.reduce(aplicarPartida, atual), ultimoRegistroEm: momento };
    });
    if (normalizadas.some(partida => partida.jogadores - partida.robos >= 2)) await atualizarNoRanking(perfil);
    return responder({ perfil: { ...perfilPublico(perfil), historico: perfil.historico } });
  }

  async function recuperar(requisicao) {
    const credencial = lerCodigo((await lerCorpo(requisicao)).codigo);
    if (!credencial) throw new ErroConta('Código inválido.', 400);
    const lido = await lerPerfil(credencial.id);
    if (!lido || !segredoConfere(lido.perfil, credencial.id, credencial.segredo)) throw new ErroConta('Código não encontrado.', 404);
    return responder({ perfil: { ...perfilPublico(lido.perfil), historico: lido.perfil.historico }, credencial });
  }

  async function ranking() {
    const entrada = await armazem.getWithMetadata(CHAVE_RANKING, { type: 'json' });
    return responder({ linhas: entrada?.data?.linhas ?? [], atualizadoEm: entrada?.data?.atualizadoEm ?? null }, 200, {
      'cache-control': 'public, max-age=15',
    });
  }

  return async function api(requisicao) {
    const { pathname } = new URL(requisicao.url);
    const rota = `${requisicao.method} ${pathname.replace(/\/+$/, '')}`;
    try {
      if (requisicao.method !== 'GET' && !origemPermitida(requisicao)) throw new ErroConta('Origem não permitida.', 403);
      switch (rota) {
        case 'POST /api/perfil':
          return await criar(requisicao);
        case 'GET /api/perfil': {
          const { perfil } = await autenticar(requisicao);
          return responder({ perfil: { ...perfilPublico(perfil), historico: perfil.historico } });
        }
        case 'PUT /api/perfil':
          return await editar(requisicao);
        case 'POST /api/perfil/partidas':
          return await registrar(requisicao);
        case 'POST /api/perfil/recuperar':
          return await recuperar(requisicao);
        case 'GET /api/ranking':
          return await ranking();
        default:
          return responder({ erro: 'Rota inexistente.' }, 404);
      }
    } catch (erro) {
      if (erro instanceof ErroConta) return responder({ erro: erro.message }, erro.status);
      console.error('Profile API failed:', rota, erro);
      return responder({ erro: 'Erro interno. Tente de novo.' }, 500);
    }
  };
}

// Site-wide stores are shared by every deploy: drafts and local runs write to a separate one, so tests never
// touch the real profiles and ranking. The store is opened on every request: it carries a short-lived Blobs token
// from the invocation, and a store kept by a warm instance failed with "Token expired" (500s on 28/10/2026).
export default async function perfil(requisicao, contexto) {
  const nome = contexto?.deploy?.context === 'production' ? 'perfis' : 'perfis-teste';
  return criarApi({ armazem: getStore({ name: nome, consistency: 'strong' }) })(requisicao);
}

export const config = {
  path: ['/api/perfil', '/api/perfil/*', '/api/ranking'],
  rateLimit: { windowLimit: 60, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
