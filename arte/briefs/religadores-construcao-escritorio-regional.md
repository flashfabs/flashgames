# Escritório Regional

- id: `religadores/escritorio-regional`
- Facção: Religadores (jogador na fase 1) · Categoria: construção, QG · Lote: portão de estilo e fase 1
- Versão: 1, de 30/10/2026

## Papel na matriz

QG: blindagem Estrutura, cerca de 3.000 de vida; tem a fila de construção da base (um prédio de cada vez), produz o Guincho de Células e a Equipe de Manutenção e é a raiz da rede, com raio de 8 células.

É prédio elétrico: a interferência o desliga por alguns segundos, e desligado ele para a fila.

Na fase 1, perdê-lo não perde a missão sozinho: a derrota só vem sem QG, sem Poste Avançado e sem nenhuma Equipe de Manutenção capaz de erguer um.

## Fantasia

A agência regional da concessionária virou quartel-general: a fila de atendimento agora é fila de produção, e a senha continua sendo chamada no painel.

## Silhueta

Vista de cima em 3/4, é o maior volume da facção e o único de dois andares: um bloco de concreto aparente com brises verticais na fachada, marquise sobre a entrada e, num dos lados, um galpão baixo anexo com porta de enrolar larga, por onde saem os veículos.

No telhado, caixa d'água, um exaustor e painéis solares remendados; na esquina, um poste de concreto alto com cruzeta e transformador, de onde saem os cabos da rede para os postes, que é o ponto de partida visível da rede inteira.

Na fachada, um painel de senha luminoso grande ("SENHA 042") e um letreiro de agência sem nome de empresa real; o painel é o detalhe de humor e também o sinal de atividade: a senha muda quando a fila anda.

O que distingue das outras da facção: o Alojamento é baixo, de contêineres; a Garagem é um galpão de telhado em arco, sem andar de cima; o Acumulador é um pátio cercado de bancos de bateria; o Almoxarifado é um depósito de prateleiras com antena de laboratório. Só o Escritório tem fachada de prédio de escritório e o poste com transformador.

## Paleta e máscara de time

- Paredes: cinza-concreto `#8A8C8E` e branco-encardido `#E6E1D3`, com manchas de chuva e de terra.
- Brises, marquise e porta de enrolar: laranja-segurança `#E2711D` com faixas refletivas.
- Caixilhos das janelas e letreiro: azul-cobalto `#1F4E8C`.
- Painel de senha, janelas e lâmpadas da marquise: camada de luzes (acende e apaga sem quadro novo).
- Máscara de time: a bandeira no mastro do telhado, a faixa pintada na platibanda (a borda do telhado) e a borda da marquise; nunca as paredes nem a porta de enrolar.

## Partes que se movem

- Porta de enrolar do galpão (abre para o veículo sair e fecha).
- Painel de senha (números trocando) e lâmpadas das janelas, na camada de luzes.
- Bandeira no mastro, com tecido em laço.
- Exaustor do telhado girando.
- Isoladores do poste com faísca ocasional quando a rede está carregada (efeito separado, opcional).

## Animações e estados

- Construindo: canteiro com fita zebrada, cones e fundação marcada; andaime em camada separada; o prédio pronto é revelado de baixo para cima pela máscara do shader (formato combinado com `rts-render`).
- Pronta, atividade em laço: 8 quadros (exaustor girando, bandeira, painel piscando); a camada de luzes acesa por cima.
- Produzindo: porta de enrolar abrindo e fechando, 6 quadros, sincronizada com a saída do veículo.
- Sem energia (interferência ou falta de rede): mesmo quadro da pronta com a camada de luzes desligada e o exaustor parado.
- Danificada (abaixo de metade da vida): 1 quadro com vidros quebrados, brise arrancado, letreiro torto, um trecho da platibanda caído, marcas de queimado; fumaça e faíscas em efeitos separados por cima.
- Destruída: 1 quadro de ruína com lajes caídas, ferragem exposta e o letreiro no chão; o poste do transformador tombado sobre o galpão.
- Fecho da fase 1 (entardecer): só a camada de luzes acendendo, sem quadro novo.
- Pontos de encaixe: saída da porta de enrolar (onde nasce o veículo), topo do mastro, ponta da cruzeta do poste (onde começa o cabo desenhado até o primeiro poste) e centro da fachada (barra de vida e seleção).

## Referências do mundo real

- Agência de atendimento de concessionária de serviço público, de concreto aparente e brises, dos anos 1980 e 1990, sem logotipo, nome ou cores de nenhuma empresa real.
- Painel de senha de atendimento e sala de espera com cadeiras de longarina.
- Porta de enrolar de aço de galpão.
- Poste de concreto de rede de distribuição com cruzeta, isoladores e transformador.
- Caixa d'água de fibra e painéis solares instalados depois, com fiação aparente.

## Tamanho

- Ocupa 4 × 3 células (o bloco de dois andares em 2 × 3 e o galpão em 2 × 3, lado a lado).
- Quadro de 768 px no uhd, pela altura do segundo andar, do mastro e do poste.

## Checklist de originalidade

- [x] Nome nosso (termo de organização de empresa de serviço, sem empresa real); busca simples na web em 30/10/2026 sem uso como construção em jogo.
- [x] A descrição começa pelo papel na matriz.
- [x] Combinação própria: QG como agência de atendimento com fila de senha e raiz visível da rede elétrica; não reproduz construção conhecida.
- [x] Silhueta distinta das outras da facção no papel. [ ] Teste de 5 segundos no portão de estilo (`rts-arte`, E2).
- [x] Números da nossa tabela de partida.
- [ ] Falas: pendente, etapa de som e falas.
- [ ] Ficha de origem: pendente, `rts-arte`, junto com o asset.
- [ ] Revisão por quem jogou o jogo que inspirou o projeto: pendente, pedida ao Victor.
- [ ] Teste de combinação por alguém que não é fã: pendente, pedido ao Victor.
