// Terrain of a match: blocked cells, visual relief, height levels 0..3 and start bases.
// Either generated from a seed (the prototype's noise map, now with hills), built from given layers (tests), or read
// from the design front's map files (C6). Everything is integer and depends only on its inputs.
import { CATEGORIA } from './contratos.js';

const MAX_NIVEL = 3;
// 4-neighbour steps for the reachability flood
const PASSO_X = [1, -1, 0, 0];
const PASSO_Y = [0, 0, 1, -1];

function hash2(ix, iy, semente) {
  let h = Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1) ^ semente;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) & 255;
}

// Value noise in 0..255 on a lattice of `passo` cells, with integer smoothstep weights.
function ruido(x, y, passo, semente) {
  const ix = Math.trunc(x / passo);
  const iy = Math.trunc(y / passo);
  const fx = Math.trunc(((x - ix * passo) * 256) / passo);
  const fy = Math.trunc(((y - iy * passo) * 256) / passo);
  const sx = (fx * fx * (768 - 2 * fx)) >> 16;
  const sy = (fy * fy * (768 - 2 * fy)) >> 16;
  const a = hash2(ix, iy, semente);
  const b = hash2(ix + 1, iy, semente);
  const c = hash2(ix, iy + 1, semente);
  const d = hash2(ix + 1, iy + 1, semente);
  const ab = a + (((b - a) * sx) >> 8);
  const cd = c + (((d - c) * sx) >> 8);
  return ab + (((cd - ab) * sy) >> 8);
}

/** Relief value that leaves `percentual` percent of the cells strictly above it. */
function limiarDoTopo(histograma, total, percentual) {
  let limiar = 255;
  for (let acumulado = 0; limiar > 0; limiar--) {
    acumulado += histograma[limiar];
    if (acumulado * 100 >= total * percentual) break;
  }
  return limiar;
}

/**
 * Seeded map: rock plateaus on the top 21% of the relief, open hills in levels 0..2 below them, two bases in opposite
 * corners joined by a guaranteed corridor, and every pocket unreachable from base 0 turned to rock.
 */
export function gerarMapa(largura, altura, semente) {
  const total = largura * altura;
  const bloqueado = new Uint8Array(total);
  const relevo = new Uint8Array(total);
  const nivel = new Uint8Array(total);
  const histograma = new Int32Array(256);
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const v = Math.trunc((ruido(x, y, 28, semente) * 4 + ruido(x, y, 13, semente ^ 0x51) * 2 + ruido(x, y, 6, semente ^ 0x9e)) / 7);
      relevo[y * largura + x] = v;
      histograma[v]++;
    }
  }
  const limiarRocha = limiarDoTopo(histograma, total, 21);
  for (let i = 0; i < total; i++) bloqueado[i] = relevo[i] > limiarRocha ? 1 : 0;
  for (let x = 0; x < largura; x++) bloqueado[x] = bloqueado[(altura - 1) * largura + x] = 1;
  for (let y = 0; y < altura; y++) bloqueado[y * largura] = bloqueado[y * largura + largura - 1] = 1;

  const bases = [
    { x: 24, y: altura - 24 },
    { x: largura - 24, y: 24 },
  ];
  const limpar = (cx, cy, raio) => {
    for (let y = cy - raio; y <= cy + raio; y++) {
      for (let x = cx - raio; x <= cx + raio; x++) {
        if (x < 1 || y < 1 || x >= largura - 1 || y >= altura - 1) continue;
        if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= raio * raio) bloqueado[y * largura + x] = 0;
      }
    }
  };
  for (const base of bases) limpar(base.x, base.y, 16);
  limpar(largura >> 1, altura >> 1, 12);
  // a guaranteed corridor between the bases through the centre
  for (let k = 0; k <= largura; k++) {
    const x = bases[0].x + Math.trunc(((bases[1].x - bases[0].x) * k) / largura);
    const y = bases[0].y + Math.trunc(((bases[1].y - bases[0].y) * k) / largura);
    limpar(x, y, 2);
  }
  manterAlcancavel(largura, altura, bloqueado, bases[0]);

  // hills: the open ground splits by relief into level 0 (lower half), 1 and 2 (top fifth)
  const histogramaAberto = new Int32Array(256);
  let abertas = 0;
  for (let i = 0; i < total; i++) {
    if (bloqueado[i]) continue;
    histogramaAberto[relevo[i]]++;
    abertas++;
  }
  const limiar2 = limiarDoTopo(histogramaAberto, abertas, 20);
  const limiar1 = limiarDoTopo(histogramaAberto, abertas, 50);
  for (let i = 0; i < total; i++) nivel[i] = bloqueado[i] ? 0 : relevo[i] > limiar2 ? 2 : relevo[i] > limiar1 ? 1 : 0;
  const mapa = { largura, altura, bloqueado, relevo, nivel, bases, nos: [] };
  for (const nome of CAMADAS_EXTRAS) mapa[nome] = new Uint8Array(total);
  return mapa;
}

