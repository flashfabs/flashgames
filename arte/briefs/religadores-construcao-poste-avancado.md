# Poste Avançado

- id: `religadores/poste-avancado`
- Facção: Religadores (jogador na fase 1) · Categoria: construção, posto avançado · Lote: fase 1 (peça extra, fora da contagem original de 8 construções, porque a missão precisa dela)
- Versão: 1, de 30/10/2026

## Papel na matriz

Posto avançado: blindagem Estrutura, cerca de 1.000 C, 40 segundos, 1.500 de vida; erguido no local pela Equipe de Manutenção, longe da base; cria área de construção com rede própria e serve de depósito de Carga, sem precisar estar ligado ao Escritório Regional.

Na fase 1 é a forma de tomar o Cemitério Norte e de abrir o Ferro-Velho Leste, e conta para a regra de derrota (o jogador só perde sem QG, sem Poste Avançado e sem Equipe de Manutenção).

## Fantasia

Um poste com transformador, um contêiner de baterias e uma bandeira: onde a Regional finca o pé, começa a cobrança.

## Silhueta

Vista de cima em 3/4, é um poste mais grosso que o comum, com transformador e chave fusível, ao lado de um contêiner curto aberto num dos lados, com um rack de baterias e uma pequena cobertura de lona azul; uma doca simples de descarga; e um mastro alto com bandeira, a parte mais alta.

Tudo sobre uma base de concreto cercada por cones e fita zebrada, como uma obra que nunca termina.

O que distingue das outras da facção: parece um Poste com um Acumulador pequeno grudado; tem de ler como "posto da facção" e não como um dos dois, e o mastro com bandeira é o que resolve.

## Paleta e máscara de time

- Poste e base: cinza-concreto `#8A8C8E`.
- Contêiner: azul-cobalto `#1F4E8C` com faixas laranja-segurança `#E2711D`.
- Lona e cones: laranja-segurança e branco-encardido `#E6E1D3`.
- Lâmpada do transformador e células: camada de luzes.
- Máscara de time: a bandeira do mastro e a lateral do contêiner.

## Partes que se movem

- Bandeira com tecido em laço.
- Lâmpada de sinalização do topo do mastro (camada de luzes).
- Talha da doca, como a do Acumulador, em versão pequena.

## Animações e estados

- Construindo: a Equipe de Manutenção trabalha ao lado; andaime em camada separada; revelação pela máscara do shader.
- Pronta, atividade em laço: 8 quadros (bandeira, lâmpada piscando).
- Recebendo carga: 6 quadros da talha.
- Sem energia: camada de luzes desligada.
- Danificada: 1 quadro com o contêiner amassado e a lona rasgada.
- Destruída: 1 quadro com o poste tombado sobre o contêiner.
- Pontos de encaixe: ponto de descarga, ponta do poste (cabos) e topo do mastro.

## Referências do mundo real

- Poste de concreto com transformador de distribuição e chave fusível.
- Contêiner de canteiro de obras aberto num dos lados.
- Cones, fita zebrada e cobertura de lona de obra de rua.

## Tamanho

- Ocupa 2 × 2 células; quadro de 512 px no uhd.

## Checklist de originalidade

- [x] Nome nosso; busca simples na web em 30/10/2026 sem uso como construção em jogo.
- [x] A descrição começa pelo papel na matriz.
- [x] Combinação própria: posto avançado como poste com transformador e contêiner de baterias; posto avançado é convenção do gênero, a forma é nossa.
- [x] Silhueta distinta das outras da facção no papel. [ ] Teste de 5 segundos no portão de estilo (`rts-arte`, E2).
- [x] Números da nossa tabela de partida.
- [ ] Falas: não se aplica.
- [ ] Ficha de origem: pendente, `rts-arte`, junto com o asset.
- [ ] Revisão por quem jogou o jogo que inspirou o projeto: pendente, pedida ao Victor.
- [ ] Teste de combinação por alguém que não é fã: pendente, pedido ao Victor.
