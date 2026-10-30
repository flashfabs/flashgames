# Barracão

- id: `desligados/barracao`
- Facção: Desligados (inimigo na fase 1) · Categoria: construção, quartel empacotável · Lote: fase 1
- Versão: 1, de 30/10/2026

## Papel na matriz

Quartel: blindagem Estrutura, cerca de 400 C, cerca de 1.125 de vida (25% menos que o padrão); produz Chapa, Arpoador e Rolimã.

Empacotável depois da fase 1; o modelo nasce sobre esquis de madeira com rodas. Não é elétrico.

Na fase 1 fica no Acampamento da Catraca.

## Fantasia

O ponto da turma: banco de madeira, quadro de fretes e uma fila de gente esperando serviço.

## Silhueta

Vista de cima em 3/4, é um galpão aberto dos lados, de telha ondulada sobre esteios de madeira, com bancos compridos onde há gente sentada esperando; no fundo, um quadro-negro grande com a palavra "FRETES" e uma lista de destinos riscados a giz.

Do beiral pendura um cordão de bandeirinhas de pano, de ponta a ponta, que dá cor e movimento; num canto, um carrinho de mão e trouxas amarradas.

O que distingue das outras da facção: é a única construção aberta dos lados e com gente à vista; o Carroção-Mãe é um carroção de toldo em arco, o Paiol é fechado, a Ferraria tem chaminé.

## Paleta e máscara de time

- Telhado: telha ondulada com ferrugem e remendos.
- Esteios e bancos: madeira crua.
- Gente nos bancos: ponchos e chapéus nas cores da facção, lona crua `#CDBB94`, ocre `#B5832E` e verde-oliva desbotado `#6F7445`.
- Quadro-negro: moldura vermelho-tijolo `#9B3B26`.
- Máscara de time: o cordão de bandeirinhas inteiro e uma faixa pintada na cumeeira.

## Partes que se movem

- Cordão de bandeirinhas balançando.
- Duas ou três figuras sentadas com gestos curtos (corpo-base de infantaria).
- Uma figura que se levanta e sai quando a unidade fica pronta.

## Animações e estados

- Construindo: esteios e telhado em camada separada; revelação pela máscara do shader.
- Pronta, atividade em laço: 8 quadros (bandeirinhas, gente nos bancos).
- Produzindo: 4 quadros, uma figura se levanta e sai pela frente.
- Danificada: 1 quadro com parte do telhado caída e bancos virados.
- Destruída: 1 quadro com o telhado no chão e esteios quebrados.
- Depois da fase 1 (escaramuça): empacotar e desempacotar.
- Pontos de encaixe: saída da frente e topo.

## Referências do mundo real

- Barracão de madeira com telha ondulada de rodoviária e de feira do interior.
- Quadro-negro de giz com lista de fretes e destinos.
- Bancos compridos de madeira e cordão de bandeirinhas de pano.

## Tamanho

- Ocupa 3 × 3 células; quadro de 512 px no uhd.

## Checklist de originalidade

- [x] Nome comum de dicionário; busca simples na web em 30/10/2026 sem uso como construção em jogo de estratégia.
- [x] A descrição começa pelo papel na matriz.
- [x] Combinação própria: quartel como ponto de espera de freteiros com quadro de fretes; quartel é convenção do gênero, a forma e o humor são nossos.
- [x] Silhueta distinta das outras da facção no papel. [ ] Teste de 5 segundos no portão de estilo (`rts-arte`, E2).
- [x] Números da nossa tabela de partida.
- [ ] Falas: não se aplica.
- [ ] Ficha de origem: pendente, `rts-arte`, junto com o asset.
- [ ] Revisão por quem jogou o jogo que inspirou o projeto: pendente, pedida ao Victor.
- [ ] Teste de combinação por alguém que não é fã: pendente, pedido ao Victor.
