import { escolherJogada } from './robo.js';
self.onmessage = ({ data }) => { self.postMessage({ id: data.id, jogada: escolherJogada(data.partida, data.dificuldade) }); };
