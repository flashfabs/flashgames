import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarPartida, destinos, mover } from '../site/js/xadrez/regras.js';
import { escolherJogada } from '../site/js/xadrez/robo.js';
test('todos os níveis escolhem jogadas legais sem alterar a posição', () => {
  for (const nivel of ['facil', 'medio', 'dificil']) { const p=criarPartida(false); mover(p,52,36); const antes=JSON.stringify(p); const j=escolherJogada(p,nivel,()=>0,2000); assert.ok(destinos(p,j.origem).includes(j.destino)); assert.equal(JSON.stringify(p),antes); }
});
test('o computador encontra xeque-mate em uma jogada', () => {
  const p=criarPartida(false); for(const [a,b] of [[53,45],[12,28],[54,38]]) mover(p,a,b); const j=escolherJogada(p,'dificil',()=>0,3000); assert.ok(mover(p,j.origem,j.destino,j.promocao)); assert.equal(p.fim?.motivo,'Xeque-mate');
});
test('partida encerrada não recebe jogada',()=>{ const p=criarPartida(); p.fim={vencedor:'b'}; assert.equal(escolherJogada(p,'facil'),null); });
