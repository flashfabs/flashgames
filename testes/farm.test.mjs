import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarTabuleiro, criarPartida, assumirBot, agir, jogadorAtual, pecasDisponiveis, verticesLivres, estradasLivres, tamanhoEstrada, taxaBanco, expirarProposta, RECURSOS } from '../site/js/farm/regras.js';

const cesta = itens => Object.fromEntries(RECURSOS.map(r=>[r,itens[r] || 0]));
const jogadores = [{id:'a',nome:'Ana'}, {id:'b',nome:'Bia'}];
function preparar() {
  const p = criarPartida(jogadores, () => 0.5);
  while (p.fase === 'preparo') {
    const j = jogadorAtual(p);
    if (p.etapa === 'fazenda') assert.ok(agir(p,j.id,{tipo:'fazenda',indice:verticesLivres(p,j,true)[0]}));
    else assert.ok(agir(p,j.id,{tipo:'estrada',indice:estradasLivres(p,j,p.ultimoVertice)[0]}));
  }
  return p;
}

test('hexagons share vertices and edges, with a larger board for six players', () => {
  const normal = criarTabuleiro(4, () => 0.5);
  assert.equal(normal.terrenos.length, 19); assert.equal(normal.vertices.length, 54); assert.equal(normal.arestas.length, 72);
  assert.equal(criarTabuleiro(1, () => 0.5).terrenos.length, 19);
  assert.equal(criarTabuleiro(5, () => 0.5).terrenos.length, 37);
  assert.equal(criarTabuleiro(6, () => 0.5).terrenos.length, 37);
  assert.equal(normal.terrenos.filter(t => t.tipo === 'deserto').length, 1);
});
test('setup alternates in snake order, gives two farms, roads and starting resources', () => {
  const p = preparar(); assert.equal(p.fase,'rolar'); assert.equal(jogadorAtual(p).id,'a');
  assert.deepEqual(p.jogadores.map(j=>j.pontos),[2,2]); assert.equal(Object.keys(p.estradas).length,4);
  for(const j of p.jogadores) assert.ok(RECURSOS.reduce((n,r)=>n+j.recursos[r],0)>0);
});
test('actions are restricted to the active player and bank trade costs four', () => {
  const p=preparar(), a=p.jogadores[0]; assert.equal(agir(p,'b',{tipo:'dados'}),false);
  assert.ok(agir(p,'a',{tipo:'dados'},()=>0)); assert.equal(p.fase,'acoes');
  a.recursos.madeira=4; const antes=a.recursos.trigo;
  assert.ok(agir(p,'a',{tipo:'banco',oferta:cesta({madeira:4}),pedido:cesta({trigo:1})}));
  assert.equal(a.recursos.madeira,0); assert.equal(a.recursos.trigo,antes+1);
  assert.ok(agir(p,'a',{tipo:'passar'})); assert.equal(jogadorAtual(p).id,'b');
});
test('player trades need the recipient to accept and transfer resources', () => {
  const p=preparar(); agir(p,'a',{tipo:'dados'},()=>0);
  p.jogadores[0].recursos.madeira=2;p.jogadores[1].recursos.trigo=1;p.jogadores[1].recursos.madeira=0;
  assert.ok(agir(p,'a',{tipo:'propor',oferta:cesta({madeira:2}),pedido:cesta({trigo:1})}));
  assert.equal(agir(p,'a',{tipo:'passar'}),false); assert.ok(agir(p,'b',{tipo:'responder',aceitar:true}));
  assert.ok(agir(p,'a',{tipo:'concluir-troca',alvo:'b'}));
  assert.equal(p.jogadores[0].recursos.madeira,0);assert.equal(p.jogadores[1].recursos.madeira,2);assert.equal(p.proposta,null);
});
test('a seven requires moving the robber before the turn can proceed', () => {
  const p=preparar(); let n=0; assert.ok(agir(p,'a',{tipo:'dados'},()=>++n===1?0:0.9));
  assert.equal(p.fase,'ladrao');assert.equal(agir(p,'a',{tipo:'passar'}),false);
  const destino=p.ladrao===0?1:0;assert.ok(agir(p,'a',{tipo:'ladrao',indice:destino},()=>0)); assert.equal(p.fase,'acoes');
});

