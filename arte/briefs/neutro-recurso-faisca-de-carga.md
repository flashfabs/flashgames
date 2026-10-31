# Faísca de Carga

- id: `neutro/faisca-de-carga` · asset `neutro-recurso-faisca-de-carga`
- Facção: neutra · Categoria: recurso do mapa · Lote: kit cinza da caixa de areia e fase 1
- Versão: 1, de 31/10/2026

## Papel na matriz

A carga derramada: quando um coletor morre, tudo o que ele levava cai no chão em faíscas de 25 C cada, que qualquer coletor de qualquer lado recolhe durante 90 segundos; depois disso, somem.
Ensina que saquear comboio dá lucro e que escoltar é decisão; a Carroça de Pedal dos Desligados recolhe duas vezes mais rápido.

O que a faísca precisa contar de longe: "tem carga solta aqui, e está acabando o tempo".

## Fantasia

Células soltas do palete partido, ainda chiando no chão, que alguém vai querer antes que esfriem.

## Silhueta

Vista de cima em 3/4, duas ou três células de bateria caídas e meio enterradas na terra, com arcos elétricos curtos pulando entre elas; pequena, cerca de meia célula, sempre no chão, sem altura.

O que distingue: é o único objeto do mapa que estala e pisca branco-azulado em vez de pulsar devagar como a pilha.

## Paleta neutra

- Células: plástico preto e cinza com terminais de cobre.
- Arcos: branco-azulado `#CFF6FF` com bordas no mesmo azul-esverdeado da pilha `#4FD1B5`, na camada de luzes.
- Sem máscara de time.

## Estados e animações

- Viva: laço de 6 quadros com arcos aleatórios (variações por semente para não piscarem juntas).
- Esfriando: nos últimos 20 segundos, os arcos ficam mais raros e mais fracos (o jogo troca para um laço de 6 quadros mais apagado).
- Recolhida ou sumida: 4 quadros de estalo final e as células somem.
- Pontos de encaixe: o centro, para o coletor parar em cima.

## Referências do mundo real

- Arco elétrico entre terminais de bateria em curto.
- Células cilíndricas e prismáticas espalhadas depois de queda de palete.

## Tamanho

- Meia célula de chão; quadro de 128 px no uhd.

## Checklist de originalidade

- [x] Nome comum e descritivo.
- [x] A descrição começa pelo papel na matriz.
- [x] Combinação própria: carga de coletor destruído que fica no chão por tempo limitado, recolhível por qualquer lado.
- [ ] Teste de 5 segundos: visível sobre terra, capim e asfalto a 1080p (`rts-arte`, no kit cinza).
- [x] Números da nossa tabela de partida (`site/rts/dados/economia.json`).
- [ ] Falas: não se aplica.
- [ ] Ficha de origem: pendente, `rts-arte`, junto com o asset.
- [ ] Revisão por quem jogou o jogo que inspirou o projeto: pendente, pedida ao Victor.
- [ ] Teste de combinação por alguém que não é fã: pendente, pedido ao Victor.
