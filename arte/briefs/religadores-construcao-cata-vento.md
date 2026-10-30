# Cata-vento

- id: `religadores/cata-vento`
- Facção: Religadores (jogador na fase 1) · Categoria: construção, renda pelo vento · Lote: fase 1
- Versão: 1, de 30/10/2026

## Papel na matriz

Renda pelo vento: blindagem Estrutura, cerca de 300 C, 20 segundos, 500 de vida; só pode ser erguido numa célula ventosa, que fica sempre em terreno alto.

Regra do vento depois da revisão crítica: o vento vem em rajadas anunciadas; cada rajada rende um lote de Carga de uma vez a quem tiver o cata-vento de pé naquele momento. Não é renda constante nem reserva para o fim da partida: é um motivo para disputar o alto o tempo todo.

Na fase 1 há quatro células ventosas: no platô da base, na colina da Torre Antiga, perto do Ferro-Velho e no cume do Morro.

## Fantasia

Gerador de quintal com pás de tambor cortado, que só paga quando o vento resolve soprar.

## Silhueta

Vista de cima em 3/4, é uma torre treliçada fina de cerca de duas células de altura, com um rotor de três pás largas feitas de tambor de metal cortado ao meio e um leme de cauda; na base, uma caixa de baterias com um medidor.

É a construção mais alta e mais fina da facção depois do Poste, e a única com partes girando o tempo todo; o rotor parado ou disparado é o que mostra se a rajada chegou.

O que distingue das outras da facção: a Torre de Holofote também é torre, mas tem guarita e holofote em cima, sem rotor; o Poste é concreto liso, sem treliça.

## Paleta e máscara de time

- Torre: metal galvanizado com faixas laranja-segurança `#E2711D` na base.
- Pás: metal de tambor com tinta azul-cobalto `#1F4E8C` descascada.
- Caixa de baterias: cinza-concreto `#8A8C8E`, com o medidor e uma lâmpada na camada de luzes.
- Máscara de time: o leme de cauda e a porta da caixa de baterias.

## Partes que se movem

- Rotor de três pás, girando devagar (sem rajada) e rápido (na rajada).
- Leme de cauda com pequena oscilação.
- Ponteiro do medidor e lâmpada da caixa (camada de luzes).

## Animações e estados

- Construindo: revelação pela máscara do shader, com andaime pequeno.
- Pronta, sem rajada: laço de 8 quadros com o rotor girando devagar.
- Na rajada: laço de 8 quadros com o rotor disparado e faíscas na caixa de baterias (efeito separado); o aviso da rajada que vem é da interface e do som.
- Sem energia (interferência): rotor travado, camada de luzes desligada.
- Danificado: 1 quadro com uma pá arrancada; em laço, o rotor gira torto (4 quadros).
- Destruído: 1 quadro com a torre dobrada ao meio e o rotor no chão.
- Pontos de encaixe: centro do rotor (efeito de rajada), caixa de baterias (faíscas) e topo.

## Referências do mundo real

- Aerogerador artesanal de pequeno porte, de pás feitas de tambor de metal ou de cano cortado.
- Torre treliçada de antena ou de catavento de fazenda, galvanizada.
- Caixa de baterias de sistema solar ou eólico isolado, com medidor.

## Tamanho

- Ocupa 2 × 2 células; quadro de 512 px de largura, mais alto pela torre (estimativa 512 × 640 px no uhd).

## Checklist de originalidade

- [x] Nome comum de dicionário; busca simples na web em 30/10/2026; a combinação abaixo é que define a peça.
- [x] A descrição começa pelo papel na matriz.
- [x] Combinação revista: a primeira versão (renda constante que segura a partida quando o recurso acaba) ficava perto de um prédio de renda de um jogo conhecido, e por isso o vento virou rajadas anunciadas que se disputam no alto, só em célula ventosa.
- [x] Silhueta distinta das outras da facção no papel. [ ] Teste de 5 segundos no portão de estilo (`rts-arte`, E2).
- [x] Números da nossa tabela de partida (o valor de cada rajada ainda será definido nos dados de jogo).
- [ ] Falas: não se aplica, exceto o aviso de rajada.
- [ ] Ficha de origem: pendente, `rts-arte`, junto com o asset.
- [ ] Revisão por quem jogou o jogo que inspirou o projeto: pendente, pedida ao Victor.
- [ ] Teste de combinação por alguém que não é fã: pendente, pedido ao Victor.
