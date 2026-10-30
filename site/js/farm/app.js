import { tocarSom } from './sons.js';
import { Sala, normalizarCodigo, limparNome } from '../sala.js';
import { criarPartida, criarTabuleiro, assumirBot, agir, jogadorAtual, pecasDisponiveis, verticesLivres, estradasLivres, taxaBanco, estoqueBanco, expirarProposta, RECURSOS, CORES, CUSTOS, META } from './regras.js';

const $ = s => document.querySelector(s);
const icones = { madeira: '🌲', barro: '🧱', 'lã': '🐑', trigo: '🌾', pedra: '⛰️', deserto: '🏜️' };
const coresTerreno = { madeira: '#39784a', barro: '#c47950', 'lã': '#8cc660', trigo: '#e9c655', pedra: '#8c9aa1', deserto: '#e4c991' };
const nomesBots = ['Bento', 'Margarida', 'Chico', 'Aurora', 'Zeca'];
const svgNS = 'http://www.w3.org/2000/svg';
let sala = null, partida = null, visao = null, robos = [], modo = null, ocupado = false, botTimer = null, painelTroca = false;
let tokenBot = 0, ultimaRolagemVista = 0, timerProposta = null, timerContagem = null, timerDados = null, timerContagemDados = null;
let configuracao = { limite: 6, privacidade: 'privada', token: null }, timerPublico = null;
const DIFICULDADES = { facil: 'Fácil', medio: 'Médio', dificil: 'Difícil' };
const h = (tag, classe, texto) => { const el = document.createElement(tag); if (classe) el.className = classe; if (texto != null) el.textContent = texto; return el; };
const btn = (texto, funcao, classe = '') => { const el = h('button', classe, texto); el.type = 'button'; el.addEventListener('click', funcao); return el; };
const aviso = texto => { $('#aviso').textContent = texto || ''; };
const elSvg = (nome, attrs = {}) => { const el = document.createElementNS(svgNS, nome); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v)); return el; };
const corJogador = (p, id) => p.jogadores.find(j => j.id === id)?.cor || '#fff';
const listaRecursos = obj => RECURSOS.reduce((n, r) => n + (obj?.[r] || 0), 0);
document.addEventListener('click',e=>{if(e.target.closest('button, select, [role="button"]'))tocarSom('clique');},true);
function atualizarVisao(nova){
 const anterior=visao, novos=anterior && nova ? (nova.historico||[]).slice(anterior.historico?.length||0) : [];
 visao=nova;desenhar();
 if(nova && ((!anterior && nova.fase!=='espera') || (anterior?.fase==='espera' && nova.fase==='preparo')))tocarSom('inicio');
 if(anterior && nova && anterior.turno!==nova.turno)tocarSom('vez');
 const movimentos=novos.flatMap(e=>e.movimentos||[]);if(movimentos.some(m=>m.para===sala?.meuId))tocarSom('recurso');
 if(movimentos.length)requestAnimationFrame(()=>animarRecursos(movimentos));
}
function animarRecursos(movimentos){
 if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 const origem=id=>id==='banco'?document.querySelector('.banco-disponivel'):id===sala.meuId?document.querySelector('.minha-fazenda'):Array.from(document.querySelectorAll('[data-jogador]')).find(el=>el.dataset.jogador===id);
 for(const [indice,m] of movimentos.slice(0,12).entries()){
  const de=origem(m.de),para=origem(m.para);if(!de||!para)continue;const a=de.getBoundingClientRect(),b=para.getBoundingClientRect();if(!a.width||!b.width)continue;
  const item=h('span','recurso-voador',icones[m.recurso]);item.style.left=`${a.left+a.width/2}px`;item.style.top=`${a.top+a.height/2}px`;document.body.append(item);
  const dx=b.left+b.width/2-(a.left+a.width/2),dy=b.top+b.height/2-(a.top+a.height/2);const animacao=item.animate([{transform:'translate(-50%, -50%) scale(.7)',opacity:0},{transform:'translate(-50%, -50%) scale(1.2)',opacity:1,offset:.22},{transform:`translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.8)`,opacity:0}],{duration:1100,delay:indice*90,easing:'ease-in-out'});animacao.onfinish=()=>item.remove();animacao.oncancel=()=>item.remove();
 }
}

function nomeInicial() { try { return localStorage.getItem('farm:nome') || ''; } catch { return ''; } }
$('#nome').value = nomeInicial();
const codigoConvite = normalizarCodigo(location.hash.slice(1));
if (codigoConvite) { $('#criar').textContent = `Entrar na sala ${codigoConvite}`; $('#codigo').value = codigoConvite; }
const limiteInicio = $('#limite'), quantidadeBots = $('#bot-quantidade'), dificuldadesInicio = $('#dificuldades-bots');
function atualizarOpcoesBots() {
  const limite = Number(limiteInicio.value), anterior = Math.min(Number(quantidadeBots.value) || 0, limite - 1);
  quantidadeBots.replaceChildren(...Array.from({ length: limite }, (_, n) => { const o=document.createElement('option'); o.value=String(n); o.textContent=String(n); return o; }));
  quantidadeBots.value=String(anterior); atualizarDificuldades();
}
function atualizarDificuldades() {
  const anteriores = [...dificuldadesInicio.querySelectorAll('select')].map(s=>s.value), n=Number(quantidadeBots.value);
  $('#dificuldades-vazio').hidden = n > 0;
  dificuldadesInicio.replaceChildren(...Array.from({length:n},(_,i)=> {
    const label=h('label','',`Bot ${i+1}`), select=document.createElement('select'); select.setAttribute('aria-label',`Dificuldade do bot ${i+1}`);
    for(const [valor,nome] of Object.entries(DIFICULDADES)){const o=document.createElement('option');o.value=valor;o.textContent=nome;select.append(o);}
    select.value=anteriores[i] || 'medio'; label.append(select); return label;
  }));
}
limiteInicio.addEventListener('change', atualizarOpcoesBots);
quantidadeBots.addEventListener('change', atualizarDificuldades);
atualizarOpcoesBots();
if (codigoConvite) $('#config-sala').hidden = true;
async function atualizarSalasPublicas() {
  const lista=$('#lista-publicas'); lista.replaceChildren(h('p','config-dica','Buscando salas…'));
  try {
    const r=await fetch('/api/salas-farm',{cache:'no-store'}); if(!r.ok) throw new Error('diretório indisponível');
    const dados=await r.json(); lista.replaceChildren();
    if (!dados.salas?.length) lista.append(h('p','config-dica','Nenhuma sala pública disponível agora.'));
    for(const item of dados.salas || []) { const linha=h('div','sala-publica'); linha.append(h('span','',`${item.nome} · ${item.ocupadas}/${item.limite}`),btn('Entrar',()=>entrar(item.codigo))); lista.append(linha); }
  } catch { lista.replaceChildren(h('p','config-dica','Não foi possível carregar salas públicas. Tente novamente.')); }
}
$('#salas-publicas').addEventListener('toggle',()=>{if($('#salas-publicas').open)atualizarSalasPublicas();});
async function publicarSala(nova, config, aberta = true, bots = 0) {
  const ocupadas=Math.min(config.limite,Math.max(partida?.jogadores.length||0,nova.membros.size+bots));
  const r=await fetch('/api/salas-farm',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({codigo:nova.codigo,token:config.token,nome:limparNome($('#nome').value),limite:config.limite,ocupadas,bots,aberta}),keepalive:!aberta});
  if(!r.ok) throw new Error('Não foi possível publicar a sala. Tente novamente ou crie uma sala privada.');
}

