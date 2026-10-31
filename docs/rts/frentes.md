# Frentes do RTS

Como as sessões dividem o trabalho do RTS original da Salinha: frentes, donos de arquivo, contratos entre módulos, travas, portas e as regras que valem para todas.
O estado vivo de cada frente fica em [ESTADO.md](ESTADO.md); as regras do repositório, no [AGENTS.md](../../AGENTS.md) da `main`, e o que está aqui se soma a elas.

## Regras comuns a todas as sessões

- O jogo é original: nenhum nome, termo, imagem, som, número, mapa ou texto de outro jogo, e nenhuma menção à série que inspirou o projeto em código, arquivo, commit, branch, pull request ou prompt de IA. O `testes/rts-originalidade.test.mjs` reprova.
- A pesquisa e o plano que citam essa série ficam fora do repositório, na base de conhecimento privada do Victor (decisão D01).
- Identificadores em português, comentários e commits em inglês (Conventional Commits), interface em português do Brasil, nunca hard wrap (uma frase por linha, inclusive em Markdown e commits).
- `npm test` antes de cada commit; mexeu em tela, entrada, fluxo ou desempenho, rode também os testes de ponta a ponta no PC da RTX 4090 com `scripts/rtx-testes.sh` (seção Onde roda o quê).
- Contrato mudou: commit próprio, a versão do contrato sobe e os consumidores são avisados por mensagem.
- Mexa só nos arquivos da sua frente; ligar o seu código em arquivo de outra frente com uma ou duas linhas é aceito se dito no commit; acima disso, peça ao dono por mensagem.
- Sem aprovação do Victor: nada de instalar ferramenta, criar conta, aceitar licença, baixar modelo, mexer no WSL do PC da RTX 4090 (o sincronizador do WhatsApp roda lá) ou usar a GPU fora da trava `D:\rts\trava-gpu`.
- Nenhum fan-out de subagentes sem perguntar ao Victor antes, dizendo quantos agentes.
- Cada sessão trabalha numa worktree do clone oficial `/Users/vhccruz/Dev/salinha`, numa branch `rts/<frente>-<assunto>` (ou na branch que o app criou, desde que neutra), e serve a worktree na sua porta.
- No fim da onda, a sessão atualiza a sua seção do [ESTADO.md](ESTADO.md) (feito, números medidos com fonte, pendências) e é encerrada.

## Onde roda o quê (regra do Victor de 30/10/2026, 20h17)

O Mac ficou lento com várias sessões, então tudo que exige esforço roda no PC da RTX 4090 (Windows nativo, `ssh rtx4090`, 20 threads, 64 GB, Node 24).

- No Mac: editar, git, `npm test` e, só quando for indispensável, um spec curto com um navegador e um worker (`npx playwright test <spec> --project=<um> --workers=1`).
- No PC: render e tudo do Blender, IA de imagem, empacotar atlas e converter imagens em lote, os testes de ponta a ponta completos, medição de desempenho em 4K, simulações longas e qualquer laço que segure CPU ou GPU por mais de um ou dois minutos.
- Testes de ponta a ponta no PC: `scripts/rtx-testes.sh` roda o mesmo que o `npm run e2e` (funcionais, desempenho com a trava da GPU e `rts-determinismo-*`), `scripts/rtx-testes.sh rts` roda o mesmo sem os funcionais do Pavio e do Farm (só `testes/e2e/rts-*`, o desempenho do RTS e o determinismo), e `scripts/rtx-testes.sh -- <argumentos do playwright test>` roda só o que você pedir.
- Com oito sessões o PC vira fila (uma execução completa segura a trava de 8 a 15 minutos; medido em 31/10/2026): entrega que só mexe em `site/rts/`, `testes/rts*`, `testes/e2e/rts-*`, `ferramentas/rts/`, `arte/` ou `docs/rts/` integra com `scripts/rtx-testes.sh rts`, porque o Pavio e o Farm não leem nada disso e o Action roda todos os funcionais em cada push da `rts/base`; mexeu em arquivo compartilhado (`package.json`, `playwright.config.mjs`, `scripts/`, `netlify.toml`, `.github/`, `site/js/`, `site/index.html`), o completo. Cada execução anota quanto esperou pela trava em `D:\rts\testes\fila.log`, e cada sessão usa a própria cópia do `execucao.ps1` em `D:\rts\testes\<sessão>\scripts`. Ele leva a worktree como está (com o que não foi commitado), sobrevive à queda do SSH (`scripts/rtx-testes.sh acompanhar <execução>` retoma) e traz o log, o resumo e os relatórios para `test-results/rtx/<execução>/`; o código de saída é 0 só se tudo passou. `scripts/rtx-testes.sh estado` mostra as travas e as últimas execuções da sessão.
- Medição que só faz sentido no Mac (Safari, Metal do M5 Pro, a referência de 60 qps do Mac) não roda por conta própria: entra na lista "Medições que esperam o Mac" do [ESTADO.md](ESTADO.md) e roda quando o Victor pedir, uma por vez.
- Número de desempenho do PC só vale com o Chrome desenhando na NVIDIA: o executor confere a placa antes de cada passo de desempenho e registra no log (`PLACA ...`).

