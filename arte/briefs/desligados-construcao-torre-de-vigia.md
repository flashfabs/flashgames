# Torre de Vigia

- id: `desligados/torre-de-vigia`
- Facção: Desligados (inimigo na fase 1) · Categoria: construção, defesa leve · Lote: fase 1
- Versão: 1, de 30/10/2026

## Papel na matriz

Defesa leve de madeira: blindagem Estrutura, cerca de 400 C, cerca de 525 de vida (25% menos que o padrão), dano Bala, visão longa.

Forte contra infantaria e batedores; fraca contra artilharia e linha pesada; não é elétrica, então a interferência não a desliga.

Na fase 1 guarda o posto do Cemitério Norte (com Paliçada e 4 Chapas) e o Desfiladeiro.

## Fantasia

Mastro de barco fincado no chão, plataforma lá em cima e um vigia de luneta que cobra pedágio de quem passa.

## Silhueta

Vista de cima em 3/4, é um mastro alto de madeira, estaiado por cabos presos em estacas no chão, com uma plataforma redonda de tábuas no topo cercada por uma amurada baixa; na plataforma, um atirador com carabina de ar e uma luneta.

Uma vela de sinal pequena, triangular, pendurada numa verga perto do topo; uma escada de corda descendo até a base, que é um anel de fardos e caixas.

É a única peça vertical de uma facção horizontal, e por isso é feita de corda e madeira fina: deve ler como "mastro" e nunca como as torres de metal dos Religadores.

O que distingue das outras da facção: é a única construção alta e fina; a chaminé da Ferraria é tijolo grosso e solta fumaça.

## Paleta e máscara de time

- Mastro e plataforma: madeira crua e escurecida.
- Estais e escada: corda clara de sisal.
- Base: fardos e caixas, lona crua `#CDBB94` com remendos em xadrez de ocre `#B5832E`.
- Atirador: poncho verde-oliva desbotado `#6F7445` e chapéu.
- Máscara de time: a vela de sinal e a amurada da plataforma.

## Partes que se movem

- Atirador com a carabina, girando na plataforma (camada própria, 16 direções), com recuo e baforada de ar.
- Vela de sinal tremulando.
- Estais com leve vibração (opcional).

## Animações e estados

- Construindo: andaime de madeira em camada separada; revelação pela máscara do shader.
- Pronta: corpo em 1 quadro, vela em laço de 4 quadros; atirador em 16 direções.
- Atirando: 2 quadros por direção do atirador.
- Danificada: 1 quadro com um estai partido e o mastro inclinado.
- Destruída: 1 quadro com o mastro quebrado ao meio e a plataforma no chão.
- Pontos de encaixe: boca da carabina por direção, topo do mastro (barra de vida) e centro da plataforma.

## Referências do mundo real

- Mastro de veleiro antigo com cesto de gávea.
- Estais e escada de corda de embarcação.
- Luneta de bronze.
- Base de fardos e caixas amarrados.

## Tamanho

- Ocupa 2 × 2 células na base (os estais saem até as bordas); quadro de 512 px de largura, mais alto pelo mastro (estimativa 512 × 768 px no uhd).

## Checklist de originalidade

- [x] Nome comum de dicionário; busca simples na web em 30/10/2026. Ponto de atenção: "torre de vigia" também é o nome genérico de torres de defesa em traduções de outros jogos de estratégia; o nome passa por ser termo de dicionário, e a forma (mastro de barco estaiado com plataforma) e o tiro de ar são nossos.
- [x] A descrição começa pelo papel na matriz.
- [x] Combinação própria: mastro estaiado de barco com plataforma e vela de sinal como torre de defesa.
- [x] Silhueta distinta das outras da facção no papel e da Torre Antiga neutra (concreto, com cabine e torreta). [ ] Teste de 5 segundos no portão de estilo (`rts-arte`, E2).
- [x] Números da nossa tabela de partida.
- [ ] Falas: não se aplica.
- [ ] Ficha de origem: pendente, `rts-arte`, junto com o asset.
- [ ] Revisão por quem jogou o jogo que inspirou o projeto: pendente, pedida ao Victor.
- [ ] Teste de combinação por alguém que não é fã: pendente, pedido ao Victor.
