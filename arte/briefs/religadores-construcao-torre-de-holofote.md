# Torre de Holofote

- id: `religadores/torre-de-holofote`
- Facção: Religadores (jogador na fase 1) · Categoria: construção, defesa leve · Lote: fase 1
- Versão: 1, de 30/10/2026

## Papel na matriz

Defesa leve: blindagem Estrutura, cerca de 400 C, 20 segundos, 700 de vida, dano Bala (cerca de 14 a cada 0,8 segundo), alcance 6.

Mecânica própria: o holofote revela um cone de 8 células na neblina, girando devagar o tempo todo, e denuncia quem está escondido de tocaia.

Forte contra infantaria, anti-blindagem, batedores e coletores; fraca contra artilharia e contra linha pesada. É prédio elétrico: fora da rede, para; a interferência a desliga.

Na fase 1 é liberada pelo segundo objetivo e é a resposta ensinada para as tocaias nas ruínas e para a onda da Ponte Velha.

## Fantasia

Torre de iluminação de canteiro com uma pregadeira rotativa e um holofote que acha quem estava de tocaia.

## Silhueta

Vista de cima em 3/4, é uma torre tubular de cerca de duas células de altura com uma guarita blindada pequena no topo; ao lado da guarita, num garfo próprio, um holofote redondo grande; embaixo da guarita, a pregadeira rotativa.

O holofote e a arma giram separados: o holofote varre devagar, sempre, e a arma vira para o alvo; o facho de luz no chão é desenhado pelo jogo.

O que distingue das outras da facção: o Cata-vento é torre treliçada com rotor; o Poste é concreto liso; só a Torre de Holofote tem guarita e a lente redonda grande.

## Paleta e máscara de time

- Torre: cinza-concreto `#8A8C8E` com faixas laranja-segurança `#E2711D` na base.
- Guarita: azul-cobalto `#1F4E8C` com chapas rebitadas.
- Holofote: carcaça cinza, lente na camada de luzes.
- Máscara de time: o teto da guarita e uma bandeirola na antena da guarita.

## Partes que se movem

- Holofote no garfo, girando 360° devagar (camada própria, 16 direções).
- Pregadeira rotativa sob a guarita, girando para o alvo (camada própria, 16 direções), com recuo e clarão azulado.
- Lente do holofote acesa ou apagada (camada de luzes).

## Animações e estados

- Construindo: andaime em camada separada; revelação pela máscara do shader.
- Pronta: corpo em 1 quadro; holofote e arma em 16 direções cada.
- Atirando: 2 quadros por direção da arma.
- Sem energia: lente apagada, holofote e arma parados.
- Danificada: 1 quadro com a guarita amassada e a lente rachada.
- Destruída: 1 quadro com a torre tombada.
- Pontos de encaixe: centro da lente (origem do cone de luz), boca da arma por direção e topo.

## Referências do mundo real

- Torre de iluminação de canteiro de obras e de pátio.
- Holofote de busca de grande diâmetro montado em garfo.
- Guarita de vigilância de canteiro, de chapa.
- Pregador pneumático de bobina, de alta cadência.

## Tamanho

- Ocupa 2 × 2 células; quadro de 512 px no uhd (mais alto se a guarita não couber: 512 × 640).

## Checklist de originalidade

- [x] Nome nosso; busca simples na web em 30/10/2026 sem uso como construção em jogo.
- [x] A descrição começa pelo papel na matriz.
- [x] Combinação própria: torre de canteiro cujo holofote giratório revela tocaias na neblina; torre de defesa é convenção do gênero, a revelação por cone girando e a forma são nossas.
- [x] Silhueta distinta das outras da facção no papel. [ ] Teste de 5 segundos no portão de estilo (`rts-arte`, E2).
- [x] Números da nossa tabela de partida.
- [ ] Falas: não se aplica, exceto avisos de interface.
- [ ] Ficha de origem: pendente, `rts-arte`, junto com o asset.
- [ ] Revisão por quem jogou o jogo que inspirou o projeto: pendente, pedida ao Victor.
- [ ] Teste de combinação por alguém que não é fã: pendente, pedido ao Victor.
