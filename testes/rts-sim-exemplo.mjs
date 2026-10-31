// Example game data (C5) and a small sandbox map (C6) in the design front's file formats, for the simulation's rule
// tests and the sandbox golden replay. The numbers are the plan's starting points; the real ones live in
// site/rts/dados/ and change with play tests, so the rule tests use these and stay put.

/** unidades.json, predios.json, economia.json, pesquisas.json and armas.json as parsed JSON. */
export function dadosExemplo() {
  return {
    unidades: {
      versao: 1,
      unidades: [
        { nome: 'guincho-de-celulas', faccao: 'religadores', classe: 'veiculo', blindagem: 'leve', custo: 300, tempoMs: 20000, lotacao: 2, vida: 400, velocidade: 160, raio: 4, visao: 6, giroCorpo: 8, giroTorre: 8, coletor: 1, coleta: { carga: 100, carregarMs: 4000, descarregarMs: 2000, recolherFaiscaMs: 2000 } },
        { nome: 'turma-de-linha', faccao: 'religadores', classe: 'infantaria', blindagem: 'pessoal', custo: 100, tempoMs: 12000, lotacao: 1, vida: 100, velocidade: 120, raio: 2, visao: 7, giroCorpo: 16, giroTorre: 16, arma: 'carabina' },
        { nome: 'equipe-de-manutencao', faccao: 'religadores', classe: 'veiculo', blindagem: 'leve', custo: 350, tempoMs: 20000, lotacao: 2, vida: 250, velocidade: 160, raio: 4, visao: 6, giroCorpo: 8, giroTorre: 8, ergue: ['poste-avancado'] },
        { nome: 'religador', faccao: 'religadores', classe: 'infantaria', blindagem: 'pessoal', custo: 500, tempoMs: 20000, lotacao: 4, limite: 2, vida: 120, velocidade: 120, raio: 2, visao: 7, giroCorpo: 16, giroTorre: 16, religa: 1 },
        { nome: 'carroca-de-pedal', faccao: 'desligados', classe: 'veiculo', blindagem: 'leve', custo: 250, tempoMs: 18000, lotacao: 2, vida: 300, velocidade: 130, raio: 4, visao: 6, giroCorpo: 8, giroTorre: 8, coletor: 1, coleta: { carga: 100, carregarMs: 4000, descarregarMs: 2000, recolherFaiscaMs: 1000 } },
        { nome: 'chapa', faccao: 'desligados', classe: 'infantaria', blindagem: 'pessoal', custo: 100, tempoMs: 12000, lotacao: 1, vida: 100, velocidade: 120, raio: 2, visao: 7, giroCorpo: 16, giroTorre: 16, arma: 'carabina' },
      ],
    },
    predios: {
      versao: 1,
      predios: [
        { nome: 'escritorio-regional', faccao: 'religadores', pegada: [3, 3], custo: 2000, tempoMs: 60000, vida: 3000, eletrico: 0, visao: 8, raioRede: 8, deposito: 1, filaConstrucao: 1, constroi: ['poste', 'acumulador', 'alojamento-da-turma', 'cata-vento'], produz: ['guincho-de-celulas', 'equipe-de-manutencao'] },
        { nome: 'poste', faccao: 'religadores', pegada: [1, 1], custo: 50, tempoMs: 5000, vida: 150, visao: 3, raioRede: 6 },
        { nome: 'acumulador', faccao: 'religadores', pegada: [3, 2], custo: 400, tempoMs: 25000, vida: 1200, eletrico: 1, visao: 5, raioRede: 4, deposito: 1 },
        { nome: 'alojamento-da-turma', faccao: 'religadores', pegada: [3, 3], custo: 400, tempoMs: 25000, vida: 1500, eletrico: 1, visao: 5, produz: ['turma-de-linha', 'religador'], requer: ['acumulador'] },
        { nome: 'cata-vento', faccao: 'religadores', pegada: [2, 2], custo: 300, tempoMs: 20000, vida: 500, visao: 4, ventosa: 1 },
        { nome: 'poste-avancado', faccao: 'religadores', pegada: [2, 2], custo: 1000, tempoMs: 40000, vida: 800, visao: 6, raioRede: 6, raizRede: 1, deposito: 1, construidoPor: 'unidade' },
        { nome: 'barracao', faccao: 'desligados', pegada: [3, 3], custo: 400, tempoMs: 25000, vida: 1500, visao: 5, deposito: 1, produz: ['carroca-de-pedal', 'chapa'] },
      ],
    },
    economia: {
      versao: 1,
      lotacaoMaxima: 60,
      saturacao: 3,
      cargaDerramada: { porcento: 100, duracaoMs: 90000 },
      vento: { intervaloMs: 120000, lote: 80, avisoMs: 15000 },
      foraDaRede: { producaoPorcento: 50, defesasParam: 1 },
      reciclarPorcento: 50,
      reparoCustoPorcento: 50,
      faiscaCarga: 25,
      cargaInicial: 1500,
    },
    pesquisas: {
      versao: 1,
      pesquisas: [{ nome: 'turno-extra', predio: 'escritorio-regional', custo: 400, tempoMs: 30000 }],
    },
    armas: {
      versao: 1,
      armas: [{ nome: 'carabina', tipoDano: 'bala', dano: 10, recargaMs: 1000, alcance: 40 }],
    },
  };
}

