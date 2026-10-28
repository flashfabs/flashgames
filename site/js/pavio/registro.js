// Puts every finished match into this device's profile (conta.js). Each device registers only its own player:
// at the start of a match it notes this player's round score, and when the match ends (result screen, or the
// final one) the difference is this match's crates, eliminations and win. Robots and spectators register nothing.
// Called from the game's phase changes with the round state the host shares with everyone.

import { MAPAS, PONTOS } from './regras.js';
import { registrarPartida } from '../conta.js';

const ZERO = Object.freeze({ vitorias: 0, caixas: 0, eliminacoes: 0 });

const pontos = placar => placar.caixas * PONTOS.caixa + placar.eliminacoes * PONTOS.eliminacao + placar.vitorias * PONTOS.vitoria;

function chaveDoMapa(n) {
  const mapa = MAPAS[n];
  return String(mapa?.tema ?? mapa?.nome ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

// True when this player alone has the most points (wins break ties), as on the final screen.
function ehCampeao(estado, meuId) {
  const linhas = estado.escalacao.map(item => ({ id: item.id, ...ZERO, ...estado.placar?.[item.id] }));
  linhas.sort((a, b) => pontos(b) - pontos(a) || b.vitorias - a.vitorias);
  const [primeiro, segundo] = linhas;
  const empate = segundo && pontos(segundo) === pontos(primeiro) && segundo.vitorias === primeiro.vitorias;
  return primeiro?.id === meuId && !empate;
}

export function criarRegistro({ meuId, registrar = registrarPartida, agora = () => Date.now() }) {
  let inicio = null; // { idPartida, placar, em } of the match being played

  function aoMudarFase(estado) {
    const eu = meuId();
    const naRodada = estado.escalacao?.some(item => item.id === eu);
    if (estado.fase === 'contagem') {
      inicio = naRodada ? { idPartida: estado.idPartida, placar: { ...ZERO, ...estado.placar?.[eu] }, em: agora() } : null;
      return;
    }
    if (estado.fase !== 'resultado' && estado.fase !== 'final') return;
    // Joined late, reconnected without seeing the start, or already registered: nothing reliable to add.
    if (!naRodada || !inicio || inicio.idPartida !== estado.idPartida) return;
    const placar = { ...ZERO, ...estado.placar?.[eu] };
    const resumo = {
      em: agora(),
      mapa: chaveDoMapa(estado.mapa),
      venceu: estado.resultado?.vencedor === eu,
      caixas: Math.max(0, placar.caixas - inicio.placar.caixas),
      eliminacoes: Math.max(0, placar.eliminacoes - inicio.placar.eliminacoes),
      jogadores: estado.escalacao.length,
      robos: estado.escalacao.filter(item => item.robo).length,
      duracaoS: Math.min(900, Math.round((agora() - inicio.em) / 1000)),
      campeaoDaRodada: estado.fase === 'final' && !estado.motivo && estado.escalacao.length > 1 && ehCampeao(estado, eu),
    };
    inicio = null;
    Promise.resolve()
      .then(() => registrar(resumo))
      .catch(erro => console.warn('Could not register the match in the profile', erro));
  }

  return {
    // Never lets a profile problem get in the way of the game's phase change.
    aoMudarFase(estado) {
      try {
        aoMudarFase(estado);
      } catch (erro) {
        console.warn('Match registration skipped', erro);
      }
    },
  };
}
