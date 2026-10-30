// Movement scenarios shared by the RTS simulation tests and by ferramentas/rts/medir-movimento.mjs: a 2-cell bridge
// over a river, and many simultaneous group orders across the seeded map. Each returns its measurements.
import { criarSimulacao, passo, agendarComando, REGRAS_LIVRES } from '../site/rts/js/sim/simulacao.js';
import { TIPO_COMANDO, FP, criarComando, idDe } from '../site/rts/js/sim/contratos.js';

const TANQUE = 1;

/** Map with a rock river at columns 38..41 crossed by a bridge two cells wide at rows 19 and 20. */
export function mapaDaPonte() {
  const largura = 80;
  const altura = 40;
  const bloqueado = new Uint8Array(largura * altura);
  for (let y = 0; y < altura; y++) {
    if (y === 19 || y === 20) continue;
    for (let x = 38; x <= 41; x++) bloqueado[y * largura + x] = 1;
  }
  return { largura, altura, bloqueado, bases: [{ x: 10, y: 20 }] };
}

const id = (sim, i) => idDe(i, sim.geracao[i]);

// State of one unit, for diagnosing a stuck one.
function retratoDaUnidade(sim, i, parado, campo) {
  const ord = sim.ordens;
  return { tick: sim.tick, parado, x: +(sim.x[i] / 1024).toFixed(2), y: +(sim.y[i] / 1024).toFixed(2), meta: [+(ord.metaX[i] / 1024).toFixed(1), +(ord.metaY[i] / 1024).toFixed(1)], campo, limiar: ord.limiar[i], fase: sim.fase[i], visada: sim.visada[i], semProgresso: sim.semProgresso[i], desvioAte: sim.desvioAte[i] };
}

// Watches the units of the scenario every tick: the longest run of ticks a unit still on its way spent without
// progress, either along its order's flow field (a third of a cell) or straight towards its slot (a quarter cell), and
// the tick by which every unit had arrived. Detours around rock count as progress; jams and jitter do not.
function vigiar(sim, slots, limite, espiar = null) {
  const melhor = new Float64Array(sim.capacidade).fill(Infinity);
  const melhorCampo = new Float64Array(sim.capacidade).fill(Infinity);
  const parado = new Int32Array(sim.capacidade);
  const { largura } = sim.mapa;
  let maiorParado = 0;
  let quemParado = -1;
  let chegada = -1;
  for (let k = 0; k < limite; k++) {
    passo(sim);
    let todas = true;
    for (const i of slots) {
      if (!sim.ativo[i] || sim.parada[i]) {
        // arrived (or gone); if pushed off its slot it walks back and is watched afresh
        melhor[i] = Infinity;
        melhorCampo[i] = Infinity;
        parado[i] = 0;
        continue;
      }
      todas = false;
      const dx = sim.ordens.metaX[i] - sim.x[i];
      const dy = sim.ordens.metaY[i] - sim.y[i];
      const d = Math.sqrt(dx * dx + dy * dy);
      const e = sim.ordens.campo[sim.ordens.ordem[i]];
      const campo = sim.caminhos.pronto[e] ? sim.caminhos.dist[e][(sim.y[i] >> 10) * largura + (sim.x[i] >> 10)] : Infinity;
      let avancou = false;
      if (d <= melhor[i] - 256) {
        melhor[i] = d;
        avancou = true;
      }
      if (campo <= melhorCampo[i] - 3) {
        melhorCampo[i] = campo;
        avancou = true;
      }
      if (avancou) {
        parado[i] = 0;
        continue;
      }
      parado[i]++;
      if (espiar && i === espiar.unidade && parado[i] % 30 === 0) {
        espiar.registro.push(retratoDaUnidade(sim, i, parado[i], campo));
        espiar.aoParar?.(sim, i, parado[i]);
      }
      if (parado[i] > maiorParado) {
        maiorParado = parado[i];
        quemParado = i;
      }
    }
    if (todas && sim.tick > 2) {
      chegada = sim.tick;
      break;
    }
  }
  let longe = 0;
  for (const i of slots) {
    const dx = (sim.ordens.metaX[i] - sim.x[i]) / FP;
    const dy = (sim.ordens.metaY[i] - sim.y[i]) / FP;
    longe = Math.max(longe, Math.hypot(dx, dy));
  }
  const pendentes = slots.filter(i => sim.ativo[i] && !sim.parada[i]);
  // sim is kept for diagnosis; non-enumerable so printing a result stays short
  return Object.defineProperty({ chegada, maiorParado, quemParado, maisLongeDaVaga: +longe.toFixed(2), pendentes: pendentes.length }, 'sim', { value: sim });
}

