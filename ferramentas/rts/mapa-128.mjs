// A 128 x 96 stand-in for the first mission's map, in the C6 files, for measuring the engine at that size before the
// design front's map exists: the design sandbox (96 x 96, river with a bridge and fords, plateaus with ramps, ruins,
// six nodes) on the west, and 32 more columns on the east with a rock ridge crossed by a narrow canyon and a wide gap,
// the river running on with a ford, and a two-level hill with a neutral structure, windy cells and a seventh node.
// Not a design: only the shape and the size of what the engine has to carry.
import { readFileSync } from 'node:fs';

const LARGURA = 128;
const ALTURA = 96;
const PASSAGEM = { LIVRE: 0, BLOQUEADA: 1, LENTA: 2 };

const lerJson = url => JSON.parse(readFileSync(url, 'utf8'));

/** { cabecalho, camadas, entidades } of the stand-in, as lerMapaDeArquivos takes them. */
export function mapa128() {
  const pasta = new URL('../../site/rts/dados/mapas/caixa-de-areia/', import.meta.url);
  const base = lerJson(new URL('mapa.json', pasta));
  const bytesBase = new Uint8Array(readFileSync(new URL(base.camadas.arquivo, pasta)));
  const entidadesBase = lerJson(new URL('entidades.json', pasta));
  const { largura: lb, altura: ab, camadas: { ordem } } = base;
  const total = LARGURA * ALTURA;
  const bytes = new Uint8Array(total * ordem.length);
  const camada = nome => bytes.subarray(ordem.indexOf(nome) * total, (ordem.indexOf(nome) + 1) * total);
  const camadaBase = nome => bytesBase.subarray(ordem.indexOf(nome) * lb * ab, (ordem.indexOf(nome) + 1) * lb * ab);
  for (const nome of ordem) {
    const destino = camada(nome);
    const origem = camadaBase(nome);
    for (let y = 0; y < ab; y++) {
      for (let x = 0; x < lb; x++) destino[y * LARGURA + x] = origem[y * lb + x];
      // the sandbox's east border opens onto the new columns
      if (y > 0 && y < ab - 1) destino[y * LARGURA + lb - 1] = origem[y * lb + lb - 2];
    }
  }
  const passagem = camada('passagem');
  const altura = camada('altura');
  const recurso = camada('recurso');
  const rocha = base.solos.findIndex(s => s.nome === 'rocha');
  const lama = base.solos.findIndex(s => s.nome === 'agua-rasa');
  const solo = camada('solo');
  const pintar = (x, y, p, s = -1) => {
    passagem[y * LARGURA + x] = p;
    if (s >= 0) solo[y * LARGURA + x] = s;
  };
  for (let y = 0; y < ALTURA; y++) {
    for (let x = lb; x < LARGURA; x++) {
      const borda = y === 0 || y === ALTURA - 1 || x === LARGURA - 1;
      pintar(x, y, borda ? PASSAGEM.BLOQUEADA : PASSAGEM.LIVRE, borda ? rocha : 0);
      // the river goes on east at the sandbox's rows, with a ford
      const rio = y >= 46 && y <= 49;
      if (rio && !borda) pintar(x, y, x >= 110 && x <= 114 ? PASSAGEM.LENTA : PASSAGEM.BLOQUEADA, x >= 110 && x <= 114 ? lama : rocha);
      // the ridge: rock at x 100..102, crossed by a 2-cell canyon (y 30..31) and a 12-cell gap (y 66..77)
      const canion = y === 30 || y === 31;
      const brecha = y >= 66 && y <= 77;
      if (x >= 100 && x <= 102 && !borda && !rio && !canion && !brecha) pintar(x, y, PASSAGEM.BLOQUEADA, rocha);
    }
  }
  // the hill north of the river: level 1 on x 108..124, y 20..42, level 2 on its 6-cell-inset top
  for (let y = 20; y <= 42; y++) {
    for (let x = 108; x <= 124; x++) {
      altura[y * LARGURA + x] = x >= 112 && x <= 120 && y >= 26 && y <= 36 ? 2 : 1;
    }
  }
  const no = { id: 'morro-leste', x: 116, y: 82 };
  const indiceNo = entidadesBase.nos.length + 1;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) recurso[(no.y + dy) * LARGURA + no.x + dx] = indiceNo;
  const pilhas = [[-1, 0], [1, 0], [0, -1]].map(([dx, dy]) => ({ tipo: 'pilha', dono: -1, x: no.x + dx, y: no.y + dy, carga: 3000, no: indiceNo - 1 }));
  return {
    cabecalho: { ...base, id: 'carga-128', largura: LARGURA, altura: ALTURA, simetria: 'nenhuma' },
    camadas: bytes,
    entidades: {
      ...entidadesBase,
      nos: [...entidadesBase.nos, no],
      entidades: [...entidadesBase.entidades, ...pilhas, { tipo: 'torre-antiga', dono: -1, x: 116, y: 31, etiqueta: 'torre-do-morro' }],
      ventosas: [...entidadesBase.ventosas, [114, 28], [115, 28], [118, 34]],
      areas: { ...entidadesBase.areas, morro: { x: 108, y: 20, largura: 17, altura: 23 } },
      pontos: { ...entidadesBase.pontos, subestacao: [116, 31] },
      rotas: { ...entidadesBase.rotas, 'rota-canion': [[81, 31], [101, 30], [112, 30], [116, 34]] },
    },
  };
}