/**
 * A 48 x 40 sandbox in the C6 files: a low valley, a hill (level 1 with a level 2 top) in the middle with a windy
 * cell, two resource nodes of three piles near each base and a rock spur, players 0 (Religadores, south-west) and 1
 * (Desligados, north-east), each with a headquarters or shed and a harvester.
 */
export function mapaExemplo() {
  const largura = 48;
  const altura = 40;
  const total = largura * altura;
  const ordem = ['solo', 'altura', 'passagem', 'cobertura', 'recurso', 'decoracao'];
  const bytes = new Uint8Array(total * ordem.length);
  const camada = nome => bytes.subarray(ordem.indexOf(nome) * total, (ordem.indexOf(nome) + 1) * total);
  const nivel = camada('altura');
  const passagem = camada('passagem');
  const recurso = camada('recurso');
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const c = y * largura + x;
      if (x === 0 || y === 0 || x === largura - 1 || y === altura - 1) passagem[c] = 1;
      // the hill: level 1 inside a 10 x 8 block, level 2 on its 4 x 2 top
      if (x >= 19 && x <= 28 && y >= 16 && y <= 23) nivel[c] = 1;
      if (x >= 22 && x <= 25 && y >= 19 && y <= 20) nivel[c] = 2;
    }
  }
  // a rock spur north of the hill
  for (let y = 6; y <= 13; y++) passagem[y * largura + 24] = 1;
  const nos = [
    { id: 'no-sul', x: 12, y: 26 },
    { id: 'no-norte', x: 35, y: 13 },
  ];
  const pilhas = [];
  nos.forEach((no, k) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) recurso[(no.y + dy) * largura + no.x + dx] = k + 1;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1]]) pilhas.push({ tipo: 'pilha', dono: -1, x: no.x + dx, y: no.y + dy, carga: 1500, no: k });
  });
  return {
    cabecalho: {
      versao: 1,
      id: 'caixa-exemplo',
      largura,
      altura,
      camadas: { arquivo: 'camadas.bin', ordem },
      solos: ['terra'],
      decoracoes: [],
      jogadores: [
        { time: 0, faccao: 'religadores', base: [8, 32] },
        { time: 1, faccao: 'desligados', base: [39, 7] },
      ],
    },
    camadas: bytes,
    entidades: {
      versao: 1,
      nos,
      entidades: [
        ...pilhas,
        { tipo: 'escritorio-regional', dono: 0, x: 6, y: 31, etiqueta: 'qg-sul' },
        { tipo: 'guincho-de-celulas', dono: 0, x: 10, y: 30 },
        { tipo: 'barracao', dono: 1, x: 38, y: 6, etiqueta: 'barracao-norte' },
        { tipo: 'carroca-de-pedal', dono: 1, x: 37, y: 10 },
      ],
      ventosas: [[23, 19]],
      areas: { morro: { x: 19, y: 16, largura: 10, altura: 8 } },
      pontos: { centro: [24, 20] },
      rotas: { leste: [[39, 7], [30, 12], [24, 20]] },
    },
  };
}
