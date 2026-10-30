# Paiol

- id: `desligados/paiol`
- Facção: Desligados (inimigo na fase 1) · Categoria: construção, depósito empacotável · Lote: fase 1
- Versão: 1, de 30/10/2026

## Papel na matriz

Depósito de Carga: blindagem Estrutura, cerca de 400 C, cerca de 900 de vida (25% menos que o padrão); recebe a Carga das Carroças de Pedal.

Empacotável depois da fase 1, como os outros prédios da facção; o modelo nasce sobre um trenó de madeira com rodas.

Não é elétrico.

## Fantasia

Onde a mercadoria dorme: caixas empilhadas, lona por cima e um vigia que dorme junto.

## Silhueta

Vista de cima em 3/4, é uma construção baixa e fechada: caixas e fardos empilhados em U formando paredes, cobertos por uma lona esticada em varas, com uma rampa de descarga de tábuas na frente.

Ao lado da rampa, um pau de carga de madeira (um mastro curto com uma lança e talha de corda) que iça as caixas da Carroça; é a única parte alta.

O que distingue das outras da facção: é a mais baixa das construções grandes; o Carroção-Mãe tem toldo em arco alto, o Barracão é aberto dos lados, a Ferraria tem chaminé; só o Paiol é um bloco fechado de caixas com o pau de carga.

## Paleta e máscara de time

- Caixas e fardos: madeira crua e sacaria de juta, com cordas.
- Lona: lona crua `#CDBB94` com remendos em xadrez de ocre `#B5832E`.
- Pau de carga: madeira escura com detalhes vermelho-tijolo `#9B3B26`.
- Células guardadas: brilho do recurso vazando pelas frestas, na camada de luzes.
- Máscara de time: uma faixa pintada na borda da lona e uma bandeirola no topo do pau de carga.

## Partes que se movem

- Pau de carga com a lança girando e a talha subindo e descendo.
- Lona com balanço leve.
- Brilho das células pelas frestas (camada de luzes).

## Animações e estados

- Construindo: estacas e lona em camada separada; revelação pela máscara do shader.
- Pronta, atividade em laço: 8 quadros (lona, brilho pulsando de leve).
- Recebendo carga: 6 quadros do pau de carga içando uma caixa da Carroça.
- Danificada: 1 quadro com a lona rasgada e caixas tombadas.
- Destruída: 1 quadro com as caixas espalhadas e a lona no chão.
- Depois da fase 1 (escaramuça): empacotar e desempacotar.
- Pontos de encaixe: ponto de descarga (onde a Carroça para), ponta da lança do pau de carga e topo.

## Referências do mundo real

- Armazém de beira de cais e de entreposto do interior, com caixas e sacaria.
- Pau de carga com talha de corda, de navio e de armazém.
- Lona encerada esticada em varas.

## Tamanho

- Ocupa 3 × 2 células; quadro de 512 px no uhd.

## Checklist de originalidade

- [x] Nome comum de dicionário (depósito rural); busca simples na web em 30/10/2026 sem uso como construção em jogo de estratégia.
- [x] A descrição começa pelo papel na matriz.
- [x] Combinação própria: depósito de mercadoria com pau de carga de cais; depósito é convenção do gênero, a forma é nossa.
- [x] Silhueta distinta das outras da facção no papel. [ ] Teste de 5 segundos no portão de estilo (`rts-arte`, E2).
- [x] Números da nossa tabela de partida.
- [ ] Falas: não se aplica.
- [ ] Ficha de origem: pendente, `rts-arte`, junto com o asset.
- [ ] Revisão por quem jogou o jogo que inspirou o projeto: pendente, pedida ao Victor.
- [ ] Teste de combinação por alguém que não é fã: pendente, pedido ao Victor.