test('development cards cannot be played on the turn they are purchased', () => {
  const p=preparar(), a=p.jogadores[0]; agir(p,'a',{tipo:'dados'},()=>0);
  a.recursos['lã']=1; a.recursos.trigo=1; a.recursos.pedra=1; p.baralho=['cavaleiro'];
  assert.ok(agir(p,'a',{tipo:'comprar-carta'})); assert.equal(agir(p,'a',{tipo:'jogar-carta',indice:0}),false);
  agir(p,'a',{tipo:'passar'}); agir(p,'b',{tipo:'dados'},()=>0); agir(p,'b',{tipo:'passar'});
  assert.ok(agir(p,'a',{tipo:'jogar-carta',indice:0})); assert.equal(p.fase,'ladrao');
  assert.ok(agir(p,'a',{tipo:'ladrao',indice:p.ladrao===0?1:0},()=>0)); assert.equal(p.fase,'rolar');
});
test('road length counts connected edges without reusing any segment', () => {
  const p=preparar(), a=p.jogadores[0];
  const antes=tamanhoEstrada(p,a.id); assert.ok(antes>=1);
  const livre=estradasLivres(p,a)[0], e=p.tabuleiro.arestas[livre];
  p.estradas[e.a<e.b?`${e.a}:${e.b}`:`${e.b}:${e.a}`]=a.id;
  assert.ok(tamanhoEstrada(p,a.id)>=antes);
});

test('a player selects exactly half their cards after rolling seven', () => {
  const p=preparar(), a=p.jogadores[0], b=p.jogadores[1];
  for(const r of RECURSOS){a.recursos[r]=0;b.recursos[r]=0;} a.recursos.madeira=8;
  let n=0; agir(p,'a',{tipo:'dados'},()=>++n===1?0:0.9); assert.equal(p.fase,'descarte');
  const invalido=Object.fromEntries(RECURSOS.map(r=>[r,0])); assert.equal(agir(p,'a',{tipo:'descartar',recursos:invalido}),false);
  invalido.madeira=4; assert.ok(agir(p,'a',{tipo:'descartar',recursos:invalido})); assert.equal(a.recursos.madeira,4); assert.equal(p.fase,'ladrao');
});
test('a farm at a specialized port enables two-for-one bank trades', () => {
  const p=preparar(), a=p.jogadores[0]; agir(p,'a',{tipo:'dados'},()=>0);
  const porto=p.tabuleiro.portos.find(x=>x.tipo==='madeira'); p.construcoes[porto.a]={dono:a.id,tipo:'fazenda'};
  assert.equal(taxaBanco(p,a.id,'madeira'),2); a.recursos.madeira=2; const antes=a.recursos.trigo;
  assert.ok(agir(p,'a',{tipo:'banco',oferta:cesta({madeira:2}),pedido:cesta({trigo:1})})); assert.equal(a.recursos.madeira,0);assert.equal(a.recursos.trigo,antes+1);
});

test('one human can play solo and bot difficulty is preserved', () => {
  const solo=criarPartida([{id:'a',nome:'Ana'}],()=>0.5); assert.equal(solo.jogadores.length,1); assert.deepEqual(solo.ordem,[0,0]);
  const comBot=criarPartida([{id:'a',nome:'Ana'},{id:'b',nome:'Bento',robo:true,dificuldade:'dificil'}],()=>0.5);
  assert.equal(comBot.jogadores[1].dificuldade,'dificil');
});