function ocupar(valor, texto) { ocupado = valor; $('#status-inicio').textContent = texto || ''; for (const b of document.querySelectorAll('#inicio button')) b.disabled = valor; }
async function entrar(codigo = null) {
  if (ocupado) return; const nome = limparNome($('#nome').value); try { localStorage.setItem('farm:nome', nome); } catch {}
  ocupar(true, codigo ? 'Entrando na sala…' : 'Criando sua sala…');
  try {
    if (codigo) { const nova = await Sala.entrar(codigo, { nome }); abrir(nova); }
    else {
      configuracao = { limite: Number(limiteInicio.value), privacidade: $('#privacidade').value, token: crypto.randomUUID() };
      robos = [...dificuldadesInicio.querySelectorAll('select')].map((select,n)=>({id:`bot-${n}`,nome:nomesBots[n],robo:true,dificuldade:select.value}));
      const nova = await Sala.criar({ nome, maxMembros: configuracao.limite });
      try { if (configuracao.privacidade === 'publica') await publicarSala(nova,configuracao,true,robos.length); }
      catch (erro) { nova.sair(); throw erro; }
      abrir(nova);
    }
  }
  catch (erro) { console.error(erro); $('#status-inicio').textContent = erro.message || 'Não foi possível conectar à sala.'; }
  finally { ocupar(false, $('#status-inicio').textContent); }
}
$('#form-inicio').addEventListener('submit', evento => { evento.preventDefault(); entrar(codigoConvite); });
$('#form-codigo').addEventListener('submit', evento => { evento.preventDefault(); const codigo = normalizarCodigo($('#codigo').value); if (!codigo) { $('#status-inicio').textContent = 'Digite um código de sala válido.'; return; } entrar(codigo); });
$('#copiar').addEventListener('click', async () => { try { await navigator.clipboard.writeText(sala.codigo); aviso('Código copiado!'); } catch { aviso(`Código da sala: ${sala.codigo}`); } });
$('#copiar-link').addEventListener('click', async () => { try { await navigator.clipboard.writeText(sala.link); aviso('Link copiado! Envie para a galera.'); } catch { aviso(`Copie o link: ${sala.link}`); } });
$('#sair').addEventListener('click', () => { if (partida && !confirm('Sair da partida e voltar ao início?')) return; if(sala?.souAnfitriao && configuracao.privacidade==='publica') publicarSala(sala,configuracao,false,robos.length).catch(()=>{}); sala?.sair(); location.href = '/farm.html'; });
function abrir(nova) {
  sala = nova; history.replaceState(null, '', `${location.pathname}#${sala.codigo}`);
  $('#inicio').hidden = true; $('#sala').hidden = false; $('#sala-codigo').textContent = sala.codigo;
  sala.on('mensagem', receber);
  sala.on('membros', () => { if (sala.souAnfitriao) { sincronizarParticipantes(); transmitir(); } else desenhar(); });
  sala.on('saiu', membro => {
    if (!sala.souAnfitriao || !partida || partida.fase === 'fim' || partida.fase === 'espera') return;
    const jogador = partida.jogadores.find(j => j.id === membro.id);
    if (jogador && !jogador.robo) { jogador.robo = true; aviso(`${jogador.nome} saiu; um bot assumiu a fazenda.`); transmitir(); }
  });
  sala.on('reconectou', () => { aviso('Conexão restabelecida.'); sala.enviarAoAnfitriao({ t: 'farm:pedir' }); });
  sala.on('reconectando', () => aviso('Reconectando…'));
  sala.on('caiu', texto => aviso(texto));
  sala.on('trocaDeAnfitriao', () => { partida = null; visao = null; robos = []; configuracao.privacidade='privada'; clearInterval(timerPublico); aviso('O anfitrião mudou. Prepare uma nova partida.'); transmitir(); });
  if (sala.souAnfitriao) { prepararMesa(); transmitir(); if(configuracao.privacidade==='publica') timerPublico=setInterval(()=>publicarSala(sala,configuracao,salaAberta(),quantidadeRobos()).catch(()=>aviso('Não foi possível atualizar a lista pública.')),20000); } else sala.enviarAoAnfitriao({ t: 'farm:pedir' });
  desenhar();
}
function quantidadeRobos(){return partida ? partida.jogadores.filter(j=>j.robo).length : robos.length;}
function salaAberta(){return !partida || partida.fase==='espera' || (partida.fase!=='fim' && quantidadeRobos()>0);}
function jogadoresPendentes(){return partida?sala.membrosOrdenados().filter(m=>!m.fora && !partida.jogadores.some(j=>j.id===m.id)):[];}
function substituirBot(id,botId){
 const membro=sala.membros.get(id),bot=partida?.jogadores.find(j=>j.id===botId && j.robo);
 if(!membro || membro.fora || !bot || !assumirBot(partida,botId,{id:membro.id,nome:membro.nome,nomeBot:bot.nome}))return false;
 robos=robos.filter(r=>r.id!==botId);
 if(partida.fase==='espera' && partida.jogadores.length>=configuracao.limite)iniciarPartida();
 return true;
}
function sincronizarParticipantes(){
 if(!partida)return;
 if(partida.fase==='espera' && (partida.jogadores.some(j=>!j.robo && !sala.membros.has(j.id)) || (partida.jogadores.length<configuracao.limite && jogadoresPendentes().length))){prepararMesa();}
 const pendentes=jogadoresPendentes(), disponiveis=partida.jogadores.filter(j=>j.robo);
 if(pendentes.length===1 && disponiveis.length===1)substituirBot(pendentes[0].id,disponiveis[0].id);
}
function prepararMesa() {
 const participantes=[...sala.membrosOrdenados().filter(m=>!m.fora).slice(0,Math.max(0,configuracao.limite-robos.length)),...robos];
 if(!participantes.length)return;
 const anterior=partida?.fase==='espera'?partida.tabuleiro:null;
 const tamanhoMaior=participantes.length>=5;
 const tabuleiro=anterior && (anterior.terrenos.length>19)===tamanhoMaior ? anterior : criarTabuleiro(participantes.length);
 partida=criarPartida(participantes);partida.tabuleiro=tabuleiro;partida.ladrao=tabuleiro.terrenos.findIndex(t=>t.tipo==='deserto');
 partida.fase='espera';partida.mensagem='Compartilhe o código e inicie quando todos estiverem prontos.';
 if(participantes.length>=configuracao.limite) iniciarPartida();
}
function iniciarPartida(){
 if(!sala?.souAnfitriao || partida?.fase!=='espera')return;
 partida.fase='preparo';partida.mensagem='Escolha onde construir sua primeira fazenda.';
}

