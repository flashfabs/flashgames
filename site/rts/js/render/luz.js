// Lighting scenes of a mission (the LUZ event): day, dusk and night as a tint over the lit art, the sun's height for
// the terrain's shading and the shadows' length, and how strongly the valley's lights read. A scene change fades over
// a few seconds; when the evening comes, the lights switch on one by one, outwards from where it started.

const GRAUS = Math.PI / 180;
const TRANSICAO_MS = 8000;
// how fast the switching-on spreads, in cells per second
const VELOCIDADE_ACENDER = 9;

/** The scenes the renderer knows; a mission's scene names map onto them by meaning. */
export const CENAS = Object.freeze({
  dia: { tinta: [1, 1, 1], elevacaoSol: null, luzes: 0 },
  entardecer: { tinta: [1.0, 0.74, 0.56], elevacaoSol: 16, luzes: 0.85 },
  noite: { tinta: [0.4, 0.46, 0.64], elevacaoSol: 34, luzes: 1 },
});

/** Scene a mission's scene name stands for: dusk, night or day, by its words; unknown names stay as day. */
export function cenaDoNome(nome) {
  if (/entardecer|tarde|por-do-sol|crepusculo|poente/.test(nome)) return 'entardecer';
  if (/noite|madrugada|escuro/.test(nome)) return 'noite';
  return 'dia';
}

const suave = t => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/**
 * @param {ReturnType<typeof import('./projecao.js').criarProjecao>} projecao
 */
export function criarLuz(projecao) {
  // the scene faded from, the scene faded to, when the fade began, where the lights start switching on
  let de = CENAS.dia;
  let para = CENAS.dia;
  let inicio = -Infinity;
  const origem = { x: 0, y: 0, ms: -Infinity };
  /** @type {string[]} mission scene names, in the order LUZ counts them */
  let nomes = [];
  const [sx, sy, sz] = projecao.sol;
  const azimute = Math.atan2(sy, sx);
  const elevacaoDia = Math.asin(sz);
  // current values, written by atualizar(): tint, lights strength, sun vector
  const estado = { tinta: new Float32Array([1, 1, 1]), luzes: 0, sol: new Float32Array([sx, sy, sz]), agora: 0 };

  function elevacao(cena) {
    return cena.elevacaoSol === null ? elevacaoDia : cena.elevacaoSol * GRAUS;
  }

  return {
    estado,

    /** Names of the mission's scenes (MapaEstatico.cenasLuz), in the order the LUZ event counts them. */
    definirNomes(lista) {
      nomes = lista ?? [];
    },

    /**
     * Fades to a scene: by the LUZ event's index into the mission's names (without names, 0 is dusk and 1 night),
     * or by the renderer's own scene name. (x, y) is where the lights start switching on, in cells.
     */
    definirCena(cena, agora, x, y) {
      const nome = typeof cena === 'number' ? (nomes.length ? cenaDoNome(nomes[cena] ?? '') : ['entardecer', 'noite'][cena] ?? 'dia') : cena;
      const alvo = CENAS[nome] ?? CENAS.dia;
      if (alvo === para) return;
      de = atual(agora);
      para = alvo;
      inicio = agora;
      if (alvo.luzes > 0 && de.luzes === 0) {
        origem.x = x;
        origem.y = y;
        origem.ms = agora + TRANSICAO_MS * 0.35;
      }
    },

    /** Recomputes the current tint, sun and lights strength for this frame. */
    atualizar(agora) {
      const t = suave((agora - inicio) / TRANSICAO_MS);
      for (let i = 0; i < 3; i++) estado.tinta[i] = de.tinta[i] + (para.tinta[i] - de.tinta[i]) * t;
      estado.luzes = de.luzes + (para.luzes - de.luzes) * t;
      const e = elevacao(de) + (elevacao(para) - elevacao(de)) * t;
      estado.sol[0] = Math.cos(e) * Math.cos(azimute);
      estado.sol[1] = Math.cos(e) * Math.sin(azimute);
      estado.sol[2] = Math.sin(e);
      estado.agora = agora;
      return estado;
    },

    /**
     * How lit a light at (x, y) cells is now, 0..1: the scene's lights strength, reached a moment after the
     * switching-on front passes it; `semente` (0..1) staggers lights at the same distance.
     */
    acesa(x, y, semente) {
      if (estado.luzes <= 0) return 0;
      const atraso = (Math.hypot(x - origem.x, y - origem.y) / VELOCIDADE_ACENDER) * 1000 + semente * 600;
      return estado.luzes * suave((estado.agora - origem.ms - atraso) / 350);
    },
  };

  // A scene object holding the values of the fade in progress, so a new fade starts from where the last one was.
  function atual(agora) {
    const t = suave((agora - inicio) / TRANSICAO_MS);
    return {
      tinta: de.tinta.map((v, i) => v + (para.tinta[i] - v) * t),
      elevacaoSol: (elevacao(de) + (elevacao(para) - elevacao(de)) * t) / GRAUS,
      luzes: de.luzes + (para.luzes - de.luzes) * t,
    };
  }
}
