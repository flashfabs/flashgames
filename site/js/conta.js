// Device profile ("perfil do aparelho"): nickname, color, symbol and match statistics, with no password, e-mail
// or personal data. The real copy lives on the server (Netlify Functions + Blobs, /api/perfil) under a random id
// and secret kept on this device. A local copy keeps everything working when the server cannot be reached, and
// matches played offline are sent later. The recovery code (id + secret) takes the profile to another device.
//
// Contract with the screens (all async; none of them needs the network to answer):
// - obterPerfil() → { id, nome, cor, simbolo, criadoEm, atualizadoEm, estatisticas, historico, local }
//   (creates the profile the first time; `local` is true while it only exists on this device)
// - salvarPerfil({ nome, cor, simbolo }) → the updated profile
// - registrarPartida(resumo) → the updated profile; resumo = { venceu, caixas, eliminacoes, jogadores, robos,
//   mapa, duracaoS, campeaoDaRodada, em } for the player on this device (points are computed from it)
// - historico() → this profile's latest matches, newest first
// - ranking() → [{ posicao, id, nome, cor, simbolo, pontos, vitorias, partidas, eu }] (matches with friends only)
// - codigoDeRecuperacao() → 'XXXXX-XXXXX-...' or null while the profile only exists on this device
// - recuperar(codigo) → the recovered profile, which replaces the one on this device; throws ErroConta

import {
  ErroConta, novoPerfil, aplicarPartida, normalizarResumo, camposEditaveis, formatarCodigo, lerCodigo,
  ALFABETO_CONTA, TAMANHO_ID, MAX_LOTE,
} from './conta-regras.js';

export { ErroConta } from './conta-regras.js';

const CHAVE = 'salinha:conta';
const CHAVE_RANKING = 'salinha:ranking';
const CHAVE_NOME_ANTIGO = 'salinha:nome';
const API = '/api/perfil';
const API_RANKING = '/api/ranking';
const TEMPO_API_MS = 6000;
const ESPERA_APOS_FALHA_MS = 60 * 1000;
const MAX_PENDENTES = 50;
const CORES_INICIAIS = 8;
const APELIDOS = ['Faísca', 'Pólvora', 'Estopim', 'Fagulha', 'Chispa', 'Brasa', 'Rojão', 'Traque', 'Fumaça', 'Pavio'];

class ErroApi extends Error {
  constructor(mensagem, status) {
    super(mensagem);
    this.status = status;
  }
}

let fila = Promise.resolve();
let apiIndisponivelAte = 0;

// One operation at a time, so creating the profile and registering a match never race each other.
function emSerie(tarefa) {
  const resultado = fila.then(tarefa, tarefa);
  fila = resultado.catch(() => {});
  return resultado;
}

function lerArmazenado(chave) {
  try {
    return JSON.parse(localStorage.getItem(chave) ?? 'null');
  } catch (erro) {
    console.warn(`Stored "${chave}" unreadable, ignoring it`, erro);
    return null;
  }
}

function gravarArmazenado(chave, valor) {
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
  } catch (erro) {
    console.warn(`Could not store "${chave}" on this device`, erro);
  }
}

function sortear(alfabeto, tamanho) {
  const valores = crypto.getRandomValues(new Uint32Array(tamanho));
  return Array.from(valores, valor => alfabeto[valor % alfabeto.length]).join('');
}

function apelidoSorteado() {
  const apelido = APELIDOS[Math.floor(Math.random() * APELIDOS.length)];
  return `${apelido} ${10 + Math.floor(Math.random() * 90)}`;
}

function nomeAntigo() {
  try {
    return localStorage.getItem(CHAVE_NOME_ANTIGO);
  } catch {
    return null;
  }
}

// Reads this device's data, creating a local profile the first time.
function carregar() {
  const salvo = lerArmazenado(CHAVE);
  const dados = {
    credencial: salvo?.credencial ?? null,
    perfil: salvo?.perfil ?? null,
    pendentes: Array.isArray(salvo?.pendentes) ? salvo.pendentes : [],
    edicao: salvo?.edicao ?? null, // fields changed while the server was unreachable
  };
  if (!dados.perfil) {
    dados.perfil = novoPerfil({
      id: `local-${sortear(ALFABETO_CONTA, TAMANHO_ID)}`,
      nome: nomeAntigo() || apelidoSorteado(),
      cor: Math.floor(Math.random() * CORES_INICIAIS),
    });
    gravarArmazenado(CHAVE, dados);
  }
  return dados;
}

function copia(dados) {
  const { segredoHash, ...perfil } = structuredClone(dados.perfil);
  return { ...perfil, local: !dados.credencial };
}

async function chamar(caminho, { metodo = 'GET', corpo = null, credencial = null } = {}) {
  let resposta;
  try {
    resposta = await fetch(caminho, {
      method: metodo,
      headers: {
        ...(corpo ? { 'content-type': 'application/json' } : {}),
        ...(credencial ? { authorization: `Perfil ${credencial.id}.${credencial.segredo}` } : {}),
      },
      body: corpo ? JSON.stringify(corpo) : undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(TEMPO_API_MS),
    });
  } catch (erro) {
    throw new ErroApi(`Sem conexão com o servidor de perfis (${erro.name})`, 0);
  }
  const tipo = resposta.headers.get('content-type') ?? '';
  const dados = tipo.includes('application/json') ? await resposta.json() : null;
  if (!resposta.ok || !dados) throw new ErroApi(dados?.erro || `Servidor de perfis respondeu ${resposta.status}`, resposta.status);
  return dados;
}

