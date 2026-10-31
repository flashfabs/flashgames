// Map format of the RTS (contract C6) and its conversion from the Tiled JSON source.
// Source: arte/mapas-fonte/<id>.tmj (tile layers solo, altura and decoracao; object layers entidades, nos, ventosas,
// areas, pontos and rotas) with the tileset terreno.tsj. Output: site/rts/dados/mapas/<id>/ with mapa.json (header and
// tables), camadas.bin (one byte per cell per layer, row by row, in the order of mapa.json camadas.ordem) and
// entidades.json (nodes, start entities, windy spots, areas, points and routes, all in cells).
// Everything here is plain integer work so the same source always yields the same bytes.

export const VERSAO_MAPA = 1;
export const PIXELS_POR_CELULA = 16;
export const ORDEM_CAMADAS = Object.freeze(['solo', 'altura', 'passagem', 'cobertura', 'recurso', 'decoracao']);
export const MAX_ALTURA = 3;

/** passagem codes */
export const PASSAGEM = Object.freeze({ LIVRE: 0, BLOQUEADA: 1, LENTA: 2 });
/** cobertura codes */
export const COBERTURA = Object.freeze({ NENHUMA: 0, MATO: 1, RUINA: 2 });

// Ground kinds: the render picks the tile by name, the motor reads passagem and cobertura from the layers.
export const SOLOS = Object.freeze([
  { nome: 'terra-batida', passagem: PASSAGEM.LIVRE, cobertura: COBERTURA.NENHUMA, cor: [150, 92, 62] },
  { nome: 'capim', passagem: PASSAGEM.LIVRE, cobertura: COBERTURA.NENHUMA, cor: [128, 132, 70] },
  { nome: 'capim-alto', passagem: PASSAGEM.LIVRE, cobertura: COBERTURA.MATO, cor: [96, 118, 52] },
  { nome: 'cascalho', passagem: PASSAGEM.LIVRE, cobertura: COBERTURA.NENHUMA, cor: [140, 132, 120] },
  { nome: 'asfalto-velho', passagem: PASSAGEM.LIVRE, cobertura: COBERTURA.NENHUMA, cor: [78, 76, 74] },
  { nome: 'entulho', passagem: PASSAGEM.LIVRE, cobertura: COBERTURA.RUINA, cor: [120, 104, 96] },
  { nome: 'lama', passagem: PASSAGEM.LENTA, cobertura: COBERTURA.NENHUMA, cor: [92, 66, 46] },
  { nome: 'agua-rasa', passagem: PASSAGEM.LENTA, cobertura: COBERTURA.NENHUMA, cor: [84, 132, 150] },
  { nome: 'agua-funda', passagem: PASSAGEM.BLOQUEADA, cobertura: COBERTURA.NENHUMA, cor: [40, 82, 120] },
  { nome: 'rocha', passagem: PASSAGEM.BLOQUEADA, cobertura: COBERTURA.NENHUMA, cor: [90, 70, 64] },
]);

// Props drawn on a cell; some block movement.
export const DECORACOES = Object.freeze([
  { nome: 'pedra', bloqueia: 0, cor: [110, 100, 96] },
  { nome: 'arvore-seca', bloqueia: 0, cor: [70, 56, 40] },
  { nome: 'carcaca-de-onibus', bloqueia: 1, cor: [150, 120, 40] },
  { nome: 'muro-em-ruina', bloqueia: 1, cor: [160, 150, 140] },
  { nome: 'poste-caido', bloqueia: 0, cor: [60, 60, 60] },
  { nome: 'pneus', bloqueia: 0, cor: [30, 30, 30] },
  { nome: 'ponte-de-concreto', bloqueia: 0, cor: [170, 168, 160] },
]);

// Tileset layout: solos first, then the four heights, then the props; each tile says which layer and code it is.
export function tilesDoTileset() {
  const tiles = [];
  SOLOS.forEach((solo, codigo) => tiles.push({ camada: 'solo', codigo, nome: solo.nome, cor: solo.cor }));
  for (let codigo = 0; codigo <= MAX_ALTURA; codigo++) {
    const v = 60 + codigo * 60;
    tiles.push({ camada: 'altura', codigo, nome: `altura-${codigo}`, cor: [v, v, v] });
  }
  DECORACOES.forEach((decoracao, i) => tiles.push({ camada: 'decoracao', codigo: i + 1, nome: decoracao.nome, cor: decoracao.cor }));
  return tiles;
}

