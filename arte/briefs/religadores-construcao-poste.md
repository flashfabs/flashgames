# Poste

- id: `religadores/poste`
- Facção: Religadores (jogador na fase 1) · Categoria: construção, extensão de rede · Lote: fase 1
- Versão: 1, de 30/10/2026

## Papel na matriz

Área de construção e de energia: blindagem Estrutura, cerca de 50 C, 5 segundos, 300 de vida; estende a rede em 6 células; barato e frágil; posicionado em série com Shift.

Os cabos aparecem desenhados entre um poste e o seguinte; derrubar um poste corta a energia de tudo o que estava depois dele, o que faz do Poste o alvo favorito do assédio inimigo.

## Fantasia

Concreto, cruzeta e três isoladores: a fronteira da civilização, de 6 em 6 células.

## Silhueta

Vista de cima em 3/4, é uma linha vertical fina e alta, de concreto, com uma cruzeta no topo e três isoladores; na metade da altura, uma plaqueta de numeração e uma faixa pintada.

É a peça mais simples e mais repetida da base: tem de ler como "poste" em qualquer zoom e não pode competir com as unidades, então fica sem detalhe miúdo e com contraste médio.

O que distingue das outras da facção: é a única construção de uma célula e a única que é só um traço vertical.

## Paleta e máscara de time

- Poste: cinza-concreto `#8A8C8E` com sujeira de terra vermelha na base.
- Cruzeta: madeira tratada escura ou concreto; isoladores de porcelana branco-encardido `#E6E1D3`.
- Acento: uma faixa refletiva laranja-segurança `#E2711D` na base, para o poste não sumir no capim seco.
- Máscara de time: a faixa pintada na metade da altura e a plaqueta de numeração.

## Partes que se movem

- Nenhuma parte articulada; os cabos são desenhados pelo jogo entre os pontos de encaixe.
- Faísca ocasional num isolador quando a rede está carregada (efeito separado, opcional).

## Animações e estados

- Construindo: sobe pela máscara do shader, sem andaime (é rápido).
- Pronta: 1 quadro.
- Sem energia: o mesmo quadro; quem mostra a falta de energia são os cabos e os prédios.
- Danificado: 1 quadro com o poste inclinado e a cruzeta torta.
- Destruído: 1 quadro com o poste quebrado ao meio e a cruzeta no chão; o jogo desenha o cabo caído.
- Pontos de encaixe: os três isoladores (de onde saem os cabos; o jogo pode desenhar um cabo só, preso ao do meio) e o topo (barra de vida e seleção).

## Referências do mundo real

- Poste de concreto de rede de distribuição com cruzeta e isoladores de porcelana.
- Plaqueta de numeração de poste.
- Faixa de sinalização refletiva na base de poste em beira de estrada.

## Tamanho

- Ocupa 1 × 1 célula; sobe cerca de 1,5 célula, então o quadro precisa de mais altura que largura (estimativa 256 × 384 px no uhd).

## Checklist de originalidade

- [x] Nome comum de dicionário; a peça é definida pela regra de rede, que é nossa.
- [x] A descrição começa pelo papel na matriz.
- [x] Combinação própria: rede de postes com cabos desenhados que pode ser cortada no meio; energia que limita a base é convenção do gênero, a rede visível de postes é nossa.
- [x] Silhueta distinta das outras da facção no papel. [ ] Teste de 5 segundos no portão de estilo (`rts-arte`, E2).
- [x] Números da nossa tabela de partida.
- [ ] Falas: não se aplica.
- [ ] Ficha de origem: pendente, `rts-arte`, junto com o asset.
- [ ] Revisão por quem jogou o jogo que inspirou o projeto: pendente, pedida ao Victor.
- [ ] Teste de combinação por alguém que não é fã: pendente, pedido ao Victor.