test('the active player chooses among accepted public offers and completes only their chosen trade', () => {
  const p=criarPartida([...jogadores,{id:'c',nome:'Caio'},{id:'d',nome:'Dani'}],()=>0.5);p.fase='acoes';p.turno=0;
  const [a,b,c,d]=p.jogadores;a.recursos.madeira=2;a.recursos.barro=1;
  b.recursos.trigo=c.recursos.trigo=2;b.recursos.pedra=c.recursos.pedra=1;
  const oferta=cesta({madeira:2,barro:1}),pedido=cesta({trigo:2,pedra:1});
  assert.ok(agir(p,'a',{tipo:'propor',oferta,pedido}));assert.equal(agir(p,'a',{tipo:'responder',aceitar:true}),false);
  assert.ok(agir(p,'b',{tipo:'responder',aceitar:true}));assert.ok(agir(p,'c',{tipo:'responder',aceitar:true}));
  assert.equal(a.recursos.madeira,2);assert.equal(c.recursos.trigo,2);
  assert.equal(agir(p,'d',{tipo:'concluir-troca',alvo:'b'}),false);assert.equal(agir(p,'a',{tipo:'concluir-troca',alvo:'d'}),false);
  assert.ok(agir(p,'d',{tipo:'responder',aceitar:false}));assert.ok(agir(p,'a',{tipo:'concluir-troca',alvo:'c'}));
  assert.equal(p.proposta,null);assert.equal(a.recursos.trigo,2);assert.equal(a.recursos.pedra,1);assert.equal(c.recursos.madeira,2);assert.equal(c.recursos.barro,1);assert.equal(b.recursos.trigo,2);
});
test('withdrawn acceptance cannot be chosen and resources are checked again on completion', () => {
  const p=criarPartida([...jogadores,{id:'c',nome:'Caio'}],()=>0.5);p.fase='acoes';const [a,b,c]=p.jogadores;a.recursos.madeira=1;b.recursos.trigo=c.recursos.trigo=1;
  assert.ok(agir(p,'a',{tipo:'propor',oferta:cesta({madeira:1}),pedido:cesta({trigo:1})}));
  assert.ok(agir(p,'b',{tipo:'responder',aceitar:true}));assert.ok(agir(p,'c',{tipo:'responder',aceitar:true}));
  assert.ok(agir(p,'b',{tipo:'responder',aceitar:false}));assert.equal(agir(p,'a',{tipo:'concluir-troca',alvo:'b'}),false);
  c.recursos.trigo=0;assert.equal(agir(p,'a',{tipo:'concluir-troca',alvo:'c'}),false);assert.ok(p.proposta);
});
test('bank trade uses the owned port rate for each resource', () => {
  const p=criarPartida(jogadores,()=>0.5);p.fase='acoes';const a=p.jogadores[0];const porto=p.tabuleiro.portos.find(x=>x.tipo==='madeira');p.construcoes[porto.a]={dono:a.id,tipo:'fazenda'};a.recursos.madeira=4;a.recursos.barro=4;
  assert.ok(agir(p,a.id,{tipo:'banco',oferta:cesta({madeira:4,barro:4}),pedido:cesta({trigo:3})}));assert.equal(a.recursos.trigo,3);
});
test('stone uses 4:1 without an owned stone or general port, even if another player owns the stone port', () => {
  const p=criarPartida(jogadores,()=>0.5);p.fase='acoes';const [a,b]=p.jogadores;
  const pedra=p.tabuleiro.portos.find(porto=>porto.tipo==='pedra');
  const outro=p.tabuleiro.portos.find(porto=>porto.tipo==='madeira' && ![porto.a,porto.b].includes(pedra.a) && ![porto.a,porto.b].includes(pedra.b));
  p.construcoes[pedra.a]={dono:b.id,tipo:'fazenda'};p.construcoes[outro.a]={dono:a.id,tipo:'fazenda'};
  assert.equal(taxaBanco(p,a.id,'pedra'),4);assert.equal(taxaBanco(p,b.id,'pedra'),2);
  a.recursos.pedra=4;assert.equal(agir(p,a.id,{tipo:'banco',oferta:cesta({pedra:2}),pedido:cesta({trigo:1})}),false);
  assert.ok(agir(p,a.id,{tipo:'banco',oferta:cesta({pedra:4}),pedido:cesta({trigo:1})}));
});