// Open cells that cannot be reached from the origin become rock, so nobody spawns or paths into a pocket.
function manterAlcancavel(largura, altura, bloqueado, origem) {
  const total = largura * altura;
  const alcancavel = new Uint8Array(total);
  const fila = new Int32Array(total);
  let inicio = 0;
  let fim = 0;
  const primeira = origem.y * largura + origem.x;
  alcancavel[primeira] = 1;
  fila[fim++] = primeira;
  while (inicio < fim) {
    const u = fila[inicio++];
    const ux = u % largura;
    const uy = Math.trunc(u / largura);
    for (let k = 0; k < 4; k++) {
      const vx = ux + PASSO_X[k];
      const vy = uy + PASSO_Y[k];
      if (vx < 0 || vy < 0 || vx >= largura || vy >= altura) continue;
      const v = vy * largura + vx;
      if (!bloqueado[v] && !alcancavel[v]) {
        alcancavel[v] = 1;
        fila[fim++] = v;
      }
    }
  }
  for (let i = 0; i < total; i++) if (!alcancavel[i]) bloqueado[i] = 1;
}

// Optional per-cell layers a map may carry besides the terrain: windy cells, cover, slow ground (fords, mud), resource
// node areas, and the ground and decoration ids the art reads.
const CAMADAS_EXTRAS = ['ventosa', 'cobertura', 'lento', 'recurso', 'solo', 'decoracao'];

/**
 * Map from explicit layers, validated: integer sizes, layers of the right length, levels 0..3, bases inside open
 * ground. The border is always rock. Extra layers (CAMADAS_EXTRAS) and the resource nodes pass through.
 */
export function montarMapa({ largura, altura, bloqueado, relevo, nivel, bases, nos, ...extras }) {
  if (!Number.isInteger(largura) || !Number.isInteger(altura) || largura < 8 || altura < 8 || largura > 1024 || altura > 1024) {
    throw new Error(`mapa: tamanho inválido ${largura}x${altura}`);
  }
  const total = largura * altura;
  const camada = (dados, nome) => {
    if (dados === undefined) return new Uint8Array(total);
    if (dados.length !== total) throw new Error(`mapa: a camada ${nome} tem ${dados.length} células, esperava ${total}`);
    return Uint8Array.from(dados);
  };
  const mapa = { largura, altura, bloqueado: camada(bloqueado, 'bloqueado'), relevo: camada(relevo, 'relevo'), nivel: camada(nivel, 'nivel'), bases: [], nos: (nos ?? []).map(no => ({ x: no.x, y: no.y })) };
  for (const nome of CAMADAS_EXTRAS) mapa[nome] = camada(extras[nome], nome);
  for (let i = 0; i < total; i++) if (mapa.nivel[i] > MAX_NIVEL) throw new Error(`mapa: nível ${mapa.nivel[i]} acima de ${MAX_NIVEL}`);
  for (let x = 0; x < largura; x++) mapa.bloqueado[x] = mapa.bloqueado[(altura - 1) * largura + x] = 1;
  for (let y = 0; y < altura; y++) mapa.bloqueado[y * largura] = mapa.bloqueado[y * largura + largura - 1] = 1;
  for (const base of bases ?? []) {
    if (!Number.isInteger(base.x) || !Number.isInteger(base.y) || mapa.bloqueado[base.y * largura + base.x]) throw new Error(`mapa: base fora do chão aberto (${base.x}, ${base.y})`);
    mapa.bases.push({ x: base.x, y: base.y });
  }
  return mapa;
}

/** Names of the extra layers, in the order a saved state stores them. */
export const NOMES_CAMADAS_EXTRAS = Object.freeze(CAMADAS_EXTRAS.slice());

// ---------- map files (C6) ----------