## Integração (decisão D30)

A branch `rts/base` é a integração do RTS, com trava própria, e só vai para a `main` nos marcos combinados com o Victor.
Nada do RTS vai para a `main` nem para a Netlify antes disso; nunca force push, nunca `reset`, e para desfazer, `git revert`.

1. Pegue a trava: `until mkdir /Users/vhccruz/Dev/salinha/.git/rts-integracao.lock 2>/dev/null; do sleep 20; done` e escreva nela quem você é e a hora (`echo "<sessão> $(date)" > /Users/vhccruz/Dev/salinha/.git/rts-integracao.lock/dono`). Esperando a trava, use a ferramenta Monitor com esse laço.
2. Na sua worktree: `git merge rts/base`, resolva os conflitos preservando o código das outras sessões, e rode `npm test`; se a entrega mexe em tela, entrada, fluxo ou desempenho, rode também no PC `scripts/rtx-testes.sh rts` (só arquivos do RTS) ou `scripts/rtx-testes.sh` (algum arquivo compartilhado). Tudo tem que passar. Para não segurar a trava de integração na fila do PC, rode os testes no PC antes de pegar a trava e, com ela, só o `npm test` depois do `merge`, a não ser que o `merge` traga mudança de tela, entrada ou fluxo de outra sessão que encoste na sua.
3. Avance a `rts/base` e mande para o GitHub: `git -C /Users/vhccruz/Dev/salinha fetch . <sua-branch>:rts/base && git -C /Users/vhccruz/Dev/salinha push origin rts/base`. Se o `fetch` recusar por não ser avanço direto, alguém integrou antes: volte ao passo 2.
4. Solte a trava (`rm /Users/vhccruz/Dev/salinha/.git/rts-integracao.lock/dono && rmdir /Users/vhccruz/Dev/salinha/.git/rts-integracao.lock`) e mande à `rts-qualidade` uma linha com o que entrou e o commit.
5. Acompanhe o Action do seu push (`gh run list --branch rts/base --limit 3`); vermelho é a sua prioridade. Com vários pushes seguidos, o GitHub mantém só o mais novo na fila e marca os do meio como cancelados; o mais novo cobre os commits deles.

O `npm run e2e` completo não roda mais no Mac: com dois ao mesmo tempo a carga passou de 70 em 30/10/2026 e os testes do Pavio estouraram o tempo sem nada quebrado. No PC, o executor faz uma execução por vez.
A `rts/base` nunca fica com checkout em nenhuma worktree, senão o `fetch` do passo 3 é recusado.
O Action `.github/workflows/testes.yml` roda em cada push da `rts/base`; vermelho na `rts/base` é prioridade de quem integrou por último.
Trava presa há mais de 45 minutos com o dono parado pode ser removida, avisando as outras sessões.

## Frentes

