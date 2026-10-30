# Almoxarifado Técnico

- id: `religadores/almoxarifado-tecnico`
- Facção: Religadores (jogador na fase 1) · Categoria: construção, prédio técnico · Lote: fase 1
- Versão: 1, de 30/10/2026

## Papel na matriz

Prédio técnico: blindagem Estrutura, cerca de 1.000 C, 45 segundos, 1.500 de vida; libera o nível 2 (Cesto Blindado e Lança-Bobinas) e três pesquisas: Aterramento (metade da duração da paralisia), Isolamento (+15% de vida dos veículos) e Turno Extra (+15% de velocidade dos Guinchos).

É prédio elétrico: fora da rede pesquisa a 50%, e a interferência o desliga.

Na fase 1 é liberado depois de segurar a Ponte Velha e abre a fase de escolha de rota.

## Fantasia

Onde fica tudo o que a Regional tem de bom, trancado a chave, com requisição em três vias.

## Silhueta

Vista de cima em 3/4, é um galpão de telhado plano com um lado inteiro aberto, mostrando prateleiras porta-palete altas cheias de caixas; num canto, uma bancada de ensaio dentro de uma gaiola de malha metálica que solta faíscas quando há pesquisa em andamento; na frente, um guichê de requisição com uma fila de papéis presos num prego e uma empilhadeira estacionada.

No telhado, um mastro curto com uma biruta e uma antena de laboratório.

O que distingue das outras da facção: a Garagem tem telhado em arco e portas de enrolar; o Acumulador é um pátio de racks de bateria sem paredes. Só o Almoxarifado tem prateleiras de caixas à mostra e a gaiola de ensaio.

## Paleta e máscara de time

- Paredes e telhado: cinza-concreto `#8A8C8E` e branco-encardido `#E6E1D3`.
- Prateleiras: azul-cobalto `#1F4E8C` com longarinas laranja-segurança `#E2711D`.
- Caixas: papelão e madeira, com etiquetas brancas.
- Gaiola e faíscas da bancada: camada de luzes e efeito separado.
- Máscara de time: a faixa pintada na platibanda e a biruta do mastro.

## Partes que se movem

- Empilhadeira indo e voltando entre as prateleiras.
- Faíscas dentro da gaiola de ensaio (camada de luzes e efeito).
- Biruta no mastro.

## Animações e estados

- Construindo: andaime em camada separada; revelação pela máscara do shader.
- Pronta, atividade em laço: 8 quadros (empilhadeira, biruta).
- Pesquisando: laço de 8 quadros com a gaiola faiscando, para o jogador ver de longe que há pesquisa em andamento.
- Sem energia: camada de luzes desligada, empilhadeira parada.
- Danificada: 1 quadro com prateleiras tombadas e caixas no chão.
- Destruída: 1 quadro com o telhado caído sobre as prateleiras.
- Pontos de encaixe: centro da gaiola (faíscas) e topo.

## Referências do mundo real

- Almoxarifado de empresa de serviço público com prateleiras porta-palete e empilhadeira.
- Gaiola de Faraday de laboratório de ensaio de alta tensão.
- Guichê de requisição de material com formulários em vias.

## Tamanho

- Ocupa 3 × 3 células; quadro de 512 px no uhd.

## Checklist de originalidade

- [x] Nome nosso; busca simples na web em 30/10/2026 sem uso como construção em jogo.
- [x] A descrição começa pelo papel na matriz.
- [x] Combinação própria: prédio técnico como almoxarifado burocrático com gaiola de ensaio; prédio que libera tecnologia é convenção do gênero, a forma e as pesquisas são nossas.
- [x] Silhueta distinta das outras da facção no papel. [ ] Teste de 5 segundos no portão de estilo (`rts-arte`, E2).
- [x] Números da nossa tabela de partida.
- [ ] Falas: não se aplica, exceto avisos de interface.
- [ ] Ficha de origem: pendente, `rts-arte`, junto com o asset.
- [ ] Revisão por quem jogou o jogo que inspirou o projeto: pendente, pedida ao Victor.
- [ ] Teste de combinação por alguém que não é fã: pendente, pedido ao Victor.
