# Carroção-Mãe

- id: `desligados/carrocao-mae`
- Facção: Desligados (inimigo na fase 1) · Categoria: construção, QG empacotável · Lote: fase 1
- Versão: 1, de 30/10/2026

## Papel na matriz

QG: blindagem Estrutura, cerca de 2.250 de vida (os prédios dos Desligados têm 25% menos vida); fila de construção e produção da Carroça de Pedal (e do Remendeiro, depois da fase 1).

Mecânica de facção: empacota em 5 segundos, anda devagar e se desmonta em outro lugar; na fase 1 os Desligados são o computador e não empacotam, mas o modelo já nasce com rodas e lança de engate, para não ser refeito na escaramuça.

Não é elétrico. Na fase 1 é o coração do Acampamento da Catraca, ao norte do rio; derrubá-lo é a recompensa do objetivo opcional de desmontar o acampamento.

## Fantasia

A matriz da firma: um carroção de toldo com balcão, cofre e balança, que muda de lugar quando a conta chega.

## Silhueta

Vista de cima em 3/4, é o maior volume da facção e o mais horizontal: um carroção comprido de toldo em arco alto, sobre quatro rodas grandes de madeira, com a lança de engate na frente apoiada num cavalete.

Montado, os dois lados do carroção se abrem em toldos laterais sobre varas, formando uma barraca de feira em volta, com balcão, caixas empilhadas e uma balança de pratos pendurada na frente, que é o símbolo da facção (comércio, não ideologia).

Um mastro alto com uma pipa de lona amarrada no topo, que serve de sinal para os carroções do bando.

O que distingue das outras da facção: o Barracão é um galpão aberto de telha; a Ferraria tem a chaminé de tijolo; o Paiol é baixo e fechado; só o Carroção-Mãe tem o toldo em arco alto e as rodas grandes à mostra.

## Paleta e máscara de time

- Toldo principal: lona crua `#CDBB94` com remendos em xadrez de ocre `#B5832E` e vermelho-tijolo `#9B3B26`.
- Madeira do carroção e rodas: madeira escura com aros de ferro e detalhes verde-oliva desbotado `#6F7445`.
- Toldos laterais: listras de lona crua e vermelho-tijolo.
- Lamparinas: brilho quente na camada de luzes.
- Máscara de time: a franja recortada das bordas dos toldos laterais e a pipa do mastro; o toldo em arco fica nas cores da facção.

## Partes que se movem

- Toldos laterais (abrem e fecham; para a escaramuça, empacotam).
- Balança de pratos balançando.
- Pipa no mastro, tremulando.
- Lamparinas (camada de luzes).
- Rampa lateral que baixa para a unidade sair.
- Rodas e lança de engate (paradas na fase 1; giram ao empacotar e andar na escaramuça).

## Animações e estados

- Construindo: canteiro de estacas e cordas; varas e toldos em camada separada; revelação pela máscara do shader.
- Pronta, atividade em laço: 8 quadros (toldos tremulando, balança, pipa, lamparinas).
- Produzindo: 4 quadros da rampa lateral baixando para a Carroça sair.
- Danificada: 1 quadro com o toldo rasgado, uma roda quebrada e caixas tombadas.
- Destruída: 1 quadro com o carroção tombado e a lona queimada.
- Depois da fase 1 (escaramuça, E7): empacotar e desempacotar (8 quadros cada, 1 direção) e andar empacotado (como veículo, 16 direções).
- Pontos de encaixe: saída da rampa, topo do mastro e centro (barra de vida e seleção).

## Referências do mundo real

- Carroção de toldo de mudança e de circo itinerante, de rodas grandes de madeira.
- Barraca de feira livre com toldos de lona e balcão.
- Balança de pratos de feirante.
- Pipa de lona amarrada em mastro, usada como sinal.

## Tamanho

- Ocupa 4 × 3 células montado; quadro de 768 px no uhd.

## Checklist de originalidade

- [x] Nome nosso; busca simples na web em 30/10/2026 sem uso como construção em jogo.
- [x] A descrição começa pelo papel na matriz.
- [x] Combinação própria: QG como carroção de feira com balança, de uma facção de comércio. Prédios que se empacotam e mudam de lugar são convenção do gênero; aqui a forma é nossa e a mecânica nem entra na fase 1.
- [x] Silhueta distinta das outras da facção no papel. [ ] Teste de 5 segundos no portão de estilo (`rts-arte`, E2).
- [x] Números da nossa tabela de partida.
- [ ] Falas: não se aplica, exceto avisos de interface.
- [ ] Ficha de origem: pendente, `rts-arte`, junto com o asset.
- [ ] Revisão por quem jogou o jogo que inspirou o projeto: pendente, pedida ao Victor.
- [ ] Teste de combinação por alguém que não é fã: pendente, pedido ao Victor.