| Frente | Sessão e porta | É dona de | Ondas |
| --- | --- | --- | --- |
| F1 Motor e simulação | `rts-motor`, 8821 (onda 1) | `site/rts/js/sim/` (menos `sim/comportamentos/`), `site/rts/js/trabalhador.js`, `ferramentas/rts/tabelas/`, `testes/rts-sim*.test.mjs`, `testes/rts-replays/` | 1 |
| F1a Motor: núcleo, economia, construção e produção | `rts-motor-economia`, 8821 | o núcleo de `site/rts/js/sim/` (todos os arquivos que existiam no fim da onda 1, menos `combate.js`, e sempre `contratos.js` e `simulacao.js`), os módulos novos de economia, construção e produção, `site/rts/js/trabalhador.js`, `ferramentas/rts/tabelas/`, as ferramentas dos replays e de medida em `ferramentas/rts/`, `testes/rts-replays/` e os `testes/rts-sim*.test.mjs` que não sejam de combate nem de gatilhos | 2, 3, 5, 6 |
| F1b Motor: combate, veterania, pesquisas e gatilhos | `rts-motor-combate`, 8829 | `site/rts/js/sim/combate.js`, os módulos novos de veterania, pesquisas, religar estruturas e gatilhos, `testes/rts-sim-combate*.test.mjs` e `testes/rts-sim-gatilhos*.test.mjs` | 2, 3 |
| F2 Renderização e 4K | `rts-render`, 8822 | `site/rts/js/render/`, `site/rts/js/ativos/`, `site/rts/dados/projecao.json`, `site/rts/ferramentas/visualizador.html`, `testes/e2e/rts-desempenho.spec.mjs` | 1 a 4 |
| F3 Arte e Blender | `rts-arte`, 8824 | `arte/blender/`, `arte/procedencia/`, `ferramentas/arte/`, `site/rts/assets/{sprites,terreno,interface,video}/`, `site/rts/assets/indice.json`; no PC, `D:\rts` e a trava da GPU | 0 a 5 |
| F4 Áudio | `rts-som`, 8827 | `site/rts/js/audio/`, `site/rts/dados/sons.json`, `site/rts/assets/audio/`, `ferramentas/audio/`, `arte/procedencia/audio/`; gravações fora do repositório | 3, 4 |
| F5 Design, mundo e fase 1 | `rts-design`, 8825 | `site/rts/dados/{unidades,predios,armas}.json`, `site/rts/dados/missoes/`, `site/rts/dados/mapas/`, `site/rts/dados/textos/pt-BR.json`, `site/rts/js/telemetria/`, `arte/briefs/`, `arte/mapas-fonte/`, `ferramentas/mapas/` | 1 (só briefs), 2, 3, 5 |
| F6 IA inimiga | `rts-ia`, 8826; na onda 3, a sessão `rts-rede` (8828) | `site/rts/js/sim/comportamentos/` (determinístico, sob a barreira da F1a), `site/rts/js/ia/`, `ferramentas/rts/ia-harness.mjs`, `testes/rts-ia*.test.mjs` | 3, 5 |
| F7 Interface e controles | `rts-interface`, 8823 | `site/rts/index.html`, `site/rts/css/`, `site/rts/js/principal.js`, `site/rts/js/entrada/`, `site/rts/js/interface/`, `testes/rts-interface.test.mjs` e `testes/e2e/rts-hud.spec.mjs` (exceção combinada com a F8 na onda 2) | 1 a 6 |
| F8 Qualidade e coordenação | `rts-qualidade`, 8820 | `testes/e2e/rts-*` (menos `rts-desempenho` e `rts-hud`), `site/rts/js/teste/` (o gancho `window.__rts`, carregado só com `?teste=1`), `ferramentas/rts/ritmo/` (conferidor de ritmo), `testes/rts-gancho.test.mjs`, `testes/rts-ritmo.test.mjs`, `testes/rts-originalidade.test.mjs`, `testes/rts-orcamento.json`, `testes/rts-orcamento.test.mjs`, `testes/rts-manifesto.test.mjs`, `testes/rts-procedencia.test.mjs`, `testes/rts-licencas.json`, `playwright.config.mjs`, `package.json`, `scripts/`, `netlify.toml`, `.github/workflows/`, `prototipos/diagnostico/`, `docs/rts/` | todas |
| F9 Rede | `rts-rede`, 8828 (na onda 3 essa sessão faz a F6) | `prototipos/rts-lockstep/` e, na E8, `site/rts/js/rede/`; `site/js/sala.js` só em acordo | 2 (curta), 6 |

