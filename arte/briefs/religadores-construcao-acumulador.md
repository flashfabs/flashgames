# Acumulador

- id: `religadores/acumulador`
- Facção: Religadores (jogador na fase 1) · Categoria: construção, depósito · Lote: fase 1
- Versão: 1, de 30/10/2026

## Papel na matriz

Depósito de Carga: blindagem Estrutura, cerca de 400 C, 25 segundos, 1.200 de vida; recebe a Carga que os Guinchos trazem e é também um nó da rede, com raio de 4 células.

É prédio elétrico: a interferência o desliga por alguns segundos.

Na fase 1, construir o primeiro Acumulador é o primeiro objetivo, e erguer um no Cemitério Norte é uma das formas de tomar o cemitério.

## Fantasia

Banco de baterias de subestação, cercado e etiquetado: tudo o que entra é registrado, e nada sai sem protocolo.

## Silhueta

Vista de cima em 3/4, é um pátio baixo cercado de alambrado com fileiras de racks de bateria sob uma cobertura leve de telha metálica, e uma doca de descarga num dos lados com um pórtico pequeno, onde o Guincho encosta.

Num canto, um poste curto com isoladores, de onde sai o cabo da rede; na frente, um painel com um medidor de ponteiro grande que mostra quanto está entrando.

O que distingue das outras da facção: é a única construção baixa e "aberta", de pátio com racks à vista; o Escritório tem dois andares, a Garagem tem telhado em arco, o Alojamento é de contêineres.

## Paleta e máscara de time

- Cobertura e racks: cinza-concreto `#8A8C8E` e azul-cobalto `#1F4E8C`.
- Alambrado e pórtico: metal galvanizado com faixas laranja-segurança `#E2711D`.
- Piso: concreto branco-encardido `#E6E1D3` com marcas de pneu.
- Lâmpadas dos racks e células: brilho azul esverdeado do recurso, na camada de luzes.
- Máscara de time: a placa do portão e uma faixa pintada na borda da cobertura.

## Partes que se movem

- Pórtico de descarga com talha que desce e sobe.
- Lâmpadas dos racks acendendo em sequência (camada de luzes).
- Ponteiro do medidor.

## Animações e estados

- Construindo: canteiro com fita zebrada; andaime em camada separada; revelação de baixo para cima pela máscara do shader.
- Pronta, atividade em laço: 8 quadros, lâmpadas dos racks correndo em sequência.
- Recebendo carga: 6 quadros, a talha desce, pega o palete e o leva ao rack; sincronizada com o descarregamento do Guincho.
- Sem energia: camada de luzes desligada.
- Danificada: 1 quadro com racks tombados, cobertura furada e alambrado amassado; faíscas em efeito separado.
- Destruída: 1 quadro com racks derretidos, cobertura caída e a cerca no chão.
- Pontos de encaixe: ponto de descarga (onde o Guincho para), ponta do poste (cabo da rede) e centro (barra de vida e seleção).

## Referências do mundo real

- Sala de baterias estacionárias de subestação e de central de telecomunicações, com racks e cabos grossos.
- Alambrado com placa genérica de perigo, sem logotipo de empresa real.
- Pórtico de carga com talha manual de doca.
- Medidor analógico de painel elétrico.

## Tamanho

- Ocupa 3 × 2 células; quadro de 512 px no uhd.

## Checklist de originalidade

- [x] Nome nosso (termo técnico comum); busca simples na web em 30/10/2026 sem uso como construção em jogo de estratégia.
- [x] A descrição começa pelo papel na matriz.
- [x] Combinação própria: depósito de recurso como banco de baterias que também estende a rede; depósito é convenção do gênero, a forma é nossa.
- [x] Silhueta distinta das outras da facção no papel. [ ] Teste de 5 segundos no portão de estilo (`rts-arte`, E2).
- [x] Números da nossa tabela de partida.
- [ ] Falas: não se aplica a construção, exceto avisos de interface (etapa de som e falas).
- [ ] Ficha de origem: pendente, `rts-arte`, junto com o asset.
- [ ] Revisão por quem jogou o jogo que inspirou o projeto: pendente, pedida ao Victor.
- [ ] Teste de combinação por alguém que não é fã: pendente, pedido ao Victor.
