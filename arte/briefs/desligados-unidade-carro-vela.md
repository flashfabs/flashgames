# Carro-Vela

- id: `desligados/carro-vela`
- Facção: Desligados (inimigo na fase 1) · Categoria: unidade, veículo · Lote: portão de estilo e fase 1
- Versão: 1, de 30/10/2026

## Papel na matriz

Assédio rápido: blindagem Leve, dano Bala, cerca de 350 C, lotação 2, sai da Ferraria a Vapor.

Mecânica própria: +30% de velocidade em campo aberto e −30% em ruínas e lama; Abalroar, uma investida curta que atordoa infantaria por 1 segundo.

Boa contra infantaria, coletores e artilharia desprotegida; fraca contra anti-blindagem e contra o Cesto Blindado erguido.

Na fase 1 aparece em patrulhas na Várzea e na onda da Ponte Velha; não é elétrico, então a interferência não o paralisa.

## Fantasia

Frete expresso a vento: chega antes do aviso e vai embora antes da conta.

## Silhueta

Vista de cima em 3/4, é um triângulo alto de lona sobre um chassi comprido e estreito de três rodas (uma na frente, que esterça, e duas atrás num eixo largo); a vela é a forma dominante e o que se lê primeiro, mesmo no menor zoom.

Na frente, um para-choque grosso de pneus velhos empilhados e amarrados, que é o aríete do Abalroar; atrás da vela, o piloto deitado quase na horizontal; na proa, um atirador sentado num banco giratório com uma carabina de ar de reservatório grande.

A vela é fina e translúcida, remendada em quadrados de lona de cores diferentes: é o caso difícil do portão de estilo (borda fina, transparência, leitura contra terreno claro e escuro).

O que distingue das outras da facção: a Carroça de Pedal é baixa, quadrada e coberta por toldo, sem vela; o Locomóvel é pesado, com caldeira, chaminé e rodas traseiras enormes; o Canhão de Caldeira é uma carreta parada com cano grosso; o Rolimã é baixo e chato, quase rente ao chão. O Carro-Vela é o único da facção com forma vertical em triângulo.

## Paleta e máscara de time

- Vela: lona crua `#CDBB94`, com remendos em padrão xadrez de ocre `#B5832E` e vermelho-tijolo `#9B3B26` como acento da facção.
- Chassi e mastro: madeira e tubo de ferro com ocre e verde-oliva desbotado `#6F7445`.
- Pneus do aríete: borracha escura gasta, amarrada com corda clara.
- Máscara de time: uma faixa horizontal larga pintada na vela, a um terço da altura, e uma flâmula comprida no topo do mastro; a faixa precisa continuar legível através da translucidez da vela, e isso é um teste do portão.
- Veterania: uma fita colorida amarrada no mastro por nível (detalhe da facção).

## Partes que se movem

- Três rodas girando; a roda dianteira esterça.
- Mastro fixo no chassi; retranca (a barra de baixo da vela) com balanço leve.
- Vela com tecido animado: enfunada em movimento, panejando parada (simulação de tecido assada ou shape keys, o que o portão provar mais estável entre quadros).
- Banco giratório do atirador com a carabina: torre separada, pequena.
- Piloto deitado, com braços no manche.
- Flâmula do topo do mastro tremulando.

## Animações

- Corpo: parado (vela panejando, 4 quadros de laço) e rodando (vela enfunada e rodas girando, 4 quadros de laço), em 16 ou 32 direções conforme o portão.
- Torre do atirador: girando por direção e atirando (2 quadros, com uma baforada branca de ar na boca, sem fogo).
- Abalroar: investida de 4 quadros, vela cheia, poeira levantando, pneus da frente amassando no impacto.
- Destruído: 1 quadro com a vela rasgada e o mastro quebrado, mais a carcaça no chão (a carcaça vai servir ao Remendeiro depois da fase 1).
- Pontos de encaixe por direção: boca da carabina, topo do mastro (barra de vida), ponto de poeira das rodas traseiras.

## Referências do mundo real

- Carro a vela de praia e de lago seco (três rodas, piloto deitado, vela alta).
- Vela triangular de jangada de pesca, de lona remendada.
- Para-choque de pneus de rebocador e de cais de porto.
- Carabina de ar comprimido de reservatório grande, de pressão manual.
- Remendos de lona costurados à mão e cordas de sisal.

## Tamanho

- Ocupa cerca de 1 × 1,5 célula; a vela sobe perto de 1,5 célula acima do chassi, então o quadro precisa de mais altura que o padrão de veículo (estimativa 256 × 320 px no uhd), a confirmar no portão.

## Checklist de originalidade

- [x] Nome nosso; busca simples na web em 30/10/2026 sem uso como unidade em jogo.
- [x] A descrição começa pelo papel na matriz.
- [x] Combinação própria: carro a vela de frete com aríete de pneus, rápido no aberto e lento na ruína; não reproduz unidade conhecida.
- [x] Silhueta distinta das outras da facção no papel. [ ] Teste de 5 segundos no portão de estilo (`rts-arte`, E2).
- [x] Números da nossa tabela de partida.
- [ ] Falas: pendente, etapa de som e falas.
- [ ] Ficha de origem: pendente, `rts-arte`, junto com o asset.
- [ ] Revisão por quem jogou o jogo que inspirou o projeto: pendente, pedida ao Victor.
- [ ] Teste de combinação por alguém que não é fã: pendente, pedido ao Victor.
