# Ponte Basculante

- id: `neutro/ponte-basculante`
- Facção: neutra, religável · Categoria: estrutura do mapa · Lote: fase 1
- Versão: 1, de 30/10/2026

## Papel na matriz

Estrutura neutra religável: morta, o tabuleiro está erguido e o rio não se atravessa ali; religada pelo Religador (cerca de 30 segundos dentro da cabine), o tabuleiro desce e a ponte vira passagem para todos os lados.

Na fase 1 fica no rio a leste, entre o Ferro-Velho e a Várzea, e é o objetivo opcional que dá o atalho rápido para a rota aberta até o Morro; a alternativa é o vau lento mais ao sul.

Na fase 1 não é destrutível (decisão a confirmar nos dados da missão), para a rota não sumir de vez.

## Fantasia

A ponte que levantava para a barcaça passar ficou levantada no dia do Clarão; desce com um pouco de carga e muita paciência.

## Silhueta

Vista de cima em 3/4, são duas cabeceiras de concreto, uma em cada margem, e um tabuleiro de treliça de aço rebitada que gira numa articulação na cabeceira sul, com um bloco de contrapeso enorme de concreto atrás da articulação; na margem sul, uma casa de máquinas pequena com janelas, cancelas e semáforos de ponte.

Erguida, o tabuleiro aponta para o céu em ângulo de cerca de 70° e é a forma mais alta e mais estranha do vale; baixada, vira uma faixa de ponte comum sobre o rio.

O que distingue de tudo no mapa: a Ponte Velha, que é terreno e não se religa, é de pedra e sem treliça; nada mais no mapa tem uma estrutura inclinada desse tamanho.

## Paleta neutra e máscara de time

- Cabeceiras e contrapeso: concreto envelhecido `#9A968D` com limo perto da água.
- Treliça: aço com tinta industrial desbotada, amarelo-máquina e ferrugem.
- Casa de máquinas: concreto e janelas; semáforos e lâmpadas na camada de luzes.
- Máscara de time: as cancelas e uma faixa na fachada da casa de máquinas, coloridas só no estado religado.

## Partes que se movem

- Tabuleiro de treliça, girando na articulação (erguido e baixado).
- Contrapeso, que desce quando o tabuleiro desce.
- Cancelas (abrem com a ponte baixada).
- Semáforos e lâmpadas da casa de máquinas (camada de luzes): vermelho erguida, verde baixada.

## Animações e estados

- Morta e erguida: 1 quadro (ferrugem, luzes apagadas, cancelas fechadas).
- Religando: laço de 4 quadros com faíscas na casa de máquinas e luzes piscando.
- Baixando: transição de cerca de 12 quadros do tabuleiro descendo e do contrapeso subindo de volta à posição de equilíbrio.
- Baixada e religada: 1 quadro com luzes acesas e cancelas abertas.
- Pontos de encaixe: porta da casa de máquinas (onde o Religador entra), as duas pontas do tabuleiro (para o mapa ligar a passagem) e topo do tabuleiro erguido (barra de progresso da religação).
- Como é longa, a ponte pode sair em peças (cabeceira com casa de máquinas, tabuleiro, cabeceira norte) se a `rts-render` preferir montar; a direção da ponte no mapa é norte e sul, atravessando um rio que corre de oeste para leste.

## Referências do mundo real

- Ponte basculante de uma folha, com contrapeso e casa de máquinas.
- Treliça de aço rebitada de ponte antiga.
- Cancelas e semáforos de ponte móvel.

## Tamanho

- Ocupa cerca de 7 × 2 células (5 de água e 1 em cada margem) mais a casa de máquinas em 2 × 2 na margem sul; quadro estimado de 1.024 px no uhd para o conjunto, ou peças menores se for montada.
- A largura do rio nesse ponto é decisão do mapa da fase 1 (da `rts-design`, na onda 3); o brief segue os 5 de água até lá.

## Checklist de originalidade

- [x] Nome comum, descritivo; busca simples na web em 30/10/2026 sem uso como estrutura religável em jogo.
- [x] A descrição começa pelo papel na matriz.
- [x] Combinação própria: ponte móvel parada no alto que só desce quando alguém devolve a energia e abre uma rota.
- [x] Silhueta distinta de tudo no mapa no papel. [ ] Teste de 5 segundos no portão de estilo (`rts-arte`, E2).
- [x] Números da nossa tabela de partida (o tempo de religação é o da tabela de objetivos da fase 1).
- [ ] Falas: não se aplica.
- [ ] Ficha de origem: pendente, `rts-arte`, junto com o asset.
- [ ] Revisão por quem jogou o jogo que inspirou o projeto: pendente, pedida ao Victor.
- [ ] Teste de combinação por alguém que não é fã: pendente, pedido ao Victor.
