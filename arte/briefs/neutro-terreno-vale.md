# Terreno do vale

- id: `neutro/terreno-vale` · assets `terreno-<solo>` e `neutro-decoracao-<nome>`
- Categoria: terreno e decoração · Lote: kit cinza da caixa de areia e fase 1
- Versão: 1, de 31/10/2026

## Papel na matriz

O chão da caixa de areia e da fase 1 (um bioma só: vale de terra vermelha com capim, rio, ruínas e morro), com os nomes exatos das tabelas `solos` e `decoracoes` do `site/rts/dados/mapas/caixa-de-areia/mapa.json`, que o render usa para escolher o ladrilho.
O terreno decide a luta (pilar do terreno): o jogador precisa ler de relance o que é passável, o que é lento, o que dá cobertura e o que é alto.

Regras de leitura: o chão usa valores médios e pouco saturados, para as unidades saltarem; cobertura (capim alto e entulho) tem textura mais quebrada que o chão aberto; lento (lama e água rasa) é mais escuro e úmido; bloqueado (rocha, água funda) tem borda clara de penhasco ou de margem.

## Solos (ladrilhos de 8 × 8 células, sem emenda, como o `terreno-terra-batida` do portão)

| Nome | O que é | Jogo | Leitura |
| --- | --- | --- | --- |
| `terra-batida` | terra vermelha seca, pisada | livre | o chão padrão (já existe) |
| `capim` | capim baixo e ralo sobre a terra | livre | manchas mais verdes, mesmo valor |
| `capim-alto` | touceiras altas, até o joelho | livre, cobertura de mato (esconde tocaia) | mais escuro e quebrado, sombra própria |
| `cascalho` | brita e caco de concreto | livre | cinza-quente, granulado fino |
| `asfalto-velho` | estrada rachada com mato nas fendas | livre | faixa cinza-escura com faixa amarela gasta |
| `entulho` | tijolo, reboco e ferragem de casa caída | livre, cobertura de ruína | blocos claros e sombras curtas |
| `lama` | margem encharcada | lenta | marrom-escuro brilhante |
| `agua-rasa` | vau com pedras aparentes | lenta | água clara com pedras, espuma nas bordas |
| `agua-funda` | o rio | bloqueado | azul-esverdeado escuro, margem com lama |
| `rocha` | paredão e penhasco do platô | bloqueado | rocha avermelhada com borda clara no topo |

Penhasco: as células de `rocha` entre dois níveis são o paredão; o render desenha a face do degrau a partir da altura das vizinhas, então o ladrilho de rocha precisa de um topo plano e uma face vertical que case com ele.
Rampa: vizinhas passáveis de níveis diferentes; sem ladrilho próprio, o render suaviza.
Transições: entre cada par de solos vizinhos, máscara de borda irregular (o render faz o splatting), então os ladrilhos não precisam de bordas desenhadas.

## Decorações (uma por célula, por cima do solo)

| Nome | O que é | Bloqueia | Tamanho |
| --- | --- | --- | --- |
| `pedra` | pedra solta de meio metro | não | meia célula, quadro de 128 px |
| `arvore-seca` | árvore pequena sem folhas | não | 1 célula, quadro de 256 px de altura |
| `carcaca-de-onibus` | ônibus enferrujado sem rodas, de lado | sim | 1 célula de pegada, quadro de 256 px; a lataria transborda para o lado |
| `muro-em-ruina` | pedaço de parede de tijolo de pé | sim | 1 célula, quadro de 256 px |
| `poste-caido` | poste de concreto antigo deitado com fios | não | 1 célula, quadro de 256 px |
| `pneus` | pilha de pneus | não | meia célula, quadro de 128 px |
| `ponte-de-concreto` | tabuleiro da ponte velha, com mureta e buracos | não (é o caminho sobre o rio) | 1 célula por peça, montada em faixa de 2 de largura |

Variações: 3 a 4 por decoração, escolhidas pelo render por posição, para o mapa não repetir.

## Referências do mundo real

- Vale de terra vermelha com pasto ralo do interior do Sudeste e do Centro-Oeste.
- Bairro abandonado depois de enchente: casas sem telhado, muros de tijolo baiano, entulho.
- Pontes rodoviárias antigas de concreto com mureta.
- Ferro-velho de ônibus em terreno aberto.

## Checklist de originalidade

- [x] Nomes comuns e descritivos; nenhum ladrilho, textura ou paleta copiado de outro jogo.
- [x] A descrição começa pelo papel na matriz.
- [x] Combinação própria: bioma brasileiro de terra vermelha com ruínas de bairro e sucata de ônibus.
- [ ] Teste de leitura: passável, lento, cobertura e alto se distinguem a 1080p e com filtro de daltonismo (`rts-arte` e `rts-render`, no kit cinza).
- [x] Números e regras do nosso formato de mapa (C6).
- [ ] Falas: não se aplica.
- [ ] Ficha de origem: pendente, `rts-arte`, junto com cada asset.
- [ ] Revisão por quem jogou o jogo que inspirou o projeto: pendente, pedida ao Victor.
- [ ] Teste de combinação por alguém que não é fã: pendente, pedido ao Victor.