Onda 3 (E4, a missão "Morro Aceso" em cinza, e o que der da E5 sem as escolhas do portão), aberta em 31/10/2026 pela sessão que coordena as ondas, com o Victor dormindo: as sessões da onda 2 seguem, cada uma na sua frente; a F1a fica com o núcleo, o movimento e a API que os comportamentos da IA usam; a F1b com os gatilhos da missão e o acampamento que se empacota e foge; a sessão `rts-rede` passa a ser a F6 (comportamentos e IA, porta 8828) até a E8; a F4 (som) abre de manhã com o Victor. Recado que o app segurar (limite de mensagens entre sessões sem o Victor escrever) vai para `<sessão>-recados.md` na pasta de notas, que cada sessão confere antes de integrar.
Divisão do motor a partir da onda 2 (plano, E3): a F1 vira duas sessões, F1a e F1b, pela tabela acima. `contratos.js` e `simulacao.js` são da F1a; a F1b liga os seus módulos neles com uma ou duas linhas ditas no commit e, acima disso, pede à F1a por mensagem. Mudança de contrato (C1 a C4) passa pela F1a, que sobe a versão e avisa os consumidores.
O protótipo técnico fica em `prototipos/rts-4k/` (porta 8811) e não vai ao ar; o passo zero da onda 1 o move para `site/rts/`, dividido pelos donos acima, numa sessão só, antes de as outras mexerem nele.
`package.json`, `playwright.config.mjs`, `netlify.toml` e `scripts/` são compartilhados com o Pavio e o Farm: cada mudança neles passa com todos os testes de ponta a ponta.
Na fase 1, o RTS não toca em `site/js/sala.js`, `site/js/app.js`, `site/index.html`, no Pavio nem no Farm.

## Contratos entre frentes

| # | Contrato | Onde | Dono | Consumidores | Versão |
| --- | --- | --- | --- | --- | --- |
| C1 | Comando `{ tick, jogador, seq, tipo, unidades, alvo, x, y, arg }` com `TIPO_COMANDO` inteiro e ids de entidade com geração (slot e geração); na rede, array compacto | `site/rts/js/sim/contratos.js` | F1a | F6, F7, F9, F8, F1b | `VERSAO_COMANDOS`, congelada no fim da E3 |
| C2 | Retrato por passo em TypedArrays transferíveis: id com geração, tipo, dono, posição, nível, direções, animação, vida, bandeiras, visão, recursos, filas, eventos, soma | `contratos.js` | F1a | F2, F4, F7, F9, F8 | `VERSAO_SIMULACAO` |
| C3 | Eventos de apresentação (`TIRO`, `IMPACTO`, `EXPLOSAO`, `MORTE`, `PRODUCAO_CONCLUIDA`, `CONSTRUCAO_CONCLUIDA`, `SOB_ATAQUE`, `RECURSO_ESGOTADO`, `MENSAGEM_MISSAO`, `OBJETIVO`, `VITORIA`, `DERROTA`); a simulação nunca os lê de volta | `contratos.js` | F1a (eventos de combate e de missão pedidos pela F1b) | F2, F4, F7, F5, F8 | `VERSAO_SIMULACAO` |
| C4 | `vistaDoTime(sim, time)`: só o que o time enxerga, mais os fantasmas de prédios vistos | `site/rts/js/sim/` | F1a | F6 | teste de "sem trapaça" |
| C5 | Dados de jogo em inteiros, validados no carregamento | `site/rts/dados/{unidades,predios,armas}.json` | F5 (números), F1a (esquema e validador) | F1a, F1b, F7 | campo `versao` |
| C6 | Mapa: `mapa.json` (cabeçalho), `camadas.bin` (solo, altura, passabilidade, recurso, decoração) e `entidades.json` | `site/rts/dados/mapas/<id>/` | F5 | F1a, F2, F7 | campo `versao`, esquema testado pela F1a |
| C7 | Gatilhos de missão (condições e ações) em JSON | `site/rts/dados/missoes/` | F5 (dados), F1b (avaliador), F6 (comportamentos) | F1b | campo `versao` |
| C8 | Projeção e luz: elevação, metros e pixels por célula por nível, campo de visão em células (30 colunas em 16:9, linhas fixas, colunas entre 24 e 40) e os três zooms, sol, transformação de cor, exagero da infantaria e cores de time; a câmera da página é `{ x, y, zoom }`, com o zoom como fator, e as conversões entre tela e mapa ficam em `site/rts/js/entrada/camera.js` sobre `site/rts/js/render/projecao.js` | `site/rts/dados/projecao.json` | F2 | F3, F7 | `versao`; v1 congelada no M2 |
| C9 | Manifesto de sprites por asset e índice por fase, com pontos de encaixe por direção | `site/rts/assets/sprites/<categoria>/<asset>.json`, `site/rts/assets/indice.json` | F3 | F2, F8 | `versao` |
| C10 | Sons: evento para ids de som, categoria, prioridade e variações | `site/rts/dados/sons.json` | F4 | F4 | `versao` |
| C11 | Textos de interface, briefings, falas e legendas por id | `site/rts/dados/textos/pt-BR.json` | F5 | F7, F4 | ids estáveis |
| C12 | Orçamentos de memória e de download por nível e por fase | `testes/rts-orcamento.json` | F8 | todos | — |
| C13 | Procedência por asset (autores, ferramentas, modelos de IA com licença, prompt, semente, edições humanas) e lista de licenças permitidas | `arte/procedencia/`, `testes/rts-licencas.json` e `testes/rts-procedencia.test.mjs` | F8 (esquema e lista), F3 e F4 (conteúdo) | F8 | — |
| C14 | Pedido de asset por mensagem à F3: id, tipo, brief de uma linha, animações, prioridade; a F3 entrega antes um provisório | mensagem entre sessões | F3 | todos | — |
| C15 | Registro do kit de teste, exportado em JSON pelo jogador, sem rede | `site/rts/js/telemetria/` | F5 | F8 | campo `versao` |
| C16 | Pacote de turno do lockstep e soma por subsistema; mensagens abaixo de 16.000 bytes | `site/rts/js/rede/` | F9 | F1a | `VERSAO_PROTOCOLO` da sala |

