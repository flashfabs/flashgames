# Locomóvel

- id: `desligados/locomovel`
- Facção: Desligados (inimigo na fase 1) · Categoria: unidade, veículo pesado · Lote: fase 1 (só no clímax)
- Versão: 1, de 30/10/2026

## Papel na matriz

Linha pesada, nível 2: blindagem Pesada, dano Perfurante, cerca de 700 C, lento e muito resistente, lotação 3; sai da Ferraria a Vapor.

Mecânica própria, Pressão: quanto mais tempo parado, mais pressão na caldeira; o primeiro tiro depois de 5 segundos parado causa +50% de dano.

Bom contra veículos e prédios; fraco contra anti-blindagem e artilharia; não é elétrico, então a interferência não o paralisa.

Na fase 1 aparece pela primeira vez no clímax, num encontro controlado, e no Difícil vem um segundo na onda final.

## Fantasia

Trator a vapor de fazenda velha, com caldeira remendada e um canhão de pressão que guarda o melhor tiro para quem chega perto.

## Silhueta

Vista de cima em 3/4, é o maior veículo da facção: uma caldeira horizontal comprida deitada sobre o chassi, com uma chaminé alta na frente, duas rodas traseiras enormes de ferro com garras e duas rodas dianteiras pequenas; atrás, a plataforma do maquinista com um toldo curto.

No lado, o volante grande e a biela, que se mexem quando ele anda; no alto da caldeira, montado numa base giratória, um canhão de vapor de cano grosso que atira grampos de trilho.

Chapas rebitadas e toras amarradas nas laterais servem de blindagem.

O que distingue das outras da facção: o Canhão de Caldeira também tem caldeira, mas vertical, sobre uma carreta de duas rodas empurrada a mão, com cano curto apontado para o alto; o Locomóvel é horizontal, autopropelido, com chaminé e rodas gigantes.

## Paleta e máscara de time

- Caldeira e chassi: ferro escuro com ferrugem e remendos de chapa ocre `#B5832E`.
- Rodas: ferro escuro com aros vermelho-tijolo `#9B3B26`.
- Toldo e toras: lona crua `#CDBB94` e madeira; toras com corda.
- Manômetro e fornalha: brilho quente na camada de luzes.
- Máscara de time: uma faixa larga pintada na chaminé e a bandeira presa ao toldo.
- Veterania: uma fita colorida amarrada na chaminé por nível.

## Partes que se movem

- Rodas traseiras e dianteiras girando; dianteiras esterçam.
- Volante, biela e pistão em ciclo quando anda.
- Torre do canhão (camada separada, 360°), com recuo.
- Válvula de segurança soltando vapor, mais forte com a pressão cheia; ponteiro do manômetro.
- Fumaça da chaminé (efeito separado, mais densa quando anda).
- Maquinista na plataforma.

## Animações

- Corpo: parado (4 quadros de laço com vapor leve) e rodando (4 quadros de laço com volante e biela), em 16 ou 32 direções conforme o portão.
- Torre: girando por direção; atirando normal (2 quadros) e atirando com pressão cheia (4 quadros, jato de vapor grande).
- Pressão acumulando: 3 níveis visíveis na válvula e no manômetro (vapor fraco, médio, forte), 2 quadros de laço cada.
- Destruído: 1 quadro com a caldeira estourada e a chaminé caída, mais a carcaça.
- Pontos de encaixe por direção: boca do canhão, topo da chaminé (fumaça), válvula (vapor) e topo (barra de vida).

## Referências do mundo real

- Locomóvel e trator a vapor agrícola do fim do século 19 e começo do 20, de caldeira horizontal, chaminé na frente e rodas de ferro com garras.
- Volante, biela, manômetro e válvula de segurança de máquina a vapor.
- Grampo de trilho de ferrovia (o projétil).
- Chapas rebitadas e toras usadas como proteção em veículo improvisado.

## Tamanho

- Ocupa cerca de 1,25 × 1,75 célula; quadro de 256 px no uhd, ou 320 px se a chaminé não couber.

## Checklist de originalidade

- [x] Nome nosso (nome real da máquina, sem uso como unidade em jogo encontrado na busca simples de 30/10/2026).
- [x] A descrição começa pelo papel na matriz.
- [x] Combinação própria: trator a vapor com tiro reforçado por pressão acumulada parado; não reproduz unidade conhecida.
- [x] Silhueta distinta das outras da facção no papel. [ ] Teste de 5 segundos no portão de estilo (`rts-arte`, E2).
- [x] Números da nossa tabela de partida.
- [ ] Falas: pendente, etapa de som e falas.
- [ ] Ficha de origem: pendente, `rts-arte`, junto com o asset.
- [ ] Revisão por quem jogou o jogo que inspirou o projeto: pendente, pedida ao Victor.
- [ ] Teste de combinação por alguém que não é fã: pendente, pedido ao Victor.
