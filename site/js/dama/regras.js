const oposta = cor => cor === 'b' ? 'p' : 'b';
const cor = p => p && (p === p.toUpperCase() ? 'b' : 'p');
const dentro = (y, x) => y >= 0 && y < 8 && x >= 0 && x < 8;
const direcoes = [[-1,-1],[-1,1],[1,-1],[1,1]];
const casa = i => 'abcdefgh'[i % 8] + (8 - Math.floor(i / 8));

export function criarPartida(comRelogio = true, minutos = 10) {
  const tabuleiro = Array(64).fill('');
  for (let i = 0; i < 64; i++) if ((Math.floor(i / 8) + i % 8) % 2) tabuleiro[i] = i < 24 ? 'p' : i >= 40 ? 'P' : '';
  return { tabuleiro, vez: 'b', continuacao: null, capturadas: [], historico: [], posicoes: {}, semCaptura: 0, contagemFinal: null, tempos: comRelogio ? { b: minutos * 60000, p: minutos * 60000 } : null, fim: null };
}

// Captured pieces remain on the board until the whole sequence ends, blocking a king's path.
function saltos(tab, origem, capturadas) {
  const p = tab[origem], y = Math.floor(origem / 8), x = origem % 8, resultado = [];
  for (const [dy, dx] of direcoes) {
    let yy = y + dy, xx = x + dx, alvo = null;
    while (dentro(yy, xx)) {
      const i = yy * 8 + xx;
      if (tab[i]) {
        if (alvo !== null || cor(tab[i]) === cor(p) || capturadas.includes(i)) break;
        alvo = i;
      } else if (alvo !== null) {
        resultado.push({ destino: i, alvo });
        if (p.toLowerCase() !== 'd') break;
      } else if (p.toLowerCase() !== 'd') break;
      yy += dy; xx += dx;
    }
  }
  return resultado;
}
function sequencias(tab, origem, capturadas = []) {
  const saltosPossiveis = saltos(tab, origem, capturadas);
  if (!saltosPossiveis.length) return [[]];
  return saltosPossiveis.flatMap(salto => {
    const copia = [...tab]; copia[salto.destino] = copia[origem]; copia[origem] = '';
    return sequencias(copia, salto.destino, [...capturadas, salto.alvo]).map(resto => [salto, ...resto]);
  });
}
function opcoes(s) {
  const origens = s.continuacao === null ? s.tabuleiro.map((p, i) => cor(p) === s.vez ? i : -1).filter(i => i >= 0) : [s.continuacao];
  const capturas = origens.flatMap(origem => sequencias(s.tabuleiro, origem, s.capturadas).filter(seq => seq.length).map(seq => ({ origem, seq })));
  if (capturas.length) {
    const maior = Math.max(...capturas.map(c => c.seq.length));
    return capturas.filter(c => c.seq.length === maior).map(c => ({ origem: c.origem, ...c.seq[0] }));
  }
  if (s.continuacao !== null) return [];
  return origens.flatMap(origem => {
    const p = s.tabuleiro[origem], y = Math.floor(origem / 8), x = origem % 8, resultado = [];
    for (const [dy, dx] of direcoes) {
      if (p.toLowerCase() !== 'd' && dy !== (s.vez === 'b' ? -1 : 1)) continue;
      for (let k = 1; dentro(y + dy*k, x + dx*k); k++) {
        const destino = (y + dy*k)*8 + x + dx*k;
        if (s.tabuleiro[destino]) break;
        resultado.push({ origem, destino, alvo: null });
        if (p.toLowerCase() !== 'd') break;
      }
    }
    return resultado;
  });
}
// The five-move endings count complete turns by each player, including captures and man moves.
function finalComContagem(tabuleiro) {
  const lados = ['b', 'p'].map(lado => tabuleiro.flatMap((p, i) => cor(p) === lado ? [{ p, i }] : []));
  const perfil = pecas => `${pecas.filter(x => x.p.toLowerCase() === 'd').length}d${pecas.filter(x => x.p.toLowerCase() === 'p').length}p`;
  const [a, b] = lados.map(perfil);
  const par = [a, b].sort().join(':');
  if (['1d0p:1d0p', '1d0p:1d1p', '1d0p:2d0p', '1d1p:2d0p', '2d0p:2d0p'].includes(par)) return true;
  return lados.some((pecas, i) => perfil(pecas) === '1d0p' && Math.floor(pecas[0].i / 8) + pecas[0].i % 8 === 7 && ['3d0p', '2d1p', '1d2p'].includes(perfil(lados[1-i])));
}
const chavePosicao = s => s.tabuleiro.map(p => p || '.').join('') + s.vez;
export function destinos(s, origem) { return s.fim ? [] : [...new Set(opcoes(s).filter(j => j.origem === origem).map(j => j.destino))]; }
export function mover(s, origem, destino) {
  if (s.fim) return false;
  const jogada = opcoes(s).find(j => j.origem === origem && j.destino === destino);
  if (!jogada) return false;
  if (!s.historico.length) s.posicoes[chavePosicao(s)] = 1;
  if (s.continuacao === null && !s.contagemFinal && finalComContagem(s.tabuleiro)) s.contagemFinal = { b: 0, p: 0 };
  const p = s.tabuleiro[origem], lado = s.vez, capturada = jogada.alvo === null ? '' : s.tabuleiro[jogada.alvo];
  s.tabuleiro[destino] = p; s.tabuleiro[origem] = '';
  if (capturada) s.capturadas.push(jogada.alvo);
  const continua = capturada && saltos(s.tabuleiro, destino, s.capturadas).length > 0;
  s.continuacao = continua ? destino : null;
  s.historico.push({ origem, destino, lado, capturada, texto: `${casa(origem)}${capturada ? '×' : '–'}${casa(destino)}` });
  if (!continua) {
    for (const i of s.capturadas) s.tabuleiro[i] = '';
    s.semCaptura = s.capturadas.length || p.toLowerCase() === 'p' ? 0 : s.semCaptura + 1;
    s.capturadas = [];
    if (p === 'P' && destino < 8) s.tabuleiro[destino] = 'D';
    if (p === 'p' && destino >= 56) s.tabuleiro[destino] = 'd';
    s.vez = oposta(lado);
    if (!opcoes(s).length) s.fim = { vencedor: lado, motivo: 'Sem jogadas disponíveis' };
    const chave = chavePosicao(s);
    s.posicoes[chave] = (s.posicoes[chave] || 0) + 1;
    if (!s.fim && s.posicoes[chave] >= 3) s.fim = { vencedor: null, motivo: 'Empate por repetição' };
    if (!s.fim && s.semCaptura >= 40) s.fim = { vencedor: null, motivo: 'Empate após 20 lances de damas por jogador' };
    if (s.contagemFinal) s.contagemFinal[lado]++;
    if (!finalComContagem(s.tabuleiro)) s.contagemFinal = null;
    else if (!s.contagemFinal) s.contagemFinal = { b: 0, p: 0 };
    if (!s.fim && s.contagemFinal && s.contagemFinal.b >= 5 && s.contagemFinal.p >= 5) s.fim = { vencedor: null, motivo: 'Empate após 5 lances de cada jogador no final' };
  }
  return true;
}
export function simular(s, origem, destino) {
  const copia = { ...s, tabuleiro: [...s.tabuleiro], capturadas: [...s.capturadas], historico: [...s.historico], posicoes: { ...s.posicoes }, contagemFinal: s.contagemFinal && { ...s.contagemFinal } };
  mover(copia, origem, destino); return copia;
}