Um teste de esquema impede que um consumidor velho de contrato passe despercebido.

## Determinismo (vale desde o primeiro dia)

- Estado todo em inteiros: posições em 1/1.024 de célula, ângulos de 0 a 255, tempos em passos, divisão truncada de forma explícita.
- Nada de `Math.sin`, `cos`, `atan2`, `pow`, `hypot`, `Math.random`, `Date` ou `performance.now` na simulação; trigonometria vem de tabela inteira gerada offline.
- Iteração em ordem de slot; comandos de um passo aplicados em ordem total (jogador, seq); comandos são a única entrada.
- Estado todo serializável: salvar, carregar e replay.
- Um teste no `npm test` varre `site/rts/js/sim/` e reprova float e funções proibidas; replays dourados conferem as somas no Node, e o projeto Playwright `rts-determinismo` confere no Chromium, no Firefox e no WebKit.

## Travas e recursos únicos

- Integração do RTS: `/Users/vhccruz/Dev/salinha/.git/rts-integracao.lock` (seção Integração acima).
- Integração da `main` e publicação: `/Users/vhccruz/Dev/salinha/.git/integracao.lock`, pelos passos do [AGENTS.md](../../AGENTS.md); para o RTS, só nos marcos.
- GPU da RTX 4090: só a `rts-arte` usa, pela trava `D:\rts\trava-gpu`, criada com `New-Item -ItemType Directory -ErrorAction Stop` e com um arquivo `dono`; o `rtx.sh` a solta por `trap` mesmo em erro. Outra frente que precise da GPU pede à `rts-arte`.
- Testes no PC: `D:\rts\trava-testes`, pasta criada pelo executor com um arquivo `dono` (`<sessão> <execução> pid=<pid> <hora>`); uma execução por vez, e uma trava cujo processo dono sumiu (o PC reiniciou) é retomada pela próxima. Desde 31/10/2026 quem espera entra numa fila por ordem de chegada (uma senha por execução em `D:\rts\testes\senhas`, e só a mais antiga viva tenta a trava); `scripts/rtx-testes.sh estado` mostra a fila. Execução de uma sessão que ainda não fez merge disso não tira senha e ainda pode furar a fila. Os passos de desempenho pegam também a `D:\rts\trava-gpu`, no mesmo formato do `rtx.sh`, esperando até 60 minutos e soltando só a própria.
- Disco D: do PC: a F3 grava em `D:\rts`, dentro do teto combinado; o executor de testes grava só em `D:\rts\testes\<sessão>` (árvore, `node_modules` e as cinco últimas execuções), `D:\rts\playwright` (navegadores do Playwright), `D:\rts\npm-cache` e `D:\rts\cache\tmp-testes`.
- WSL do PC: nada de `wsl --shutdown`, reinício ou mudança de `.wslconfig` sem o Victor.
- Nenhum runner próprio do GitHub Actions no repositório público.

