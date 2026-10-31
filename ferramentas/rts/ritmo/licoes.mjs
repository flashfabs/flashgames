// Lessons checker for stage E4: whether each lesson of a phase shows in a play-test log (C15), by the list the design
// front writes next to the mission (site/rts/dados/missoes/<missao>.licoes.json). A lesson is a condition over the
// log's events, so the list can change without touching this file:
//   { "id": "atacar-mover", "texto": "...", "momento": "M2",
//     "se": { "evento": "comando", "campos": { "comando": 3 }, "minimos": { "n": 3 }, "antesDeSegundos": 600, "vezes": 1 } }
// "campos" must be equal, "minimos" at least, "maximos" at most; "vezes" counts matching events (1 by default);
// { "todas": [...] } and { "alguma": [...] } combine conditions. The criterion: every lesson in the log of at least
// 4 of 6 people, two thirds of the logs in general.

const PASSOS_POR_SEGUNDO_PADRAO = 30;
const passoDe = evento => evento.passo ?? evento.tick;

/** Problems in a lessons list; an empty list means it can be used. */
export function validarLicoes(lista) {
  const problemas = [];
  if (!lista || lista.versao !== 1 || !Array.isArray(lista.licoes)) return ['a lista de lições precisa de versao 1 e de "licoes"'];
  const ids = new Set();
  const condicao = (c, onde) => {
    if (!c || typeof c !== 'object') return problemas.push(`${onde}: condição vazia`);
    if (Array.isArray(c.todas)) return c.todas.forEach((s, k) => condicao(s, `${onde}.todas[${k}]`));
    if (Array.isArray(c.alguma)) return c.alguma.forEach((s, k) => condicao(s, `${onde}.alguma[${k}]`));
    if (typeof c.evento !== 'string') problemas.push(`${onde}: falta "evento"`);
  };
  lista.licoes.forEach((l, k) => {
    if (typeof l.id !== 'string' || ids.has(l.id)) problemas.push(`lição ${k}: id ausente ou repetido`);
    ids.add(l.id);
    condicao(l.se, `lição ${l.id ?? k}`);
  });
  return problemas;
}

/** First tick at which a condition holds in the log, or null. */
function quando(c, eventos, pps) {
  if (Array.isArray(c.todas)) {
    const passos = c.todas.map(s => quando(s, eventos, pps));
    return passos.includes(null) ? null : Math.max(...passos);
  }
  if (Array.isArray(c.alguma)) {
    const passos = c.alguma.map(s => quando(s, eventos, pps)).filter(p => p !== null);
    return passos.length ? Math.min(...passos) : null;
  }
  let vistos = 0;
  for (const e of eventos) {
    if (e.tipo !== c.evento) continue;
    if (c.antesDeSegundos !== undefined && passoDe(e) > c.antesDeSegundos * pps) continue;
    if (c.campos && !Object.entries(c.campos).every(([k, v]) => e[k] === v)) continue;
    if (c.minimos && !Object.entries(c.minimos).every(([k, v]) => typeof e[k] === 'number' && e[k] >= v)) continue;
    if (c.maximos && !Object.entries(c.maximos).every(([k, v]) => typeof e[k] === 'number' && e[k] <= v)) continue;
    if (++vistos >= (c.vezes ?? 1)) return passoDe(e);
  }
  return null;
}

/** Each lesson of the list in one log: [{ id, texto, momento, aprendeu, segundos }]. */
export function conferirLicoes(registro, lista) {
  const pps = registro.passosPorSegundo ?? PASSOS_POR_SEGUNDO_PADRAO;
  return lista.licoes.map(l => {
    const passo = quando(l.se, registro.eventos, pps);
    return { id: l.id, texto: l.texto ?? l.id, momento: l.momento ?? null, aprendeu: passo !== null, segundos: passo === null ? null : passo / pps };
  });
}

/** Minimum logs a lesson must show in: 4 of 6, two thirds in general. */
export const minimoDePessoas = total => Math.ceil((total * 4) / 6);

/** Every lesson over several logs: [{ id, texto, momento, pessoas, total, passou }]. */
export function conferirLicoesVarias(registros, lista) {
  const porRegistro = registros.map(r => conferirLicoes(r, lista));
  const minimo = minimoDePessoas(registros.length);
  return lista.licoes.map((l, k) => {
    const pessoas = porRegistro.filter(licoes => licoes[k].aprendeu).length;
    return { id: l.id, texto: l.texto ?? l.id, momento: l.momento ?? null, pessoas, total: registros.length, minimo, passou: registros.length === 0 ? null : pessoas >= minimo };
  });
}
