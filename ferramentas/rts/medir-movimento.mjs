// Movement acceptance over several seeds: the 2-cell bridge, and 20 simultaneous group orders on each seeded map,
// printing for each seed the longest a unit went without progress and when everyone arrived. Long: run it on the
// RTX 4090 PC, ferramentas/rts/rtx-node.sh -- ferramentas/rts/medir-movimento.mjs [seeds...]
import { atravessarPonte, ordensSimultaneas } from '../../testes/rts-sim-cenarios.mjs';
import { PASSOS_POR_SEGUNDO } from '../../site/rts/js/sim/contratos.js';

const sementes = process.argv.slice(2).map(Number).filter(Number.isInteger);
const lista = sementes.length > 0 ? sementes : [7, 11, 5, 99, 42, 23, 1, 2, 3, 13, 17, 31, 64, 77];
const sozinho = atravessarPonte(1);
const grupo = atravessarPonte(20);
console.log(JSON.stringify({ ponte: { sozinho: sozinho.chegada, grupo: grupo.chegada, limite: Math.floor(1.5 * sozinho.chegada) + 8 * PASSOS_POR_SEGUNDO } }));
for (const semente of lista) {
  const inicio = Date.now();
  const r = ordensSimultaneas({ grupos: 20, porGrupo: 100, semente });
  console.log(JSON.stringify({ semente, unidades: r.unidades, maiorParado: r.maiorParado, segundos: +(r.maiorParado / PASSOS_POR_SEGUNDO).toFixed(1), passa: r.maiorParado <= 5 * PASSOS_POR_SEGUNDO && r.chegada > 0, chegada: r.chegada, pendentes: r.pendentes, maisLongeDaVaga: r.maisLongeDaVaga, ms: Date.now() - inicio }));
}
