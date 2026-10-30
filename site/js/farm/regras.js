// Pimp My Farm: host-authoritative board rules. Coordinates are shared vertices and edges of hexagons.
export const RECURSOS = ['madeira', 'barro', 'lã', 'trigo', 'pedra'];
export const CORES = ['#ef5450', '#4598e9', '#edae31', '#8d68c3', '#49a969', '#e481b1'];
export const CUSTOS = { estrada: { madeira: 1, barro: 1 }, fazenda: { madeira: 1, barro: 1, 'lã': 1, trigo: 1 }, cidade: { pedra: 3, trigo: 2 }, desenvolvimento: { 'lã': 1, trigo: 1, pedra: 1 } };
export const META = 10;
const misturar = (itens, sorteio) => { const a = [...itens]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(sorteio() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const chavePonto = (x, y) => `${Math.round(x * 10000)},${Math.round(y * 10000)}`;

export function criarTabuleiro(quantidade, sorteio = Math.random) {
  const raio = quantidade > 4 ? 3 : 2;
  const coords = [];
  for (let q = -raio; q <= raio; q++) for (let r = -raio; r <= raio; r++) if (Math.abs(q + r) <= raio) coords.push([q, r]);
  const tipos = misturar([...Array.from({ length: coords.length - 1 }, (_, i) => RECURSOS[i % RECURSOS.length]), 'deserto'], sorteio);
  const numeros = misturar(Array.from({ length: coords.length - 1 }, (_, i) => [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12][i % 18]), sorteio);
  const vertices = [], arestas = [], mapaVertices = new Map(), mapaArestas = new Map();
  let num = 0;
  const terrenos = coords.map(([q, r], i) => {
    const x = Math.sqrt(3) * (q + r / 2), y = 1.5 * r;
    const pontos = Array.from({ length: 6 }, (_, k) => {
      const angulo = Math.PI / 180 * (30 + k * 60), vx = x + Math.cos(angulo), vy = y + Math.sin(angulo), chave = chavePonto(vx, vy);
      if (!mapaVertices.has(chave)) { mapaVertices.set(chave, vertices.length); vertices.push({ x: vx, y: vy, terrenos: [], vizinhos: [] }); }
      const id = mapaVertices.get(chave); vertices[id].terrenos.push(i); return id;
    });
    for (let k = 0; k < 6; k++) {
      const a = pontos[k], b = pontos[(k + 1) % 6], chave = [a, b].sort((l, v) => l - v).join(':');
      if (!mapaArestas.has(chave)) { mapaArestas.set(chave, arestas.length); arestas.push({ a, b }); vertices[a].vizinhos.push(b); vertices[b].vizinhos.push(a); }
    }
    return { x, y, tipo: tipos[i], numero: tipos[i] === 'deserto' ? null : numeros[num++], pontos };
  });
  const costeiras = arestas.filter(e => vertices[e.a].terrenos.filter(i => vertices[e.b].terrenos.includes(i)).length === 1)
    .sort((a, b) => Math.atan2(vertices[a.a].y + vertices[a.b].y, vertices[a.a].x + vertices[a.b].x) - Math.atan2(vertices[b.a].y + vertices[b.b].y, vertices[b.a].x + vertices[b.b].x));
  const tiposPorto = misturar([...RECURSOS, 'geral', 'geral', 'geral', 'geral'], sorteio);
  const portos = tiposPorto.map((tipo, i) => ({ ...costeiras[Math.floor(i * costeiras.length / tiposPorto.length)], tipo }));
  return { terrenos, vertices, arestas, portos };
}

const vazio = () => Object.fromEntries(RECURSOS.map(r => [r, 0]));
export const estoqueBanco = p => Object.fromEntries(RECURSOS.map(r => [r, Math.max(0, 19 - p.jogadores.reduce((n,j) => n + j.recursos[r], 0))]));
const soma = cartas => RECURSOS.reduce((total, r) => total + cartas[r], 0);
const cestaValida = c => c && typeof c === 'object' && RECURSOS.every(r => Number.isInteger(c[r]) && c[r] >= 0 && c[r] <= 99) && Object.keys(c).every(r => RECURSOS.includes(r)) && soma(c) > 0;
const possui = (j, c) => RECURSOS.every(r => j.recursos[r] >= c[r]);
const pagar = (j, custo) => { if (!Object.entries(custo).every(([r, n]) => j.recursos[r] >= n)) return false; for (const [r, n] of Object.entries(custo)) j.recursos[r] -= n; return true; };
const chave = (a, b) => a < b ? `${a}:${b}` : `${b}:${a}`;

export function criarPartida(participantes, sorteio = Math.random) {
  if (participantes.length < 1 || participantes.length > 6) throw new Error('A partida precisa de 1 a 6 jogadores.');
  const tabuleiro = criarTabuleiro(participantes.length, sorteio);
  const jogadores = participantes.map((p, i) => ({ id: p.id, nome: p.nome, robo: !!p.robo, dificuldade: p.robo ? (p.dificuldade || 'medio') : null, cor: CORES[i], recursos: vazio(), pontos: 0, cartas: [], cavaleiros: 0 }));
  return { tabuleiro, jogadores, construcoes: {}, estradas: {}, historico: [], rolagens: 0, fase: 'preparo', ordem: [...jogadores.map((_, i) => i), ...jogadores.map((_, i) => i).reverse()], passo: 0, etapa: 'fazenda', ultimoVertice: null, turno: 0, dados: null, ladrao: tabuleiro.terrenos.findIndex(t => t.tipo === 'deserto'), vencedor: null, proposta: null, baralho: misturar([...Array(14).fill('cavaleiro'), ...Array(5).fill('vitoria'), ...Array(2).fill('estradas'), ...Array(2).fill('colheita'), ...Array(2).fill('monopolio')], sorteio), cartaUsada: false, estradasGratis: 0, maiorEstrada: null, maiorExercito: null, mensagem: 'Escolha onde construir sua primeira fazenda.' };
}
export function assumirBot(p, botId, participante) {
  if (!p || p.fase==='fim' || !participante?.id || p.jogadores.some(j=>j.id===participante.id)) return false;
  const j=p.jogadores.find(x=>x.id===botId && x.robo); if(!j) return false;
  const novo=participante.id;j.id=novo;j.nome=participante.nome;j.robo=false;j.dificuldade=null;
  for(const c of Object.values(p.construcoes))if(c.dono===botId)c.dono=novo;
  for(const [k,dono] of Object.entries(p.estradas))if(dono===botId)p.estradas[k]=novo;
  for(const campo of ['maiorEstrada','maiorExercito','vencedor'])if(p[campo]===botId)p[campo]=novo;
  if(p.descartes && Object.hasOwn(p.descartes,botId)){p.descartes[novo]=p.descartes[botId];delete p.descartes[botId];}
  if(p.vitimas)p.vitimas=p.vitimas.map(id=>id===botId?novo:id);
  if(p.proposta){if(p.proposta.de===botId)p.proposta.de=novo;for(const campo of ['aceites','recusas'])p.proposta[campo]=p.proposta[campo].map(id=>id===botId?novo:id);}
  for(const evento of p.historico){if(evento.jogador===botId)evento.jogador=novo;for(const movimento of evento.movimentos||[]){if(movimento.de===botId)movimento.de=novo;if(movimento.para===botId)movimento.para=novo;}}
  p.historico.push({icone:'👤',jogador:novo,texto:`${participante.nome} assumiu a fazenda de ${participante.nomeBot || 'um bot'}.`});
  return true;
}
export function jogadorAtual(p) { return p.jogadores[p.fase === 'preparo' ? p.ordem[p.passo] : p.turno]; }
export function pecasDisponiveis(p, id) {
  const construcoes=Object.values(p.construcoes).filter(c=>c.dono===id);
  return { fazenda:Math.max(0,5-construcoes.filter(c=>c.tipo==='fazenda').length), cidade:Math.max(0,4-construcoes.filter(c=>c.tipo==='cidade').length), estrada:Math.max(0,15-Object.values(p.estradas).filter(dono=>dono===id).length) };
}
export function verticesLivres(p, jogador, preparo = false) {
  return p.tabuleiro.vertices.map((v, i) => i).filter(i => !p.construcoes[i] && p.tabuleiro.vertices[i].vizinhos.every(n => !p.construcoes[n]) && (preparo || p.tabuleiro.arestas.some(e => (e.a === i || e.b === i) && p.estradas[chave(e.a, e.b)] === jogador.id)));
}
export function estradasLivres(p, jogador, verticeInicial = null) {
  return p.tabuleiro.arestas.map((e, i) => i).filter(i => {
    const e = p.tabuleiro.arestas[i]; if (p.estradas[chave(e.a, e.b)]) return false;
    if (verticeInicial !== null) return e.a === verticeInicial || e.b === verticeInicial;
    return [e.a, e.b].some(v => p.construcoes[v]?.dono === jogador.id || (!p.construcoes[v] && p.tabuleiro.arestas.some(outra => (outra.a === v || outra.b === v) && p.estradas[chave(outra.a, outra.b)] === jogador.id)));
  });
}
// Longest route counts each road once and cannot pass through an opponent's building.
export function tamanhoEstrada(p, id) {
  const caminhos = p.tabuleiro.arestas.filter(e => p.estradas[chave(e.a, e.b)] === id);
  function percorrer(v, usadas) {
    if (usadas.size && p.construcoes[v] && p.construcoes[v].dono !== id) return usadas.size;
    let melhor = usadas.size;
    for (let i = 0; i < caminhos.length; i++) {
      const e = caminhos[i]; if (usadas.has(i) || (e.a !== v && e.b !== v)) continue;
      usadas.add(i); melhor = Math.max(melhor, percorrer(e.a === v ? e.b : e.a, usadas)); usadas.delete(i);
    }
    return melhor;
  }
  return caminhos.reduce((melhor, e) => Math.max(melhor, percorrer(e.a, new Set()), percorrer(e.b, new Set())), 0);
}
function atualizarPremio(p, campo, valores, minimo) {
  const maximo = Math.max(0, ...valores.map(x => x.valor));
  const empatados = valores.filter(x => x.valor === maximo && x.valor >= minimo);
  const anterior = p[campo];
  const novo = empatados.some(x => x.id === anterior) ? anterior : empatados.length === 1 ? empatados[0].id : null;
  if (anterior === novo) return;
  const perdeu = p.jogadores.find(j => j.id === anterior), ganhou = p.jogadores.find(j => j.id === novo);
  if (perdeu) perdeu.pontos -= 2;
  if (ganhou) ganhou.pontos += 2;
  p[campo] = novo;
}
function atualizarEstrada(p) { atualizarPremio(p, 'maiorEstrada', p.jogadores.map(j => ({ id:j.id, valor:tamanhoEstrada(p,j.id) })), 5); }
function atualizarExercito(p) { atualizarPremio(p, 'maiorExercito', p.jogadores.map(j => ({ id:j.id, valor:j.cavaleiros })), 3); }
function checarVitoria(p, j) { if (j.pontos >= META) { p.fase = 'fim'; p.vencedor = j.id; p.mensagem = `${j.nome} venceu com ${j.pontos} pontos!`; } }
export function taxaBanco(p, id, recurso) {
  let taxa = 4;
  for (const porto of p.tabuleiro.portos ?? []) {
    if (![porto.a, porto.b].some(v => p.construcoes[v]?.dono === id)) continue;
    if (porto.tipo === recurso) return 2;
    if (porto.tipo === 'geral') taxa = 3;
  }
  return taxa;
}
function roubar(p, j, vitima, sorteio) {
  const cartas = RECURSOS.flatMap(r => Array(vitima.recursos[r]).fill(r));
  if (cartas.length) { const recurso = cartas[Math.floor(sorteio() * cartas.length)]; vitima.recursos[recurso]--; j.recursos[recurso]++; }
}
function distribuir(p, numero) {
  const ganhos = Object.fromEntries(p.jogadores.map(j => [j.id, vazio()]));
  for (const [i, terreno] of p.tabuleiro.terrenos.entries()) {
    if (i === p.ladrao || terreno.numero !== numero) continue;
    for (const v of terreno.pontos) { const casa = p.construcoes[v]; if (casa) ganhos[casa.dono][terreno.tipo] += casa.tipo === 'cidade' ? 2 : 1; }
  }
  const estoque=estoqueBanco(p);
  for (const r of RECURSOS) {
    const total=p.jogadores.reduce((n,j)=>n+ganhos[j.id][r],0);
    const beneficiarios=p.jogadores.filter(j=>ganhos[j.id][r]>0);
    if (total > estoque[r]) { if (beneficiarios.length===1) beneficiarios[0].recursos[r]+=estoque[r]; continue; }
    for (const j of beneficiarios) j.recursos[r]+=ganhos[j.id][r];
  }
}
const simbolosLog={madeira:'🌲',barro:'🧱','lã':'🐑',trigo:'🌾',pedra:'⛰️'};
const resumoLog=(c={})=>RECURSOS.filter(r=>c[r]).map(r=>`${simbolosLog[r]}${c[r]}`).join(' ');
export function expirarProposta(p, agora = Date.now()) {
  if (!p.proposta || agora < p.proposta.expiraEm) return false;
  const autor=p.jogadores.find(j=>j.id===p.proposta.de);
  p.historico.push({icone:'⌛',jogador:p.proposta.de,texto:`A proposta de ${autor?.nome ?? 'jogador'} expirou.`});
  p.proposta=null;p.mensagem='A proposta de troca expirou.';return true;
}
export function agir(p,id,acao,sorteio=Math.random){
 const j=p.jogadores.find(x=>x.id===id), antes=new Map(p.jogadores.map(x=>[x.id,{...x.recursos}])), proposta=p.proposta && structuredClone(p.proposta), fase=p.fase, carta=acao?.tipo==='jogar-carta'?j?.cartas?.[acao.indice]?.tipo:null;
 if(expirarProposta(p))return false;
 if(!agirInterno(p,id,acao,sorteio))return false;
 const nome=j.nome, icone={fazenda:'🏠',cidade:'🏙️',estrada:'🛣️',dados:'🎲',ladrao:'🥷',roubar:'🥷','comprar-carta':'🃏','jogar-carta':'🃏',descartar:'📤',banco:'⚓',propor:'🤝',responder:'🤝','concluir-troca':'🤝','cancelar-proposta':'🤝',passar:'➡️'}[acao.tipo]||'•';
 const descricao={fazenda:'construiu uma fazenda',cidade:'construiu uma cidade',estrada:'construiu uma estrada',dados:`rolou ${p.dados?.join(' + ')} = ${p.dados?.reduce((a,b)=>a+b,0)}`,ladrao:'moveu o ladrão',roubar:'roubou um recurso','comprar-carta':'comprou uma carta','jogar-carta':'jogou uma carta',descartar:'descartou recursos',banco:`trocou ${resumoLog(acao.oferta)} por ${resumoLog(acao.pedido)} no banco`,propor:`propôs ${resumoLog(acao.oferta)} por ${resumoLog(acao.pedido)}`,responder:acao.aceitar?'aceitou a proposta':'recusou a proposta','concluir-troca':`trocou com ${p.jogadores.find(x=>x.id===acao.alvo)?.nome}: ${resumoLog(proposta?.oferta||{})} por ${resumoLog(proposta?.pedido||{})}`,'cancelar-proposta':'cancelou a proposta',passar:'encerrou o turno'}[acao.tipo];
 const movimentos=[];
 if (acao.tipo==='concluir-troca' && proposta) {
  for(const r of RECURSOS){if(proposta.oferta[r])movimentos.push({recurso:r,quantidade:proposta.oferta[r],de:id,para:acao.alvo});if(proposta.pedido[r])movimentos.push({recurso:r,quantidade:proposta.pedido[r],de:acao.alvo,para:id});}
 } else if(acao.tipo==='jogar-carta' && carta==='monopolio') {
  for(const outro of p.jogadores)if(outro.id!==id){const quantidade=antes.get(outro.id)[acao.recurso]-outro.recursos[acao.recurso];if(quantidade>0)movimentos.push({recurso:acao.recurso,quantidade,de:outro.id,para:id});}
 } else if(['dados','fazenda','cidade','estrada','comprar-carta','banco','descartar'].includes(acao.tipo) || (acao.tipo==='jogar-carta' && carta==='colheita')) {
  for(const jogador of p.jogadores)for(const r of RECURSOS){const delta=jogador.recursos[r]-antes.get(jogador.id)[r];if(delta>0)movimentos.push({recurso:r,quantidade:delta,de:'banco',para:jogador.id});else if(delta<0 && acao.tipo!=='jogar-carta')movimentos.push({recurso:r,quantidade:-delta,de:jogador.id,para:'banco'});}
 }
 p.historico.push({icone,jogador:id,texto:`${nome} ${descricao}.`,...(movimentos.length?{movimentos}:{})});
 if(acao.tipo==='dados' || (fase==='preparo' && acao.tipo==='fazenda')) for(const jogador of p.jogadores){const recebido=Object.fromEntries(RECURSOS.map(r=>[r,Math.max(0,jogador.recursos[r]-antes.get(jogador.id)[r])]));if(soma(recebido))p.historico.push({icone:'📦',jogador:jogador.id,texto:`${jogador.nome} recebeu ${resumoLog(recebido)}.`});}
 return true;
}
function agirInterno(p, id, acao, sorteio = Math.random) {
  const j = p.jogadores.find(x => x.id === id);
  if (!j || p.fase === 'fim' || !acao || typeof acao !== 'object') return false;
  if (p.fase === 'descarte' && acao.tipo === 'descartar' && p.descartes?.[id] > 0) {
    const valores = acao.recursos;
    if (!valores || typeof valores !== 'object' || !RECURSOS.every(r => Number.isInteger(valores[r]) && valores[r] >= 0 && valores[r] <= j.recursos[r]) || RECURSOS.reduce((n, r) => n + valores[r], 0) !== p.descartes[id]) return false;
    for (const r of RECURSOS) j.recursos[r] -= valores[r];
    delete p.descartes[id];
    if (!Object.keys(p.descartes).length) { p.fase = 'ladrao'; p.mensagem = 'Mova o ladrão para outro terreno.'; }
    return true;
  }
  if (acao.tipo === 'cancelar-proposta' && p.proposta?.de === id) { p.proposta = null; p.mensagem = 'Proposta de troca cancelada.'; return true; }
  if (acao.tipo === 'concluir-troca' && p.proposta?.de === id && p.proposta.aceites.includes(acao.alvo)) {
    const oferta = p.proposta, outro = p.jogadores.find(x => x.id === acao.alvo);
    if (!outro || !possui(j, oferta.oferta) || !possui(outro, oferta.pedido)) return false;
    for (const r of RECURSOS) { j.recursos[r] += oferta.pedido[r] - oferta.oferta[r]; outro.recursos[r] += oferta.oferta[r] - oferta.pedido[r]; }
    p.mensagem = `${j.nome} concluiu a troca com ${outro.nome}.`; p.proposta = null; return true;
  }
  if (acao.tipo === 'responder' && p.proposta && p.proposta.de !== id && typeof acao.aceitar === 'boolean') {
    const oferta = p.proposta, outro = p.jogadores.find(x => x.id === oferta.de);
    if (acao.aceitar) {
      if (!outro || !possui(outro, oferta.oferta) || !possui(j, oferta.pedido)) return false;
      oferta.recusas = oferta.recusas.filter(x => x !== id);
      if (!oferta.aceites.includes(id)) oferta.aceites.push(id);
      p.mensagem = `${j.nome} aceitou a proposta. ${outro.nome} pode escolher com quem trocar.`;
    } else {
      oferta.aceites = oferta.aceites.filter(x => x !== id);
      if (!oferta.recusas.includes(id)) oferta.recusas.push(id);
      p.mensagem = `${j.nome} recusou a troca.`;
      if (p.jogadores.every(x => x.id === oferta.de || oferta.recusas.includes(x.id))) { p.proposta=null; p.mensagem = 'Todos recusaram a troca.'; }
    }
    return true;
  }
  if (j !== jogadorAtual(p) || p.proposta) return false;
  if (p.fase === 'preparo') {
    if (acao.tipo === 'fazenda' && p.etapa === 'fazenda' && pecasDisponiveis(p,id).fazenda > 0 && verticesLivres(p, j, true).includes(acao.indice)) {
      p.construcoes[acao.indice] = { dono: id, tipo: 'fazenda' }; j.pontos++; p.ultimoVertice = acao.indice; p.etapa = 'estrada';
      if (p.passo >= p.jogadores.length) for (const i of p.tabuleiro.vertices[acao.indice].terrenos) { const tipo = p.tabuleiro.terrenos[i].tipo; if (tipo !== 'deserto' && estoqueBanco(p)[tipo]>0) j.recursos[tipo]++; }
      p.mensagem = 'Construa uma estrada ligada à fazenda.'; return true;
    }
    if (acao.tipo === 'estrada' && p.etapa === 'estrada' && pecasDisponiveis(p,id).estrada > 0 && estradasLivres(p, j, p.ultimoVertice).includes(acao.indice)) {
      const e = p.tabuleiro.arestas[acao.indice]; p.estradas[chave(e.a, e.b)] = id; p.passo++; p.etapa = 'fazenda'; p.ultimoVertice = null;
      if (p.passo === p.ordem.length) { p.fase = 'rolar'; p.turno = 0; p.mensagem = 'Jogue os dados para começar.'; }
      else p.mensagem = 'Escolha onde construir sua fazenda.';
      return true;
    }
    return false;
  }
  if (p.fase === 'rolar' && acao.tipo === 'dados') {
    const a = 1 + Math.floor(sorteio() * 6), b = 1 + Math.floor(sorteio() * 6); p.dados = [a, b]; p.rolagens++;
    if (a + b === 7) {
      p.descartes = Object.fromEntries(p.jogadores.filter(jogador => soma(jogador.recursos) > 7).map(jogador => [jogador.id, Math.floor(soma(jogador.recursos) / 2)]));
      p.fase = Object.keys(p.descartes).length ? 'descarte' : 'ladrao';
      p.mensagem = p.fase === 'descarte' ? 'Quem tem mais de 7 recursos deve descartar metade.' : 'Mova o ladrão para outro terreno.';
    } else { distribuir(p, a + b); p.fase = 'acoes'; p.mensagem = `${j.nome} tirou ${a + b}. Construa, negocie ou encerre o turno.`; }
    return true;
  }
  if (p.fase === 'ladrao' && acao.tipo === 'ladrao' && Number.isInteger(acao.indice) && p.tabuleiro.terrenos[acao.indice] && acao.indice !== p.ladrao) {
    p.ladrao = acao.indice; const vitimas = p.jogadores.filter(x => x.id !== id && soma(x.recursos) && p.tabuleiro.terrenos[acao.indice].pontos.some(v => p.construcoes[v]?.dono === x.id));
    if (vitimas.length > 1) { p.vitimas = vitimas.map(v => v.id); p.fase = 'roubo'; p.mensagem = 'Escolha de quem pegar um recurso.'; return true; }
    if (vitimas.length === 1) roubar(p, j, vitimas[0], sorteio);
    p.fase = p.depoisLadrao || 'acoes'; p.depoisLadrao = null; p.mensagem = p.fase === 'rolar' ? 'Ladrão movido. Jogue os dados.' : 'Ladrão movido. Construa, negocie ou encerre o turno.'; return true;
  }
  if (p.fase === 'roubo' && acao.tipo === 'roubar' && p.vitimas?.includes(acao.alvo)) {
    const vitima = p.jogadores.find(x => x.id === acao.alvo); if (!vitima) return false;
    roubar(p, j, vitima, sorteio); p.vitimas = []; p.fase = p.depoisLadrao || 'acoes'; p.depoisLadrao = null;
    p.mensagem = p.fase === 'rolar' ? 'Jogue os dados.' : 'Construa, negocie ou encerre o turno.'; return true;
  }
  if ((p.fase === 'rolar' || p.fase === 'acoes') && acao.tipo === 'jogar-carta' && !p.cartaUsada) {
    const carta = j.cartas[acao.indice];
    if (!carta || carta.nova || carta.tipo === 'vitoria') return false;
    if (carta.tipo === 'cavaleiro') { j.cartas.splice(acao.indice, 1); j.cavaleiros++; p.cartaUsada = true; atualizarExercito(p); checarVitoria(p, j); if (p.fase !== 'fim') { p.depoisLadrao = p.fase; p.fase = 'ladrao'; p.mensagem = 'Mova o ladrão para outro terreno.'; } return true; }
    if (p.fase !== 'acoes') return false;
    if (carta.tipo === 'estradas') { j.cartas.splice(acao.indice, 1); p.cartaUsada = true; p.estradasGratis = 2; p.mensagem = 'Construa até duas estradas gratuitas.'; return true; }
    if (carta.tipo === 'colheita' && RECURSOS.includes(acao.recurso) && RECURSOS.includes(acao.outro) && estoqueBanco(p)[acao.recurso] >= (acao.recurso===acao.outro?2:1) && estoqueBanco(p)[acao.outro] >= 1) { j.cartas.splice(acao.indice,1); j.recursos[acao.recurso]++; j.recursos[acao.outro]++; p.cartaUsada = true; return true; }
    if (carta.tipo === 'monopolio' && RECURSOS.includes(acao.recurso)) { j.cartas.splice(acao.indice,1); for (const outro of p.jogadores) if (outro !== j) { j.recursos[acao.recurso] += outro.recursos[acao.recurso]; outro.recursos[acao.recurso] = 0; } p.cartaUsada = true; return true; }
    return false;
  }
  if (p.fase !== 'acoes') return false;
  if (acao.tipo === 'comprar-carta' && p.baralho.length && pagar(j, CUSTOS.desenvolvimento)) { const tipo = p.baralho.pop(); j.cartas.push({ tipo, nova:true }); if (tipo === 'vitoria') { j.pontos++; checarVitoria(p,j); } return true; }
  if (acao.tipo === 'estrada' && pecasDisponiveis(p,id).estrada > 0 && estradasLivres(p, j).includes(acao.indice) && (p.estradasGratis > 0 || pagar(j, CUSTOS.estrada))) { const e = p.tabuleiro.arestas[acao.indice]; p.estradas[chave(e.a, e.b)] = id; if (p.estradasGratis > 0) p.estradasGratis--; atualizarEstrada(p); checarVitoria(p,j); return true; }
  if (acao.tipo === 'fazenda' && pecasDisponiveis(p,id).fazenda > 0 && verticesLivres(p, j).includes(acao.indice) && pagar(j, CUSTOS.fazenda)) { p.construcoes[acao.indice] = { dono: id, tipo: 'fazenda' }; j.pontos++; atualizarEstrada(p); checarVitoria(p, j); return true; }
  if (acao.tipo === 'cidade' && pecasDisponiveis(p,id).cidade > 0 && p.construcoes[acao.indice]?.dono === id && p.construcoes[acao.indice]?.tipo === 'fazenda' && pagar(j, CUSTOS.cidade)) { p.construcoes[acao.indice].tipo = 'cidade'; j.pontos++; checarVitoria(p, j); return true; }
  if (['banco', 'propor'].includes(acao.tipo) && cestaValida(acao.oferta) && cestaValida(acao.pedido) && possui(j, acao.oferta) && RECURSOS.every(r => !acao.oferta[r] || !acao.pedido[r])) {
    if (acao.tipo === 'banco') {
      if (!RECURSOS.every(r => acao.pedido[r] <= estoqueBanco(p)[r])) return false;
      if (!RECURSOS.every(r => acao.oferta[r] % taxaBanco(p, id, r) === 0) || RECURSOS.reduce((n, r) => n + acao.oferta[r] / taxaBanco(p, id, r), 0) !== soma(acao.pedido)) return false;
      for (const r of RECURSOS) j.recursos[r] += acao.pedido[r] - acao.oferta[r];
      return true;
    }
    if (p.jogadores.length < 2) return false;
    p.proposta = { de: id, oferta: { ...acao.oferta }, pedido: { ...acao.pedido }, recusas: [], aceites: [], expiraEm: Date.now() + 35000 }; return true;
  }
  if (acao.tipo === 'passar') { p.turno = (p.turno + 1) % p.jogadores.length; p.fase = 'rolar'; p.cartaUsada = false; p.estradasGratis = 0; for (const carta of p.jogadores[p.turno].cartas) carta.nova = false; p.mensagem = 'Jogue os dados para começar.'; return true; }
  return false;
}
