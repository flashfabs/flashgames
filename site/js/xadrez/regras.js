const oposta = c => c === 'b' ? 'p' : 'b';
const dentro = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
const cor = p => p && (p === p.toUpperCase() ? 'b' : 'p');
export function criarPartida(comRelogio = true, minutos = 10) {
  return { tabuleiro: [...'rnbqkbnrpppppppp', ...Array(32).fill(''), ...'PPPPPPPPRNBQKBNR'], vez: 'b', roque: 'KQkq', passagem: null, meioLances: 0, historico: [], posicoes: {}, tempos: comRelogio ? { b: minutos * 60000, p: minutos * 60000 } : null, fim: null };
}
function atacada(tab, alvo, por) {
  const r = Math.floor(alvo / 8), c = alvo % 8;
  for (let i = 0; i < 64; i++) {
    const p = tab[i]; if (cor(p) !== por) continue;
    const rr = Math.floor(i / 8), cc = i % 8, dr = r - rr, dc = c - cc, t = p.toLowerCase();
    if (t === 'p' && dr === (por === 'b' ? -1 : 1) && Math.abs(dc) === 1) return true;
    if (t === 'n' && ((Math.abs(dr) === 2 && Math.abs(dc) === 1) || (Math.abs(dr) === 1 && Math.abs(dc) === 2))) return true;
    if (t === 'k' && Math.max(Math.abs(dr), Math.abs(dc)) === 1) return true;
    if ((t === 'r' || t === 'q') && (dr === 0 || dc === 0) || (t === 'b' || t === 'q') && Math.abs(dr) === Math.abs(dc)) {
      if (!dr && !dc) continue;
      let y = rr + Math.sign(dr), x = cc + Math.sign(dc), livre = true;
      while (y !== r || x !== c) { if (tab[y * 8 + x]) { livre = false; break; } y += Math.sign(dr); x += Math.sign(dc); }
      if (livre) return true;
    }
  }
  return false;
}
export function emXeque(partida, lado = partida.vez) { const rei = partida.tabuleiro.indexOf(lado === 'b' ? 'K' : 'k'); return rei < 0 || atacada(partida.tabuleiro, rei, oposta(lado)); }
function candidatos(s, origem) {
  const tab = s.tabuleiro, p = tab[origem], lado = cor(p); if (!p || lado !== s.vez) return [];
  const r = Math.floor(origem / 8), c = origem % 8, t = p.toLowerCase(), saida = [];
  const add = (y, x) => { if (!dentro(y,x)) return false; const alvo = tab[y*8+x]; if (cor(alvo) !== lado && alvo?.toLowerCase() !== 'k') saida.push(y*8+x); return !alvo; };
  if (t === 'p') { const d = lado === 'b' ? -1 : 1; if (dentro(r+d,c) && !tab[(r+d)*8+c]) { saida.push((r+d)*8+c); if (r === (lado === 'b' ? 6 : 1) && !tab[(r+2*d)*8+c]) saida.push((r+2*d)*8+c); } for (const x of [c-1,c+1]) if (dentro(r+d,x)) { const i=(r+d)*8+x; if (cor(tab[i]) === oposta(lado) && tab[i].toLowerCase() !== 'k' || i === s.passagem) saida.push(i); } }
  if (t === 'n') for (const [y,x] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) add(r+y,c+x);
  if ('brq'.includes(t)) for (const [y,x] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]]) { if (t === 'b' && (!y || !x) || t === 'r' && y && x) continue; for (let k=1; k<8 && dentro(r+y*k,c+x*k); k++) if (!add(r+y*k,c+x*k)) break; }
  if (t === 'k') { for (let y=-1;y<=1;y++) for(let x=-1;x<=1;x++) if(y||x) add(r+y,c+x); const base=lado==='b'?56:0, inimigo=oposta(lado); if(origem===base+4 && !atacada(tab,origem,inimigo)) { for(const [direito, torre, vazias, caminho, destino] of [[lado==='b'?'K':'k',7,[5,6],[5,6],6],[lado==='b'?'Q':'q',0,[1,2,3],[3,2],2]]) if(s.roque.includes(direito) && tab[base+torre] === (lado==='b'?'R':'r') && vazias.every(x=>!tab[base+x]) && caminho.every(x=>!atacada(tab,base+x,inimigo))) saida.push(base+destino); } }
  return saida;
}
function executar(s, origem, destino, promocao = 'q') {
  const tab = s.tabuleiro, p = tab[origem], t=p.toLowerCase(), lado=cor(p), captura=tab[destino], anterior=s.passagem;
  tab[origem]=''; if(t==='p' && destino===anterior && !captura && origem%8!==destino%8) tab[destino+(lado==='b'?8:-8)]='';
  tab[destino] = t==='p' && (destino<8 || destino>=56) ? (lado==='b'?promocao.toUpperCase():promocao) : p;
  if(t==='k' && Math.abs(destino-origem)===2) { const base=Math.floor(origem/8)*8, direita=destino>origem; tab[base+(direita?5:3)]=tab[base+(direita?7:0)]; tab[base+(direita?7:0)]=''; }
  if(t==='k') s.roque=s.roque.replace(lado==='b'?/[KQ]/g:/[kq]/g,'');
  for(const [i,d] of [[63,'K'],[56,'Q'],[7,'k'],[0,'q']]) if(origem===i || destino===i) s.roque=s.roque.replace(d,'');
  s.passagem=t==='p' && Math.abs(destino-origem)===16 ? (origem+destino)/2 : null;
  s.meioLances=t==='p'||captura||t==='p'&&destino===anterior ? 0 : s.meioLances+1;
  s.vez=oposta(lado);
}
export function destinos(s, origem) { return candidatos(s, origem).filter(destino => { const copia={...s,tabuleiro:[...s.tabuleiro]}; executar(copia,origem,destino); return !emXeque(copia, s.vez); }); }
const casa = i => 'abcdefgh'[i%8] + (8-Math.floor(i/8));
function chave(s) { return s.tabuleiro.map(p=>p||'.').join('')+s.vez+s.roque+(s.passagem ?? '-'); }
export function mover(s, origem, destino, promocao='q') {
  if(s.fim || !['q','r','b','n'].includes(promocao) || !destinos(s,origem).includes(destino)) return false;
  if (!s.historico.length) s.posicoes[chave(s)] = 1;
  const p=s.tabuleiro[origem], capturada=s.tabuleiro[destino] || (p.toLowerCase()==='p' && destino===s.passagem && origem%8!==destino%8 ? s.tabuleiro[destino+(s.vez==='b'?8:-8)] : ''), captura=!!capturada, lado=s.vez;
  executar(s,origem,destino,promocao);
  const xeque=emXeque(s), temJogada=s.tabuleiro.some((p,i)=>cor(p)===s.vez && destinos(s,i).length);
  let texto = p.toLowerCase()==='k' && Math.abs(destino-origem)===2 ? (destino>origem?'O-O':'O-O-O') : `${p.toLowerCase()==='p'?'':({n:'C',b:'B',r:'T',q:'D',k:'R'})[p.toLowerCase()]}${casa(origem)}${captura?'×':'–'}${casa(destino)}${p.toLowerCase()==='p' && (destino<8||destino>=56)?'='+({q:'D',r:'T',b:'B',n:'C'})[promocao]:''}`;
  if(!temJogada) s.fim=xeque?{ vencedor:lado, motivo:'Xeque-mate' }:{ vencedor:null, motivo:'Afogamento' };
  const k=chave(s); s.posicoes[k]=(s.posicoes[k]||0)+1;
  if(!s.fim && s.meioLances>=100) s.fim={vencedor:null,motivo:'Empate pela regra dos 50 lances'};
  if(!s.fim && s.posicoes[k]>=3) s.fim={vencedor:null,motivo:'Empate por repetição'};
  const pecas=s.tabuleiro.filter(Boolean).map(x=>x.toLowerCase()); if(!s.fim && pecas.every(x=>x==='k') || !s.fim && pecas.length===3 && pecas.some(x=>x==='b'||x==='n')) s.fim={vencedor:null,motivo:'Material insuficiente'};
  texto += s.fim?.motivo==='Xeque-mate'?'#':xeque?'+':''; s.historico.push({origem,destino,lado,texto,capturada}); return true;
}

// Search uses the same legal move generator without updating the visible game history.
export function simular(s, origem, destino, promocao = 'q') {
  const copia = { ...s, tabuleiro: [...s.tabuleiro] };
  executar(copia, origem, destino, promocao);
  return copia;
}
