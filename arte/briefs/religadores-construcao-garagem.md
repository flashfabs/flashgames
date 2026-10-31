# Garagem

- id: `religadores/garagem`
- Facção: Religadores (jogador na fase 1) · Categoria: construção, oficina · Lote: fase 1
- Versão: 1, de 30/10/2026

## Papel na matriz

Oficina: blindagem Estrutura, cerca de 800 C, 40 segundos, 1.800 de vida; produz Guincho de Células, Leiturista e Equipe de Manutenção, e no nível 2 o Cesto Blindado e o Lança-Bobinas.

É prédio elétrico: fora da rede produz a 50%, e a interferência o desliga por alguns segundos.

## Fantasia

O pátio de frota da concessionária: rampa, fosso e um mecânico que jura que o caminhão estava bom quando saiu.

## Silhueta

Vista de cima em 3/4, é um galpão comprido de telhado em arco de chapa metálica, com duas portas de enrolar largas na frente; o arco é a forma que se lê primeiro.

Na frente, um pátio de concreto com um fosso de inspeção e um elevador automotivo; ao lado, uma pilha de pneus e um tambor de óleo; no alto do arco, uma claraboia por onde se vê a ponte rolante lá dentro.

O que distingue das outras da facção: o Escritório tem dois andares retos e a porta de enrolar fica num anexo baixo; o Almoxarifado é um galpão de telhado plano com prateleiras à mostra. Só a Garagem tem o telhado em arco e duas portas largas.

## Paleta e máscara de time

- Telhado: chapa metálica cinza-concreto `#8A8C8E` com faixas de ferrugem.
- Paredes da frente: branco-encardido `#E6E1D3`.
- Portas de enrolar: laranja-segurança `#E2711D` com faixas refletivas.
- Ponte rolante e elevador: azul-cobalto `#1F4E8C`.
- Lâmpadas internas e da porta: camada de luzes.
- Máscara de time: a bandeira no topo do arco e a faixa pintada logo acima das portas (a verga), nunca as portas.

## Partes que se movem

- Duas portas de enrolar (uma por baia de saída).
- Elevador automotivo do pátio, que sobe e desce.
- Clarões de solda vistos pela porta aberta (camada de luzes).
- Bandeira.

## Animações e estados

- Construindo: andaime em camada separada; revelação pela máscara do shader.
- Pronta, atividade em laço: 8 quadros (elevador subindo e descendo, clarões de solda).
- Produzindo: 6 quadros por porta, abrindo e fechando na saída do veículo.
- Sem energia: camada de luzes desligada e elevador parado.
- Danificada: 1 quadro com o arco amassado, uma porta torta e fumaça (efeito separado).
- Destruída: 1 quadro com o arco desabado sobre as baias.
- Pontos de encaixe: saída de cada porta e topo do arco.

## Referências do mundo real

- Galpão de telhado em arco de chapa metálica de pátio de frota.
- Fosso de inspeção, elevador automotivo e ponte rolante de oficina de caminhão.
- Portas de enrolar de aço.

## Tamanho

- Ocupa 4 × 3 células; quadro de 768 px no uhd.

## Checklist de originalidade

- [x] Nome comum de dicionário; busca simples na web em 30/10/2026; a combinação abaixo é que define a peça.
- [x] A descrição começa pelo papel na matriz.
- [x] Combinação própria: oficina como pátio de frota de concessionária; fábrica de veículos é convenção do gênero, a forma é nossa.
- [x] Silhueta distinta das outras da facção no papel. [ ] Teste de 5 segundos no portão de estilo (`rts-arte`, E2).
- [x] Números da nossa tabela de partida.
- [ ] Falas: não se aplica, exceto avisos de interface.
- [ ] Ficha de origem: pendente, `rts-arte`, junto com o asset.
- [ ] Revisão por quem jogou o jogo que inspirou o projeto: pendente, pedida ao Victor.
- [ ] Teste de combinação por alguém que não é fã: pendente, pedido ao Victor.
