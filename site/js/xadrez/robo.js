import { destinos, emXeque, simular } from './regras.js';

const valores = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
const niveis = { facil: { profundidade: 1, margem: 160 }, medio: { profundidade: 2, margem: 25 }, dificil: { profundidade: 3, margem: 0 } };
const pertence = (p, vez) => p && (p === p.toUpperCase()) === (vez === 'b');
function jogadas(partida) {
  const resultado = [];
  partida.tabuleiro.forEach((peca, origem) => {
    if (!pertence(peca, partida.vez)) return;
    for (const destino of destinos(partida, origem)) {
      const promocao = peca.toLowerCase() === 'p' && (destino < 8 || destino >= 56);
      for (const escolha of promocao ? ['q', 'r', 'b', 'n'] : ['q']) resultado.push({ origem, destino, promocao: escolha });
    }
  });
  return resultado.sort((a, b) => prioridade(partida, b) - prioridade(partida, a));
}
function prioridade(s, j) {
  const alvo = s.tabuleiro[j.destino], peca = s.tabuleiro[j.origem];
  return (alvo ? valores[alvo.toLowerCase()] * 10 - valores[peca.toLowerCase()] : 0) + (j.promocao !== 'q' ? 0 : peca.toLowerCase() === 'p' && (j.destino < 8 || j.destino >= 56) ? 800 : 0);
}
function avaliar(s) {
  let total = 0;
  s.tabuleiro.forEach((p, i) => {
    if (!p) return;
    const branca = p === p.toUpperCase(), tipo = p.toLowerCase(), linha = Math.floor(i / 8), coluna = i % 8;
    const centro = 3.5 - (Math.abs(3.5 - linha) + Math.abs(3.5 - coluna)) / 2;
    const posicao = tipo === 'p' ? (branca ? 6 - linha : linha - 1) * 8 + centro * 3 : tipo === 'n' || tipo === 'b' ? centro * 12 : tipo === 'q' ? centro * 3 : 0;
    total += (branca ? 1 : -1) * (valores[tipo] + posicao);
  });
  return total * (s.vez === 'b' ? 1 : -1);
}
function buscar(s, profundidade, alfa, beta, prazo, ply) {
  if (Date.now() >= prazo) throw new Error('tempo');
  const opcoes = jogadas(s);
  if (!opcoes.length) return emXeque(s) ? -100000 + ply : 0;
  if (profundidade === 0) return avaliar(s);
  let melhor = -Infinity;
  for (const j of opcoes) {
    const valor = -buscar(simular(s, j.origem, j.destino, j.promocao), profundidade - 1, -beta, -alfa, prazo, ply + 1);
    melhor = Math.max(melhor, valor); alfa = Math.max(alfa, valor);
    if (alfa >= beta) break;
  }
  return melhor;
}
export function escolherJogada(partida, dificuldade = 'medio', aleatorio = Math.random, limiteMs = 2000) {
  const nivel = niveis[dificuldade] || niveis.medio, opcoes = jogadas(partida);
  if (!opcoes.length || partida.fim) return null;
  const prazo = Date.now() + limiteMs;
  let avaliadas = opcoes.map(j => ({ ...j, valor: -avaliar(simular(partida, j.origem, j.destino, j.promocao)) }));
  // Iterative deepening keeps a completed result if the time budget runs out.
  for (let profundidade = 1; profundidade <= nivel.profundidade; profundidade++) {
    const atual = [];
    try {
      for (const j of opcoes) atual.push({ ...j, valor: -buscar(simular(partida, j.origem, j.destino, j.promocao), profundidade - 1, -Infinity, Infinity, prazo, 1) });
      avaliadas = atual;
    } catch (erro) { if (erro.message !== 'tempo') throw erro; break; }
  }
  avaliadas.sort((a,b) => b.valor - a.valor);
  const candidatas = avaliadas.filter(j => j.valor >= avaliadas[0].valor - nivel.margem);
  const escolha = candidatas[Math.min(candidatas.length - 1, Math.floor(aleatorio() * candidatas.length))];
  return { origem: escolha.origem, destino: escolha.destino, promocao: escolha.promocao };
}
