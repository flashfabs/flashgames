// The Morro Aceso mission (site/rts/dados/missoes/morro-aceso.json) played on its real map and data, with the
// computer teams on: the scripted pieces a player meets do what the design says. A Religador with an escort at the
// substation starts the climax, the final waves come after their warnings, the reinforcement arrives, and the win
// comes after the close; the camp packs up when threatened, runs through the gorge and sets up in its refuge; the
// maintenance crew repairing the overturned truck brings back a veteran Cesto.
import test from 'node:test';
import assert from 'node:assert/strict';
import { passo, agendarComando } from '../site/rts/js/sim/simulacao.js';
import { TIPO_COMANDO, FP, criarComando, EVENTO, TAMANHO_EVENTO, E_TIPO, E_ARG } from '../site/rts/js/sim/contratos.js';
import { criarEntidade, idDoSlot } from '../site/rts/js/sim/entidades.js';
import { extrasMissao, missaoDe, resultadoDaMissao, rotulosDaMissao, RESULTADO, ESTADO_OBJETIVO } from '../site/rts/js/sim/gatilhos.js';
import { partidaReal } from '../ferramentas/rts/ia-harness.mjs';

const SEGUNDO = 30;
const celula = n => n * FP + (FP >> 1);

function partida(dificuldade) {
  const sim = partidaReal({ missao: 'morro-aceso', dificuldade });
  for (let k = 0; k < 2 * SEGUNDO; k++) passo(sim);
  return sim;
}
const tipo = (sim, nome) => sim.tipos.findIndex(t => t.nome === nome);
const disparou = (sim, id) => extrasMissao(sim).disparos[missaoDe(sim).gatilhos.findIndex(g => g.id === id)] > 0;
const objetivo = (sim, id) => extrasMissao(sim).objetivos[missaoDe(sim).objetivos.findIndex(o => o.id === id)];
const doTipo = (sim, nome, time) => {
  const lista = [];
  for (let i = 0; i < sim.capacidade; i++) if (sim.ativo[i] && sim.tipo[i] === tipo(sim, nome) && (time === undefined || sim.time[i] === time)) lista.push(i);
  return lista;
};
const ordem = (sim, tipoComando, unidades, campos) => agendarComando(sim, criarComando({ tick: sim.tick + 1, jogador: 0, seq: sim.tick, tipo: tipoComando, unidades: unidades.map(i => idDoSlot(sim, i)), ...campos }));

for (const dificuldade of ['facil', 'normal']) {
  test(`morro-aceso, ${dificuldade}: re-powering the substation runs the climax and the close, and wins`, () => {
    const sim = partida(dificuldade);
    const subestacao = sim.etiquetas['subestacao-do-morro'];
    const religador = criarEntidade(sim, tipo(sim, 'religador'), 0, celula(110), celula(17), 0);
    for (let k = 0; k < 8; k++) criarEntidade(sim, tipo(sim, 'cesto-blindado'), 0, celula(104 + k), celula(19), 0);
    ordem(sim, TIPO_COMANDO.HABILIDADE, [religador], { alvo: idDoSlot(sim, subestacao), arg: 1 });
    const rotulos = rotulosDaMissao(sim.opcoes.missao);
    const avisos = new Map();
    const ondas = [];
    let luz = 0;
    while (sim.tick < 6 * 60 * SEGUNDO && resultadoDaMissao(sim).every(r => r === RESULTADO.JOGANDO)) {
      passo(sim);
      for (let o = 0; o < sim.eventos.length; o += TAMANHO_EVENTO) {
        const tipoEvento = sim.eventos[o + E_TIPO];
        const grupo = rotulos[sim.eventos[o + E_ARG]];
        if (tipoEvento === EVENTO.AVISO_ATAQUE) avisos.set(grupo, sim.tick);
        if (tipoEvento === EVENTO.ONDA) ondas.push([grupo, sim.tick - avisos.get(grupo)]);
        if (tipoEvento === EVENTO.LUZ) luz++;
      }
    }
    assert.equal(resultadoDaMissao(sim)[0], RESULTADO.VITORIA, `tick ${sim.tick}`);
    assert.deepEqual(ondas.map(([g]) => g).sort(), ['onda-final-desfiladeiro', 'onda-final-varzea']);
    for (const [grupo, espera] of ondas) assert.ok(espera >= 10 * SEGUNDO, `${grupo} ${espera / SEGUNDO} s depois do aviso`);
    for (const id of ['climax', 'reforco-cestos', 'narra-meio', 'narra-quase', 'subestacao-religada']) assert.ok(disparou(sim, id), id);
    assert.equal(objetivo(sim, 'religar-subestacao'), ESTADO_OBJETIVO.CUMPRIDO);
    assert.equal(sim.time[subestacao], 0);
    assert.equal(luz, 1, 'the dusk scene, from the substation');
    assert.ok(doTipo(sim, 'cesto-blindado', 0).length >= 2, 'the two Cestos of the reinforcement');
  });
}

