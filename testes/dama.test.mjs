import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarPartida, destinos, mover } from '../site/js/dama/regras.js';
import { escolherJogada } from '../site/js/dama/robo.js';
const posicao = (pecas, vez = 'b') => { const s = criarPartida(false); s.tabuleiro.fill(''); for (const [i, p] of pecas) s.tabuleiro[i] = p; s.vez = vez; return s; };
test('posição inicial e movimentos de peça', () => { const s = criarPartida(false); assert.equal(s.tabuleiro.filter(Boolean).length, 24); assert.deepEqual(destinos(s, 40), [33]); assert.equal(mover(s, 40, 33), true); assert.equal(s.vez, 'p'); });
test('captura obrigatória, para trás e sequência maior', () => { const s = posicao([[42,'P'],[53,'P'],[35,'p'],[19,'p'],[46,'p']]); assert.deepEqual(destinos(s,53), []); assert.deepEqual(destinos(s,42), [28]); assert.ok(mover(s,42,28)); assert.equal(s.vez,'b'); assert.deepEqual(destinos(s,28),[10]); assert.ok(mover(s,28,10)); assert.equal(s.tabuleiro[35], ''); assert.equal(s.tabuleiro[19], ''); assert.equal(s.vez,'p'); const t=posicao([[26,'P'],[35,'p'],[1,'p']]); assert.deepEqual(destinos(t,26),[44]); });
test('dama voa, captura e peça é promovida ao fim da jogada', () => { const s=posicao([[42,'D'],[28,'p'],[1,'p']]); assert.deepEqual(destinos(s,42),[21,14,7]); const t=posicao([[10,'P'],[1,'p']]); assert.ok(mover(t,10,3)); assert.equal(t.tabuleiro[3],'D'); });
test('computador escolhe uma jogada legal', () => { const s=criarPartida(false); s.vez='p'; const j=escolherJogada(s,'medio',()=>0,500); assert.ok(destinos(s,j.origem).includes(j.destino)); });
