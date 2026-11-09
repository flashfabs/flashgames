import { destinos, simular } from './regras.js';
const niveis = { facil: [1, 120], medio: [3, 25], dificil: [5, 0] };
function jogadas(s) { return s.tabuleiro.flatMap((p, origem) => p && (p === p.toUpperCase()) === (s.vez === 'b') ? destinos(s, origem).map(destino => ({ origem, destino })) : []); }
function avaliar(s, lado) {
  if (s.fim) return s.fim.vencedor === lado ? 100000 : s.fim.vencedor ? -100000 : 0;
  return s.tabuleiro.reduce((v, p, i) => { if (!p || s.capturadas.includes(i)) return v; const b = p === p.toUpperCase(), valor = p.toLowerCase() === 'd' ? 300 : 100 + (b ? 7 - Math.floor(i / 8) : Math.floor(i / 8)) * 3; return v + ((b ? 'b' : 'p') === lado ? valor : -valor); }, 0);
}
function buscar(s, profundidade, lado, alfa, beta, prazo) {
  if (Date.now() >= prazo) throw new Error('tempo');
  if (!profundidade || s.fim) return avaliar(s, lado);
  const max = s.vez === lado; let melhor = max ? -Infinity : Infinity;
  for (const j of jogadas(s)) { const prox = simular(s, j.origem, j.destino); const valor = buscar(prox, profundidade - (prox.vez !== s.vez ? 1 : 0), lado, alfa, beta, prazo); melhor = max ? Math.max(melhor, valor) : Math.min(melhor, valor); if (max) alfa = Math.max(alfa, melhor); else beta = Math.min(beta, melhor); if (beta <= alfa) break; }
  return melhor;
}
export function escolherJogada(s, dificuldade = 'medio', aleatorio = Math.random, limiteMs = 1500) {
  const [profundidade, margem] = niveis[dificuldade] || niveis.medio, opcoes = jogadas(s), prazo = Date.now() + limiteMs;
  if (!opcoes.length || s.fim) return null;
  let avaliadas = opcoes.map(j => ({ ...j, valor: avaliar(simular(s, j.origem, j.destino), s.vez) }));
  for (let d = 1; d <= profundidade; d++) { try { avaliadas = opcoes.map(j => ({ ...j, valor: buscar(simular(s, j.origem, j.destino), d - 1, s.vez, -Infinity, Infinity, prazo) })); } catch (erro) { if (erro.message !== 'tempo') throw erro; break; } }
  avaliadas.sort((a, b) => b.valor - a.valor); const candidatas = avaliadas.filter(j => j.valor >= avaliadas[0].valor - margem);
  const { origem, destino } = candidatas[Math.min(candidatas.length - 1, Math.floor(aleatorio() * candidatas.length))]; return { origem, destino };
}
