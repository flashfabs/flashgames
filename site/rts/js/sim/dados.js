// Game data schema (C5) and its validator: every number the simulation reads from data must be an integer inside a
// known range, checked once at load, so no float or typo reaches the deterministic state.
// The numbers themselves belong to the design front; DADOS_PROTOTIPO keeps the prototype's two vehicles until then.
import { FP } from './contratos.js';

/** Movement classes: who fits where and who collides with whom. */
export const CLASSE = Object.freeze({ INFANTARIA: 0, VEICULO: 1, VEICULO_GRANDE: 2 });

// field: [minimum, maximum]; all integers, in world units, ticks or angle units as noted
const ESQUEMA_UNIDADE = Object.freeze({
  velocidade: [1, FP], // world units per tick
  vida: [1, 100000],
  alcance: [0, 32 * FP], // world units
  dano: [0, 100000],
  recarga: [1, 3000], // ticks between shots
  raio: [64, 4 * FP], // collision radius, world units
  visao: [1, 15], // sight radius, cells
  giroCorpo: [1, 128], // angle units per tick
  giroTorre: [1, 128],
  classe: [0, 2], // CLASSE.*
  coletor: [0, 1], // 1: harvesters of the same kind do not collide with each other
});

/**
 * Checks a list of unit kinds against the schema and returns it frozen.
 * @param {object[]} tipos
 * @returns {readonly object[]}
 */
export function validarTiposUnidade(tipos) {
  if (!Array.isArray(tipos) || tipos.length === 0) throw new Error('dados: a lista de tipos de unidade está vazia');
  const erros = [];
  tipos.forEach((tipo, indice) => {
    if (typeof tipo.nome !== 'string' || !/^[a-z0-9-]+$/.test(tipo.nome)) erros.push(`tipo ${indice}: nome inválido`);
    for (const [campo, [minimo, maximo]] of Object.entries(ESQUEMA_UNIDADE)) {
      const valor = tipo[campo];
      if (!Number.isInteger(valor)) erros.push(`${tipo.nome ?? indice}.${campo}: ${valor} não é inteiro`);
      else if (valor < minimo || valor > maximo) erros.push(`${tipo.nome ?? indice}.${campo}: ${valor} fora de ${minimo}..${maximo}`);
    }
    for (const campo of Object.keys(tipo)) if (campo !== 'nome' && !(campo in ESQUEMA_UNIDADE)) erros.push(`${tipo.nome ?? indice}.${campo}: campo desconhecido`);
  });
  if (erros.length > 0) throw new Error(`dados inválidos:\n${erros.join('\n')}`);
  return Object.freeze(tipos.map(tipo => Object.freeze({ ...tipo })));
}

/** The prototype's vehicles: a fast fragile buggy and a slow tough tank. */
export const DADOS_PROTOTIPO = validarTiposUnidade([
  { nome: 'buggy', velocidade: 88, vida: 60, alcance: 4 * FP, dano: 9, recarga: 18, raio: 330, visao: 7, giroCorpo: 8, giroTorre: 13, classe: CLASSE.VEICULO, coletor: 0 },
  { nome: 'tanque', velocidade: 52, vida: 160, alcance: 6 * FP, dano: 26, recarga: 42, raio: 440, visao: 7, giroCorpo: 8, giroTorre: 13, classe: CLASSE.VEICULO, coletor: 0 },
]);
