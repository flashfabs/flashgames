// Missions played whole in Node, without a browser, by the end-to-end tests' scripted player (rts-roteiro.mjs),
// with the real play-test log (C15) filled from every snapshot and command as on the page
// (ferramentas/rts/ritmo/jogar-roteiro.mjs). In every difficulty the match has to end (no stalemate) and every attack
// of 6 or more units has to be warned at least 10 s ahead, read from the log (stage E4). It runs with the functional
// tests because a match takes tens of seconds of CPU, too long for npm test on the Mac.
import { test, expect } from '@playwright/test';
import { jogar } from '../../ferramentas/rts/ritmo/jogar-roteiro.mjs';
import * as roteiro from './rts-roteiro.mjs';

const MISSOES = [{ missao: 'caixa-de-areia', minutos: 28 }];

for (const { missao, minutos } of MISSOES) {
  for (const dificuldade of ['facil', 'normal', 'dificil']) {
    test(`${missao}, ${dificuldade}: the match ends and every attack of 6 or more units is warned 10 s ahead`, () => {
      test.setTimeout(5 * 60 * 1000);
      const partida = jogar({ missao, dificuldade, minutos, roteiro });
      test.info().annotations.push({ type: 'fim', description: `${partida.resultado ?? 'sem fim'} aos ${partida.minutos} min` });
      for (const c of partida.conferido.criterios) test.info().annotations.push({ type: `ritmo: ${c.nome}`, description: `${c.texto} (${c.passou === null ? 'sem dado' : c.passou ? 'passou' : 'não passou'})` });
      expect(partida.conferido.valido, 'registro C15 válido').toBe(true);
      expect(['vitoria', 'derrota'], `a partida termina em ${minutos} min de jogo`).toContain(partida.resultado);
      const aviso = partida.conferido.criterios.find(c => c.id === 'avisoDeAtaque');
      expect(aviso.passou, aviso.texto).not.toBe(false);
      expect(aviso.passou, 'a missão tem ataques de 6 ou mais unidades').toBe(true);
    });
  }
}
