# Alojamento da Turma

- id: `religadores/alojamento-da-turma`
- Facção: Religadores (jogador na fase 1) · Categoria: construção, quartel · Lote: fase 1
- Versão: 1, de 30/10/2026

## Papel na matriz

Quartel: blindagem Estrutura, cerca de 400 C, 25 segundos, 1.500 de vida; produz Turma de Linha, Soldador e Religador.

É prédio elétrico: fora da rede produz a 50%, e a interferência o desliga por alguns segundos.

Na fase 1, construí-lo e formar 4 Turmas é o segundo objetivo; quando o Religador morre no clímax, é daqui que sai outro.

## Fantasia

Contêiner de obra virou alojamento: tem beliche, bebedouro, varal e um quadro de avisos com a escala de plantão.

## Silhueta

Vista de cima em 3/4, são três contêineres de canteiro empilhados em L, dois embaixo e um em cima, com escada metálica externa e passarela com guarda-corpo; no teto do contêiner de cima, uma caixa d'água; ao lado da porta de baixo, um relógio de ponto numa coluna.

Entre os contêineres, um varal com macacões laranja secando, que dá movimento e humor.

O que distingue das outras da facção: é a única construção feita de caixas empilhadas, com escada externa; o Escritório é de concreto com fachada, a Garagem tem telhado em arco.

## Paleta e máscara de time

- Contêineres: branco-encardido `#E6E1D3` e azul-cobalto `#1F4E8C`, com ferrugem nas quinas.
- Escada e guarda-corpo: laranja-segurança `#E2711D`.
- Macacões no varal: laranja-segurança.
- Janelas e lâmpada do relógio de ponto: camada de luzes.
- Máscara de time: uma bandeirola no guarda-corpo e uma faixa pintada na lateral do contêiner de cima.

## Partes que se movem

- Porta do contêiner de baixo (abre para a unidade sair).
- Varal com roupas balançando.
- Janelas acesas (camada de luzes).

## Animações e estados

- Construindo: andaime em camada separada; revelação pela máscara do shader.
- Pronta, atividade em laço: 8 quadros (varal balançando, luz da janela).
- Produzindo: 4 quadros, a porta abre na saída da unidade; a unidade nova sai batendo o ponto (o gesto fica na animação de saída da infantaria, se couber).
- Sem energia: camada de luzes desligada.
- Danificada: 1 quadro com o contêiner de cima torto, escada solta e varal caído.
- Destruída: 1 quadro com os contêineres tombados e a caixa d'água no chão.
- Pontos de encaixe: porta de saída e topo (barra de vida e seleção).

## Referências do mundo real

- Contêineres de canteiro de obras empilhados, com escada metálica e passarela.
- Relógio de ponto mecânico de cartão.
- Caixa d'água de fibra e varal de alojamento de obra.

## Tamanho

- Ocupa 3 × 3 células; quadro de 512 px no uhd.

## Checklist de originalidade

- [x] Nome nosso; busca simples na web em 30/10/2026 sem uso como construção em jogo.
- [x] A descrição começa pelo papel na matriz.
- [x] Combinação própria: quartel como alojamento de contêineres com relógio de ponto; quartel é convenção do gênero, a forma e o humor são nossos.
- [x] Silhueta distinta das outras da facção no papel. [ ] Teste de 5 segundos no portão de estilo (`rts-arte`, E2).
- [x] Números da nossa tabela de partida.
- [ ] Falas: não se aplica, exceto avisos de interface.
- [ ] Ficha de origem: pendente, `rts-arte`, junto com o asset.
- [ ] Revisão por quem jogou o jogo que inspirou o projeto: pendente, pedida ao Victor.
- [ ] Teste de combinação por alguém que não é fã: pendente, pedido ao Victor.