// The server copy plus the matches it has not received yet.
function aplicarPendentes(perfilDoServidor, pendentes) {
  return pendentes.reduce((perfil, partida) => aplicarPartida(perfil, partida), perfilDoServidor);
}

// Brings this device and the server together: creates the server profile, sends pending edits and matches,
// and takes the server's copy. Never throws: on failure the local copy stays and the next call tries again.
async function sincronizar(dados, { buscar = true } = {}) {
  if (Date.now() < apiIndisponivelAte) return;
  let servidor = null;
  try {
    if (!dados.credencial) {
      const { nome, cor, simbolo } = dados.perfil;
      const criado = await chamar(API, { metodo: 'POST', corpo: { nome, cor, simbolo } });
      dados.credencial = criado.credencial;
      dados.edicao = null;
      servidor = criado.perfil;
    } else if (dados.edicao) {
      servidor = (await chamar(API, { metodo: 'PUT', corpo: dados.edicao, credencial: dados.credencial })).perfil;
      dados.edicao = null;
    } else if (buscar) {
      servidor = (await chamar(API, { credencial: dados.credencial })).perfil;
    }
    while (dados.pendentes.length) {
      const lote = dados.pendentes.slice(0, MAX_LOTE);
      servidor = (await chamar(`${API}/partidas`, { metodo: 'POST', corpo: { partidas: lote }, credencial: dados.credencial })).perfil;
      dados.pendentes = dados.pendentes.slice(lote.length);
    }
  } catch (erro) {
    if (erro.status === 401 || erro.status === 404) {
      // The server does not know this credential (its store was reset): a new server profile is created next time.
      console.warn('Profile server does not know this profile, it will be created again', erro);
      dados.credencial = null;
    } else if (erro.status !== 429) {
      apiIndisponivelAte = Date.now() + ESPERA_APOS_FALHA_MS;
      console.warn('Profile server unavailable, using the copy on this device', erro);
    }
  } finally {
    // The screen always shows the server's copy plus whatever the server has not received yet.
    if (servidor) dados.perfil = aplicarPendentes(servidor, dados.pendentes);
    gravarArmazenado(CHAVE, dados);
  }
}

export function obterPerfil() {
  return emSerie(async () => {
    const dados = carregar();
    await sincronizar(dados);
    return copia(dados);
  });
}

export function salvarPerfil(campos) {
  return emSerie(async () => {
    const dados = carregar();
    const mudancas = camposEditaveis(campos);
    dados.perfil = { ...dados.perfil, ...mudancas, atualizadoEm: Date.now() };
    if (dados.credencial) dados.edicao = { ...dados.edicao, ...mudancas };
    gravarArmazenado(CHAVE, dados);
    await sincronizar(dados, { buscar: false });
    return copia(dados);
  });
}

export function registrarPartida(resumo) {
  return emSerie(async () => {
    const partida = normalizarResumo(resumo);
    const dados = carregar();
    dados.perfil = aplicarPartida(dados.perfil, partida);
    dados.pendentes = [...dados.pendentes, partida].slice(-MAX_PENDENTES);
    gravarArmazenado(CHAVE, dados);
    await sincronizar(dados, { buscar: false });
    return copia(dados);
  });
}

export async function historico() {
  return (await obterPerfil()).historico ?? [];
}

export async function ranking() {
  const meuId = lerArmazenado(CHAVE)?.perfil?.id;
  let linhas;
  try {
    linhas = (await chamar(API_RANKING)).linhas;
    if (!Array.isArray(linhas)) throw new ErroApi('Ranking sem linhas', 0);
    gravarArmazenado(CHAVE_RANKING, linhas);
  } catch (erro) {
    console.warn('Ranking unavailable, showing the last one seen on this device', erro);
    linhas = lerArmazenado(CHAVE_RANKING) ?? [];
  }
  return linhas.map((linha, n) => ({ ...linha, posicao: n + 1, eu: linha.id === meuId }));
}

export function codigoDeRecuperacao() {
  return emSerie(async () => {
    const dados = carregar();
    if (!dados.credencial) {
      apiIndisponivelAte = 0;
      await sincronizar(dados, { buscar: false });
    }
    return dados.credencial ? formatarCodigo(dados.credencial) : null;
  });
}

export function recuperar(codigo) {
  return emSerie(async () => {
    const lido = lerCodigo(codigo);
    if (!lido) throw new ErroConta('Código inválido: são 30 letras e números, em grupos de 5.');
    let resposta;
    try {
      resposta = await chamar(`${API}/recuperar`, { metodo: 'POST', corpo: { codigo: formatarCodigo(lido) } });
    } catch (erro) {
      if (erro.status === 401 || erro.status === 404) throw new ErroConta('Esse código não abre nenhum perfil. Confira e tente de novo.', erro.status);
      if (erro.status === 429) throw new ErroConta('Muitas tentativas seguidas. Espere um minuto e tente de novo.', 429);
      throw new ErroConta('Sem conexão com o servidor de perfis. Tente de novo daqui a pouco.', erro.status || 503);
    }
    const dados = { credencial: resposta.credencial, perfil: resposta.perfil, pendentes: [], edicao: null };
    gravarArmazenado(CHAVE, dados);
    return copia(dados);
  });
}