// Layers of camadas.bin: one byte per cell per layer, row by row, in the header's `ordem`; value ranges.
const CAMADAS_C6 = Object.freeze({ solo: 255, altura: MAX_NIVEL, passagem: 2, cobertura: 2, recurso: 255, decoracao: 255 });
const CAMADAS_OBRIGATORIAS = ['altura', 'passagem'];
const PASSAGEM = Object.freeze({ LIVRE: 0, BLOQUEADA: 1, LENTA: 2 });
/** Kind name of a battery pile in entidades.json. */
export const TIPO_PILHA_ARQUIVO = 'pilha';

function decodificarCamadas(camadas) {
  if (camadas instanceof Uint8Array) return camadas;
  if (Array.isArray(camadas)) return Uint8Array.from(camadas);
  if (typeof camadas === 'string') {
    // base64, so a replay or a save can carry the layers inside JSON
    const binario = atob(camadas);
    const bytes = new Uint8Array(binario.length);
    for (let k = 0; k < binario.length; k++) bytes[k] = binario.charCodeAt(k);
    return bytes;
  }
  if (camadas instanceof ArrayBuffer) return new Uint8Array(camadas);
  throw new Error('mapa: camadas em formato desconhecido');
}

/** camadas.bin bytes as base64 text (for replays and saves, which are JSON). */
export function camadasEmTexto(bytes) {
  let binario = '';
  for (let k = 0; k < bytes.length; k += 0x8000) binario += String.fromCharCode(...bytes.subarray(k, k + 0x8000));
  return btoa(binario);
}

const ehCelula = (v, largura, altura) => Array.isArray(v) && v.length === 2 && Number.isInteger(v[0]) && Number.isInteger(v[1]) && v[0] >= 0 && v[1] >= 0 && v[0] < largura && v[1] < altura;

/**
 * Reads and validates a map in the C6 files against compiled data (compilarDados), and returns the layers for
 * montarMapa plus the starting entities. Throws with every problem found.
 * @param {{cabecalho: object, camadas: Uint8Array|number[]|string, entidades: object}} arquivos mapa.json, camadas.bin, entidades.json
 * @param {{tipos: readonly object[], indice: Map<string, number>, economia: object}} dados
 */
