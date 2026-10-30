# Estado do RTS

Estado vivo do RTS original da Salinha: o que cada frente fez, o que foi medido e os critérios de cada etapa, com número e fonte.
Quem divide o trabalho e como integrar está em [frentes.md](frentes.md); o plano completo, com a pesquisa, fica fora do repositório, na base de conhecimento privada do Victor.
Cada sessão atualiza a sua seção no fim da onda; a `rts-qualidade` mantém as medições e os critérios.

Mundo provisório: Apagão. Uma tempestade solar queimou a rede elétrica e a carga guardada em baterias velhas virou o recurso; os Religadores (jogador) enfrentam os Desligados (atravessadores e freteiros), e a Antena entra depois.

## Onde estamos

- Etapa: E0 (pré-produção e higiene) junto com a onda 1 (E1 motor de produção e E2 fábrica de arte), por pedido do Victor em 30/10/2026.
- Integração: branch `rts/base`, criada em 30/10/2026 a partir da `main` em `94d4631`; nada do RTS foi para a `main` nem para a Netlify.
- Sessões da onda 1: `rts-qualidade`, `rts-arte`, `rts-design`, `rts-motor`, `rts-render` e `rts-interface`.

## Decisões

| # | Decisão | Estado |
| --- | --- | --- |
| D01 | Pesquisa e plano fora do repositório, na base de conhecimento privada; no repositório, só documentos neutros | aceita em 30/10/2026 |
| D02 | A branch de trabalho do clone antigo nunca vai ao GitHub; o trabalho segue na `rts/base` | aceita em 30/10/2026; conferido com `git ls-remote origin` em 30/10/2026: 13 refs no GitHub, nenhuma com termo proibido |
| D03 | Jogo em `site/rts/`, publicado em `/rts/` | aceita em 30/10/2026 |
| D04 | Protótipo versionado, sem as imagens geradas pelo SDXL | aceita em 30/10/2026; feito em `prototipos/rts-4k/` |
| D05 | Scripts do Blender com GPL-3.0-or-later (cabeçalho SPDX), só em `arte/blender/` e no script do protótipo | aceita em 30/10/2026; cabeçalho posto em `prototipos/rts-4k/blender/renderizar_veiculo.py` |
| D06 | Até 5 sessões de frente mais a `rts-qualidade`; GPU só da `rts-arte` | aceita em 30/10/2026 |
| D07 | Mundo Apagão | aceita em 30/10/2026 |
| D30 | `rts/base` como integração do RTS, com trava própria, juntada à `main` só nos marcos | aceita em 30/10/2026 |
| D31 | Se ninguém do grupo modelar à mão, tudo por script | aceita em 30/10/2026 |
| D08 a D12 | Jogo comercial desde já, fontes de arte, 2D pré-renderizado, IA só para conceito, câmera e escala | abertas; D12 se decide no M2, vendo em 4K |
| D16 | Ferramentas a instalar (Tiled, Pillow, Firefox e WebKit do Playwright) | aberta; ver Medições |

## Medições da E0

