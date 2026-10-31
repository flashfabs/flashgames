# Pilha de Baterias

- id: `neutro/pilha-de-baterias` · asset `neutro-recurso-pilha-de-baterias`
- Facção: neutra · Categoria: recurso do mapa · Lote: kit cinza da caixa de areia e fase 1
- Versão: 1, de 31/10/2026

## Papel na matriz

A fonte de Carga do jogo: cada Cemitério de Baterias é um grupo de 3 a 5 pilhas de 1.500 C cada, fixas e finitas; o coletor encosta, carrega e leva ao depósito.
Não é alvo, não bloqueia tiro e não tem dono; ocupa a própria célula.

O que a pilha precisa contar de longe, sem menu: quanto ainda tem (pelo brilho) e quando acabou (apagada).

## Fantasia

Baterias velhas de ônibus, de carro e de usina solar empilhadas em paletes desde o Clarão; quem chega primeiro leva.

## Silhueta

Vista de cima em 3/4, um monte baixo e largo de paletes de madeira com caixas de bateria por cima, algumas tombadas, cabos soltos pendurados e uma lona rasgada num canto; mais larga que alta, para não esconder o coletor que encosta.

O que distingue de tudo no mapa: é a única coisa com o brilho azul-esverdeado pulsando, e o brilho mora nas frestas entre as baterias, não num farol.

## Paleta neutra

- Paletes: madeira gasta `#8B6B4A`.
- Caixas de bateria: plástico preto e cinza-chumbo, terminais de cobre oxidado em verde.
- Brilho da carga: azul-esverdeado `#4FD1B5` na camada de luzes, mais forte com a pilha cheia.
- Sem máscara de time: a pilha é de ninguém.

## Estados e animações

- Cheia, 75%, 50%, 25%: o monte vai baixando (menos caixas em cima) e o brilho fica mais fraco; 4 quadros de modelo, um por faixa.
- Brilho: laço de 8 quadros na camada de luzes, um pulso lento (cerca de 2 s), defasado de pilha para pilha.
- Apagada (esgotada): paletes vazios e caixas abertas, sem brilho; fica no mapa como decoração.
- Coleta: faíscas curtas no ponto onde o braço do coletor pega (efeito, não quadro da pilha).
- Pontos de encaixe: o ponto de coleta (onde o coletor para) e o topo, para o número de carga restante quando a pilha está selecionada.

## Referências do mundo real

- Baterias estacionárias e de ônibus elétrico em pátio de reciclagem.
- Paletes de baterias de chumbo-ácido em depósito de sucata.
- Bancos de bateria de usina solar fora de uso.

## Tamanho

- 1 × 1 célula; quadro de 256 px no uhd (o monte transborda um pouco da célula, a pegada não).

## Checklist de originalidade

- [x] Nome comum e descritivo; o recurso tem nome e forma nossos (carga em baterias velhas, não minério, cristal nem gás).
- [x] A descrição começa pelo papel na matriz.
- [x] Combinação própria: brilho que apaga em degraus conforme a pilha esvazia, em paletes de sucata.
- [ ] Teste de 5 segundos: a pilha cheia e a apagada se distinguem a 1080p (`rts-arte`, no kit cinza).
- [x] Números da nossa tabela de partida (`site/rts/dados/economia.json` e o mapa).
- [ ] Falas: não se aplica.
- [ ] Ficha de origem: pendente, `rts-arte`, junto com o asset.
- [ ] Revisão por quem jogou o jogo que inspirou o projeto: pendente, pedida ao Victor.
- [ ] Teste de combinação por alguém que não é fã: pendente, pedido ao Victor.
