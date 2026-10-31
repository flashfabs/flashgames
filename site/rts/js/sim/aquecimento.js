// Warm-up of the engine's code before the first match of a page: a small, different match (two prototype armies on a
// seeded map, one crowding across it and the other attack-moving into it) runs a few hundred ticks and is thrown away,
// so the JavaScript engine has seen the movement, stuck, cut-in and combat paths before the player's match needs them.
// Without it, the first time each path runs it is compiled again inside a tick: one-off ticks of 20 to 35 ms on the PC
// at the first group orders and at the first unit that cuts into its group's stream. It touches no other simulation.
import { criarSimulacao, passo, agendarComando, REGRAS_LIVRES } from './simulacao.js';
import { TIPO_COMANDO, FP, criarComando, idDe } from './contratos.js';

const PASSOS = 360;

/** Runs the warm-up match once; about a tenth of a second on a laptop. */
export function aquecerMotor() {
  const sim = criarSimulacao({ semente: 3, largura: 96, altura: 96, unidadesPorTime: 150, regras: REGRAS_LIVRES });
  const ids = time => {
    const lista = [];
    for (let i = 0; i < sim.capacidade; i++) if (sim.ativo[i] && sim.time[i] === time) lista.push(idDe(i, sim.geracao[i]));
    return lista;
  };
  const [base0, base1] = sim.mapa.bases;
  const centro = celula => celula * FP + (FP >> 1);
  agendarComando(sim, criarComando({ tick: 10, jogador: 0, seq: 0, tipo: TIPO_COMANDO.MOVER, unidades: ids(0), x: centro(base1.x), y: centro(base1.y) }));
  agendarComando(sim, criarComando({ tick: 10, jogador: 1, seq: 0, tipo: TIPO_COMANDO.ATACAR_MOVENDO, unidades: ids(1), x: centro((base0.x + base1.x) >> 1), y: centro((base0.y + base1.y) >> 1) }));
  for (let k = 0; k < PASSOS; k++) passo(sim);
}
