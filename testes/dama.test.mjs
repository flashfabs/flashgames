import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarPartida, destinos, mover } from '../site/js/dama/regras.js';
import { escolherJogada } from '../site/js/dama/robo.js';
const posicao = (pecas, vez = 'b') => { const s = criarPartida(false); s.tabuleiro.fill(''); for (const [i, p] of pecas) s.tabuleiro[i] = p; s.vez = vez; return s; };
test('posição inicial e movimentos de peça', () => { const s = criarPartida(false); assert.equal(s.tabuleiro.filter(Boolean).length, 24); assert.deepEqual(destinos(s, 40), [33]); assert.equal(mover(s, 40, 33), true); assert.equal(s.vez, 'p'); });
test('captura obrigatória, para trás e sequência maior', () => { const s = posicao([[42,'P'],[53,'P'],[35,'p'],[19,'p'],[46,'p']]); assert.deepEqual(destinos(s,53), []); assert.deepEqual(destinos(s,42), [28]); assert.ok(mover(s,42,28)); assert.equal(s.vez,'b'); assert.deepEqual(destinos(s,28),[10]); assert.ok(mover(s,28,10)); assert.equal(s.tabuleiro[35], ''); assert.equal(s.tabuleiro[19], ''); assert.equal(s.vez,'p'); const t=posicao([[26,'P'],[35,'p'],[1,'p']]); assert.deepEqual(destinos(t,26),[44]); });
test('dama voa, captura e peça é promovida ao fim da jogada', () => { const s=posicao([[42,'D'],[28,'p'],[1,'p']]); assert.deepEqual(destinos(s,42),[21,14,7]); const t=posicao([[10,'P'],[1,'p']]); assert.ok(mover(t,10,3)); assert.equal(t.tabuleiro[3],'D'); });
test('computador escolhe uma jogada legal', () => { const s=criarPartida(false); s.vez='p'; const j=escolherJogada(s,'medio',()=>0,500); assert.ok(destinos(s,j.origem).includes(j.destino)); });
test('repetição conta também a posição inicial com o mesmo jogador', () => {
  const s = posicao([[1,'D'],[3,'d']]);
  for (let volta = 0; volta < 2; volta++) for (const [de, para] of [[1,8],[3,10],[8,1],[10,3]]) assert.ok(mover(s,de,para), `${de}-${para}`);
  assert.equal(s.fim?.motivo, 'Empate por repetição');
});
test('20 lances de dama por jogador sem captura ou movimento de pedra', () => {
  const s = posicao([[49,'D'],[55,'D'],[3,'d'],[7,'d'],[24,'p']]); s.semCaptura = 39;
  assert.ok(mover(s,49,40)); assert.equal(s.fim?.motivo, 'Empate após 20 lances de damas por jogador');
  const t = posicao([[49,'P'],[55,'D'],[3,'d'],[7,'d']]); t.semCaptura = 39;
  assert.ok(mover(t,49,40)); assert.equal(t.semCaptura, 0); assert.equal(t.fim, null);
});
test('finais oficiais são empatados após cinco lances de cada lado', () => {
  for (const pecas of [
    [[49,'D'],[3,'d']], [[49,'D'],[3,'d'],[7,'p']],
    [[49,'D'],[55,'D'],[3,'d']], [[49,'D'],[55,'D'],[3,'d'],[7,'p']],
    [[49,'D'],[55,'D'],[3,'d'],[7,'d']],
    [[7,'D'],[24,'d'],[40,'d'],[56,'d']],
    [[7,'D'],[24,'d'],[40,'d'],[56,'p']],
    [[7,'D'],[24,'d'],[40,'p'],[56,'p']],
  ]) {
    const s = posicao(pecas); s.contagemFinal = { b: 4, p: 5 };
    const candidatos = s.tabuleiro.flatMap((p, i) => p === 'D' ? destinos(s,i).map(d => [i,d]) : []);
    let terminou = false;
    for (const [de, para] of candidatos) { const copia = structuredClone(s); mover(copia,de,para); if (copia.fim?.motivo === 'Empate após 5 lances de cada jogador no final') { terminou = true; break; } }
    assert.ok(terminou, JSON.stringify(pecas));
  }
});
test('dama solitária fora da grande diagonal não inicia contagem especial de três peças', () => {
  const s = posicao([[1,'D'],[3,'d'],[5,'d'],[7,'p']]);
  assert.ok(mover(s,1,8)); assert.equal(s.contagemFinal, null);
});
test('simulação preserva contadores da partida original', () => {
  const s = posicao([[49,'D'],[3,'d']]); s.contagemFinal = { b: 1, p: 2 };
  escolherJogada(s,'facil',()=>0); assert.deepEqual(s.contagemFinal, { b: 1, p: 2 });
});
