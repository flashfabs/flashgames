# Torre Antiga

- id: `neutro/torre-antiga`
- Facção: neutra, religável · Categoria: estrutura do mapa · Lote: fase 1
- Versão: 1, de 30/10/2026

## Papel na matriz

Estrutura neutra religável: morta, não faz nada e não é alvo; religada pelo Religador (cerca de 20 segundos parado ao pé dela), vira uma defesa de Bala com visão longa para o lado de quem religou.

Na fase 1 fica na colina do centro-oeste e cobre a Ponte Velha; religá-la é o objetivo opcional que aparece com a chegada do Religador, e ela ajuda a segurar a onda da ponte.

Depois de religada, é prédio elétrico como os dos Religadores: a interferência a desliga.

## Fantasia

A torre do antigo posto de fiscalização da estrada travou no dia do Clarão com a torreta apontada para o chão; só esperava alguém pagar a luz.

## Silhueta

Vista de cima em 3/4, é um fuste alto e cilíndrico de concreto com uma cabine mais larga no topo, de janelas em fenda, e uma torreta motorizada no teto da cabine; uma escada externa protegida por gaiola sobe pelo fuste; uma antena e uma lâmpada de sinalização no alto.

Morta, a torre está tomada por trepadeiras até a metade, com ferrugem escorrendo, vidros escuros e a torreta caída para baixo; religada, a torreta se ergue, as janelas acendem e a lâmpada pisca.

O que distingue de tudo no mapa: as torres dos Religadores são metálicas e mais baixas, a Torre de Vigia dos Desligados é um mastro de madeira com cordas; a Torre Antiga é concreto liso, mais alta e mais grossa que as duas.

## Paleta neutra e máscara de time

- Concreto envelhecido cinza `#9A968D` (o mesmo do terreno de concreto) com manchas de chuva e ferrugem.
- Trepadeiras: verde da mata escura `#3E5A3A`.
- Cabine e torreta: tinta industrial desbotada, amarelo-máquina e branco.
- Janelas e lâmpada: camada de luzes, apagadas quando morta.
- Máscara de time: a lâmpada de sinalização do topo e um painel na porta da caixa de força ao pé da torre, que só aparecem coloridos no estado religado; morta, a máscara fica cinza.

## Partes que se movem

- Torreta motorizada (camada própria, 16 direções; caída quando morta), com recuo.
- Lâmpada de sinalização e janelas (camada de luzes).
- Caixa de força ao pé da torre, com porta, onde o Religador trabalha.

## Animações e estados

- Morta: 1 quadro (trepadeiras, ferrugem, torreta caída, luzes apagadas).
- Religando: laço de 4 quadros com faíscas na caixa de força e luzes piscando fraco; sincronizado com o Religador.
- Religada: corpo em 1 quadro com trepadeiras rasgadas e luzes acesas; torreta erguida em 16 direções.
- Atirando: 2 quadros por direção da torreta.
- Danificada: 1 quadro com a cabine rachada e a torreta torta.
- Destruída: 1 quadro com a cabine desabada e o fuste quebrado.
- Pontos de encaixe: caixa de força (onde o Religador fica), boca da torreta por direção e topo.

## Referências do mundo real

- Torre de concreto de posto de fiscalização rodoviária e de controle de barragem, com cabine no alto.
- Torre de observação de incêndio florestal, com cabine envidraçada.
- Escada de marinheiro com gaiola de proteção.
- Lâmpada de sinalização de obstáculo aéreo.

## Tamanho

- Ocupa 2 × 2 células; quadro de 512 px de largura, mais alto pela torre (estimativa 512 × 768 px no uhd).

## Checklist de originalidade

- [x] Nome comum, descritivo; busca simples na web em 30/10/2026 sem uso como estrutura religável em jogo.
- [x] A descrição começa pelo papel na matriz.
- [x] Combinação própria: torre de concreto abandonada que volta a atirar quando alguém devolve a energia.
- [x] Silhueta distinta das torres das duas facções no papel. [ ] Teste de 5 segundos no portão de estilo (`rts-arte`, E2).
- [x] Números da nossa tabela de partida (o tempo de religação e o dano ainda serão definidos nos dados de jogo).
- [ ] Falas: não se aplica.
- [ ] Ficha de origem: pendente, `rts-arte`, junto com o asset.
- [ ] Revisão por quem jogou o jogo que inspirou o projeto: pendente, pedida ao Victor.
- [ ] Teste de combinação por alguém que não é fã: pendente, pedido ao Victor.