test('bank inventory decreases on production and replenishes on purchases and trading', () => {
  const p=criarPartida(jogadores,()=>0.5),a=p.jogadores[0];p.fase='rolar';p.tabuleiro.terrenos.forEach(t=>t.numero=null);
  const i=p.tabuleiro.terrenos.findIndex(t=>t.tipo==='madeira');p.ladrao=p.tabuleiro.terrenos.findIndex(t=>t.tipo==='deserto');p.tabuleiro.terrenos[i].numero=2;
  p.construcoes[p.tabuleiro.terrenos[i].pontos[0]]={dono:a.id,tipo:'fazenda'};
  assert.ok(agir(p,a.id,{tipo:'dados'},()=>0));assert.equal(a.recursos.madeira,1);assert.equal(p.historico.some(e=>e.texto.includes('recebeu 🌲1')),true);
  a.recursos.madeira=4;assert.ok(agir(p,a.id,{tipo:'banco',oferta:cesta({madeira:4}),pedido:cesta({trigo:1})}));
  assert.equal(a.recursos.madeira,0);assert.equal(a.recursos.trigo,1);
});
test('resource shortage follows the official rule for one or multiple eligible players', () => {
  const criar=(dois)=>{const p=criarPartida(jogadores,()=>0.5);p.fase='rolar';p.tabuleiro.terrenos.forEach(t=>t.numero=null);const t=p.tabuleiro.terrenos.find(t=>t.tipo==='madeira');t.numero=2;p.ladrao=p.tabuleiro.terrenos.findIndex(t=>t.tipo==='deserto');p.jogadores[0].recursos.madeira=18;p.construcoes[t.pontos[0]]={dono:'a',tipo:'cidade'};if(dois)p.construcoes[t.pontos[3]]={dono:'b',tipo:'fazenda'};return p;};
  const so=criar(false);assert.ok(agir(so,'a',{tipo:'dados'},()=>0));assert.equal(so.jogadores[0].recursos.madeira,19);
  const varios=criar(true);assert.ok(agir(varios,'a',{tipo:'dados'},()=>0));assert.equal(varios.jogadores[0].recursos.madeira,18);assert.equal(varios.jogadores[1].recursos.madeira,0);
});
test('cannot take unavailable resources from the bank or with a harvest card', () => {
 const p=criarPartida(jogadores,()=>0.5),[a,b]=p.jogadores;p.fase='acoes';a.recursos.madeira=4;b.recursos.trigo=19;
 assert.equal(agir(p,a.id,{tipo:'banco',oferta:cesta({madeira:4}),pedido:cesta({trigo:1})}),false);
 a.cartas.push({tipo:'colheita',nova:false});assert.equal(agir(p,a.id,{tipo:'jogar-carta',indice:0,recurso:'trigo',outro:'barro'}),false);
});

test('trade offer stays open for 35 seconds and expires even after acceptance', () => {
 const p=criarPartida(jogadores,()=>0.5),[a,b]=p.jogadores;p.fase='acoes';a.recursos.madeira=1;b.recursos.trigo=1;
 const inicio=Date.now();assert.ok(agir(p,a.id,{tipo:'propor',oferta:cesta({madeira:1}),pedido:cesta({trigo:1})}));
 assert.ok(p.proposta.expiraEm>=inicio+35000 && p.proposta.expiraEm<=Date.now()+35000);
 assert.ok(agir(p,b.id,{tipo:'responder',aceitar:true}));assert.equal(expirarProposta(p,p.proposta.expiraEm-1),false);
 assert.ok(expirarProposta(p,p.proposta.expiraEm));assert.equal(p.proposta,null);assert.equal(agir(p,a.id,{tipo:'concluir-troca',alvo:b.id}),false);
 assert.equal(a.recursos.madeira,1);assert.equal(b.recursos.trigo,1);assert.ok(p.historico.some(e=>e.texto.includes('expirou')));
});
test('offer closes immediately when every other player declines', () => {
 const p=criarPartida([...jogadores,{id:'c',nome:'Caio'}],()=>0.5),[a,b,c]=p.jogadores;p.fase='acoes';a.recursos.madeira=1;b.recursos.trigo=c.recursos.trigo=1;
 assert.ok(agir(p,a.id,{tipo:'propor',oferta:cesta({madeira:1}),pedido:cesta({trigo:1})}));assert.ok(agir(p,b.id,{tipo:'responder',aceitar:false}));assert.ok(p.proposta);
 assert.ok(agir(p,c.id,{tipo:'responder',aceitar:false}));assert.equal(p.proposta,null);assert.equal(p.mensagem,'Todos recusaram a troca.');
});

