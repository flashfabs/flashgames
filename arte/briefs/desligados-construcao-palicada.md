# Paliçada

- id: `desligados/palicada`
- Facção: Desligados (inimigo na fase 1) · Categoria: construção, muro · Lote: fase 1
- Versão: 1, de 30/10/2026

## Papel na matriz

Muro barato: blindagem Estrutura, cerca de 25 C por segmento, cerca de 450 de vida por segmento; posicionada em série com Shift, como os muros do gênero.

Mais barata e mais fraca que um muro comum, combina com a defesa estática fraca da facção; não é elétrica.

Na fase 1 cerca o posto do Cemitério Norte e fecha parte do Desfiladeiro.

## Fantasia

Estaca de eucalipto, porta velha, palete e placa de "vende-se": tudo o que sobrou da última mudança vira cerca.

## Silhueta

Vista de cima em 3/4, é uma cerca baixa e irregular de estacas de eucalipto apontadas, intercaladas com portas velhas, paletes em pé e placas pintadas à mão, amarradas com arame e corda.

Cada segmento tem uma variação de peças, para a cerca não parecer repetida; a altura é baixa o bastante para não esconder as unidades atrás dela.

O que distingue das outras da facção: é a única peça linear e repetida; deve ler como "cerca de sucata", nunca como muro de pedra ou de concreto.

## Paleta e máscara de time

- Estacas: eucalipto descascado, claro, e madeira escurecida.
- Portas, paletes e placas: tinta descascada nas cores da facção, ocre `#B5832E`, vermelho-tijolo `#9B3B26` e verde-oliva desbotado `#6F7445`.
- Amarras: arame e corda de sisal.
- Máscara de time: tiras de pano amarradas no topo de algumas estacas.

## Partes que se movem

- Tiras de pano balançando (opcional, laço de 4 quadros).

## Animações e estados

- Peças de ligação por vizinhos: o jogo escolhe a peça conforme os segmentos vizinhos (reto em cada eixo, cantos, T, cruz e ponta); são até 16 peças pela máscara de 4 vizinhos, ou poste mais painel, se a `rts-render` preferir montar.
- Construindo: revelação rápida pela máscara do shader, sem andaime.
- Pronta: 1 quadro por peça, com 2 ou 3 variações de sucata para os retos.
- Danificada: 1 quadro por peça com estacas tortas e uma porta caída.
- Destruída: 1 quadro por peça com o segmento no chão.

## Referências do mundo real

- Cerca de estacas de eucalipto de sítio.
- Paletes, portas de madeira velhas e placas pintadas à mão reaproveitadas.
- Arame recozido e corda de sisal.

## Tamanho

- 1 × 1 célula por segmento; quadro de 256 px no uhd.

## Checklist de originalidade

- [x] Nome comum de dicionário (cerca de estacas); busca simples na web em 30/10/2026. Ponto de atenção: o termo também aparece como muro barato de madeira em traduções de outros jogos de estratégia; muro barato é convenção do gênero, e a forma de cerca de sucata (portas, paletes, placas) é nossa.
- [x] A descrição começa pelo papel na matriz.
- [x] Combinação própria: cerca de sucata de mudança.
- [x] Silhueta distinta das outras da facção no papel. [ ] Teste de 5 segundos no portão de estilo (`rts-arte`, E2).
- [x] Números da nossa tabela de partida.
- [ ] Falas: não se aplica.
- [ ] Ficha de origem: pendente, `rts-arte`, junto com o asset.
- [ ] Revisão por quem jogou o jogo que inspirou o projeto: pendente, pedida ao Victor.
- [ ] Teste de combinação por alguém que não é fã: pendente, pedido ao Victor.
