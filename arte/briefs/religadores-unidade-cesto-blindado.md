# Cesto Blindado

- id: `religadores/cesto-blindado`
- Facção: Religadores (jogador na fase 1) · Categoria: unidade, veículo · Lote: portão de estilo e fase 1
- Versão: 1, de 30/10/2026

## Papel na matriz

Linha pesada: blindagem Pesada, dano Perfurante, cerca de 650 C, 900 de vida mais 10% por ser veículo dos Religadores, alcance 5, lento (cerca de 1,1 célula por segundo), lotação 3, liberado no nível 2 pela Garagem.

Mecânica própria, modo erguido: parado, abre as patolas e ergue a lança; ganha +2 de alcance, ignora a penalidade de tiro contra quem está no alto e vê por cima de muros e ruínas; para andar, precisa baixar a lança e recolher as patolas.

Boa contra veículos, prédios e emboscadas escondidas em ruínas; fraca contra anti-blindagem em massa, artilharia e interferência elétrica (é veículo elétrico e pode ser paralisado).

No mapa da fase 1 aparece também um Cesto tombado na margem do rio, que a Equipe de Manutenção desvira e entrega como Cesto veterano com nome.

## Fantasia

O caminhão de cesto aéreo da concessionária, chapeado e com uma cravadeira de pinos no cesto: quando a lança sobe, ninguém mais se esconde atrás do muro.

## Silhueta

Vista de cima em 3/4, é um caminhão comprido de três eixos com cabine chata na frente e uma lança longa deitada por cima, terminando num cesto quadrado; em movimento, a lança fica quase horizontal e gira com a torre, apontando para o alvo como um cano comprido, o que faz o Cesto se ler de longe como "o caminhão do braço".

Erguido, o desenho muda de horizontal para vertical: quatro patolas abertas em X no chão, a lança em dois segmentos subindo em ângulo e o cesto lá no alto, cerca de duas células acima do chassi; é a peça mais alta da facção e a única que muda de forma.

O que distingue das outras da facção: o Guincho de Células também é caminhão com braço, mas tem carroceria aberta com paletes brilhando e um guindaste curto dobrado atrás da cabine, nunca um cesto; o Lança-Bobinas se lê por um carretel enorme de cabo; a Equipe de Manutenção é um furgão curto com escada no teto; o Leiturista é uma moto.

Chapas de blindagem rebitadas por cima da cabine e das laterais deixam o contorno mais quadrado e pesado que o de qualquer outro veículo da facção.

## Paleta e máscara de time

- Cabine e chassi: branco-encardido `#E6E1D3` e cinza-concreto `#8A8C8E` nas chapas de blindagem, com sujeira de terra vermelha na parte de baixo.
- Lança: laranja-segurança `#E2711D`, a cor que identifica a facção à distância.
- Cesto: azul-cobalto `#1F4E8C`, com o operador de capacete visível dentro dele.
- Acentos: faixas refletivas alternadas nos para-choques e nas patolas; giroflex âmbar no teto da cabine.
- Máscara de time: o painel lateral do cesto (as duas faces), uma faixa larga na seção superior da lança, perto do cesto, e a placa da porta da cabine; nunca a lança inteira, que fica laranja da facção.

## Partes que se movem

- Chassi com três eixos; rodas giram; o eixo dianteiro esterça.
- Torre giratória (o pedestal da lança), 360°, renderizada como camada separada do chassi.
- Lança em dois segmentos articulados (inferior e superior), com cilindros hidráulicos que acompanham o movimento.
- Cesto com nivelamento: fica sempre na horizontal, qualquer que seja o ângulo da lança.
- Cravadeira de pinos presa à grade do cesto, com recuo no tiro.
- Operador dentro do cesto (corpo-base de infantaria, só tronco e capacete).
- Quatro patolas hidráulicas que descem e abrem.
- Giroflex âmbar girando; escapamento vertical atrás da cabine com fumaça.

## Animações

- Chassi: parado e rodando (4 quadros de laço), em 16 ou 32 direções conforme o portão.
- Torre baixada: girando por direção, atirando (recuo em 2 quadros e clarão curto na boca da cravadeira).
- Erguer: transição de cerca de 12 quadros (patolas descem, lança sobe, cesto nivela); baixar é a mesma sequência ao contrário.
- Torre erguida: parada, girando por direção e atirando (2 quadros); a torre erguida tem atlas próprio, porque o quadro fica mais alto.
- Destruído: 1 quadro com a lança tombada sobre a cabine, mais a carcaça que fica no chão.
- Tombado na margem (objeto do mapa da fase 1): 1 quadro, na direção que o mapa usar.
- Pontos de encaixe por direção e por modo: boca da cravadeira (baixado e erguido), escapamento, giroflex, topo do cesto (barra de vida quando erguido) e topo da cabine (barra de vida quando baixado).

## Referências do mundo real

- Caminhão de cesto aéreo isolado de concessionária de energia, de lança articulada, com patolas e cesto para um ou dois eletricistas, sem logotipo de nenhuma empresa real.
- Patolas e cilindros hidráulicos de caminhão-munck e de plataforma elevatória.
- Finca-pinos a pólvora (ferramenta de fixação de obra que crava pino de aço em concreto), aqui em tamanho de arma de veículo.
- Chapa de aço rebitada e soldada por cima de carroceria civil, como em veículos adaptados de mineração.
- Faixas refletivas vermelhas e brancas de para-choque de caminhão e giroflex âmbar de veículo de serviço.

## Tamanho

- Ocupa cerca de 1 × 1,5 célula (largura × comprimento); baixado, cabe no quadro de 256 px.
- Erguido, a lança e o cesto sobem cerca de 2 células acima do chassi: o quadro da torre erguida precisa de mais altura (estimativa 256 × 384 px no uhd), a confirmar no portão com a elevação escolhida.
- Portão de estilo: 3 elevações e 16 ou 32 direções, como pede o plano.

## Checklist de originalidade

- [x] Nome nosso; busca simples na web em 30/10/2026 sem uso como unidade em jogo; não é trocadilho.
- [x] A descrição começa pelo papel na matriz.
- [x] Combinação própria: caminhão de serviço de rede elétrica com lança que muda o alcance e a visão; não reproduz unidade conhecida.
- [x] Silhueta distinta das outras da facção no papel (ver Silhueta). [ ] Teste de 5 segundos no portão de estilo (`rts-arte`, E2).
- [x] Números da nossa tabela de partida.
- [ ] Falas: pendente, etapa de som e falas.
- [ ] Ficha de origem: pendente, `rts-arte`, junto com o asset.
- [ ] Revisão por quem jogou o jogo que inspirou o projeto: pendente, pedida ao Victor.
- [ ] Teste de combinação por alguém que não é fã: pendente, pedido ao Victor.