export function lerMapaDeArquivos({ cabecalho, camadas, entidades }, dados) {
  const erros = [];
  const falhar = () => {
    if (erros.length > 0) throw new Error(`mapa inválido:\n${erros.join('\n')}`);
  };
  if (!cabecalho || cabecalho.versao !== 1) erros.push(`mapa.json: versão ${cabecalho?.versao}, o leitor lê a 1`);
  const { largura, altura } = cabecalho ?? {};
  if (!Number.isInteger(largura) || !Number.isInteger(altura) || largura < 8 || altura < 8 || largura > 1024 || altura > 1024) erros.push(`mapa.json: tamanho inválido ${largura}x${altura}`);
  if (typeof cabecalho?.id !== 'string' || !/^[a-z0-9-]+$/.test(cabecalho.id)) erros.push('mapa.json: id inválido');
  const ordem = cabecalho?.camadas?.ordem;
  if (!Array.isArray(ordem)) erros.push('mapa.json: falta camadas.ordem');
  falhar();
  for (const nome of ordem) if (!(nome in CAMADAS_C6)) erros.push(`mapa.json: camada desconhecida "${nome}"`);
  for (const nome of CAMADAS_OBRIGATORIAS) if (!ordem.includes(nome)) erros.push(`mapa.json: falta a camada "${nome}"`);
  if (new Set(ordem).size !== ordem.length) erros.push('mapa.json: camada repetida');
  const total = largura * altura;
  const bytes = decodificarCamadas(camadas);
  if (bytes.length !== total * ordem.length) erros.push(`camadas.bin: ${bytes.length} bytes, esperava ${total * ordem.length} (${ordem.length} camadas de ${largura}x${altura})`);
  falhar();
  const camada = {};
  ordem.forEach((nome, k) => {
    camada[nome] = bytes.slice(k * total, (k + 1) * total);
  });
  const solos = cabecalho.solos ?? [];
  const decoracoes = cabecalho.decoracoes ?? [];
  const nos = entidades?.nos ?? [];
  if (!entidades || entidades.versao !== 1) erros.push(`entidades.json: versão ${entidades?.versao}, o leitor lê a 1`);
  if (!Array.isArray(nos)) erros.push('entidades.json: nos não é uma lista');
  const limites = { ...CAMADAS_C6, recurso: nos.length, decoracao: decoracoes.length, solo: Math.max(0, solos.length - 1) };
  for (const nome of ordem) {
    const dadosCamada = camada[nome];
    for (let c = 0; c < total; c++) {
      if (dadosCamada[c] > limites[nome]) {
        erros.push(`camadas.bin: ${nome} = ${dadosCamada[c]} na célula (${c % largura}, ${Math.trunc(c / largura)}), máximo ${limites[nome]}`);
        break;
      }
    }
  }
  const passagem = camada.passagem;
  const nivel = camada.altura;
  const aberta = c => passagem[c] !== PASSAGEM.BLOQUEADA && c % largura > 0 && c % largura < largura - 1 && c >= largura && c < total - largura;
  // ramps climb one level at a time; a bigger step between open neighbours needs a blocked cell between them
  for (let y = 1; y < altura - 1; y++) {
    for (let x = 1; x < largura - 1; x++) {
      const c = y * largura + x;
      if (!aberta(c)) continue;
      for (const v of [c + 1, c + largura]) {
        if (aberta(v) && Math.abs(nivel[c] - nivel[v]) > 1) {
          erros.push(`camadas.bin: degrau de ${Math.abs(nivel[c] - nivel[v])} níveis sem célula bloqueada entre (${x}, ${y}) e a vizinha`);
          y = altura;
          break;
        }
      }
    }
  }

  const jogadores = Array.isArray(cabecalho.jogadores) ? cabecalho.jogadores : [];
  if (jogadores.length === 0) erros.push('mapa.json: falta a lista de jogadores');
  jogadores.forEach((j, k) => {
    if (j.time !== k) erros.push(`mapa.json: jogador ${k} com time ${j.time} (o time é a posição na lista)`);
    if (!['religadores', 'desligados', 'faccao-3'].includes(j.faccao)) erros.push(`mapa.json: jogador ${k} com facção "${j.faccao}"`);
    if (!ehCelula(j.base, largura, altura) || !aberta(j.base[1] * largura + j.base[0])) erros.push(`mapa.json: base do jogador ${k} fora do chão aberto`);
  });
  nos.forEach((no, k) => {
    if (!ehCelula([no?.x, no?.y], largura, altura)) erros.push(`entidades.json: nó ${k} fora do mapa`);
  });

  const ventosa = new Uint8Array(total);
  for (const celula of entidades?.ventosas ?? []) {
    if (!ehCelula(celula, largura, altura)) {
      erros.push(`entidades.json: célula ventosa fora do mapa ${JSON.stringify(celula)}`);
      continue;
    }
    const c = celula[1] * largura + celula[0];
    if (!aberta(c)) erros.push(`entidades.json: célula ventosa bloqueada (${celula[0]}, ${celula[1]})`);
    else if (nivel[c] === 0) erros.push(`entidades.json: célula ventosa no nível 0 (${celula[0]}, ${celula[1]}); o vento fica no alto`);
    ventosa[c] = 1;
  }

  const ocupada = new Uint8Array(total);
  const etiquetas = new Set();
  const iniciais = [];
  (entidades?.entidades ?? []).forEach((e, k) => {
    const rotulo = `entidades.json[${k}${e?.etiqueta ? ` ${e.etiqueta}` : ''}]`;
    const ehPilha = e?.tipo === TIPO_PILHA_ARQUIVO;
    const tipo = dados.indice.get(ehPilha ? 'pilha' : e?.tipo);
    if (tipo === undefined) {
      erros.push(`${rotulo}: tipo "${e?.tipo}" não está nos dados`);
      return;
    }
    const t = dados.tipos[tipo];
    if (!Number.isInteger(e.dono) || e.dono < -1 || e.dono >= jogadores.length) erros.push(`${rotulo}: dono ${e.dono} (use -1 para neutro)`);
    if (ehPilha && e.dono !== -1) erros.push(`${rotulo}: pilha precisa ser neutra`);
    if (!Number.isInteger(e.x) || !Number.isInteger(e.y)) {
      erros.push(`${rotulo}: posição não inteira`);
      return;
    }
    const [pl, pa] = t.pegada;
    if (e.x < 1 || e.y < 1 || e.x + pl > largura - 1 || e.y + pa > altura - 1) {
      erros.push(`${rotulo}: fora do mapa`);
      return;
    }
    const temPegada = t.categoria !== CATEGORIA.UNIDADE;
    for (let y = e.y; y < e.y + pa; y++) {
      for (let x = e.x; x < e.x + pl; x++) {
        const c = y * largura + x;
        if (!aberta(c)) erros.push(`${rotulo}: célula (${x}, ${y}) bloqueada`);
        if (temPegada) {
          if (ocupada[c]) erros.push(`${rotulo}: célula (${x}, ${y}) já ocupada por outra construção`);
          ocupada[c] = 1;
        }
      }
    }
    if (e.etiqueta !== undefined) {
      if (typeof e.etiqueta !== 'string' || !/^[a-z0-9-]+$/.test(e.etiqueta)) erros.push(`${rotulo}: etiqueta inválida`);
      else if (etiquetas.has(e.etiqueta)) erros.push(`${rotulo}: etiqueta repetida`);
      etiquetas.add(e.etiqueta);
    }
    let carga = 0;
    let no = -1;
    if (ehPilha) {
      carga = e.carga ?? dados.economia.pilhaCarga;
      no = e.no;
      if (!Number.isInteger(carga) || carga < 1) erros.push(`${rotulo}: carga ${e.carga}`);
      if (!Number.isInteger(no) || no < 0 || no >= nos.length) erros.push(`${rotulo}: nó ${e.no} não existe`);
    } else if (e.carga !== undefined || e.no !== undefined) {
      erros.push(`${rotulo}: carga e nó são só de pilha`);
    }
    iniciais.push({ tipo, dono: e.dono, cx: e.x, cy: e.y, etiqueta: e.etiqueta ?? '', carga, no });
  });
  const dentro = (x, y) => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < largura && y < altura;
  for (const [nome, a] of Object.entries(entidades?.areas ?? {})) {
    if (!dentro(a.x, a.y) || !Number.isInteger(a.largura) || !Number.isInteger(a.altura) || a.largura < 1 || a.altura < 1 || !dentro(a.x + a.largura - 1, a.y + a.altura - 1)) erros.push(`entidades.json: área ${nome} fora do mapa`);
  }
  for (const [nome, p] of Object.entries(entidades?.pontos ?? {})) if (!ehCelula(p, largura, altura)) erros.push(`entidades.json: ponto ${nome} fora do mapa`);
  for (const [nome, rota] of Object.entries(entidades?.rotas ?? {})) {
    if (!Array.isArray(rota) || rota.length === 0 || !rota.every(p => ehCelula(p, largura, altura))) erros.push(`entidades.json: rota ${nome} com ponto fora do mapa`);
  }
  falhar();

  const bloqueado = new Uint8Array(total);
  const lento = new Uint8Array(total);
  const relevo = new Uint8Array(total);
  for (let c = 0; c < total; c++) {
    bloqueado[c] = passagem[c] === PASSAGEM.BLOQUEADA ? 1 : 0;
    lento[c] = passagem[c] === PASSAGEM.LENTA ? 1 : 0;
    relevo[c] = nivel[c] * 64 + 32;
  }
  return {
    camadas: {
      largura,
      altura,
      bloqueado,
      relevo,
      nivel,
      bases: jogadores.map(j => ({ x: j.base[0], y: j.base[1] })),
      nos: nos.map(no => ({ x: no.x, y: no.y })),
      ventosa,
      cobertura: camada.cobertura,
      lento,
      recurso: camada.recurso,
      solo: camada.solo,
      decoracao: camada.decoracao,
    },
    faccoes: jogadores.map(j => j.faccao),
    solos: solos.slice(),
    decoracoes: decoracoes.slice(),
    entidades: iniciais,
    nomesNos: nos.map(no => no.id),
    areas: entidades.areas ?? {},
    pontos: entidades.pontos ?? {},
    rotas: entidades.rotas ?? {},
  };
}

/** Nearest open cell to (cx, cy) by growing square rings, scanned in row order; -1 when none within 24 cells. */
export function celulaLivreMaisProxima(mapa, cx, cy) {
  const { largura, altura, bloqueado } = mapa;
  cx = Math.max(1, Math.min(largura - 2, cx));
  cy = Math.max(1, Math.min(altura - 2, cy));
  for (let r = 0; r < 24; r++) {
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if (x < 1 || y < 1 || x >= largura - 1 || y >= altura - 1) continue;
        if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== r) continue;
        if (!bloqueado[y * largura + x]) return y * largura + x;
      }
    }
  }
  return -1;
}