| Medição | Máquina e navegador | Resultado | Fonte |
| --- | --- | --- | --- |
| Bench 4K, 2.000 unidades com sprites | MacBook Pro M5 Pro, Chromium 151 com Metal (Playwright) | 60 qps (teto da tela), quadro p99 16,8 ms, 0 quadros acima de 20 ms, CPU do quadro p95 0,4 ms, passo p50/p95 2,3/4,1 ms | `prototipos/rts-4k/medir.mjs`, 30/10/2026 |
| Bench 4K, 10.000 unidades com sprites | MacBook Pro M5 Pro, Chromium 151 com Metal | 60 qps, p99 16,8 ms, 0 acima de 20 ms, passo p50/p95 13,7/16,8 ms | `medir.mjs`, 30/10/2026 |
| Bench 4K, 2.000 e 6.000 unidades | MacBook Pro M5 Pro, Firefox 153 (Playwright 1.62.1) | 120 e 117 qps, p99 9,5 e 16,8 ms, 0 acima de 20 ms | `medir.mjs`, 30/10/2026 |
| Bench 4K, 2.000 e 6.000 unidades | MacBook Pro M5 Pro, WebKit 26.5 (Playwright 1.62.1) | 60 qps, p99 18 ms (o relógio do WebKit arredonda para ms inteiros), 0 acima de 20 ms | `medir.mjs`, 30/10/2026 |
| Determinismo, 3.600 passos com 2.000 unidades | Node 22, Chromium 151 e Firefox 153 e WebKit 26.5 na página, `jsc` do macOS 26 | soma final `897f4ba5` igual nos cinco | `prototipos/rts-4k/verificar-determinismo.mjs`, 30/10/2026 |
| Determinismo dentro do Worker | Chromium, Firefox e WebKit do Playwright | pendente (`rts-qualidade`, nesta onda) | — |
| Safari 26 de verdade: bench em 4K | MacBook Pro M5 Pro | pendente (Victor, [roteiro de 15 minutos](#roteiro-de-15-minutos-para-o-victor)) | — |
| Safari 26 de verdade: soma no Worker | MacBook Pro M5 Pro | pendente (Victor, roteiro) | — |
| Chrome, Edge e Firefox no Windows: bench em 4K, soma e a string da placa | PC da RTX 4090, com o Victor no PC (pelo SSH os navegadores podem rodar sem GPU) | pendente (Victor, roteiro) | — |
| Notebook comum com GPU integrada | máquina de um amigo | pendente (página de diagnóstico) | — |
| Extensões de textura (BC7, S3TC, ASTC, ETC2) | cada máquina | pendente (página de diagnóstico e roteiro) | — |
| `decodeAudioData` de Ogg Opus | Safari 26 | pendente (Victor, roteiro) | — |
| Bateria de teclas (Ctrl, Option e Shift com 1 a 9, Ctrl e clique, dois dedos, pinça, Espaço, setas, F10, P, atalhos de Mesa do Mission Control) | Safari e Chrome do Mac, Chrome do Windows | pendente (página da `rts-interface` e roteiro) | — |
| Log do EEVEE pelo SSH mostra a NVIDIA | PC da RTX 4090 | pendente (`rts-arte`) | — |
| `rtx.sh renderizar tanque` com trava, código 0 e `relatorio.json` | Mac para o PC da RTX 4090 | pendente (`rts-arte`) | — |
| Lote longo com o SSH derrubado de propósito | PC da RTX 4090 | pendente (`rts-arte`) | — |
| Tamanho do git (`git count-objects -vH`) | clone oficial | 18,89 MiB soltos e 5,44 MiB empacotados, antes do protótipo | 30/10/2026 |

Navegadores do Playwright: o 1.63 do projeto só tem o Chromium no cache desta máquina; Firefox 153 e WebKit 26.5 estão no cache do playwright-core 1.62.1, que serviu para as medições de 30/10/2026.
Instalar os do 1.63 (`npx playwright install firefox webkit`) depende de aprovação do Victor (decisão D16).

## Critérios por etapa

Cada critério tem o número que conta e de onde ele vem; "plano" é a seção Etapas do plano privado.

### E0. Pré-produção e higiene

| Critério | Meta | Estado |
| --- | --- | --- |
| Teste de originalidade no `npm test` e verde | 0 achados em arquivos, metadados, commits, refs e texto do pull request | verde em 30/10/2026 (`testes/rts-originalidade.test.mjs`, 6 testes) |
| A branch antiga nunca foi ao GitHub | 0 refs com termo proibido em `git ls-remote origin` | 0 de 13 em 30/10/2026 |
| `npm test` e `npm run e2e` verdes na `rts/base`, sem mexer no Pavio nem no Farm | tudo verde | verde em 30/10/2026 na primeira integração: `npm test` 182 de 182; e2e com 32 funcionais (2 pulados por condição do próprio teste) e 2 de desempenho |
| Tabela de medições preenchida | toda linha com número ou "não deu, motivo" | em andamento |
| `rtx.sh` confere espaço em C: e D:, VRAM livre e alcance antes de cada lote | código 0 e `relatorio.json` | pendente (`rts-arte`) |
| EEVEE pelo SSH na GPU | log com a NVIDIA; senão, flipbooks no Cycles | pendente (`rts-arte`) |
| Medições no Windows feitas pelo Victor no PC | string da placa registrada | pendente |
| D01 a D07, D30 e D31 marcadas | 9 decisões | 9 de 9 em 30/10/2026 |

### E1. Motor de produção (plano, E1)

| Critério | Meta | Estado |
| --- | --- | --- |
| Mesmo hash entre motores | Node, Chromium, Firefox e WebKit iguais em 3 cenários de 18.000 passos com combate, ordens e neblina; Safari conferido à mão | pendente |
| Passo da simulação com 2.000 unidades | p99 até 10 ms, máximo até 20 ms; nenhum campo de fluxo acima de 3 ms num passo | pendente |
| Ponte de 2 células | 20 unidades atravessam em até 1,5 vez o tempo de uma sozinha mais 8 s | pendente |
| 20 ordens simultâneas | ninguém preso por mais de 5 s | pendente |
| Neblina com 2.000 unidades e 4 times | até 1 ms por passo | pendente |
| Salvar, carregar e replay | mesmo hash depois de carregar; replay reproduz as somas | pendente |
| Render em 4K com 2.000 unidades, Chrome e Safari | menos de 1% dos quadros acima de 20 ms, CPU por quadro medida e a tela dita | pendente |
| Clique até a marca no chão | abaixo de 100 ms | pendente |

### E2. Fábrica de arte e portão de estilo (plano, E2)

| Critério | Meta | Estado |
| --- | --- | --- |
| `rtx.sh renderizar <asset>` | atlas, manifesto e procedência sem passo manual, testes verdes | pendente |
| Veículo de 32 direções com todos os passes | até 10 minutos de GPU (medido: cerca de 100 s) e até 1 GB de disco | pendente |
| Memória de textura | estimada dentro de 20% da medida no navegador | pendente |
| Teste de leitura de 5 segundos | pelo menos 80% de acerto em 4K, 1080p e com filtro de daltonismo, com 5 pessoas | pendente |
| Escolhas do Victor | elevação, escala, direções e acabamento escolhidos; `projecao.json` v1 congelado | pendente |

### E3. Fatia cinza jogável (plano, E3)

| Critério | Meta | Estado |
| --- | --- | --- |
| Partida jogada por 3 pessoas do grupo | 15 a 25 minutos, com registro e condição de fim definida | pendente |
| Diversão | mediana de pelo menos 4 em 5; "jogaria de novo?" com sim de todos | pendente |
| Ritmo pelo registro | primeiro tiro entre 2:30 e 4:00; 10 contra 10 em 8 a 20 s; menos de 20% de janelas sem comando; primeiro cemitério esgotado entre 10 e 13 min; 1 a 4 coletores perdidos | pendente |
| Testes de regra | matriz, carga derramada, saturação, vento, poste, lotação verdes | pendente |
| Spike de lockstep | 10 minutos sem dessincronia entre Chrome e Firefox; envelope do comando congelado | pendente |
| Briefs | 33 aprovados no checklist de originalidade, sem lembrança específica de outro jogo na revisão | pendente |

### E4. Missão em cinza (plano, E4)

| Critério | Meta | Estado |
| --- | --- | --- |
| Duração no Normal com 6 pessoas que nunca viram o jogo | mediana de 20 a 25 min entre 3 novatos e de 15 a 18 entre 3 veteranos | pendente |
| Aviso de ataque | todo ataque com 6 ou mais unidades avisado com pelo menos 10 s (teste no registro) | pendente |
| Lições | cada lição aparece no registro de pelo menos 4 das 6 pessoas | pendente |
| Justiça e briefings | ninguém chama derrota de injusta; no máximo 1 pessoa pula briefings | pendente |
| Diversão | mediana de pelo menos 4 em 5; "jogaria a próxima fase?" com sim de pelo menos 5 de 6 | pendente |
| IA sem vantagem | sem recurso, visão ou produção extra (teste automático); replay da partida inteira reproduz as somas | pendente |

### E5. Arte e som de produção (plano, E5)

| Critério | Meta | Estado |
| --- | --- | --- |
| Texturas | até 256 MB no uhd e 96 MB no hd | pendente |
| Download sem a música | até 30 MB no uhd e 12 MB no hd | pendente |
| Leitura com a arte final | 80% no teste de 5 segundos | pendente |
| Procedência | 100% dos assets, só licenças permitidas, revisão sem lembrança específica de outro jogo | pendente |
| Som | 100 explosões em poucos segundos sem estalo; uma fala por vez; Opus no Safari ou reserva AAC | pendente |

### E6. Polimento e publicação (plano, E6)

| Critério | Meta | Estado |
| --- | --- | --- |
| Quadro | p95 até 16,7 ms em 4K no M5 Pro na luta mais pesada; até 6,9 ms na 4090; até 16,7 ms em 1080p num notebook comum | pendente |
| Carga | primeira em até 10 s a 100 Mbit/s; segunda visita em até 2 s | pendente |
| Acessibilidade e teclas | axe-core sem problema sério; teclas sem colisão com o navegador | pendente |
| Produção | fumaça verde, Pavio e Farm intactos | pendente |
| Jogo de verdade | o Victor e 3 amigos jogam a fase 1 inteira em produção | pendente |

E7 (escaramuça), E8 (multiplayer) e E9 (campanha) têm os critérios no plano e entram aqui quando a etapa abrir.

## Roteiro de 15 minutos para o Victor

Pendente nesta onda (`rts-qualidade`).

## Frentes

### F1 Motor e simulação (`rts-motor`)

Onda 1 aberta em 30/10/2026; nada integrado ainda.

### F2 Renderização e 4K (`rts-render`)

Onda 1 aberta em 30/10/2026; nada integrado ainda.

### F3 Arte e Blender (`rts-arte`)

Onda 1 aberta em 30/10/2026; nada integrado ainda.

### F5 Design, mundo e fase 1 (`rts-design`)

Onda 1 aberta em 30/10/2026, só para os briefs; nada integrado ainda.

### F7 Interface e controles (`rts-interface`)

Onda 1 aberta em 30/10/2026; nada integrado ainda.

### F8 Qualidade e coordenação (`rts-qualidade`)

- 30/10/2026: `rts/base` criada da `main` (`94d4631`); protótipo em `prototipos/rts-4k/` sem as imagens do SDXL e com o cabeçalho SPDX no script do Blender; configuração `prototipo-rts` (porta 8811) no `.claude/launch.json`; `testes/rts-originalidade.test.mjs`; este arquivo e o [frentes.md](frentes.md).
- Pendente nesta onda: página de diagnóstico em `prototipos/diagnostico/`, roteiro de 15 minutos, projeto Playwright `rts-determinismo`, barreira de determinismo com a `rts-motor`, pushes da `rts/base` no Action.

### F4, F6 e F9

Abrem nas ondas 3 (F4 e F6) e 2 (F9, spike curto).
