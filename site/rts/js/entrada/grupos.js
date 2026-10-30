// Control groups 1 to 9: store (Ctrl or Option/Alt and digit), add (Shift and digit), recall (digit), and recall twice
// quickly to bring the camera to the group. Groups hold ids with generation, so a dead unit never comes back as the new
// entity in its slot; they are a local convenience and never reach the simulation.

/** Two recalls of the same group closer than this, in milliseconds, centre the camera on it. */
export const INTERVALO_DUPLO_MS = 350;

export function criarGrupos() {
  const grupos = new Map();
  let ultimaChamada = { grupo: 0, quando: -Infinity };

  function podar(grupo, existe) {
    const ids = grupos.get(grupo);
    if (!ids) return [];
    for (const id of ids) if (!existe(id)) ids.delete(id);
    return [...ids];
  }

  return {
    /** Replaces the group with the given ids; an empty list clears it. */
    guardar(grupo, ids) {
      if (ids.length === 0) grupos.delete(grupo);
      else grupos.set(grupo, new Set(ids));
    },
    somar(grupo, ids) {
      const atual = grupos.get(grupo) ?? new Set();
      for (const id of ids) atual.add(id);
      if (atual.size > 0) grupos.set(grupo, atual);
    },
    /**
     * The living ids of the group and whether this recall is the second one in a row (centre the camera).
     * @param {(id: number) => boolean} existe
     */
    chamar(grupo, agora, existe) {
      const ids = podar(grupo, existe);
      const centralizar = ids.length > 0 && ultimaChamada.grupo === grupo && agora - ultimaChamada.quando <= INTERVALO_DUPLO_MS;
      ultimaChamada = { grupo, quando: centralizar ? -Infinity : agora };
      return { ids, centralizar };
    },
    tamanho(grupo, existe) {
      return podar(grupo, existe).length;
    },
    /** Groups that have at least one id, in order, for the on-screen buttons. */
    ocupados() {
      return [...grupos.keys()].filter(grupo => grupos.get(grupo).size > 0).sort((a, b) => a - b);
    },
  };
}