const celula = px => Math.trunc(px / PIXELS_POR_CELULA);
const propriedades = objeto => Object.fromEntries((objeto.properties ?? []).map(p => [p.name, p.value]));

/**
 * Converts a Tiled map (parsed .tmj) and its tileset (parsed .tsj) into the C6 outputs.
 * @returns {{ mapa: object, camadas: Uint8Array, entidades: object }}
 */
export function converterTiled(tmj, tsj) {
  const { width: largura, height: altura } = tmj;
  if (tmj.orientation !== 'orthogonal' || tmj.infinite) throw new Error('mapa: só mapas ortogonais e finitos');
  if (tmj.tilewidth !== PIXELS_POR_CELULA || tmj.tileheight !== PIXELS_POR_CELULA) throw new Error('mapa: ladrilho de 16 px');
  const firstgid = tmj.tilesets[0].firstgid;
  const porGid = new Map();
  for (const tile of tsj.tiles) {
    const p = propriedades(tile);
    porGid.set(firstgid + tile.id, { camada: p.camada, codigo: p.codigo });
  }
  const camadaTiled = nome => {
    const camada = tmj.layers.find(l => l.name === nome && l.type === 'tilelayer');
    if (!camada) throw new Error(`mapa: falta a camada ${nome}`);
    if (camada.data.length !== largura * altura) throw new Error(`mapa: a camada ${nome} tem ${camada.data.length} células`);
    return camada.data;
  };
  const objetos = nome => tmj.layers.find(l => l.name === nome && l.type === 'objectgroup')?.objects ?? [];
  const total = largura * altura;
  const camadas = new Uint8Array(total * ORDEM_CAMADAS.length);
  const fatia = nome => camadas.subarray(ORDEM_CAMADAS.indexOf(nome) * total, (ORDEM_CAMADAS.indexOf(nome) + 1) * total);
  const [solo, alturaCamada, passagem, cobertura, recurso, decoracao] = ORDEM_CAMADAS.map(fatia);

  const decodificar = (nome, vazioPermitido) => (gid, i) => {
    if (gid === 0 && vazioPermitido) return 0;
    const tile = porGid.get(gid);
    if (!tile || tile.camada !== nome) throw new Error(`mapa: célula ${i % largura},${Math.trunc(i / largura)} da camada ${nome} com ladrilho ${gid} de outra camada`);
    return tile.codigo;
  };
  camadaTiled('solo').forEach((gid, i) => (solo[i] = decodificar('solo', false)(gid, i)));
  camadaTiled('altura').forEach((gid, i) => (alturaCamada[i] = decodificar('altura', false)(gid, i)));
  camadaTiled('decoracao').forEach((gid, i) => (decoracao[i] = decodificar('decoracao', true)(gid, i)));
  for (let i = 0; i < total; i++) {
    const s = SOLOS[solo[i]];
    passagem[i] = decoracao[i] && DECORACOES[decoracao[i] - 1].bloqueia ? PASSAGEM.BLOQUEADA : s.passagem;
    cobertura[i] = s.cobertura;
  }

  const nos = objetos('nos').map(o => ({ id: o.name, x: celula(o.x), y: celula(o.y) }));
  const indiceNo = new Map(nos.map((no, i) => [no.id, i]));
  const entidades = objetos('entidades').map(o => {
    const p = propriedades(o);
    const entidade = { tipo: o.type, dono: p.dono ?? -1, x: celula(o.x), y: celula(o.y) };
    if (p.etiqueta) entidade.etiqueta = p.etiqueta;
    if (o.type === 'pilha') {
      entidade.carga = p.carga;
      entidade.no = p.no;
    }
    return entidade;
  });
  // resource area: Chebyshev distance up to 3 cells around each pile, marked with the node index plus one
  for (const e of entidades) {
    if (e.tipo !== 'pilha') continue;
    const valor = indiceNo.get(e.no) + 1;
    for (let y = Math.max(0, e.y - 3); y <= Math.min(altura - 1, e.y + 3); y++) {
      for (let x = Math.max(0, e.x - 3); x <= Math.min(largura - 1, e.x + 3); x++) if (!recurso[y * largura + x]) recurso[y * largura + x] = valor;
    }
  }
  const retangulos = nome => Object.fromEntries(objetos(nome).map(o => [o.name, { x: celula(o.x), y: celula(o.y), largura: celula(o.width), altura: celula(o.height) }]));
  const pontos = Object.fromEntries(objetos('pontos').map(o => [o.name, [celula(o.x), celula(o.y)]]));
  const rotas = Object.fromEntries(objetos('rotas').map(o => [o.name, o.polyline.map(p => [celula(o.x + p.x), celula(o.y + p.y)])]));
  const ventosas = objetos('ventosas').map(o => [celula(o.x), celula(o.y)]);

  const p = propriedades(tmj);
  const mapa = {
    versao: VERSAO_MAPA,
    id: p.id,
    largura,
    altura,
    simetria: p.simetria ?? 'nenhuma',
    camadas: { arquivo: 'camadas.bin', ordem: [...ORDEM_CAMADAS] },
    solos: SOLOS.map(({ nome, passagem: ps, cobertura: c }) => ({ nome, passagem: ps, cobertura: c })),
    decoracoes: DECORACOES.map(({ nome, bloqueia }) => ({ nome, bloqueia })),
    jogadores: JSON.parse(p.jogadores),
  };
  return { mapa, camadas, entidades: { versao: VERSAO_MAPA, nos, entidades, ventosas, areas: retangulos('areas'), pontos, rotas } };
}

