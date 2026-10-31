// Per-tick lists of entities by role, built in one pass over the slots at the start of each tick, so the economy,
// the network, production and the ghosts walk tens of entities instead of every slot several times. Derived state:
// rebuilt every tick from the entities, never saved. Entities created during the tick join the lists on the next one,
// and every user checks that a listed slot is still alive and still of the role it was listed for.
import { CATEGORIA } from './contratos.js';

const PAPEIS = Object.freeze(['predios', 'recursos', 'faiscas', 'estruturas', 'coletores', 'construtores']);

/** Empty lists for `capacidade` slots and `times` teams. */
export function criarListas(capacidade, times) {
  const listas = { lotacaoUnidades: new Int32Array(times) };
  for (const papel of PAPEIS) listas[papel] = { itens: new Int32Array(capacidade), n: 0 };
  return listas;
}

/** Sorts every live entity into its lists, in slot order, and sums the units' population per team. */
export function classificarEntidades(sim) {
  const { listas, tipos, capacidade, ativo, tipo, time, categoriaPorTipo, coletorPorTipo, times } = sim;
  const { predios, recursos, faiscas, estruturas, coletores, construtores, lotacaoUnidades } = listas;
  predios.n = recursos.n = faiscas.n = estruturas.n = coletores.n = construtores.n = 0;
  lotacaoUnidades.fill(0);
  for (let i = 0; i < capacidade; i++) {
    if (!ativo[i]) continue;
    const t = tipo[i];
    switch (categoriaPorTipo[t]) {
      case CATEGORIA.UNIDADE:
        if (time[i] < times) lotacaoUnidades[time[i]] += tipos[t].lotacao;
        if (coletorPorTipo[t]) coletores.itens[coletores.n++] = i;
        if (tipos[t].ergue.length > 0) construtores.itens[construtores.n++] = i;
        break;
      case CATEGORIA.PREDIO:
        predios.itens[predios.n++] = i;
        break;
      case CATEGORIA.RECURSO:
        recursos.itens[recursos.n++] = i;
        break;
      case CATEGORIA.FAISCA:
        faiscas.itens[faiscas.n++] = i;
        break;
      case CATEGORIA.ESTRUTURA:
        estruturas.itens[estruturas.n++] = i;
        break;
      default:
        break;
    }
  }
}
