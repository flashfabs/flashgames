// Stable back-to-front ordering of sprite instances without allocating per frame: an LSD radix sort on
// 16-bit keys (two 8-bit passes) that permutes an index array. Equal keys keep their emission order, so a
// turret emitted right after its body with the same key is always drawn on top of it.

export function criarOrdenacao(capacidadeInicial = 8192) {
  let chaves = new Uint16Array(capacidadeInicial);
  let indices = new Uint32Array(capacidadeInicial);
  let troca = new Uint32Array(capacidadeInicial);
  const contagem = new Uint32Array(256);

  function garantir(n) {
    if (n <= chaves.length) return;
    let capacidade = chaves.length;
    while (capacidade < n) capacidade *= 2;
    const novas = new Uint16Array(capacidade);
    novas.set(chaves);
    chaves = novas;
    indices = new Uint32Array(capacidade);
    troca = new Uint32Array(capacidade);
  }

  function passada(origem, destino, n, deslocamento) {
    contagem.fill(0);
    for (let i = 0; i < n; i++) contagem[(chaves[origem[i]] >> deslocamento) & 255]++;
    let soma = 0;
    for (let b = 0; b < 256; b++) {
      const c = contagem[b];
      contagem[b] = soma;
      soma += c;
    }
    for (let i = 0; i < n; i++) {
      const indice = origem[i];
      destino[contagem[(chaves[indice] >> deslocamento) & 255]++] = indice;
    }
  }

  return {
    /** Grows the key storage when needed; call before writing keys past the current capacity. */
    garantir,
    /** Key storage: write the key of instance i at chaves[i]. */
    get chaves() {
      return chaves;
    },
    /**
     * Sorts the first n instances by key and returns the index array (valid until the next call).
     * @param {number} n
     */
    ordenar(n) {
      garantir(n);
      for (let i = 0; i < n; i++) indices[i] = i;
      passada(indices, troca, n, 0);
      passada(troca, indices, n, 8);
      return indices;
    },
  };
}

/**
 * Maps a value in [minimo, maximo] to a 16-bit key, clamping outside the range.
 * @param {number} valor
 * @param {number} minimo
 * @param {number} maximo
 */
export function chave16(valor, minimo, maximo) {
  const t = (valor - minimo) / (maximo - minimo);
  return t <= 0 ? 0 : t >= 1 ? 65535 : (t * 65535) | 0;
}