/** Reads one layer of camadas.bin by name. */
export function camada(mapa, camadas, nome) {
  const total = mapa.largura * mapa.altura;
  const i = mapa.camadas.ordem.indexOf(nome);
  return camadas.subarray(i * total, (i + 1) * total);
}

/** Cells blocked for ground units, with entity footprints left out (the motor places those). */
export function bloqueio(mapa, camadas) {
  const passagem = camada(mapa, camadas, 'passagem');
  return Uint8Array.from(passagem, v => (v === PASSAGEM.BLOQUEADA ? 1 : 0));
}

/** Flood fill over open cells with 4-neighbour steps; returns the distance in steps, -1 where unreachable. */
export function distancias(mapa, bloqueado, origem) {
  const { largura, altura } = mapa;
  const dist = new Int32Array(largura * altura).fill(-1);
  const fila = new Int32Array(largura * altura);
  let inicio = 0;
  let fim = 0;
  const primeira = origem[1] * largura + origem[0];
  if (bloqueado[primeira]) return dist;
  dist[primeira] = 0;
  fila[fim++] = primeira;
  while (inicio < fim) {
    const u = fila[inicio++];
    const ux = u % largura;
    const uy = Math.trunc(u / largura);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const vx = ux + dx;
      const vy = uy + dy;
      if (vx < 0 || vy < 0 || vx >= largura || vy >= altura) continue;
      const v = vy * largura + vx;
      if (bloqueado[v] || dist[v] >= 0) continue;
      dist[v] = dist[u] + 1;
      fila[fim++] = v;
    }
  }
  return dist;
}

/**
 * Checks a converted map against the rules every consumer relies on; returns the list of problems (empty when valid).
 * @param {{ mapa: object, camadas: Uint8Array, entidades: object }} convertido
 * @param {{ predios: object[], unidades: object[] }} dados C5 kinds, for footprints and names
 */
