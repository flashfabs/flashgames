// Files of a match, fetched by the page and handed raw to the worker: the mission (C7) says which map (C6) and the
// starting Carga per difficulty, and the game data (C5) is always the same five files. Compiling and validating them is
// the simulation's job, inside the worker, so the replay starts from the same inputs on every machine.

const ARQUIVOS_DE_DADOS = ['unidades', 'predios', 'armas', 'economia', 'pesquisas'];

/**
 * @param {string} id mission id (site/rts/dados/missoes/<id>.json)
 * @param {URL} [base] the dados/ folder
 * @returns {Promise<{missao: object, dados: Record<string, object>, mapa: {cabecalho: object, camadas: Uint8Array, entidades: object}}>}
 */
export async function carregarPartida(id, base = new URL('../../dados/', import.meta.url)) {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error(`partida: id inválido "${id}"`);
  const buscar = async (caminho, como = 'json') => {
    const resposta = await fetch(new URL(caminho, base));
    if (!resposta.ok) throw new Error(`partida: ${caminho} respondeu ${resposta.status}`);
    return como === 'json' ? resposta.json() : resposta.arrayBuffer();
  };
  const missao = await buscar(`missoes/${id}.json`);
  const pasta = `mapas/${missao.mapa}/`;
  const cabecalho = await buscar(`${pasta}mapa.json`);
  const [entidades, camadas, ...dados] = await Promise.all([
    buscar(`${pasta}entidades.json`),
    buscar(`${pasta}${cabecalho.camadas?.arquivo ?? 'camadas.bin'}`, 'bytes'),
    ...ARQUIVOS_DE_DADOS.map(nome => buscar(`${nome}.json`)),
  ]);
  return {
    missao,
    dados: Object.fromEntries(ARQUIVOS_DE_DADOS.map((nome, k) => [nome, dados[k]])),
    mapa: { cabecalho, camadas: new Uint8Array(camadas), entidades },
  };
}
