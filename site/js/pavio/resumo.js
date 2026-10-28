// Match and round summaries: the highlights of a match, its eliminations in order, and the round's achievements,
// computed from the statistics the rules keep (Partida.estatisticas and somarEstatisticasRodada). Pure functions:
// the screens in telas.js turn them into elements.

export function formatarDuracao(segundos) {
  const total = Math.max(0, Math.round(Number(segundos) || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function plural(n, um, varios) {
  return `${n} ${n === 1 ? um : varios}`;
}

// Best value of a field among the lines (ties keep everyone), or null when nobody reaches `minimo`.
function melhores(linhas, valorDe, minimo) {
  let maior = -Infinity;
  for (const linha of linhas) maior = Math.max(maior, valorDe(linha));
  if (!(maior >= minimo)) return null;
  return { valor: maior, ids: linhas.filter(linha => valorDe(linha) === maior).map(linha => linha.id) };
}

// Highlights of one match: most crates, most eliminations, longest alive (when it set someone apart), biggest
// chain reaction and fastest elimination. Each one: { chave, icone, titulo, ids, texto }.
export function destaquesDaPartida(estatisticas = []) {
  const linhas = Array.isArray(estatisticas) ? estatisticas : [];
  const destaques = [];
  const caixas = melhores(linhas, linha => linha.caixas ?? 0, 1);
  if (caixas) destaques.push({ chave: 'caixas', icone: '📦', titulo: 'Mais caixas', ids: caixas.ids, texto: plural(caixas.valor, 'caixa', 'caixas') });
  const eliminacoes = melhores(linhas, linha => linha.eliminacoes ?? 0, 1);
  if (eliminacoes) destaques.push({ chave: 'eliminacoes', icone: '💀', titulo: 'Mais eliminações', ids: eliminacoes.ids, texto: plural(eliminacoes.valor, 'eliminação', 'eliminações') });
  const vivo = melhores(linhas, linha => Math.round(linha.tempoVivo ?? 0), 1);
  if (vivo && vivo.ids.length < linhas.length) destaques.push({ chave: 'tempoVivo', icone: '⏱', titulo: 'Mais tempo vivo', ids: vivo.ids, texto: formatarDuracao(vivo.valor) });
  const cadeia = melhores(linhas, linha => linha.maiorCadeia ?? 0, 2);
  if (cadeia) destaques.push({ chave: 'cadeia', icone: '⛓️', titulo: 'Maior reação em cadeia', ids: cadeia.ids, texto: plural(cadeia.valor, 'bomba', 'bombas') });
  const golpes = linhaDoTempo(linhas).filter(morte => morte.causa === 'bomba' && morte.por);
  if (golpes.length) {
    const [primeiro] = golpes;
    destaques.push({ chave: 'rapida', icone: '⚡', titulo: 'Eliminação mais rápida', ids: [primeiro.por], texto: formatarDuracao(primeiro.tempo), vitima: primeiro.id });
  }
  return destaques;
}

// Eliminations in the order they happened: [{ id, tempo, causa, por }].
export function linhaDoTempo(estatisticas = []) {
  return (Array.isArray(estatisticas) ? estatisticas : [])
    .filter(linha => linha.morte)
    .map(linha => ({ id: linha.id, tempo: Number(linha.morte.tempo) || 0, causa: linha.morte.causa, por: linha.morte.por ?? null }))
    .sort((a, b) => a.tempo - b.tempo);
}

// How someone went out, given the names: "explodiu com a bomba de Gil", "saiu da sala"...
export function textoDaMorte({ causa, por }, nomeDe = id => id) {
  if (causa === 'bomba' && por) return `explodiu com a bomba de ${nomeDe(por)}`;
  if (causa === 'propria') return 'explodiu com a própria bomba';
  if (causa === 'subita') return 'ficou preso na morte súbita';
  if (causa === 'saiu') return 'saiu da sala';
  return 'explodiu';
}

const CONQUISTAS = [
  { chave: 'demolidor', icone: '🧱', titulo: 'Demolidor', descricao: 'mais caixas na rodada', valor: linha => linha.caixas ?? 0, minimo: 1, texto: v => plural(v, 'caixa', 'caixas') },
  { chave: 'cacador', icone: '🎯', titulo: 'Caçador', descricao: 'mais eliminações na rodada', valor: linha => linha.eliminacoes ?? 0, minimo: 1, texto: v => plural(v, 'eliminação', 'eliminações') },
  { chave: 'sobrevivente', icone: '🛡️', titulo: 'Sobrevivente', descricao: 'mais tempo vivo na rodada', valor: linha => Math.round(linha.tempoVivo ?? 0), minimo: 1, texto: v => formatarDuracao(v) },
  { chave: 'colecionador', icone: '🎁', titulo: 'Colecionador', descricao: 'mais poderes pegos', valor: linha => Object.values(linha.itens ?? {}).reduce((soma, n) => soma + n, 0), minimo: 1, texto: v => plural(v, 'poder', 'poderes') },
  { chave: 'cadeia', icone: '⛓️', titulo: 'Rei da cadeia', descricao: 'maior reação em cadeia', valor: linha => linha.maiorCadeia ?? 0, minimo: 2, texto: v => plural(v, 'bomba', 'bombas') },
  { chave: 'andarilho', icone: '👟', titulo: 'Andarilho', descricao: 'quem mais andou', valor: linha => Math.round(linha.distancia ?? 0), minimo: 1, texto: v => plural(v, 'casa', 'casas') },
];

// Round achievements from the round totals ({ id: totals }): each goes to the best of the round, ties shared.
// Each one: { chave, icone, titulo, descricao, ids, texto }.
export function conquistasDaRodada(rodada = {}) {
  const linhas = Object.entries(rodada && typeof rodada === 'object' ? rodada : {}).map(([id, totais]) => ({ id, ...totais }));
  if (linhas.length < 2) return [];
  return CONQUISTAS.flatMap(({ valor, minimo, texto, ...conquista }) => {
    const melhor = melhores(linhas, valor, minimo);
    // An achievement everybody shares says nothing.
    if (!melhor || melhor.ids.length === linhas.length) return [];
    return [{ ...conquista, ids: melhor.ids, texto: texto(melhor.valor) }];
  });
}
