# Subestação

- id: `neutro/subestacao`
- Facção: neutra, religável · Categoria: estrutura do mapa, objetivo final · Lote: fase 1
- Versão: 1, de 30/10/2026

## Papel na matriz

Objetivo final da fase 1: estrutura neutra religável no alto do Morro, a nordeste; o Religador precisa ficar 90 segundos na casa de comando (60 no Fácil, 120 no Difícil), com a contagem pausando se ele sair ou morrer; quando a contagem chega a zero, a fase está ganha.

Durante a religação vem a onda final dos Desligados pelas duas rotas e o reforço da Regional chega pela estrada sul; a Subestação é o ponto a defender.

No fecho, ela acende, as luzes do vale acendem uma a uma a partir dela e as torres ligadas à rede ganham +25% de cadência.

Não é destrutível na fase 1, para a missão não terminar por acidente.

## Fantasia

A subestação do Morro, de onde o vale inteiro já foi aceso, e de onde vai ser de novo se a contagem chegar a zero.

## Silhueta

Vista de cima em 3/4, é o maior conjunto do mapa: um pátio cercado de alambrado com dois transformadores grandes (corpo com aletas de radiador e buchas de porcelana no alto), pórticos de treliça de aço com barramentos esticados, chaves seccionadoras em fila e para-raios; num canto, a casa de comando, um prédio baixo de concreto com porta e painel; saindo do pátio, uma torre de linha de transmissão de onde os cabos partem para o vale.

Morta, tudo está enferrujado, com mato alto no pátio, chaves abertas (os braços para cima) e a casa de comando escura; religada, as chaves fecham uma a uma, os transformadores zumbem com um brilho leve nas buchas e as lâmpadas acendem.

O que distingue de tudo no mapa: é a única estrutura com transformadores e pórticos, e a maior; deve ler como o lugar mais importante do vale.

## Paleta neutra e máscara de time

- Transformadores: cinza industrial com ferrugem; buchas de porcelana marrom-escura ou branca.
- Pórticos e chaves: aço galvanizado envelhecido.
- Casa de comando: concreto envelhecido `#9A968D` com porta de metal amarelo-máquina desbotado.
- Pátio: brita e mato seco `#B9A15A` quando morta; brita limpa onde o mato foi pisado, quando religada.
- Brilho das buchas, lâmpadas e painel: camada de luzes.
- Máscara de time: as lâmpadas de sinalização dos pórticos e o painel da casa de comando, coloridos só no estado religado.

## Partes que se movem

- Chaves seccionadoras (braços que giram de aberto para fechado), em fila.
- Brilho e zumbido visual nas buchas (camada de luzes e efeito de faísca).
- Porta da casa de comando (aberta enquanto o Religador trabalha).
- Painel da casa de comando com luzes de progresso (camada de luzes).

## Animações e estados

- Morta: 1 quadro.
- Religando, em três etapas que acompanham a contagem: até um terço, faíscas no primeiro transformador e o painel acendendo; até dois terços, o segundo transformador acende; no fim, as chaves fecham uma a uma (laço de 4 quadros por etapa, mais a transição das chaves em 8 quadros).
- Contagem pausada (o Religador saiu ou morreu): mantém a etapa alcançada, com as faíscas paradas.
- Religada: 1 quadro com tudo aceso; a partir daqui o fecho acende o vale.
- Pontos de encaixe: porta da casa de comando (onde o Religador fica), topo da torre de transmissão (de onde o jogo desenha os cabos acendendo para o vale no fecho) e centro do pátio (barra de progresso da religação).

## Referências do mundo real

- Subestação de distribuição com transformadores de potência, pórticos, barramentos, chaves seccionadoras e para-raios.
- Casa de comando de subestação.
- Torre treliçada de linha de transmissão.

## Tamanho

- Ocupa cerca de 5 × 4 células; quadro estimado de 1.024 px no uhd.

## Checklist de originalidade

- [x] Nome comum, descritivo; busca simples na web em 30/10/2026 sem uso como objetivo religável em jogo.
- [x] A descrição começa pelo papel na matriz.
- [x] Combinação própria: religar a subestação sob contagem para acender o vale; defender ponto sob contagem é convenção do gênero, a forma e o fecho são nossos.
- [x] Silhueta distinta de tudo no mapa no papel. [ ] Teste de 5 segundos no portão de estilo (`rts-arte`, E2).
- [x] Números da nossa tabela de partida (os tempos são os da tabela de dificuldade da fase 1).
- [ ] Falas: não se aplica; o Locutor narra a religação nas falas de rádio.
- [ ] Ficha de origem: pendente, `rts-arte`, junto com o asset.
- [ ] Revisão por quem jogou o jogo que inspirou o projeto: pendente, pedida ao Victor.
- [ ] Teste de combinação por alguém que não é fã: pendente, pedido ao Victor.