test('morro-aceso: the threatened camp packs up, runs through the gorge and sets up again in its refuge', () => {
  const sim = partida('normal');
  // a squad walks up to the camp's west side
  const turmas = [];
  for (let k = 0; k < 6; k++) turmas.push(criarEntidade(sim, tipo(sim, 'turma-de-linha'), 0, celula(42), celula(12 + k), 0));
  ordem(sim, TIPO_COMANDO.MOVER, turmas, { x: celula(47), y: celula(14) });
  const MONTADOS = ['carrocao-mae', 'paiol', 'barracao', 'ferraria-a-vapor'];
  const montado = () => MONTADOS.every(nome => doTipo(sim, nome, 1).length === 1);
  for (let k = 0; k < 20 * SEGUNDO || (k < 5 * 60 * SEGUNDO && !(disparou(sim, 'acampamento-remontado') && montado())); k++) passo(sim);
  for (const id of ['acampamento-ameacado', 'acampamento-foge', 'acampamento-na-grota', 'acampamento-remontado']) assert.ok(disparou(sim, id), id);
  const refugio = sim.opcoes.lugares.areas['refugio-grota'];
  for (const nome of MONTADOS) {
    const [i] = doTipo(sim, nome, 1);
    assert.ok(i !== undefined, `${nome} montado de novo`);
    const [cx, cy] = [sim.x[i] >> 10, sim.y[i] >> 10];
    assert.ok(cx >= refugio.x - 6 && cx < refugio.x + refugio.largura + 6 && cy >= refugio.y - 6 && cy < refugio.y + refugio.altura + 6, `${nome} em ${cx},${cy}, perto do refúgio`);
  }
  assert.equal(objetivo(sim, 'desmontar-acampamento'), ESTADO_OBJETIVO.ATIVO, 'the optional objective is open');
});

test('morro-aceso: the maintenance crew repairs the overturned truck and a veteran Cesto comes out', () => {
  const sim = partida('normal');
  const caminhao = sim.etiquetas['caminhao-tombado'];
  const [equipe] = doTipo(sim, 'equipe-de-manutencao', 0);
  const escolta = [];
  for (let k = 0; k < 4; k++) escolta.push(criarEntidade(sim, tipo(sim, 'turma-de-linha'), 0, celula(14 + k), celula(62), 0));
  ordem(sim, TIPO_COMANDO.ATACAR_MOVENDO, escolta, { x: celula(12), y: celula(58) });
  ordem(sim, TIPO_COMANDO.REPARAR, [equipe], { alvo: idDoSlot(sim, caminhao) });
  for (let k = 0; k < 4 * 60 * SEGUNDO && !disparou(sim, 'resgate-feito'); k++) passo(sim);
  assert.ok(disparou(sim, 'resgate-feito'), 'rescued');
  assert.equal(objetivo(sim, 'resgatar-caminhao'), ESTADO_OBJETIVO.CUMPRIDO);
  assert.equal(sim.ativo[caminhao] && sim.tipo[caminhao] === tipo(sim, 'caminhao-tombado') ? 1 : 0, 0, 'the truck is gone');
  const cestos = doTipo(sim, 'cesto-blindado', 0);
  assert.equal(cestos.length, 1);
  assert.equal(sim.veterania[cestos[0]], 2, 'a veteran');
});
