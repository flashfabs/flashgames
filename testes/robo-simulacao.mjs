// Robot benchmark, not a test: plays 20 matches of 8 robots (4 rounds of the 5 maps, fixed seeds) and prints,
// per level, wins, deaths by cause, eliminations, crates, items, time alive and time standing still, plus how
// matches end, the longest stand-still and the robots' cost per simulation step. Same numbers on every run, so
// before/after comparisons of robo.js or regras.js changes are fair.
// Run with: node testes/robo-simulacao.mjs
import { Partida, MAPAS } from '../site/js/pavio/regras.js';
import { criarRobo, aplicarAcaoDoRobo } from '../site/js/pavio/robo.js';

const DT = 1 / 60;
const niveis = ['facil', 'medio', 'dificil', 'facil', 'medio', 'dificil', 'medio', 'facil'];
const soma = {};
const seguidos = [];
let custoMax = 0;
let custoTotal = 0;
let tiques = 0;
let duracoes = [];
let empates = 0;
const vivosNaSubita = [];
const finais = {};
for (let rodada = 0; rodada < 4; rodada++) {
  for (const [n, mapa] of MAPAS.entries()) {
    let s = 1000 + rodada * 10 + n;
    const sorteio = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
    const partida = new Partida(niveis.map((_, slot) => ({ id: `r${slot}`, slot })), { mapa, sorteio, variante: rodada });
    const robos = niveis.map((nivel, slot) => criarRobo({ id: `r${slot}`, nivel, sorteio }));
    const parado = new Array(8).fill(0);
    const seguido = new Array(8).fill(0);
    const maiorSeguido = new Array(8).fill(0);
    const ultimo = partida.jogadores.map(j => ({ x: j.x, y: j.y }));
    let marcou = false;
    while (!partida.resultado && partida.tempo < 300) {
      if (!marcou && partida.tempo >= partida.morteSubitaS) { marcou = true; vivosNaSubita.push(partida.jogadores.filter(j => j.vivo).length); }
      const t0 = performance.now();
      for (const robo of robos) {
        aplicarAcaoDoRobo(partida, robo.id, robo.pensar(partida, DT));
      }
      const custo = performance.now() - t0;
      custoMax = Math.max(custoMax, custo);
      custoTotal += custo;
      tiques++;
      partida.passo(DT);
      partida.jogadores.forEach((j, k) => {
        if (j.vivo && Math.abs(j.x - ultimo[k].x) + Math.abs(j.y - ultimo[k].y) < 1e-6) { parado[k] += DT; seguido[k] += DT; maiorSeguido[k] = Math.max(maiorSeguido[k], seguido[k]); } else seguido[k] = 0;
        ultimo[k] = { x: j.x, y: j.y };
      });
    }
    duracoes.push(partida.tempo);
    maiorSeguido.forEach((t, k) => seguidos.push([t, niveis[k], mapa.nome]));
    if (!marcou) vivosNaSubita.push(-1);
    if (!partida.resultado.vencedor) empates++;
    const ultimas = partida.estatisticas().filter(e => e.morte).sort((a, b) => b.morte.tempo - a.morte.tempo).slice(0, 2).map(e => e.morte.causa).join('+');
    const chave = partida.resultado.vencedor ? 'vitória' : `empate (${ultimas})`;
    finais[chave] = (finais[chave] ?? 0) + 1;
    partida.estatisticas().forEach((e, k) => {
      const nivel = niveis[k];
      const t = (soma[nivel] ??= { jogos: 0, vitorias: 0, propria: 0, bomba: 0, subita: 0, eliminacoes: 0, caixas: 0, itens: 0, tempoVivo: 0, parado: 0 });
      t.jogos++;
      if (partida.resultado.vencedor === e.id) t.vitorias++;
      if (e.morte) t[e.morte.causa]++;
      t.eliminacoes += e.eliminacoes;
      t.caixas += e.caixas;
      t.itens += Object.values(e.itens).reduce((a, b) => a + b, 0);
      t.tempoVivo += e.tempoVivo;
      t.parado += parado[k];
    });
  }
}
for (const [nivel, t] of Object.entries(soma)) {
  const m = v => (v / t.jogos).toFixed(2);
  console.log(`${nivel}: vitórias ${m(t.vitorias)}, morte própria ${m(t.propria)}, por bomba ${m(t.bomba)}, súbita ${m(t.subita)}, eliminações ${m(t.eliminacoes)}, caixas ${m(t.caixas)}, itens ${m(t.itens)}, vivo ${m(t.tempoVivo)} s, parado ${m(t.parado)} s`);
}
console.log(`empates ${empates}/${duracoes.length}; vivos quando a súbita começa: ${vivosNaSubita.join(' ')}`);
console.log(JSON.stringify(finais));
seguidos.sort((a, b) => b[0] - a[0]);
console.log('maiores tempos parados seguidos: ' + seguidos.slice(0, 6).map(([t, n, m]) => `${t.toFixed(1)} s (${n}, ${m})`).join(', '));
console.log(`duração média ${(duracoes.reduce((a, b) => a + b, 0) / duracoes.length).toFixed(1)} s, máx ${Math.max(...duracoes).toFixed(1)} s; custo dos 8 robôs por tique: média ${(custoTotal / tiques).toFixed(2)} ms, máx ${custoMax.toFixed(1)} ms`);