test('a joining human takes over the selected bot and keeps the existing game state', () => {
 const p=criarPartida([{id:'a',nome:'Ana'},{id:'bot-1',nome:'Bento',robo:true},{id:'bot-2',nome:'Chico',robo:true}],()=>0.5);p.fase='acoes';p.turno=1;const bot=p.jogadores[1];bot.recursos.madeira=3;bot.pontos=4;bot.cartas.push({tipo:'cavaleiro',nova:false});
 p.construcoes[0]={dono:bot.id,tipo:'cidade'};p.estradas['0:1']=bot.id;p.maiorEstrada=bot.id;p.descartes={[bot.id]:2};p.vitimas=[bot.id];
 p.proposta={de:bot.id,oferta:cesta({madeira:1}),pedido:cesta({trigo:1}),recusas:['bot-2'],aceites:[bot.id],expiraEm:Date.now()+35000};
 assert.ok(assumirBot(p,'bot-1',{id:'humano',nome:'Bia',nomeBot:'Bento'}));assert.equal(p.jogadores[1].id,'humano');assert.equal(p.jogadores[1].nome,'Bia');assert.equal(p.jogadores[1].robo,false);assert.equal(p.jogadores[1].recursos.madeira,3);assert.equal(p.jogadores[1].pontos,4);assert.equal(p.jogadores[1].cartas.length,1);
 assert.equal(p.construcoes[0].dono,'humano');assert.equal(p.estradas['0:1'],'humano');assert.equal(p.maiorEstrada,'humano');assert.equal(p.descartes.humano,2);assert.deepEqual(p.vitimas,['humano']);assert.equal(p.proposta.de,'humano');assert.deepEqual(p.proposta.aceites,['humano']);assert.equal(jogadorAtual(p).id,'humano');assert.equal(p.jogadores[2].robo,true);
 assert.equal(assumirBot(p,'bot-1',{id:'outro',nome:'Outro'}),false);assert.equal(assumirBot(p,'bot-2',{id:'humano',nome:'Bia'}),false);
});

test('available pieces include setup roads and return a settlement when upgraded', () => {
 const p=preparar(),a=p.jogadores[0];assert.deepEqual(pecasDisponiveis(p,a.id),{fazenda:3,cidade:4,estrada:13});
 p.fase='acoes';p.turno=0;a.recursos.pedra=3;a.recursos.trigo=2;
 const i=Number(Object.keys(p.construcoes).find(k=>p.construcoes[k].dono===a.id));
 assert.ok(agir(p,a.id,{tipo:'cidade',indice:i}));assert.deepEqual(pecasDisponiveis(p,a.id),{fazenda:4,cidade:3,estrada:13});
});
test('each player has no more than five settlements, four cities and fifteen roads', () => {
 const p=criarPartida(jogadores,()=>0.5);p.fase='acoes';const a=p.jogadores[0];
 for(let i=0;i<5;i++)p.construcoes[i]={dono:a.id,tipo:'fazenda'};
 for(let i=5;i<9;i++)p.construcoes[i]={dono:a.id,tipo:'cidade'};
 for(let i=0;i<15;i++)p.estradas[`teste-${i}`]=a.id;
 assert.deepEqual(pecasDisponiveis(p,a.id),{fazenda:0,cidade:0,estrada:0});
 assert.deepEqual(pecasDisponiveis(p,'b'),{fazenda:5,cidade:4,estrada:15});
 a.recursos.pedra=3;a.recursos.trigo=2;assert.equal(agir(p,a.id,{tipo:'cidade',indice:0}),false);
});