function vistaPara(id) {
  if (!partida) return null;
  const p = structuredClone(partida);
  p.estoque = estoqueBanco(partida);
  for (const j of p.jogadores) if (j.id !== id) { j.quantidade = listaRecursos(j.recursos); j.recursos = null; j.cartas = []; }
  p.cartasRestantes = p.baralho.length; p.baralho = [];
  return p;
}
function transmitir() {
  if (!sala?.souAnfitriao) return;
  clearTimeout(timerProposta); clearTimeout(timerDados);
  if (partida?.fase==='rolar') {
    if (!partida.prazoDados) partida.prazoDados=Date.now()+6000;
    const rodada=partida, prazo=partida.prazoDados;
    timerDados=setTimeout(()=>{if(sala?.souAnfitriao && partida===rodada && partida.fase==='rolar' && partida.prazoDados===prazo){const j=jogadorAtual(partida);if(j && agir(partida,j.id,{tipo:'dados'}))transmitir();}},Math.max(0,prazo-Date.now()));
  } else if(partida) partida.prazoDados=null;
  if (partida && expirarProposta(partida)) painelTroca=false;
  if (partida?.proposta) timerProposta=setTimeout(()=>{if(sala?.souAnfitriao && partida && expirarProposta(partida)){painelTroca=false;transmitir();}},Math.max(0,partida.proposta.expiraEm-Date.now()));
  const novaVisao = vistaPara(sala.meuId);
  for (const m of sala.membrosOrdenados()) if (m.id !== sala.meuId) sala.enviarPara(m.id, { t: 'farm:estado', partida: vistaPara(m.id), robos, configuracao: { limite: configuracao.limite, privacidade: configuracao.privacidade } });
  if(configuracao.privacidade==='publica') publicarSala(sala,configuracao,salaAberta(),quantidadeRobos()).catch(()=>aviso('Não foi possível atualizar a lista pública.'));
  atualizarVisao(novaVisao); agendarBot();
}
function receber(de, msg) {
  if (!msg || typeof msg.t !== 'string') return;
  if (sala.souAnfitriao) {
    if (msg.t === 'farm:assumir' && partida && sala.membros.has(de)) { if(substituirBot(de,msg.bot)) { sincronizarParticipantes(); transmitir(); } else sala.enviarPara(de,{t:'farm:erro',texto:'Esse bot não está mais disponível.'}); return; }
    if (msg.t === 'farm:pedir') { sala.enviarPara(de, { t: 'farm:estado', partida: vistaPara(de), robos, configuracao: { limite: configuracao.limite, privacidade: configuracao.privacidade } }); return; }
    if (msg.t === 'farm:acao' && partida && sala.membros.has(de)) { if(expirarProposta(partida)) transmitir(); if (agir(partida, de, msg.acao)) { modo = null; transmitir(); } else sala.enviarPara(de, { t: 'farm:erro', texto: 'Essa ação não é possível agora.' }); }
  } else if (de === sala.idAnfitriao && msg.t === 'farm:estado') { robos = Array.isArray(msg.robos) ? msg.robos : []; if(msg.configuracao) configuracao = { ...configuracao, ...msg.configuracao }; atualizarVisao(msg.partida); }
  else if (de === sala.idAnfitriao && msg.t === 'farm:erro') aviso(msg.texto);
}
function acionar(acao) {
  if (!sala || !visao) return;
  if (sala.souAnfitriao) { if(expirarProposta(partida)) transmitir(); if (!agir(partida, sala.meuId, acao)) { aviso('Essa ação não é possível agora.'); return; } modo = null; aviso(''); transmitir(); }
  else { modo = null; sala.enviarAoAnfitriao({ t: 'farm:acao', acao }); }
}
function lobby() {
  const area = $('#sala-conteudo'), painel = h('section', 'lobby');
  painel.append(h('p', 'selo', 'SUA MESA DE JOGO'), h('h1', '', 'Junte a galera na fazenda'), h('p', '', `Sala ${configuracao.privacidade === 'publica' ? 'pública' : 'privada'} · até ${configuracao.limite} participantes, incluindo bots.`));
  const lista = h('div', 'jogadores');
  const membros = sala.membrosOrdenados();
  [...membros, ...robos].forEach((j, n) => { const el = h('div', 'jogador'); const cor = h('span', 'bolinha'); cor.style.setProperty('--cor', CORES[n]); el.append(cor, document.createTextNode(`${j.nome}${j.robo ? ' 🤖' : ''}${j.id === sala.idAnfitriao ? ' 👑' : ''}`));
    if(j.robo && sala.souAnfitriao) { const wrap=h('div','jogador-bot'), sel=document.createElement('select'); sel.className='dificuldade-lobby'; sel.setAttribute('aria-label',`Dificuldade de ${j.nome}`); for(const [v,t] of Object.entries(DIFICULDADES)){const o=document.createElement('option');o.value=v;o.textContent=t;sel.append(o);} sel.value=j.dificuldade || 'medio';sel.addEventListener('change',()=>{j.dificuldade=sel.value;transmitir();});wrap.append(el,sel);lista.append(wrap); } else { if(j.robo) el.append(h('small','',` · ${DIFICULDADES[j.dificuldade] || 'Médio'}`)); lista.append(el); } });
  painel.append(lista, h('p', 'dica', `${membros.length + robos.length} de ${configuracao.limite} lugares · Compartilhe o código ou link.`));
  if (sala.souAnfitriao) {
    const acoes = h('div', 'lobby-acoes');
    const adicionar = btn('+ Adicionar bot', () => { if (sala.membros.size + robos.length < configuracao.limite) { const n = robos.length; robos.push({ id: `bot-${n}`, nome: nomesBots[n], robo: true, dificuldade:'medio' }); transmitir(); } });
    adicionar.disabled = membros.length + robos.length >= configuracao.limite;
    const remover = btn('− Remover bot', () => { robos.pop(); transmitir(); }); remover.disabled = !robos.length;
    const iniciar = btn('Começar partida', () => { const participantes = [...sala.membrosOrdenados().filter(m => !m.fora), ...robos]; if (participantes.length < 1) return; partida = criarPartida(participantes); transmitir(); }, 'primario'); iniciar.disabled = membros.length + robos.length < 1;
    acoes.append(adicionar, remover, iniciar); painel.append(acoes);
  } else painel.append(h('p', 'dica', 'Aguardando o anfitrião começar a partida.'));
  area.replaceChildren(painel);
}
function scoreVertice(p, indice) { return p.tabuleiro.vertices[indice].terrenos.reduce((n, i) => n + ({ 2:1, 3:2, 4:3, 5:4, 6:5, 8:5, 9:4, 10:3, 11:2, 12:1 }[p.tabuleiro.terrenos[i].numero] || 0), 0); }
function escolherBot(p, j) {
  if (p.fase === 'descarte' && p.descartes?.[j.id]) {
    const restantes={...j.recursos}, recursos=Object.fromEntries(RECURSOS.map(r=>[r,0]));
    for(let n=p.descartes[j.id];n>0;n--){const r=RECURSOS.filter(x=>restantes[x]>0).sort((a,b)=>restantes[b]-restantes[a])[0];recursos[r]++;restantes[r]--;}
    return {tipo:'descartar',recursos};
  }
  if (p.fase === 'roubo') return {tipo:'roubar',alvo:p.vitimas[0]};
  if (p.proposta && p.proposta.de === j.id) return p.proposta.aceites.length ? {tipo:'concluir-troca',alvo:p.proposta.aceites[0]} : null;
  if (p.proposta) return p.proposta.de !== j.id && !p.proposta.recusas.includes(j.id) && !p.proposta.aceites.includes(j.id) ? { tipo:'responder', aceitar: RECURSOS.every(r => j.recursos[r] >= p.proposta.pedido[r]) && Math.random() < ({facil:.85,medio:.65,dificil:.35}[j.dificuldade] ?? .65) } : null;
  if (p.fase === 'preparo') {
    if (p.etapa === 'fazenda') { const v = verticesLivres(p, j, true).sort((a,b) => scoreVertice(p,b) - scoreVertice(p,a)); const indice=j.dificuldade==='facil'?Math.floor(Math.random()*v.length):j.dificuldade==='medio'?Math.floor(Math.random()*Math.min(8,v.length)):0; return v.length ? { tipo:'fazenda', indice:v[indice] } : null; }
    const e = estradasLivres(p, j, p.ultimoVertice); return e.length ? { tipo:'estrada', indice:e[Math.floor(Math.random()*e.length)] } : null;
  }
  const cavaleiro = j.cartas.findIndex(c => c.tipo === 'cavaleiro' && !c.nova);
  if ((p.fase === 'rolar' || p.fase === 'acoes') && !p.cartaUsada && cavaleiro >= 0) return {tipo:'jogar-carta',indice:cavaleiro};
  if (p.fase === 'rolar') return null;
  if (p.fase === 'ladrao') { const outros = p.tabuleiro.terrenos.map((_,i)=>i).filter(i=>i!==p.ladrao); return {tipo:'ladrao', indice:outros[Math.floor(Math.random()*outros.length)]}; }
  if (p.fase !== 'acoes') return null;
  if (j.dificuldade === 'facil' && Math.random() < .25) return {tipo:'passar'};
  const tem = custo => Object.entries(custo).every(([r,n])=>j.recursos[r]>=n);
  if (tem(CUSTOS.cidade) && Object.values(p.construcoes).filter(c=>c.dono===j.id && c.tipo==='cidade').length < 4) { const v = Object.keys(p.construcoes).find(i=>p.construcoes[i].dono===j.id && p.construcoes[i].tipo==='fazenda'); if (v !== undefined) return {tipo:'cidade',indice:Number(v)}; }
  if (tem(CUSTOS.fazenda) && Object.values(p.construcoes).filter(c=>c.dono===j.id && c.tipo==='fazenda').length < 5) { const v=verticesLivres(p,j).sort((a,b)=>scoreVertice(p,b)-scoreVertice(p,a)); if(v.length)return {tipo:'fazenda',indice:v[0]}; }
  if ((p.estradasGratis > 0 || tem(CUSTOS.estrada)) && Object.values(p.estradas).filter(d=>d===j.id).length < 15) { const e=estradasLivres(p,j); if(e.length){ if(j.dificuldade==='dificil') e.sort((a,b)=>{const valor=i=>{const edge=p.tabuleiro.arestas[i];return Math.max(scoreVertice(p,edge.a),scoreVertice(p,edge.b));};return valor(b)-valor(a);}); return {tipo:'estrada',indice:j.dificuldade==='dificil'?e[0]:e[Math.floor(Math.random()*e.length)]}; } }
  if (tem(CUSTOS.desenvolvimento) && p.baralho.length) return {tipo:'comprar-carta'};
  const excesso=RECURSOS.find(r=>j.recursos[r]>=taxaBanco(p,j.id,r)); if(excesso){const falta=RECURSOS.filter(r=>r!==excesso && estoqueBanco(p)[r]>0).sort((a,b)=>j.recursos[a]-j.recursos[b])[0];if(falta)return {tipo:'banco',oferta:Object.fromEntries(RECURSOS.map(r=>[r,r===excesso?taxaBanco(p,j.id,r):0])),pedido:Object.fromEntries(RECURSOS.map(r=>[r,r===falta?1:0]))};}
  return {tipo:'passar'};
}
function agendarBot() {
  clearTimeout(botTimer); const token=++tokenBot; if (!sala?.souAnfitriao || !partida || partida.fase==='fim' || jogadoresPendentes().length) return;
  const j = partida.fase==='descarte' ? partida.jogadores.find(x=>x.robo && partida.descartes?.[x.id]) : partida.proposta ? (partida.jogadores.find(x=>x.robo && x.id!==partida.proposta.de && !partida.proposta.recusas.includes(x.id) && !partida.proposta.aceites.includes(x.id)) || (partida.proposta.aceites.length ? partida.jogadores.find(x=>x.robo && x.id===partida.proposta.de) : null)) : jogadorAtual(partida);
  if (!j?.robo) return;
  botTimer=setTimeout(()=>{if(token!==tokenBot || !partida)return;const acao=escolherBot(partida,j);if(acao && agir(partida,j.id,acao)) transmitir();}, 700);
}
function desenhar() { clearInterval(timerContagem); clearInterval(timerContagemDados); if (!sala) return; if (!visao) $('#sala-conteudo').replaceChildren(h('p','dica','Carregando o tabuleiro…')); else desenharJogo(visao); }
function desenharJogo(p) {
  const area=$('#sala-conteudo'), jogo=h('div','jogo'), tab=h('section','tabuleiro-painel'), lateral=h('aside','acoes'); let trocaAberta=null;
  const atual=jogadorAtual(p), eu=p.jogadores.find(j=>j.id===sala.meuId), meuTurno=atual?.id===sala.meuId && !p.proposta;
  const cab=h('div','turno'); cab.append(h('strong','',p.fase==='fim'?'🏆 Fim de jogo':p.fase==='espera'?'🌱 Aguardando jogadores':`🌱 Vez de ${atual?.nome ?? '…'}`),h('span','',p.dados?`🎲 ${p.dados[0]} + ${p.dados[1]} = ${p.dados[0]+p.dados[1]}`:'Pimp My Farm')); tab.append(cab,h('p','dica',p.mensagem));
  if(p.fase==='preparo' && meuTurno) modo=p.etapa;
  if(p.fase==='ladrao' && meuTurno) modo='ladrao';
  if(!eu && p.fase!=='fim' && p.jogadores.some(j=>j.robo)) { const escolha=h('section','escolha-bot');escolha.append(h('h2','','Escolha uma fazenda'),h('p','','Selecione o bot que você quer substituir. Você continuará com suas construções e recursos.'));for(const bot of p.jogadores.filter(j=>j.robo)){const botao=btn(`🤖 ${bot.nome} · ${bot.pontos} pontos`,()=>sala.enviarAoAnfitriao({t:'farm:assumir',bot:bot.id}));botao.style.borderColor=bot.cor;escolha.append(botao);}tab.append(escolha);}
  if(p.proposta && eu) tab.append(criarPopupTroca(p,eu));
  tab.append(desenharTabuleiro(p,eu,meuTurno),h('p','legenda-portos','⚓ Portos: os pontos ligados indicam onde construir. A etiqueta mostra o recurso e a taxa; âncora vale para qualquer recurso.'));
  const historico=h('section','historico-jogo');historico.append(h('h3','','📜 Histórico da partida'));
  const lista=h('div','historico-lista');lista.setAttribute('aria-label','Histórico completo da partida');
  if(!p.historico?.length)lista.append(h('p','',p.fase==='espera'?'Aguardando início da partida.':'A partida começou.'));
  for(const evento of p.historico||[]){const linha=h('div','historico-evento'),marcador=h('span','historico-cor');marcador.style.background=corJogador(p,evento.jogador);linha.append(marcador,h('span','',`${evento.icone} ${evento.texto}`));lista.append(linha);}historico.append(lista);lateral.append(historico);
  if(!eu) lateral.append(h('p','','Você está assistindo esta partida.'));
  else {const fazenda=h('section','minha-fazenda');fazenda.append(h('h2','','🌾 Sua fazenda'));const recursos=h('div','recursos');for(const r of RECURSOS){const c=h('div','recurso');c.title=r;c.setAttribute('aria-label',`${r}: ${eu.recursos?.[r] ?? 0}`);c.append(h('span','',icones[r]),h('b','',String(eu.recursos?.[r] ?? 0)));recursos.append(c);}fazenda.append(recursos);lateral.classList.add('com-fazenda');lateral.append(fazenda);}
  const banco=h('section','banco-disponivel');banco.append(h('h3','','🏦 Recursos disponíveis'));const reservas=h('div','recursos');for(const r of RECURSOS){const item=h('div','recurso');item.title=`${r}: ${p.estoque?.[r] ?? 19} disponíveis`;item.append(h('span','',icones[r]),h('b','',String(p.estoque?.[r] ?? 19)));reservas.append(item);}banco.append(reservas);lateral.append(banco);
  if(p.fase!=='espera' && p.fase!=='preparo' && p.fase!=='fim'){
    const linha=h('div','linha-dados'),dados=btn('',()=>acionar({tipo:'dados'}),`dados-visuais${p.rolagens>ultimaRolagemVista?' rolando':''}`);
    const podeRolar=meuTurno && p.fase==='rolar';dados.disabled=!podeRolar;dados.setAttribute('aria-label',podeRolar?'Rolar dados':p.dados?`Dados: ${p.dados[0]} e ${p.dados[1]}`:'Dados ainda não rolados');dados.title=podeRolar?'Clique nos dados para rolar':'Resultado dos dados';
    const pontos={1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]};
    for(const n of p.dados||[1,1]){const face=h('span','dado');face.setAttribute('aria-hidden','true');for(let i=0;i<9;i++)face.append(h('span',`dado-ponto${pontos[n].includes(i)?' ativo':''}`));dados.append(face);}linha.append(dados);
    if(p.fase==='rolar' && p.prazoDados){const contador=h('span','contador-dados');const atualizar=()=>{contador.textContent=`Rolagem automática em ${Math.max(0,Math.ceil((p.prazoDados-Date.now())/1000))}s`;};atualizar();timerContagemDados=setInterval(atualizar,250);linha.append(contador);}
    lateral.append(linha);if(p.rolagens>ultimaRolagemVista)ultimaRolagemVista=p.rolagens;
  }
  lateral.append(h('h3','','🏆 Placar')); const placar=h('div','placar'); for(const j of p.jogadores){const linha=h('div');linha.dataset.jogador=j.id;const ponto=h('span','bolinha');ponto.style.setProperty('--cor',j.cor);linha.append(ponto,h('span','',`${j.nome}${j.robo?' 🤖':''}${p.maiorEstrada===j.id?' 🛤️':''}${p.maiorExercito===j.id?' ⚔️':''}`),h('b','',`${j.pontos} / ${META}`));placar.append(linha);}lateral.append(placar);
  let construcoes=null;
  if(eu && p.fase!=='fim'){
    lateral.append(h('h3','','Construções disponíveis'));construcoes=h('div','botoes-construcao');const disponiveis=pecasDisponiveis(p,eu.id);
    for(const [tipo,rotulo] of [['estrada','Estrada'],['fazenda','Aldeia'],['cidade','Cidade']]){
      const b=btn('',()=>{modo=modo===tipo?null:tipo;desenhar();},modo===tipo?'selecionado':'');
      const custo={estrada:'🌲🧱',fazenda:'🌲🧱🐑🌾',cidade:'🌾🌾⛰️⛰️⛰️'}[tipo];
      b.title=`${rotulo}: ${disponiveis[tipo]} disponíveis · ${custo}`;b.setAttribute('aria-label',`${rotulo}: ${disponiveis[tipo]} disponíveis`);b.setAttribute('aria-pressed',String(modo===tipo));
      b.disabled=!(meuTurno && p.fase==='acoes') || disponiveis[tipo]===0;
      b.append(iconeConstrucao(tipo,eu.cor),h('span','contagem-construcao',String(disponiveis[tipo])));construcoes.append(b);
    }
    lateral.append(construcoes);
  }
  if(p.fase==='espera'){lateral.append(h('p','dica',`${p.jogadores.length} de ${configuracao.limite} jogadores · Compartilhe o código ou o link.`));if(sala.souAnfitriao)lateral.append(btn('▶ Iniciar partida',()=>{iniciarPartida();transmitir();},'primario'));else lateral.append(h('p','dica','Aguardando o anfitrião iniciar.'));}
  else if(p.fase==='fim') lateral.append(h('p','',p.mensagem));
  else if(p.fase==='descarte' && p.descartes?.[sala.meuId]) lateral.append(criarDescarte(p,eu));
  else if(p.fase==='descarte') lateral.append(h('p','dica','Aguardando os jogadores descartarem recursos.'));
  else if(p.proposta) lateral.append(h('p','dica','Proposta de troca em andamento.'));
  else if(meuTurno){
    if(eu && (p.fase==='rolar' || p.fase==='acoes')) lateral.append(criarCartas(p,eu));

    if(p.fase==='preparo') lateral.append(h('p','',p.etapa==='fazenda'?'Toque em um ponto claro para construir sua fazenda.':'Toque em uma linha clara para construir sua estrada.'));
    if(p.fase==='ladrao') lateral.append(h('p','','Toque em outro terreno para mover o ladrão.'));
    if(p.fase==='roubo') { lateral.append(h('p','','Escolha de quem pegar um recurso:')); for(const id of p.vitimas) { const alvo=p.jogadores.find(j=>j.id===id); if(alvo) lateral.append(btn(alvo.nome,()=>acionar({tipo:'roubar',alvo:id}))); } }
    if(p.fase==='acoes'){
      if(modo) lateral.append(h('p','dica','Escolha uma posição destacada no tabuleiro.'));
      if(p.estradasGratis) lateral.append(h('p','dica',`Estradas gratuitas restantes: ${p.estradasGratis}`));
      const comprar=btn('',()=>acionar({tipo:'comprar-carta'}),'comprar-desenvolvimento');
      comprar.disabled=!p.cartasRestantes;comprar.setAttribute('aria-label',`Comprar carta de desenvolvimento · ${p.cartasRestantes} disponíveis`);comprar.title='Comprar carta de desenvolvimento: 🐑 🌾 ⛰️';
      const carta=h('span','carta-desenvolvimento'),engrenagem=elSvg('svg',{viewBox:'0 0 24 24','aria-hidden':'true'});
      engrenagem.append(elSvg('path',{d:'M10 1h4l.6 2.4 1.9.8 2.1-1.3 2.8 2.8-1.3 2.1.8 1.9L23 10v4l-2.4.6-.8 1.9 1.3 2.1-2.8 2.8-2.1-1.3-1.9.8L14 23h-4l-.6-2.4-1.9-.8-2.1 1.3-2.8-2.8 1.3-2.1-.8-1.9L1 14v-4l2.4-.6.8-1.9-1.3-2.1 2.8-2.8 2.1 1.3 1.9-.8z',fill:'#fff',stroke:'#173b27','stroke-width':'.65','stroke-linejoin':'round'}),elSvg('circle',{cx:12,cy:12,r:3.2,fill:'#6e3699'}));carta.append(engrenagem,h('span','cartas-quantidade',String(p.cartasRestantes)));comprar.append(carta);construcoes.append(comprar);
      const trocas=btn('🤝 Negociar',()=>{painelTroca=!painelTroca;desenhar();});lateral.append(trocas);if(painelTroca){trocaAberta=h('aside','acoes painel-negociacao');trocaAberta.append(criarTroca(p,eu));jogo.classList.add('negociando');}
      lateral.append(btn('Encerrar turno →',()=>{painelTroca=false;acionar({tipo:'passar'});},'primario'));
    }
  } else if(p.fase!=='fim') lateral.append(h('p','dica','Aguarde sua vez.'));
  const ajuda=h('details');ajuda.append(h('summary','','Como jogar'),h('p','','Cada jogador começa com 2 fazendas e 2 estradas. Quando os dados correspondem a um terreno, as fazendas vizinhas recebem recursos. Construa fazendas (1 ponto), melhore-as (2 pontos) e chegue a 10 pontos. Ao tirar 7, o ladrão bloqueia um terreno. Troque com outros jogadores ou use o banco e os portos (4:1, 3:1 ou 2:1). Cartas concedem vantagens; a maior estrada e o maior exército valem 2 pontos cada.'));lateral.append(ajuda);
  const fazenda=lateral.querySelector('.minha-fazenda');if(fazenda){const conteudo=h('div','conteudo-acoes');for(const elemento of [...lateral.children])if(elemento!==fazenda)conteudo.append(elemento);lateral.prepend(conteudo);}
  jogo.append(tab,lateral);if(trocaAberta)jogo.append(trocaAberta);area.replaceChildren(jogo);lista.scrollTop=lista.scrollHeight;
}
function criarPopupTroca(p,eu){
 const o=p.proposta, autor=p.jogadores.find(j=>j.id===o.de), popup=h('section','popup-troca');popup.setAttribute('aria-label','Proposta de troca');
 const topo=h('div','popup-troca-topo'), prazo=h('span','popup-troca-prazo');topo.append(h('strong','','🤝 Troca'),prazo);popup.append(topo);
 const atualizar=()=>{prazo.textContent=`${Math.max(0,Math.ceil((o.expiraEm-Date.now())/1000))}s`;};atualizar();timerContagem=setInterval(atualizar,1000);
 const resumo=c=>RECURSOS.filter(r=>c[r]).map(r=>`${icones[r]} ${c[r]}`).join('  ');
 popup.append(h('p','',`${autor?.nome ?? 'Jogador'} oferece ${resumo(o.oferta)}`),h('p','',`em troca de ${resumo(o.pedido)}`));
 if(eu?.id===o.de){
  popup.append(h('p','popup-troca-info',o.aceites.length?'Escolha quem aceitou:':'Aguardando respostas.'));
  for(const id of o.aceites){const jogador=p.jogadores.find(j=>j.id===id);if(jogador){const escolha=btn(`✅ ${jogador.nome}`,()=>acionar({tipo:'concluir-troca',alvo:id}),'popup-troca-escolha');escolha.setAttribute('aria-label',`Concluir troca com ${jogador.nome}`);popup.append(escolha);}}
  popup.append(btn('Cancelar proposta',()=>acionar({tipo:'cancelar-proposta'}),'popup-troca-cancelar'));
 }else if(eu){
  const acoes=h('div','popup-troca-acoes'),aceitar=btn('✓',()=>acionar({tipo:'responder',aceitar:true}),'popup-troca-aceitar'),recusar=btn('✕',()=>acionar({tipo:'responder',aceitar:false}),'popup-troca-recusar');
  aceitar.setAttribute('aria-label','Aceitar proposta');aceitar.title='Aceitar proposta';recusar.setAttribute('aria-label','Recusar proposta');recusar.title='Recusar proposta';
  aceitar.disabled=!RECURSOS.every(r=>eu.recursos[r]>=o.pedido[r]) || o.aceites.includes(eu.id);recusar.disabled=o.recusas.includes(eu.id);
  acoes.append(aceitar,recusar);popup.append(acoes);
  if(o.aceites.includes(eu.id))popup.append(h('p','popup-troca-info','Aceita. O jogador da vez escolhe com quem trocar.'));
  else if(o.recusas.includes(eu.id))popup.append(h('p','popup-troca-info','Você recusou. Pode mudar de ideia enquanto a proposta estiver aberta.'));
  else if(aceitar.disabled)popup.append(h('p','popup-troca-info','Você não tem os recursos pedidos.'));
 }
 return popup;
}
function criarDescarte(p, eu) {
 const bloco=h('div','troca'), campos={}; bloco.append(h('h3','','Descarte recursos'),h('p','dica',`Escolha exatamente ${p.descartes[eu.id]} recursos para descartar.`));
 for(const r of RECURSOS){const linha=h('div','linha');const campo=document.createElement('input');campo.type='number';campo.min='0';campo.max=String(eu.recursos[r]);campo.value='0';campo.setAttribute('aria-label',`Descartar ${r}`);campos[r]=campo;linha.append(h('span','',`${icones[r]} ${r} (${eu.recursos[r]})`),campo);bloco.append(linha);}
 bloco.append(btn('Confirmar descarte',()=>acionar({tipo:'descartar',recursos:Object.fromEntries(RECURSOS.map(r=>[r,Number(campos[r].value)]))})));return bloco;
}
function criarCartas(p, eu) {
 const box=h('div','cartas'); const jogaveis=(eu.cartas||[]).map((c,i)=>({...c,indice:i})).filter(c=>c.tipo!=='vitoria');
 if (!jogaveis.length) return box;
 box.append(h('h3','','🃏 Suas cartas'));
 const nomes={cavaleiro:'Cavaleiro',estradas:'Duas estradas',colheita:'Colheita',monopolio:'Monopólio'};
 for(const carta of jogaveis) {
  const linha=h('div','linha-carta'); const escolha=document.createElement('select');
  for(const r of RECURSOS){const o=document.createElement('option');o.value=r;o.textContent=`${icones[r]} ${r}`;escolha.append(o);}
  const outra=escolha.cloneNode(true); outra.selectedIndex=1;
  const botao=btn(`${nomes[carta.tipo]}${carta.nova?' · próximo turno':''}`,()=>acionar({tipo:'jogar-carta',indice:carta.indice,recurso:escolha.value,outro:outra.value}));
  botao.disabled=carta.nova||p.cartaUsada||(p.fase==='rolar'&&carta.tipo!=='cavaleiro');linha.append(botao);
  if(carta.tipo==='colheita'||carta.tipo==='monopolio')linha.append(escolha);
  if(carta.tipo==='colheita')linha.append(outra);
  box.append(linha);
 }
 return box;
}
function criarTroca(p,eu){
 const bloco=h('div','troca'); bloco.append(h('h3','','Trocar recursos'));
 const alvo=document.createElement('select');alvo.setAttribute('aria-label','Tipo de troca');
 for(const [v,t] of [['banco','Banco / portos'],['jogadores','Players']]){const o=document.createElement('option');o.value=v;o.textContent=t;alvo.append(o);}
 bloco.append(alvo,h('p','dica','Clique nos recursos para adicionar um por vez. O porto reduz automaticamente a taxa do banco.'));
 const cestas={oferta:Object.fromEntries(RECURSOS.map(r=>[r,0])),pedido:Object.fromEntries(RECURSOS.map(r=>[r,0]))};
 for(const [campo,titulo] of [['oferta','Oferecer'],['pedido','Receber']]){
  const secao=h('div','troca-cesta'), linha=h('div','troca-recursos'), atualizadores=[];secao.append(h('h3','',titulo));
  for(const r of RECURSOS){const b=btn('',()=>{if(cestas[campo][r]<99){cestas[campo][r]++;atualizar();}},'troca-recurso');const atualizar=()=>{b.replaceChildren(h('span','',icones[r]),h('b','',String(cestas[campo][r])));b.setAttribute('aria-label',`${titulo} ${r}: ${cestas[campo][r]}`);};b.title=`${titulo} ${r}`;atualizadores.push(atualizar);atualizar();linha.append(b);}
  secao.append(linha,btn('Limpar',()=>{for(const r of RECURSOS)cestas[campo][r]=0;atualizadores.forEach(atualizar=>atualizar());},'troca-limpar'));bloco.append(secao);
 }
 const estado=h('p','dica');bloco.append(estado);
 const atualizarTaxa=()=>{estado.textContent=alvo.value==='banco'?`Suas taxas: ${RECURSOS.map(r=>{const taxa=taxaBanco(p,eu.id,r);return `${icones[r]} ${taxa}:1${taxa===2?' (porto próprio)':taxa===3?' (porto geral)':''}`;}).join(' · ')}`:'A proposta será enviada a todos os outros jogadores.';};alvo.addEventListener('change',atualizarTaxa);atualizarTaxa();
 bloco.append(btn('Enviar troca',()=>{const oferta={...cestas.oferta},pedido={...cestas.pedido};if(!listaRecursos(oferta)||!listaRecursos(pedido)){estado.textContent='Escolha o que oferecer e o que receber.';return;}if(RECURSOS.some(r=>oferta[r]>eu.recursos[r] || (oferta[r] && pedido[r]))){estado.textContent='Confira os recursos disponíveis e evite oferecer e pedir o mesmo recurso.';return;}if(alvo.value==='banco' && RECURSOS.some(r=>pedido[r]>(p.estoque?.[r]??0))){estado.textContent='O banco não tem recursos suficientes para essa troca.';return;}if(alvo.value==='banco' && (!RECURSOS.every(r=>oferta[r]%taxaBanco(p,eu.id,r)===0) || RECURSOS.reduce((n,r)=>n+oferta[r]/taxaBanco(p,eu.id,r),0)!==listaRecursos(pedido))){estado.textContent='A quantidade oferecida não corresponde às suas taxas de banco e portos.';return;}if(alvo.value==='jogadores' && p.jogadores.length<2){estado.textContent='É preciso outro jogador para negociar.';return;}painelTroca=false;acionar({tipo:alvo.value==='banco'?'banco':'propor',oferta,pedido});}));return bloco;
}
function iconeConstrucao(tipo,cor){
 const svg=elSvg('svg',{viewBox:'0 0 24 24','aria-hidden':'true'});
 if(tipo==='cidade'){svg.append(elSvg('path',{d:'M2 21 V11 L7 7 L11 10.2 V8 L16 3 L22 8 V21 Z',fill:cor,stroke:'#151515','stroke-width':'1.2','stroke-linejoin':'round'}),elSvg('path',{d:'M11 10.2 V21 M4 14 H6 M8 14 H9 M4 17 H6 M8 17 H9 M13 10 H15 M18 10 H20 M13 13 H15 M18 13 H20 M14 21 V17 H19 V21',fill:'none',stroke:'#151515','stroke-width':'1.1','stroke-linecap':'round'}));return svg;}
 if(tipo==='estrada'){svg.append(elSvg('path',{d:'M3 18 L21 6',fill:'none',stroke:'#151515','stroke-width':'7','stroke-linecap':'round'}),elSvg('path',{d:'M3 18 L21 6',fill:'none',stroke:cor,'stroke-width':'5','stroke-linecap':'round'}));return svg;}
 svg.append(elSvg('path',{d:tipo==='fazenda'?'M2 11 L12 3 L22 11 L20 11 L20 21 L4 21 L4 11 Z':'M3 9 L7 3 L17 3 L21 9 L21 21 L3 21 Z',fill:cor,stroke:'#151515','stroke-width':'1.2','stroke-linejoin':'round'}));
 svg.append(elSvg('path',{d:tipo==='fazenda'?'M9 21 V14 H15 V21 M4 11 L12 4 L20 11':'M3 9 H21 M8 21 V13 H16 V21 M8 13 L16 21 M16 13 L8 21',fill:'none',stroke:'#151515','stroke-width':'1.1','stroke-linejoin':'round'}));return svg;
}
function desenharTabuleiro(p,eu,meuTurno){
 const svg=elSvg('svg',{class:'tabuleiro',viewBox:p.tabuleiro.terrenos.length>19?'-8 -7.3 16 14.6':'-6.3 -5.8 12.6 11.6',role:'img','aria-label':'Tabuleiro de terrenos, estradas e fazendas'});
 const defs=elSvg('defs');svg.append(defs);
 const terrenosAtlas={madeira:[0,0],barro:[1,0],'lã':[2,0],trigo:[0,1],pedra:[1,1],deserto:[2,1]};
 for(const [i,t] of p.tabuleiro.terrenos.entries()){
  const pontos=Array.from({length:6},(_,k)=>{const a=Math.PI/180*(30+k*60);return `${t.x+Math.cos(a)},${t.y+Math.sin(a)}`;}).join(' ');
  const clip=elSvg('clipPath',{id:`terreno-recorte-${i}`});clip.append(elSvg('polygon',{points:pontos}));defs.append(clip);
  const pol=elSvg('polygon',{points:pontos,fill:coresTerreno[t.tipo],class:`hex${modo==='ladrao'&&meuTurno&&i!==p.ladrao?' alvo':''}`});if(modo==='ladrao'&&meuTurno)pol.addEventListener('click',()=>acionar({tipo:'ladrao',indice:i}));svg.append(pol);
  const [coluna,linha]=terrenosAtlas[t.tipo], largura=Math.sqrt(3), altura=2;
  svg.append(elSvg('image',{href:'img/farm-terrenos-ilustrados.png',x:t.x-largura/2-coluna*largura,y:t.y-1-linha*altura,width:largura*3,height:altura*2,preserveAspectRatio:'none','clip-path':`url(#terreno-recorte-${i})`,class:'textura-terreno'}));
  svg.append(elSvg('polygon',{points:pontos,fill:'none',class:'contorno-terreno'}));
  if(t.numero){svg.append(elSvg('circle',{cx:t.x,cy:t.y,r:.23,class:'numero'}));const num=elSvg('text',{x:t.x,y:t.y,class:'numero-texto'});num.textContent=t.numero;svg.append(num);}
  if(i===p.ladrao){
   const l=elSvg('svg',{x:t.x-.38,y:t.y-.38,width:.76,height:.76,viewBox:'0 0 32 32',role:'img','aria-label':'Ladrão',class:'figura-ladrao'});
   l.append(elSvg('circle',{cx:16,cy:16,r:15,fill:'#fff1c6',stroke:'#392b20','stroke-width':1}),elSvg('path',{d:'M5 29 Q6 22 12 21 H20 Q26 22 27 29 Z',fill:'#514537',stroke:'#211c18','stroke-width':1.1}),elSvg('ellipse',{cx:16,cy:15,rx:8,ry:8.5,fill:'#e8b77c',stroke:'#211c18','stroke-width':1}),elSvg('path',{d:'M8 13 Q16 10 24 13 L23 18 Q16 20 9 18 Z',fill:'#242728'}),elSvg('circle',{cx:12.5,cy:15.5,r:1.1,fill:'#fff'}),elSvg('circle',{cx:19.5,cy:15.5,r:1.1,fill:'#fff'}),elSvg('path',{d:'M6 10 L9 5 Q16 2 23 5 L26 10 Q16 12 6 10 Z',fill:'#382e27',stroke:'#211c18','stroke-width':1.2}),elSvg('path',{d:'M5 10 Q16 13 27 10',fill:'none',stroke:'#211c18','stroke-width':2,'stroke-linecap':'round'}));svg.append(l);
  }
 }
 for(const porto of p.tabuleiro.portos || []) {
  const a=p.tabuleiro.vertices[porto.a],b=p.tabuleiro.vertices[porto.b],mx=(a.x+b.x)/2,my=(a.y+b.y)/2,comprimento=Math.hypot(b.x-a.x,b.y-a.y)||1;
  let nx=-(b.y-a.y)/comprimento,ny=(b.x-a.x)/comprimento;if(nx*mx+ny*my<0){nx=-nx;ny=-ny;}
  const px=mx+nx*1.05,py=my+ny*1.05;
  const meuPorto=!!eu && [porto.a,porto.b].some(v=>p.construcoes[v]?.dono===eu.id);
  const descricao=porto.tipo==='geral'?'Porto geral: troque 3 recursos iguais por 1':'Porto de '+porto.tipo+': troque 2 por 1';
  const grupo=elSvg('g',{class:`porto-grupo${meuPorto?' porto-proprio':''}`,role:'img','aria-label':descricao+(meuPorto?' · seu porto':'')});
  const titulo=elSvg('title');titulo.textContent=descricao+(meuPorto?' · seu porto':'')+'. Construa em um dos dois pontos conectados para usar.';grupo.append(titulo);
  for(const v of [a,b]){
   grupo.append(elSvg('line',{x1:v.x,y1:v.y,x2:px,y2:py,class:'porto-ligacao-sombra'}),elSvg('line',{x1:v.x,y1:v.y,x2:px,y2:py,class:'porto-ligacao'}));
   grupo.append(elSvg('circle',{cx:v.x,cy:v.y,r:.14,class:'porto-ponto'}));
  }
  grupo.append(elSvg('rect',{x:px-.48,y:py-.23,width:.96,height:.46,rx:.14,class:'porto-etiqueta'}));
  const icone=elSvg('text',{x:px-.26,y:py,class:'porto-icone'});icone.textContent=porto.tipo==='geral'?'⚓':icones[porto.tipo];grupo.append(icone);
  const taxa=elSvg('text',{x:px+.12,y:py,class:'porto-taxa'});taxa.textContent=porto.tipo==='geral'?'3:1':'2:1';grupo.append(taxa);svg.append(grupo);
 }
 const livresEstradas=eu&&meuTurno&&modo==='estrada'?estradasLivres(p,eu,p.fase==='preparo'?p.ultimoVertice:null):[];
 const livresCasas=eu&&meuTurno&&modo==='fazenda'?verticesLivres(p,eu,p.fase==='preparo'):[];
 const key=(a,b)=>a<b?`${a}:${b}`:`${b}:${a}`;
 for(const [i,e] of p.tabuleiro.arestas.entries()) {const a=p.tabuleiro.vertices[e.a],b=p.tabuleiro.vertices[e.b],dono=p.estradas[key(e.a,e.b)],livre=livresEstradas.includes(i);if(dono||livre){if(dono)svg.append(elSvg('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,class:'estrada-contorno'}));svg.append(elSvg('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,class:`estrada${livre?' livre':''}`,style:dono?`stroke:${corJogador(p,dono)};stroke-width:.15`:''}));if(livre){const hit=elSvg('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,class:'estrada-hit',role:'button',tabindex:0,'aria-label':'Construir estrada'});hit.addEventListener('click',()=>acionar({tipo:'estrada',indice:i}));hit.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();acionar({tipo:'estrada',indice:i});}});svg.append(hit);}}}
 for(const [i,v] of p.tabuleiro.vertices.entries()) {const casa=p.construcoes[i],livre=livresCasas.includes(i),melhorar=modo==='cidade'&&meuTurno&&casa?.dono===eu?.id&&casa.tipo==='fazenda';if(!casa&&!livre)continue;if(casa){const tamanho=casa.tipo==='cidade'?.55:.50;const figura=iconeConstrucao(casa.tipo,corJogador(p,casa.dono));figura.setAttribute('x',v.x-tamanho/2);figura.setAttribute('y',v.y-tamanho/2);figura.setAttribute('width',tamanho);figura.setAttribute('height',tamanho);figura.setAttribute('class','casa-figura');svg.append(figura);}else svg.append(elSvg('circle',{cx:v.x,cy:v.y,r:.11,class:'casa livre'}));if(livre||melhorar){const hit=elSvg('circle',{cx:v.x,cy:v.y,r:.2,class:'casa-hit',role:'button',tabindex:0,'aria-label':melhorar?'Construir cidade':'Construir fazenda'});const ativar=()=>acionar({tipo:melhorar?'cidade':'fazenda',indice:i});hit.addEventListener('click',ativar);hit.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();ativar();}});svg.append(hit);}}
 return svg;
}
