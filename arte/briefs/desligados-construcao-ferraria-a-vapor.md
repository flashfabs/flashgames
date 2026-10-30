# Ferraria a Vapor

- id: `desligados/ferraria-a-vapor`
- Facção: Desligados (inimigo na fase 1) · Categoria: construção, oficina empacotável · Lote: fase 1
- Versão: 1, de 30/10/2026

## Papel na matriz

Oficina: blindagem Estrutura, cerca de 800 C, cerca de 1.350 de vida (25% menos que o padrão); produz o Carro-Vela e, no nível 2, o Locomóvel e o Canhão de Caldeira.

Empacotável depois da fase 1, menos a chaminé, que é desmontada em seções; não é elétrica.

Na fase 1 fica no Acampamento da Catraca e é de onde sai o Locomóvel do clímax.

## Fantasia

Bigorna, caldeira e martelo-pilão: aqui tudo se conserta, se troca ou vira outra coisa.

## Silhueta

Vista de cima em 3/4, é um galpão de oficina aberto na frente com uma chaminé alta de tijolo num canto, a parte mais alta de toda a facção, sempre soltando fumaça; dentro, visível pela frente, uma caldeira, uma forja e um martelo-pilão a vapor grande.

Na frente, um cavalete em A de madeira com talha para erguer chassis, e em volta, pilhas de sucata, rodas e tambores.

O que distingue das outras da facção: é a única com chaminé de tijolo e fumaça constante; o Carroção-Mãe e o Paiol são de lona, o Barracão é de telha aberta.

## Paleta e máscara de time

- Chaminé: tijolo vermelho-tijolo `#9B3B26` com fuligem no topo.
- Galpão: madeira e chapa com remendos ocre `#B5832E`; cobertura de lona crua `#CDBB94` em parte do telhado.
- Máquinas: ferro escuro; fornalha e forja com brilho quente na camada de luzes.
- Portão: lona de correr verde-oliva desbotado `#6F7445`.
- Máscara de time: uma faixa larga pintada na chaminé, abaixo da fuligem, e uma bandeira no cavalete.

## Partes que se movem

- Martelo-pilão batendo, com faíscas (efeito separado).
- Fole da forja.
- Fumaça da chaminé (efeito separado, contínuo).
- Portão de lona de correr (abre para o veículo sair).
- Talha do cavalete.

## Animações e estados

- Construindo: andaime de madeira em camada separada; revelação pela máscara do shader; a fumaça só começa quando fica pronta.
- Pronta, atividade em laço: 8 quadros (martelo-pilão, fole, brilho da forja).
- Produzindo: 4 quadros do portão de lona abrindo para o veículo sair.
- Danificada: 1 quadro com a chaminé rachada e parte do telhado caída.
- Destruída: 1 quadro com a chaminé tombada sobre o galpão.
- Depois da fase 1 (escaramuça): empacotar e desempacotar.
- Pontos de encaixe: saída do portão, topo da chaminé (fumaça) e centro (barra de vida).

## Referências do mundo real

- Ferraria de oficina ferroviária e de engenho, com forja a carvão, fole e bigorna.
- Martelo-pilão a vapor.
- Chaminé de tijolo de engenho e de olaria.
- Cavalete em A de madeira com talha, de oficina rural.

## Tamanho

- Ocupa 4 × 3 células; quadro de 768 px no uhd, pela altura da chaminé.

## Checklist de originalidade

- [x] Nome nosso; busca simples na web em 30/10/2026 sem uso como construção em jogo.
- [x] A descrição começa pelo papel na matriz.
- [x] Combinação própria: oficina de veículos como ferraria a vapor com martelo-pilão; fábrica de veículos é convenção do gênero, a forma é nossa.
- [x] Silhueta distinta das outras da facção no papel. [ ] Teste de 5 segundos no portão de estilo (`rts-arte`, E2).
- [x] Números da nossa tabela de partida.
- [ ] Falas: não se aplica.
- [ ] Ficha de origem: pendente, `rts-arte`, junto com o asset.
- [ ] Revisão por quem jogou o jogo que inspirou o projeto: pendente, pedida ao Victor.
- [ ] Teste de combinação por alguém que não é fã: pendente, pedido ao Victor.