export function validarMapa({ mapa, camadas, entidades }, dados) {
  const erros = [];
  const { largura, altura } = mapa;
  const total = largura * altura;
  if (camadas.length !== total * mapa.camadas.ordem.length) erros.push(`camadas.bin com ${camadas.length} bytes`);
  const solo = camada(mapa, camadas, 'solo');
  const alt = camada(mapa, camadas, 'altura');
  const passagem = camada(mapa, camadas, 'passagem');
  const decoracao = camada(mapa, camadas, 'decoracao');
  const recurso = camada(mapa, camadas, 'recurso');
  for (let i = 0; i < total; i++) {
    if (solo[i] >= mapa.solos.length) erros.push(`solo ${solo[i]} desconhecido`);
    if (alt[i] > MAX_ALTURA) erros.push(`altura ${alt[i]}`);
    if (decoracao[i] > mapa.decoracoes.length) erros.push(`decoração ${decoracao[i]} desconhecida`);
    if (recurso[i] > entidades.nos.length) erros.push(`recurso ${recurso[i]} sem nó`);
  }
  const bloqueado = bloqueio(mapa, camadas);
  for (let x = 0; x < largura; x++) if (!bloqueado[x] || !bloqueado[(altura - 1) * largura + x]) erros.push(`borda aberta na coluna ${x}`);
  for (let y = 0; y < altura; y++) if (!bloqueado[y * largura] || !bloqueado[y * largura + largura - 1]) erros.push(`borda aberta na linha ${y}`);
  // a slope between two open neighbours climbs one level at most; anything steeper must be a blocked cliff cell
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const i = y * largura + x;
      if (bloqueado[i]) continue;
      for (const j of [x + 1 < largura ? i + 1 : -1, y + 1 < altura ? i + largura : -1]) {
        if (j >= 0 && !bloqueado[j] && Math.abs(alt[i] - alt[j]) > 1) erros.push(`degrau de ${Math.abs(alt[i] - alt[j])} níveis sem penhasco em ${x},${y}`);
      }
    }
  }
  if (mapa.simetria === 'rotacao-180') {
    for (const nome of ['solo', 'altura', 'passagem', 'cobertura', 'decoracao']) {
      const c = camada(mapa, camadas, nome);
      for (let i = 0; i < total; i++) if (c[i] !== c[total - 1 - i]) {
        erros.push(`camada ${nome} sem simetria em ${i % largura},${Math.trunc(i / largura)}`);
        break;
      }
    }
  }

  const tipos = new Map([...dados.predios.map(p => [p.nome, { pegada: p.pegada, predio: true }]), ...dados.unidades.map(u => [u.nome, { pegada: [1, 1], predio: false }])]);
  const ocupado = new Uint8Array(total);
  const nomesNos = new Set(entidades.nos.map(n => n.id));
  for (const e of entidades.entidades) {
    const tipo = e.tipo === 'pilha' ? { pegada: [1, 1], predio: true } : tipos.get(e.tipo);
    if (!tipo) {
      erros.push(`entidade de tipo ${e.tipo} desconhecido`);
      continue;
    }
    if (e.tipo === 'pilha' && (!nomesNos.has(e.no) || !(e.carga > 0))) erros.push(`pilha em ${e.x},${e.y} sem nó ou carga`);
    const [w, h] = tipo.pegada;
    for (let y = e.y; y < e.y + h; y++) {
      for (let x = e.x; x < e.x + w; x++) {
        const i = y * largura + x;
        if (x < 0 || y < 0 || x >= largura || y >= altura || bloqueado[i]) erros.push(`${e.tipo} em ${e.x},${e.y} sobre célula bloqueada ${x},${y}`);
        else if (ocupado[i] && tipo.predio) erros.push(`${e.tipo} em ${e.x},${e.y} sobrepõe outra entidade`);
        else if (alt[i] !== alt[e.y * largura + e.x]) erros.push(`${e.tipo} em ${e.x},${e.y} sobre níveis diferentes`);
        if (tipo.predio && x >= 0 && y >= 0 && x < largura && y < altura) ocupado[i] = 1;
      }
    }
  }
  for (const [x, y] of entidades.ventosas) {
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const i = (y + dy) * largura + x + dx;
      if (bloqueado[i] || alt[i] < 1) erros.push(`ventosa em ${x},${y} fora do alto ou bloqueada`);
    }
  }

  // reachability from the first player's base: every node, entity, area centre, point and route waypoint
  const base = mapa.jogadores[0].base;
  const alcance = distancias(mapa, bloqueado, base);
  const alcancavel = (x, y, raio = 1) => {
    for (let dy = -raio; dy <= raio; dy++) for (let dx = -raio; dx <= raio; dx++) {
      const cx = x + dx;
      const cy = y + dy;
      if (cx >= 0 && cy >= 0 && cx < largura && cy < altura && alcance[cy * largura + cx] >= 0) return true;
    }
    return false;
  };
  for (const j of mapa.jogadores) if (!alcancavel(j.base[0], j.base[1], 0)) erros.push(`base do time ${j.time} inalcançável`);
  for (const e of entidades.entidades) if (!alcancavel(e.x, e.y)) erros.push(`${e.tipo} em ${e.x},${e.y} inalcançável`);
  for (const [nome, a] of Object.entries(entidades.areas)) if (!alcancavel(a.x + (a.largura >> 1), a.y + (a.altura >> 1), 2)) erros.push(`área ${nome} inalcançável`);
  for (const [nome, [x, y]] of Object.entries(entidades.pontos)) if (!alcancavel(x, y, 0)) erros.push(`ponto ${nome} inalcançável`);
  for (const [nome, pontos] of Object.entries(entidades.rotas)) for (const [x, y] of pontos) if (!alcancavel(x, y, 0)) erros.push(`rota ${nome} passa por ${x},${y}, inalcançável`);
  return erros;
}
