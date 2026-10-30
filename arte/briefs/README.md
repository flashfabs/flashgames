# Briefs de arte do RTS

Um brief por unidade, construção ou estrutura neutra, escrito pela frente de design (`rts-design`) para a frente de arte (`rts-arte`) modelar no Blender, primeiro no kit cinza e depois na arte final.
As facções, a premissa do mundo e o bloco de originalidade de cada facção ficam em [faccoes.md](faccoes.md).

Os números de jogo citados aqui (custo, vida, alcance, tempos) são hipóteses da tabela de partida do plano e servem só para dar contexto ao papel; os valores de verdade passam a morar em `site/rts/dados/` quando a etapa de dados chegar, e o teste de jogo vai mudá-los.

## Nome dos arquivos

- `<faccao>-<categoria>-<nome>.md`, tudo em minúsculas, sem acento, com hífen.
- `faccao`: `religadores`, `desligados` ou `neutro`.
- `categoria`: `unidade`, `construcao` ou `estrutura` (estrutura neutra religável do mapa).
- O `id` de cada brief é `<faccao>/<nome>`, o mesmo que a ficha de origem do asset vai usar.

## Seções de todo brief

1. Papel na matriz: papel, blindagem e dano, contra quem é boa e fraca, e o que a torna diferente.
2. Fantasia: uma linha.
3. Silhueta: a forma geral vista de cima em 3/4 e o que a distingue das outras peças da mesma facção.
4. Paleta e máscara de time: cores da facção em cada parte e onde exatamente vai a máscara de time.
5. Partes que se movem: a lista para o rig.
6. Animações: as necessárias na fase 1, e as que ficam para depois marcadas como tal.
7. Referências do mundo real: máquinas, roupas, ferramentas e construções; nunca outro jogo.
8. Tamanho: células ocupadas e quadro de render.
9. Checklist de originalidade preenchido.

## Convenções comuns de render

Estas convenções vêm do plano e valem até o portão de estilo decidir outra coisa (decisão D12: elevação, escala e direções, escolhidas vendo em 4K).

- Câmera em 3/4, ponto de partida perto de 55° de elevação; o portão testa três elevações.
- Escala: 128 px por célula no nível uhd (4K) e 64 px no nível hd, gerado por redução do uhd.
- Infantaria: cerca de 0,5 célula, quadro de 128 px, 16 direções; parada (4 quadros), andando (8), atirando (4) e morrendo (8).
- Veículo: cerca de 1 célula, quadro de 256 px, 16 ou 32 direções para o corpo e para a torre separada; parado, rodando, recuo de tiro, destruído e carcaça.
- Construção: 2 a 4 células, quadro de 512 a 768 px, 1 direção; pronta, atividade em laço, danificada e destruída; a construção sobe com andaime e máscara no shader.
- Pontos de encaixe exportados por direção sempre que o brief citar: boca da arma, escapamento, topo (barra de vida e seleção) e os que o brief pedir.
- Leitura: o terreno usa valores médios e pouco saturados, e as unidades usam acentos saturados e sombra de contato escura para se destacarem do chão.
- Luzes, lâmpadas e telas que acendem e apagam (prédio sem energia, paralisia, entardecer do fecho da fase) ficam, quando o brief pedir, numa camada separada para o jogo ligar e desligar sem quadro novo; o formato dessa camada é combinado entre `rts-arte` e `rts-render`.

## Máscara de time

- A cor de time entra só nas áreas da máscara que o brief indica (bandeirolas, faixas, painéis, capacetes); a paleta da facção fica no resto.
- A máscara nunca cobre a cor principal da facção, para a facção continuar legível pela silhueta e pela paleta.
- As 8 cores de time são as do conjunto de Okabe e Ito, com cinza-claro no lugar do preto, e cada time tem também um padrão (listras, pontos, xadrez, faixa dupla) no anel de seleção e na bandeira, porque cor nunca é o único sinal.
- Atenção no portão: o laranja e o vermelhão de time ficam perto do laranja-segurança dos Religadores e do vermelho-tijolo dos Desligados; a área de máscara precisa ser grande o bastante para o padrão aparecer.

## Referências

- Só do mundo real: fotos, objetos, máquinas, roupas, construções e esboços nossos.
- Nenhuma captura, arte, logotipo ou interface de outro jogo, e nenhuma marca, empresa ou pessoa real imitada (nada de logotipo ou cor de concessionária, fabricante ou rádio real).
- Imagem de IA generativa só como concept, com ficha de origem (modelo, versão, prompt, semente, licença) e prompt que não cita jogo, estúdio nem artista; o asset final é modelado no Blender.

## Checklist de originalidade

O checklist tem dois blocos: o da facção, que fica em [faccoes.md](faccoes.md) e é respondido uma vez por facção, e o de cada peça, que fica no fim de cada brief.
Um "não" bloqueia a entrada da peça no jogo até ser resolvido.
Marcação: `[x]` passa, `[ ]` pendente (com quando e quem), e reprovação escrita por extenso com a proposta de troca.

### Bloco da facção (premissa, ideologia e arquétipo)

- [ ] A premissa, a ideologia e o arquétipo da facção não mapeiam um a um numa facção de jogo conhecido.
- [ ] A dupla jogador contra inimigo reproduz a dupla de algum jogo conhecido? A resposta tem que ser "não", com o motivo.
- [ ] Teste de combinação feito também por alguém que não é fã do jogo que inspirou o projeto: o conjunto de mundo, recurso, facções, mecânicas e trilha lembra um jogo específico?

### Bloco de cada unidade, construção ou estrutura

- [ ] O nome é nosso, não aparece em listas de unidades de jogos de estratégia conhecidos, e não é trocadilho de nome existente; busca simples na web registrada com data. Termo comum de dicionário (garagem, poste, torre de vigia) passa, desde que a combinação abaixo também passe.
- [ ] A descrição começa pelo papel na matriz, não por "é tipo o X de tal jogo".
- [ ] A combinação de nome, silhueta, tema, função e mecânica não reproduz uma peça conhecida.
- [ ] A silhueta é distinta das outras peças da mesma facção (no papel, neste brief) e passa no teste de leitura de 5 segundos (no portão de estilo, com 5 pessoas, em 4K, 1080p e com filtro de daltonismo).
- [ ] Os números vieram da nossa tabela de partida, não de tabela de outro jogo.
- [ ] As falas foram escritas por nós e passaram na revisão de humor (etapa de som e falas).
- [ ] A ficha de origem do asset está preenchida (`rts-arte`, junto com o asset).
- [ ] Revisão por alguém que jogou o jogo que inspirou o projeto: "isso te lembra algo específico?"; se citar uma peça dele, redesenhar.
- [ ] Teste de combinação por alguém que não é fã.
