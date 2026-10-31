// Diagnoses the unit that waits longest in the 20 simultaneous orders of one seed: runs the scenario once to find it,
// then again watching it every 30 ticks without progress (position, slot, field distance, stuck counters) and the
// cells around it. Long: run it on the RTX 4090 PC, ferramentas/rts/rtx-node.sh -- ferramentas/rts/espiar-movimento.mjs <seed>
import { ordensSimultaneas } from '../../testes/rts-sim-cenarios.mjs';

const semente = Number(process.argv[2] ?? 5);
const primeira = ordensSimultaneas({ grupos: 20, porGrupo: 100, semente });
console.log(JSON.stringify({ semente, maiorParado: primeira.maiorParado, quemParado: primeira.quemParado }));
const registro = [];
const espiar = {
  unidade: primeira.quemParado,
  registro,
  aoParar(sim, i, parado) {
    if (parado !== 120) return;
    const { largura, bloqueado } = sim.grade;
    const cx = sim.x[i] >> 10;
    const cy = sim.y[i] >> 10;
    const linhas = [];
    for (let y = cy - 4; y <= cy + 4; y++) {
      let linha = '';
      for (let x = cx - 6; x <= cx + 6; x++) {
        let vizinhos = 0;
        for (let j = 0; j < sim.capacidade; j++) if (sim.ativo[j] && sim.x[j] >> 10 === x && sim.y[j] >> 10 === y) vizinhos++;
        linha += x === cx && y === cy ? '@' : bloqueado[y * largura + x] ? '#' : sim.caminhos.fresta[y * largura + x] ? 'f' : vizinhos > 0 ? String(Math.min(9, vizinhos)) : '.';
      }
      linhas.push(linha);
    }
    registro.push({ arredores: linhas });
  },
};
ordensSimultaneas({ grupos: 20, porGrupo: 100, semente, espiar });
for (const linha of registro) console.log(JSON.stringify(linha));
