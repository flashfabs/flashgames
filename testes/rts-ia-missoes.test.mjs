// The computer teams on the design front's missions (site/rts/dados/missoes/), real data and maps: each mission's
// "equipes" block (or, for a mission without one, the block ferramentas/rts/ia-harness.mjs makes from its waves)
// compiles at every difficulty; and played with nobody at the controls, the teams take the player's base down, every
// wave at least 10 s after its warning, with valid commands of the computer player only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { passo, REGRAS_LIVRES } from '../site/rts/js/sim/simulacao.js';
import { EVENTO, TAMANHO_EVENTO, E_TIPO, E_ARG, comandoValido } from '../site/rts/js/sim/contratos.js';
import { lerMapaDeArquivos } from '../site/rts/js/sim/mapa.js';
import { compilarDados } from '../site/rts/js/sim/dados.js';
import { rotulosDaMissao, resultadoDaMissao, RESULTADO } from '../site/rts/js/sim/gatilhos.js';
import { compilarEquipes, equipesDe } from '../site/rts/js/sim/comportamentos/equipes.js';
import { partidaReal, lerMissao, equipesDasOndas, arquivosDeDados, arquivosDoMapa } from '../ferramentas/rts/ia-harness.mjs';

const pasta = new URL('../site/rts/dados/missoes/', import.meta.url);
const missoes = existsSync(pasta) ? readdirSync(pasta).filter(nome => nome.endsWith('.json')).map(nome => nome.slice(0, -5)) : [];
const equipesDaMissao = missao => missao.equipes ?? equipesDasOndas(missao);

test('there is a mission to play the teams on', () => {
  assert.ok(missoes.length >= 1);
});

for (const id of missoes) {
  test(`mission ${id}: its teams compile against its map at every difficulty`, () => {
    const missao = lerMissao(id);
    const mapa = lerMapaDeArquivos(arquivosDoMapa(missao.mapa), compilarDados(arquivosDeDados()));
    const contexto = { lugares: { areas: mapa.areas, pontos: mapa.pontos, rotas: mapa.rotas }, times: mapa.camadas.bases.length, largura: mapa.camadas.largura, altura: mapa.camadas.altura };
    for (const dificuldade of ['facil', 'normal', 'dificil']) {
      const c = compilarEquipes({ ...missao, equipes: equipesDaMissao(missao) }, { ...contexto, dificuldade });
      assert.ok(c && c.equipes.length > 0, dificuldade);
    }
  });

  test(`mission ${id}: unattended, the teams take the base down, each wave 10 s or more after its warning`, () => {
    const missao = lerMissao(id);
    const rotulos = rotulosDaMissao({ ...missao, equipes: equipesDaMissao(missao) });
    for (const dificuldade of ['facil', 'normal', 'dificil']) {
      const sim = partidaReal({ missao: id, dificuldade });
      assert.equal(sim.regras.renascer, REGRAS_LIVRES.renascer);
      const jogadores = new Set(equipesDe(sim).jogadores);
      const avisos = new Map();
      let comandos = 0;
      while (sim.tick < 25 * 60 * 30 && resultadoDaMissao(sim).every(r => r === RESULTADO.JOGANDO)) {
        const antes = sim.comandos.length;
        passo(sim);
        for (const c of sim.comandos.slice(antes)) {
          assert.ok(jogadores.has(c.jogador) && comandoValido(c), JSON.stringify(c));
          comandos++;
        }
        for (let k = 0; k < sim.eventos.length; k += TAMANHO_EVENTO) {
          const tipo = sim.eventos[k + E_TIPO];
          const grupo = rotulos[sim.eventos[k + E_ARG]];
          if (tipo === EVENTO.AVISO_ATAQUE) avisos.set(grupo, sim.tick);
          if (tipo === EVENTO.ONDA && avisos.has(grupo)) assert.ok(sim.tick - avisos.get(grupo) >= 10 * 30, `${dificuldade}: ${grupo} at least 10 s after its warning`);
        }
      }
      assert.equal(resultadoDaMissao(sim)[0], RESULTADO.DERROTA, `${dificuldade}: the base fell (tick ${sim.tick})`);
      assert.ok(comandos > 10, `${dificuldade}: the teams gave orders`);
    }
  });
}