## Portas

| Porta | Uso |
| --- | --- |
| 8811 | protótipo `prototipos/rts-4k/` (configuração `prototipo-rts` do `.claude/launch.json`) |
| 8820 | `rts-qualidade` |
| 8821 | `rts-motor` (onda 1), `rts-motor-economia` (onda 2 em diante) |
| 8822 | `rts-render` |
| 8823 | `rts-interface` |
| 8824 | `rts-arte` |
| 8825 | `rts-design` |
| 8826 | `rts-ia` |
| 8827 | `rts-som` |
| 8828 | `rts-rede` |
| 8829 | `rts-motor-combate` |

## Git e tamanho

- Nenhum arquivo acima de 8 MB; re-render só quando o script ou a configuração do asset mudar.
- `git count-objects -vH` a cada etapa, registrado no [ESTADO.md](ESTADO.md); acima de cerca de 300 MB de histórico, os atlas saem do git.
- Fontes pesadas (`.blend`, renders brutos, gravações) ficam fora do repositório; no git entram atlas, manifestos, scripts e procedência.
- Scripts que usam a API do Blender levam `# SPDX-License-Identifier: GPL-3.0-or-later` e ficam em `arte/blender/` (decisão D05); o script do protótipo também.
- Imagens geradas por IA de conceito não entram no repositório (decisão D04); entram os prompts, as sementes e o script que as recria.

## Pastas

```
site/rts/index.html, css/, js/principal.js     página, estilos e laço de quadro (F7)
site/rts/js/sim/                               simulação inteira e determinística (F1a; combate, veterania, pesquisas, religar e gatilhos da F1b)
site/rts/js/sim/comportamentos/                equipes da missão, determinístico (F6)
site/rts/js/trabalhador.js                     Worker: relógio, fila de comandos, retratos (F1a)
site/rts/js/ia/                                jogadores virtuais (F6)
site/rts/js/render/, js/ativos/                WebGL2 e carregador de atlas (F2)
site/rts/js/entrada/, js/interface/            mouse, teclado, trackpad, HUD, menus (F7)
site/rts/js/audio/                             motor de áudio (F4)
site/rts/js/telemetria/                        registro do kit de teste (F5)
site/rts/js/teste/                             gancho dos testes de ponta a ponta, só com ?teste=1 (F8)
site/rts/js/rede/                              lockstep, na E8 (F9)
site/rts/dados/                                projecao.json (F2), dados de jogo, missões, mapas, textos (F5), sons.json (F4)
site/rts/assets/                               índice, sprites, terreno, interface, vídeo (F3), áudio (F4)
site/rts/ferramentas/visualizador.html         visualizador de atlas, sem link (F2)
arte/                                          não publicado: briefs e mapas-fonte (F5), blender e procedência (F3)
ferramentas/arte/, audio/, mapas/, rts/        ferramentas de linha de comando
testes/rts-*.test.mjs                          node --test (o npm test só lê testes/*.test.mjs)
testes/rts-replays/                            replays dourados (F1a)
testes/e2e/rts-*.spec.mjs                      Playwright (F8; rts-desempenho é da F2 e rts-hud da F7)
prototipos/                                    fora da publicação
docs/rts/                                      ESTADO.md e este arquivo (F8)
```

Nomes de asset em minúsculas, ASCII e com hífen (`<faccao>-<categoria>-<nome>`); passes `cor`, `time` e `normal`; níveis `hd` e `uhd`.