/** n tanks in a block on the left bank ordered to the right bank; returns ticks until all arrived. */
export function atravessarPonte(n) {
  const unidades = [];
  for (let k = 0; k < n; k++) unidades.push({ tipo: TANQUE, time: 0, x: (12 + (k % 5)) * FP + 512, y: (18 + Math.trunc(k / 5)) * FP + 512 });
  const sim = criarSimulacao({ mapa: mapaDaPonte(), unidades, regras: REGRAS_LIVRES });
  const slots = unidades.map((_, i) => i);
  agendarComando(sim, criarComando({ tick: 1, jogador: 0, seq: 0, tipo: TIPO_COMANDO.MOVER, unidades: slots.map(i => id(sim, i)), x: 66 * FP, y: 20 * FP }));
  const resultado = vigiar(sim, slots, 6000);
  const naMargemDireita = slots.filter(i => sim.x[i] >> 10 > 41).length;
  return { ...resultado, naMargemDireita };
}

/**
 * 2,000 units of one team (no enemy, so nobody stops to shoot) split into `grupos` groups ordered on the same tick to
 * spots all over the seeded map.
 */
export function ordensSimultaneas({ grupos = 20, porGrupo = 100, semente = 7, limite = 9000, espiar = null } = {}) {
  const base = criarSimulacao({ semente, unidadesPorTime: 1, regras: REGRAS_LIVRES });
  const { mapa } = base;
  // starting spots and destinations: open cells on a coarse lattice, picked in a fixed order
  const abertas = [];
  for (let y = 16; y < mapa.altura - 16; y += 16) for (let x = 16; x < mapa.largura - 16; x += 16) if (!mapa.bloqueado[y * mapa.largura + x]) abertas.push([x, y]);
  const unidades = [];
  for (let g = 0; g < grupos; g++) {
    const [ox, oy] = abertas[(g * 7) % abertas.length];
    for (let k = 0; k < porGrupo; k++) {
      const u = { tipo: k % 10 < 7 ? 0 : 1, time: 0, x: ox * FP + ((k % 10) - 5) * 700, y: oy * FP + (Math.trunc(k / 10) - 5) * 700, grupo: g };
      // keep only units that start on open ground
      if (!mapa.bloqueado[(u.y >> 10) * mapa.largura + (u.x >> 10)]) unidades.push(u);
    }
  }
  const sim = criarSimulacao({ mapa: { largura: mapa.largura, altura: mapa.altura, bloqueado: mapa.bloqueado, nivel: mapa.nivel, bases: mapa.bases }, unidades, regras: REGRAS_LIVRES });
  const slots = unidades.map((_, i) => i);
  for (let g = 0; g < grupos; g++) {
    const membros = slots.filter(i => unidades[i].grupo === g);
    const [dx, dy] = abertas[(g * 11 + 5) % abertas.length];
    agendarComando(sim, criarComando({ tick: 1, jogador: 0, seq: g, tipo: TIPO_COMANDO.MOVER, unidades: membros.map(i => id(sim, i)), x: dx * FP + 512, y: dy * FP + 512 }));
  }
  return { unidades: unidades.length, ...vigiar(sim, slots, limite, espiar) };
}
