# Estado do RTS

Estado vivo do RTS original da Salinha: o que cada frente fez, o que foi medido e os critérios de cada etapa, com número e fonte.
Quem divide o trabalho e como integrar está em [frentes.md](frentes.md); o plano completo, com a pesquisa, fica fora do repositório, na base de conhecimento privada do Victor.
Cada sessão atualiza a sua seção no fim da onda; a `rts-qualidade` mantém as medições e os critérios.

Mundo provisório: Apagão. Uma tempestade solar queimou a rede elétrica e a carga guardada em baterias velhas virou o recurso; os Religadores (jogador) enfrentam os Desligados (atravessadores e freteiros), e a terceira facção (codinome Facção 3, a comunidade da emissora) entra depois.

## Onde estamos

- Etapa: E3 (fatia cinza jogável), na onda 2, aberta em 30/10/2026 com as 8 sessões aprovadas pelo Victor; termina no marco M3, uma partida de 15 a 25 minutos com arte cinza jogada por 3 pessoas do grupo. A onda 1 (E1 motor de produção e E2 fábrica de arte, junto com a E0) terminou em 30/10/2026; o que ficou dela está nas seções de cada frente e em "Medições que esperam o Mac".
- Sessões da onda 2 e portas: `rts-qualidade` (8820), `rts-motor-economia` (8821), `rts-render` (8822), `rts-interface` (8823), `rts-arte` (8824), `rts-design` (8825), `rts-rede` (8828) e `rts-motor-combate` (8829); o motor ficou dividido em F1a e F1b pela tabela de frentes do [frentes.md](frentes.md).
- Integração: branch `rts/base`, criada em 30/10/2026 a partir da `main` em `94d4631`; nada do RTS foi para a `main` nem para a Netlify.
- Guarda da produção, conferida de novo no fim da onda 1 (30/10/2026): `salinha-jogos.netlify.app/versao.json` em `45b1664`, `/rts/` responde 404, a `rts/base` não tem deploy de branch na Netlify e a `main` segue em `94d4631`.
- Página de diagnóstico para os amigos, com aprovação do Victor em 30/10/2026: deploy de rascunho na Netlify, fora da produção, em https://diagnostico-rts--salinha-jogos.netlify.app (deploy `6ae537f4a4f10013b680a403`, feito com `netlify deploy --no-build --alias diagnostico-rts` sem `--prod`), só com `prototipos/diagnostico` e o protótipo de `3faef0e`; a raiz leva a `/diagnostico/`. Conferido no Chromium: placa, Opus e a soma `897f4ba5` no Worker. A produção seguiu em `45b1664`. Um deploy novo com o mesmo `--alias` atualiza esse endereço.
- Fim da onda 1 (30/10/2026): as seis frentes integraram na `rts/base` e o Action ficou verde em `f609c18` (run 41147192783); o que falta da E0 depende do Victor (roteiro de medições, endereço da página de diagnóstico) e está em "Medições que esperam o Mac".
- Sessões da onda 1, arquivadas: `rts-qualidade`, `rts-arte`, `rts-design`, `rts-motor`, `rts-render` e `rts-interface`.
- Regra do Victor de 30/10/2026, 20h17: o que exige esforço roda no PC da RTX 4090 e o Mac fica com editar, git e `npm test`; os testes de ponta a ponta rodam no PC por `scripts/rtx-testes.sh` (detalhes em [frentes.md](frentes.md), seção Onde roda o quê).

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
| D16 | Ferramentas a instalar (Tiled, Pillow, Firefox e WebKit do Playwright) | Firefox e WebKit do Playwright aprovados e instalados no Mac em 30/10/2026; Tiled e Pillow seguem abertos |

## Medições da E0

| Medição | Máquina e navegador | Resultado | Fonte |
| --- | --- | --- | --- |
| Bench 4K, 2.000 unidades com sprites | MacBook Pro M5 Pro, Chromium 151 com Metal (Playwright) | 60 qps (teto da tela), quadro p99 16,8 ms, 0 quadros acima de 20 ms, CPU do quadro p95 0,4 ms, passo p50/p95 2,3/4,1 ms | `prototipos/rts-4k/medir.mjs`, 30/10/2026 |
| Bench 4K, 10.000 unidades com sprites | MacBook Pro M5 Pro, Chromium 151 com Metal | 60 qps, p99 16,8 ms, 0 acima de 20 ms, passo p50/p95 13,7/16,8 ms | `medir.mjs`, 30/10/2026 |
| Bench 4K, 2.000 e 6.000 unidades | MacBook Pro M5 Pro, Firefox 153 (Playwright 1.62.1) | 120 e 117 qps, p99 9,5 e 16,8 ms, 0 acima de 20 ms | `medir.mjs`, 30/10/2026 |
| Bench 4K, 2.000 e 6.000 unidades | MacBook Pro M5 Pro, WebKit 26.5 (Playwright 1.62.1) | 60 qps, p99 18 ms (o relógio do WebKit arredonda para ms inteiros), 0 acima de 20 ms | `medir.mjs`, 30/10/2026 |
| Determinismo, 3.600 passos com 2.000 unidades | Node 22, Chromium 151 e Firefox 153 e WebKit 26.5 na página, `jsc` do macOS 26 | soma final `897f4ba5` igual nos cinco | `prototipos/rts-4k/verificar-determinismo.mjs`, 30/10/2026 |
| Determinismo dentro do Worker, mesmo roteiro | Chromium 153 (Playwright 1.63), Firefox 153 e WebKit 26.5 (playwright-core 1.62.1) | soma final `897f4ba5` e as seis somas iguais à referência nos três; 1,50, 2,81 e 1,36 ms por passo | `prototipos/diagnostico/` e `testes/e2e/rts-determinismo.spec.mjs`, 30/10/2026 |
| Bench 4K pela página de diagnóstico, 2.000 unidades | MacBook Pro M5 Pro: Chromium 153 com Metal, Firefox 153, WebKit 26.5 (Playwright) | Chromium 60 qps, p99 16,8 ms, 0 de 600 quadros acima de 20 ms; Firefox 110,5 qps, p99 18,1 ms, 4 de 1.105; WebKit 59,9 qps, p99 20 ms, 3 de 600 | `prototipos/diagnostico/`, 30/10/2026 |
| Safari 26 de verdade: bench em 4K | MacBook Pro M5 Pro | não deu nesta onda: precisa do Victor na frente do Mac; o [roteiro](roteiro-medicoes.md) está pronto e a medição entrou em "Medições que esperam o Mac" | — |
| Safari 26 de verdade: soma no Worker | MacBook Pro M5 Pro | não deu nesta onda: precisa do Victor na frente do Mac; o [roteiro](roteiro-medicoes.md) está pronto e a medição entrou em "Medições que esperam o Mac" | — |
| Chrome e Edge no Windows: bench em 4K, soma e a string da placa | PC da RTX 4090, com o Victor no PC (pelo SSH os navegadores podem rodar sem GPU) | não deu nesta onda: precisa do Victor sentado no PC ([roteiro](roteiro-medicoes.md), Parte 3); servir as páginas em localhost pelo Python do Blender foi testado pelo SSH em 30/10/2026 | — |
| Firefox no Windows | PC da RTX 4090 | não deu: o Firefox não está instalado no PC (conferido em 30/10/2026), e instalar depende do Victor | — |
| Notebook comum com GPU integrada | máquina de um amigo | não deu nesta onda: falta um amigo abrir a página de diagnóstico, que desde 30/10/2026 está em https://diagnostico-rts--salinha-jogos.netlify.app e colar o resultado | — |
| Extensões de textura e MAX_TEXTURE_SIZE | MacBook Pro M5 Pro, Playwright | Chromium 153 (ANGLE Metal, Apple M5 Pro): S3TC, RGTC, BPTC (BC7), ETC2, ASTC e PVRTC, 16384; Firefox 153 ("Apple M1, or similar"): só S3TC e RGTC, 8192; WebKit 26.5: todas, 16384 | `prototipos/diagnostico/`, 30/10/2026 |
| Extensões de textura | Safari 26, Chrome e Edge do Windows, notebook comum | não deu nesta onda: sai da página de diagnóstico no [roteiro](roteiro-medicoes.md) (Safari e PC) e no notebook de um amigo, que dependem do Victor | — |
| `decodeAudioData` de Opus em Ogg e de AAC em MP4 | Playwright no Mac | Opus decodifica no Chromium 153, no Firefox 153 e no WebKit 26.5; AAC decodifica no Chromium e no Firefox e falha no WebKit do Playwright, que vem sem os codecs proprietários (não vale pelo Safari) | `prototipos/diagnostico/`, 30/10/2026 |
| `decodeAudioData` de Opus e de AAC | Safari 26 | não deu nesta onda: precisa do Victor na frente do Mac; o [roteiro](roteiro-medicoes.md) está pronto e a medição entrou em "Medições que esperam o Mac" | — |
| Bateria de teclas (Ctrl, Option e Shift com 1 a 9, Ctrl e clique, dois dedos, pinça, Espaço, setas, F10, P, atalhos de Mesa do Mission Control) | Safari e Chrome do Mac, Chrome do Windows | não deu nesta onda: precisa do Victor no Safari e no Chrome do Mac e no Chrome do PC (`prototipos/teclas/` da `rts-interface`, [roteiro](roteiro-medicoes.md)) | — |
| EEVEE pelo SSH na GPU | PC da RTX 4090 | usa a NVIDIA: `gpu.platform` depois de `gpu.init()` deu OPENGL, "NVIDIA GeForce RTX 4090/PCIe/SSE2", "4.6.0 NVIDIA 591.86"; o `nvidia-smi` listou o `blender.exe` a 50%; 266 quadros de 256 px em 25 s (94 ms por quadro) | `rts-arte`, 30/10/2026 |
| `ferramentas/arte/rtx.sh renderizar teste-veiculo-tanque` com trava, código 0 e `relatorio.json` | Mac para o PC da RTX 4090 | código 0; checagem antes do lote com C: 23,1 GB, D: 58,7 GB e 22.924 MiB de VRAM livres; trava pega e solta; OPTIX; 192 renders em 6,95 s, empacotar 2,6 s, lote de 10,4 s; atlas, manifesto, procedência e `indice.json` no repositório | `rts-arte`, 30/10/2026 |
| Lote longo com o SSH derrubado de propósito | PC da RTX 4090 | sobrevive: com o cliente morto aos 25 s de um lote de 192 quadros, o Blender terminou sozinho; como o `Start-Process` morre quando a sessão SSH termina normalmente, o `rtx.sh` lança o lote pelo WMI (`Win32_Process.Create`) e o próprio PC solta a trava, sem `schtasks`. Queda de rede sem FIN não foi testada (exigiria derrubar o Tailscale) | `rts-arte`, 30/10/2026 |
| Tamanho do git (`git count-objects -vH`) | clone oficial | 18,89 MiB soltos e 5,44 MiB empacotados antes do protótipo; 23,98 MiB soltos e 5,44 MiB empacotados com o protótipo e o passo zero (os atlas do protótipo e de `site/rts/assets/prototipo/` são os mesmos objetos); no fim da onda 1, com os 11 assets do portão de estilo, 54,26 MiB empacotados e 25,24 MiB soltos, nenhum arquivo acima de 2 MB | 30/10/2026 |

Navegadores do Playwright: o Firefox 155 e o WebKit 26.6 do Playwright 1.63 foram instalados no Mac em 30/10/2026, com aprovação do Victor (D16), e o `rts-determinismo` passou nos três motores localmente; as medições anteriores do Firefox 153 e do WebKit 26.5 vieram do playwright-core 1.62.1.
Numa máquina sem esses navegadores, `npm run e2e` pula os projetos `rts-determinismo-firefox` e `rts-determinismo-webkit` com um aviso; no Action eles são instalados e rodam.

## Testes no PC da RTX 4090

Executor `scripts/rtx-testes.sh`, entregue em 30/10/2026; números das execuções `20261030-203756` e `20261030-205046` em `D:\rts\testes\rts-qualidade-97785b`.

| Medição | Resultado |
| --- | --- |
| Placa do Chrome lançado pelo SSH (sessão 0) | NVIDIA GeForce RTX 4090 nos quatro backends do ANGLE (d3d11, gl, vulkan, d3d11on12); o executor usa o d3d11 e confere antes de cada passo de desempenho |
| Funcionais | 41 de 41, nenhum instável, em 4,7 minutos com 2 processos |
| `rts-determinismo` | 12 de 12 (roteiro do protótipo e os 3 replays dourados no Chromium, no Firefox e no WebKit), em 2,5 minutos: o mesmo resultado do Mac e do Action |
| `rts-desempenho`, 2.000 unidades em 4K (3840×2160), zoom padrão | 60 qps, quadro p99 16,8 ms, 0 de 600 quadros acima de 20 ms, CPU do quadro p95 0,5 ms, GPU 4,8 ms por quadro, passo da simulação p50/p95 8,9/22,2 ms; depois de a soma de verificação passar a uma por segundo (`21d0b40`), a `rts-render` mediu o passo em 1,8/3,3 ms em 4K e 1,7/3,0 ms em 1080p (execução `20261030-205938`), então não era disputa com o render |
| `rts-desempenho`, zoom afastado | 60 qps, p99 16,8 ms, 0 de 600 acima de 20 ms, GPU 1,6 ms, passo p50/p95 9,1/18,8 ms |
| Pavio, 8 jogadores (`desempenho.spec.mjs`) | reprova no PC: trabalho por quadro p95 do convidado 8,7 ms contra o limite de 8 ms; com a CPU 4x mais lenta, quadro p95 de 183 ms no anfitrião e 150 ms no convidado (a limitação de CPU do Chrome pesa muito mais no Windows). Os limites foram feitos para o Mac, como substituto de um iPad, então esse teste fica fora do e2e do PC e entra na lista abaixo |
| Pavio, anfitrião com 7 robôs | passa no PC |
| Disco do executor no D: | 1,19 GB de navegadores em `D:\rts\playwright` e 1,70 GB em `D:\rts\testes` (todas as sessões), de 3,71 GB em `D:\rts`; o `checar.ps1` da `rts-arte` recusa lote acima de 12 GB |

Duas correções saíram dessas execuções: o servidor dos testes passou a aceitar 128 conexões na fila (`scripts/servidor-testes.py`), porque o padrão de 5 do Python recusava conexões no Windows quando os 7 convidados entram juntos, e o controle de gestos sintéticos do `toque.spec.mjs` pula no Windows como já pulava no Linux.

## Medições que esperam o Mac

Rodam só quando o Victor pedir, uma por vez, com o Mac sem outras sessões pesadas:

- Safari 26 de verdade: página de diagnóstico, bench do jogo em 4K e a soma no Worker ([roteiro](roteiro-medicoes.md), Parte 1).
- Bateria de teclas no Safari e no Chrome do Mac ([roteiro](roteiro-medicoes.md), Partes 1 e 2).
- Referência de 60 qps no Metal do M5 Pro: `rts-desempenho` em 4K com 2.000 unidades no Chrome e o passo da simulação limpo, sem outras sessões rodando (critérios da E1).
- Pavio com 8 jogadores (`npx playwright test testes/e2e/desempenho.spec.mjs --project=desempenho --workers=1`), cujos limites são do Mac.
- Render da fatia cinza no M5 Pro (`rts-render`): `rts-desempenho` em 4K com 2.000 unidades e 60 prédios no Chrome com Metal (`npx playwright test testes/e2e/rts-desempenho.spec.mjs --project=desempenho --workers=1`), e no Safari 26 `/rts/?bench=1&res=4k&seg=20&avancar=600&predios=60` em tela cheia, uma vez com `&terreno=procedural` e outra sem, copiando o JSON do canto.
- Lockstep com o Safari 26 de verdade: abrir no Safari o link da sala do protótipo `prototipos/rts-lockstep/` criada no Chrome do Mac e jogar alguns minutos com o robô ligado, conferindo no painel do anfitrião que as somas comparadas sobem e as dessincronias ficam em 0 (o WebKit do Playwright no Windows não tem WebRTC, e no Mac rodou 1 minuto); se der, a rodada inteira de 10 minutos com o WebKit do Playwright no Mac ([README do protótipo](../../prototipos/rts-lockstep/README.md)).

## Critérios por etapa

Cada critério tem o número que conta e de onde ele vem; "plano" é a seção Etapas do plano privado.

### E0. Pré-produção e higiene

| Critério | Meta | Estado |
| --- | --- | --- |
| Teste de originalidade no `npm test` e verde | 0 achados em arquivos, metadados, commits, refs e texto do pull request | verde em 30/10/2026 (`testes/rts-originalidade.test.mjs`, 6 testes) |
| A branch antiga nunca foi ao GitHub | 0 refs com termo proibido em `git ls-remote origin` | 0 de 13 em 30/10/2026 |
| `npm test` e `npm run e2e` verdes na `rts/base`, sem mexer no Pavio nem no Farm | tudo verde | verde em 30/10/2026 na primeira integração: `npm test` 182 de 182; e2e com 32 funcionais (2 pulados por condição do próprio teste) e 2 de desempenho |
| Tabela de medições preenchida | toda linha com número ou "não deu, motivo" | feito no fim da onda 1 (30/10/2026): o que dependia de máquina e Playwright tem número; Safari, Windows com o Victor no PC, notebook e teclas estão como "não deu", com o motivo e o roteiro pronto |
| `rtx.sh` confere espaço em C: e D:, VRAM livre e alcance antes de cada lote | código 0 e `relatorio.json` | feito em 30/10/2026 (`rts-arte`; números na tabela de medições) |
| EEVEE pelo SSH na GPU | log com a NVIDIA; senão, flipbooks no Cycles | feito em 30/10/2026: NVIDIA GeForce RTX 4090 no `gpu.platform` (`rts-arte`) |
| Medições no Windows feitas pelo Victor no PC | string da placa registrada | não deu nesta onda: precisa do Victor sentado no PC ([roteiro](roteiro-medicoes.md), Parte 3); pelo SSH a placa já aparece como NVIDIA GeForce RTX 4090 no Chrome do executor de testes |
| D01 a D07, D30 e D31 marcadas | 9 decisões | 9 de 9 em 30/10/2026 |

### E1. Motor de produção (plano, E1)

| Critério | Meta | Estado |
| --- | --- | --- |
| Mesmo hash entre motores | Node, Chromium, Firefox e WebKit iguais em 3 cenários de 18.000 passos com combate, ordens e neblina; Safari conferido à mão | feito em 30/10/2026 (seção F1): os 3 replays de `testes/rts-replays/` dão o mesmo final no Node 22 do Mac e no Node 24 do PC; a versão atual bateu dentro de Worker no Chromium, no Firefox e no WebKit do Action (run 41146036513, 12 de 12) e a anterior também no `jsc` do macOS; Safari de verdade pendente (Victor) |
| Passo da simulação com 2.000 unidades | p99 até 10 ms, máximo até 20 ms; nenhum campo de fluxo acima de 3 ms num passo | no PC da RTX 4090 sem carga: p99 4,4 ms e máximo 9,6 ms no Node, p99 4,3 ms e máximo 9,8 ms num Worker do Chromium 153, pior fatia de campo 2,5 ms (seção F1); dentro da página completa, depois da soma uma vez por segundo (`VERSAO_SIMULACAO` 2), p50/p95 1,7/3,0 ms em 4K e 1,8/3,3 ms em 1080p, medido pela `rts-render` no PC (antes, com a soma a cada passo, p95 de 22 ms); no M5 Pro, medida limpa pendente |
| Ponte de 2 células | 20 unidades atravessam em até 1,5 vez o tempo de uma sozinha mais 8 s | feito: 20 tanques em 1.211 passos, um sozinho em 1.128, limite 1.932 (`testes/rts-sim-movimento.test.mjs`) |
| 20 ordens simultâneas | ninguém preso por mais de 5 s | parcial: no cenário do teste (semente 7) o pior caso é 74 passos (2,5 s); em 6 sementes do mesmo cenário, 4 passam e 2 não (8,5 s e 6,9 s), por filas em passagens de 1 célula e fluxo contrário em corredores diagonais estreitos do mapa de ruído |
| Neblina com 2.000 unidades e 4 times | até 1 ms por passo | feito: média 0,16 ms, p99 0,62 ms, máximo 2,0 ms no PC (`ferramentas/rts/medir-neblina.mjs`) |
| Salvar, carregar e replay | mesmo hash depois de carregar; replay reproduz as somas | feito: carregar no meio do cálculo de um campo e com comandos pendentes continua com as mesmas somas por subsistema; os replays dourados reproduzem as somas (`testes/rts-sim.test.mjs`, `testes/rts-sim-replays.test.mjs`) |
| Render em 4K com 2.000 unidades, Chrome e Safari | menos de 1% dos quadros acima de 20 ms, CPU por quadro medida e a tela dita | Chromium com Metal: 0 de 600 quadros acima de 20 ms, CPU do quadro p95 0,3 ms, canvas 3840×2160 (seção F2); Safari pendente (Victor) |
| Clique até a marca no chão | abaixo de 100 ms | p50 de 22 ms e p95 de 28 ms no Chromium 152 do Mac (seção F7); o `rts-entrada.spec.mjs` cobra p50 abaixo de 100 ms onde há GPU e passa no PC da RTX 4090 (execução `20261030-205356` da `rts-interface`) |

### E2. Fábrica de arte e portão de estilo (plano, E2)

| Critério | Meta | Estado |
| --- | --- | --- |
| `rtx.sh renderizar <asset>` | atlas, manifesto e procedência sem passo manual, testes verdes | feito em 30/10/2026 (`rts-arte`): os 11 assets do portão saíram assim do commit `19ffcaa`, código 0 em todos, com `npm test` verde |
| Veículo de 32 direções com todos os passes | até 10 minutos de GPU e até 1 GB de disco | medido em 30/10/2026 pela `rts-arte`: Cesto Blindado com cor, time, normal e sombra, 1.920 renders em 129 s de GPU e 222 s de lote, 123 MB no D:; sem o denoiser na CPU, 0,03 a 0,06 s por quadro de 256 px |
| Memória de textura | estimada dentro de 20% da medida no navegador | medida em 31/10/2026 (seção F3): com os 44 sprites do kit, o render aloca 634,7 MiB no `uhd` contra 285 estimados (224 do atlas de fase mais os solos); a diferença vem do array de sprites a 4096 de largura por causa das fichas provisórias (`adicionarFichas`), correção pedida à `rts-render`; refazer a medida depois dela |
| Teste de leitura de 5 segundos | pelo menos 80% de acerto em 4K, 1080p e com filtro de daltonismo, com 5 pessoas | pendente |
| Escolhas do Victor | elevação, escala, direções e acabamento escolhidos; `projecao.json` v1 congelado | pendente |

### E3. Fatia cinza jogável (plano, E3)

Aberta em 30/10/2026 (onda 2). Cada linha tem um dono: quem entrega o número, ou quem destrava quando o número depende do Victor. O empacotar dos Desligados saiu da E3 para a E7 (plano, E3: na fase 1 os Desligados não constroem).

| Critério | Meta | Dono | Estado |
| --- | --- | --- | --- |
| Partida jogada por 3 pessoas do grupo | 15 a 25 minutos, com registro e condição de fim definida (sobreviver a N ondas ou destruir o acampamento) | Victor joga com 2 pessoas pelo kit do M3 (`rts-qualidade`); condição de fim e caixa de areia da `rts-design` | pendente |
| Diversão | mediana de pelo menos 4 em 5; "jogaria de novo?" com sim de todos | Victor (respostas das 3 pessoas pelo kit do M3); `rts-qualidade` registra | pendente |
| Ritmo: primeiro tiro | entre 2:30 e 4:00 | número: conferidor de ritmo da `rts-qualidade` sobre o registro (C15); ajuste: `rts-design` | pendente |
| Ritmo: 10 contra 10 | resolvido em 8 a 20 s | idem; ajuste: `rts-design` com a `rts-motor-combate` | pendente |
| Ritmo: janelas sem comando | menos de 20% | idem; ajuste: `rts-design` e `rts-interface` | pendente |
| Ritmo: primeiro cemitério esgotado | entre 10 e 13 min | idem; ajuste: `rts-design` com a `rts-motor-economia` | pendente |
| Ritmo: coletores perdidos | 1 a 4 por partida | idem; ajuste: `rts-design` | pendente |
| Testes de regra: carga derramada, saturação, vento, poste, lotação | verdes no `npm test` | `rts-motor-economia` | feito em 31/10/2026: `testes/rts-sim-economia.test.mjs`, 15 testes verdes (seção F1a) |
| Testes de regra: matriz de dano, veterania, pesquisas, religar e gatilhos | verdes no `npm test` | `rts-motor-combate` | pendente |
| Fatia cinza de ponta a ponta | começar, coletar, construir, produzir, lutar, vitória e derrota verdes no `rts/base` com o gancho `window.__rts` (`?teste=1`) | `rts-qualidade` | parcial: o gancho funciona na página (`testes/e2e/rts-fatia.spec.mjs`, 3 de 3 no PC, execução `20261031-011951`: a página normal não o carrega; ler, mandar e avançar, também com a aba oculta); os 4 testes da partida (`rts-fatia-partida.spec.mjs`) pulam até a missão dar a Carga inicial, a vitória e a derrota pelos gatilhos da `rts-motor-combate` |
| Spike de lockstep | 10 minutos sem dessincronia entre Chrome e Firefox, mensagens abaixo de 16.000 bytes | `rts-rede` | feito em 31/10/2026: 10 minutos de jogo no PC com 4 páginas (Chromium 153 e Firefox 155, duas de cada), atraso artificial ligado, 1.812 somas por subsistema comparadas e 0 dessincronias, maior mensagem de 15.660 bytes, turnos acima de 16.000 fatiados (seção F9); WebKit 26.6 do Playwright só no Mac, 1 minuto sem dessincronia; Safari de verdade com o Victor |
| Formato de comando congelado | `VERSAO_COMANDOS` 1 depois do spike | `rts-motor-economia`, depois da `rts-rede` | feito em 31/10/2026: `VERSAO_COMANDOS` 1, com teto de 1.024 unidades por comando (seção F1a) |
| Briefs | 33 aprovados no checklist de originalidade, sem lembrança específica de outro jogo na revisão | `rts-design`; a revisão por quem jogou o jogo que inspirou o projeto depende do Victor achar a pessoa | pendente: 37 briefs escritos com o checklist preenchido no que depende da `rts-design`; as duas revisões humanas esperam o Victor (convite pronto, seção F5) |
| Kit cinza | todas as unidades e construções da fase 1 em cinza procedural, com manifesto e procedência | `rts-arte` | feito em 31/10/2026 (seção F3): 15 unidades, 19 prédios e estruturas, pilha de baterias, faísca, 7 decorações, 10 solos e os ícones, num atlas de fase de 7 camadas no `uhd` (224 MiB); falta aparecer no jogo pela `rts-render` e a memória medida no navegador |
| HUD da fatia | recursos, lotação, construção e produção com fila e grade, minimapa com alertas, coletor ocioso | `rts-interface` | pendente |
| Render da fatia | construções com pegada, cabos e o que a caixa de areia pede | `rts-render` | feito em 31/10/2026 (seção F2): relevo, penhascos, neblina com altura, prédios com pegada e obra, fantasma de colocação, memória na neblina, cabos, splatting por solo e o kit cinza pelo índice; em 4K com 2.000 unidades e 60 prédios, 0 de 600 quadros acima de 20 ms no PC; Mac e Safari em "Medições que esperam o Mac" |
| Manifesto, orçamento e procedência | testes verdes, com a lista de licenças permitidas | `rts-qualidade` | feito em 31/10/2026: `testes/rts-manifesto.test.mjs` (7), `rts-orcamento.test.mjs` (4, com `testes/rts-orcamento.json`) e `rts-procedencia.test.mjs` (5, com `testes/rts-licencas.json`) verdes, lendo o atlas de fase desde `095ae79`. Orçamento da fase 1 com o kit cinza: textura `uhd` 271 MiB contra 256 (o atlas dá 224, os 11 solos de 4 MiB passam do teto) e `hd` 75,8 contra 96; download 6,6 MiB no `uhd` e 2,8 no `hd`, contra 30 e 12. O teto da fase só reprova (`obrigatorio`) quando o `uhd` couber; a alavanca é da `rts-arte` |
| Tamanho do git | `git count-objects -vH` no fim da etapa | `rts-qualidade` | pendente |
| Som provisório | sintetizado e respostas gravadas pelo grupo | sem sessão na onda 2 (a `rts-som` abre na onda 3); a decisão de adiantar ou seguir sem som no M3 é do Victor | parcial: sons sintetizados provisórios da `rts-interface` em `site/rts/js/audio/provisorio.js` (cliques, respostas de ordem, tiros, explosões, produção e construção prontas, alarme de ataque); as respostas gravadas pelo grupo ficam para a `rts-som` ou para o Victor |

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

## O que depende do Victor (onda 2)

Ninguém espera parado por estes itens; cada sessão segue com o que dá e a `rts-qualidade` mantém a lista.

- Como os amigos abrem a fatia cinza no M3: deploy de rascunho na Netlify com endereço próprio (`--alias fatia-cinza`, sem `--prod`, como a página de diagnóstico) ou o Mac servindo a `rts/base` em casa ([kit do M3](kit-m3.md)).
- Jogar o M3 com 2 pessoas do grupo pelo [kit do M3](kit-m3.md) e mandar os 3 registros e as respostas para a `rts-qualidade`.
- Som provisório no M3: a `rts-som` só abre na onda 3; adiantar ou jogar o M3 sem som.
- Achar quem jogou o jogo que inspirou o projeto para a revisão dos briefs (`rts-design`) e recrutar os 6 testadores da E4 (3 novatos e 3 veteranos).
- Licença comunitária de áudio gerado por IA (Stable Audio): fica fora da lista de licenças permitidas (`testes/rts-licencas.json`) até a decisão dele.
- As escolhas do portão de estilo (M2) e as medições que esperam o Mac, abaixo.

## Roteiro para o Victor

O [roteiro de medições](roteiro-medicoes.md) cobre o Safari 26, o Chrome e o Edge no PC da RTX 4090 e a bateria de teclas: cerca de 15 minutos no Mac e 10 no PC. As respostas entram na tabela de medições acima.

## Frentes

### F1 Motor e simulação (`rts-motor`, onda 1; na onda 2, `rts-motor-economia` e `rts-motor-combate`)

- 30/10/2026, passo zero: o protótipo foi para `site/rts/` dividido pelos donos (simulação em `js/sim/`, worker em `js/trabalhador.js`, render em `js/render/` e `js/ativos/`, entrada e interface em `js/entrada/` e `js/interface/`, `js/principal.js` só com a montagem e o laço de quadro, `js/ponte-simulacao.js` como lado da página do protocolo do worker), sem mudar comportamento; `prototipos/rts-4k/` ficou congelado.
- 30/10/2026: `site/rts/js/sim/contratos.js` com o comando (C1, `TIPO_COMANDO`, validação, ordem total e forma compacta), ids com geração (slot nos 16 bits baixos), o retrato por passo (C2, arrays por entidade viva em ordem de slot), os eventos (C3, registros de 9 inteiros com posições), a forma da `VistaDoTime` (C4) e as mensagens do worker; `VERSAO_COMANDOS` 0 e `VERSAO_SIMULACAO` 1.
- 30/10/2026, onda 1 integrada: simulação dividida por subsistema (`estado`, `entidades`, `dados` com esquema e validador de inteiros, `mapa` com morros nos níveis 0 a 2, `caminhos`, `ordens`, `movimento`, `combate`, `neblina`, `vista`, `soma`, `persistencia`, `replay`), tabelas trigonométricas inteiras geradas por `ferramentas/rts/tabelas/gerar-tabelas.mjs`.
- Caminhos: campo de fluxo por destino com cache LRU de 40 campos compartilhado pelas ordens, calculado em fatias de 12.000 expansões por passo (contagem, não relógio, para fatiar igual em toda máquina), com pedágio perto da rocha (24 na célula encostada, 6 a duas células) para os grupos não colarem nas paredes.
- Movimento: formação na chegada (fileiras perpendiculares à aproximação, mais largas que fundas, mantendo a ordem da esquerda para a direita), mira numa célula adiante no campo ou em linha reta quando a visada está livre, detecção de unidade presa com desvio para o lado e chegada aceita perto da vaga ou encostada no próprio grupo parado, prioridades na separação (quem está parado cede, quem segura posição não é empurrado, grupos que se cruzam se empurram pouco e mantêm a direita, unidade travada atravessa grupos em movimento de outras ordens, coletores do mesmo tipo passam um pelo outro).
- Comandos obedecidos: MOVER, ATACAR_MOVENDO, ATACAR, PATRULHAR, PARAR, SEGURAR_POSICAO e a fila do Shift (até 8); o resto do `TIPO_COMANDO` é descartado até a onda 2.
- Neblina incremental por time (contagem de observadores por célula, só quem muda de célula custa) com altura: de baixo se vê a borda de um morro, não o que está atrás.
- Worker com relógio fixo a 75, 100 ou 125% de 30 passos por segundo, recuperação de até 4 passos, pausa por motivo (jogador ou aba oculta), salvar e carregar e gravação do replay da partida.
- Testes: `testes/rts-sim.test.mjs` (contratos, matemática, dados, mapas, campos fatiados, neblina, vista, comandos, salvar e carregar), `testes/rts-sim-barreira.test.mjs` (barreira de determinismo sobre `site/rts/js/sim/`), `testes/rts-sim-replays.test.mjs` com os 3 replays dourados de `testes/rts-replays/` (gerados por `ferramentas/rts/gerar-replays.mjs`) e `testes/rts-sim-movimento.test.mjs` (ponte e 20 ordens).

| Medição | Máquina | Resultado | Fonte |
| --- | --- | --- | --- |
| Replays dourados, 3 de 18.000 passos | Mac (Node 22, V8 12.4) e PC (Node 24, V8 13.6) | finais `22d9d9dd`, `0d7f99a8` e `d5574fea` iguais nos dois; gerados no PC e conferidos no Mac | `ferramentas/rts/verificar-replays.mjs`, 30/10/2026 |
| Mesmos replays antes do pedágio 24/6 | Mac: `jsc` do macOS, Chromium 153, Firefox 155, WebKit 26.6 | os 3 finais iguais ao Node em todos | 30/10/2026 |
| Passo com 2.000 unidades, 9.000 passos com rajadas de 20 ordens | PC, i7-12700KF, Node 24, sem carga | p50 2,7 ms, p99 4,4 ms, máximo 9,6 ms; pior fatia de campo 2,5 ms; neblina média 0,41 ms | `ferramentas/rts/medir-passo.mjs`, 30/10/2026 |
| O mesmo com a CPU do PC em 69% por outros processos | PC | p99 6,5 a 10,3 ms, máximo 15 a 39 ms, pior fatia de campo 5 a 7 ms; pedágio antigo e novo iguais dentro do ruído | idem |
| Passo com 2.000 unidades | MacBook Pro M5 Pro, Node 22, carga do Mac em torno de 20 | p50 1,7 ms, p99 2,8 ms, máximo 10,4 ms (só o primeiro passo) | 30/10/2026 |
| Passo com 2.000 unidades num Worker, sem render | PC, Chromium 153 e Firefox 155 do Playwright, headless | Chromium p50 2,3 ms, p95 3,3 ms, p99 4,3 ms, máximo 9,8 ms; montando o retrato e a soma a cada passo, p99 4,9 ms e máximo 19,4 ms, com mais 2,65 ms por passo para retrato e soma; Firefox p99 3 ms, máximo 11 a 14 ms | 30/10/2026 |
| Soma de verificação completa | Mac, Node 22 | 0,8 ms por cálculo, contra 1,6 ms do passo: desde a `VERSAO_SIMULACAO` 2 o worker calcula uma vez por segundo | 30/10/2026 |
| Neblina, 4 times de 500 unidades vivas patrulhando | PC | média 0,16 ms, p99 0,62 ms, máximo 2,0 ms | `ferramentas/rts/medir-neblina.mjs` |
| Ponte de 2 células | Node | 20 tanques 1.211 passos, um sozinho 1.128 | `testes/rts-sim-movimento.test.mjs` |
| 20 ordens simultâneas, cerca de 1.900 unidades, 6 sementes | PC | pior unidade sem avançar: 74, 133, 140, 140, 206 e 256 passos (sementes 7, 11, 5, 99, 42 e 23) | `testes/rts-sim-cenarios.mjs` |

Pendências da F1 no fim da onda 1: as 20 ordens simultâneas em mapas com passagens de 1 célula e corredores diagonais estreitos; a medida limpa do passo no M5 Pro e o Safari de verdade (Victor); `VERSAO_COMANDOS` só depois do spike S7; os fantasmas de prédios; os números de unidades vindos da `rts-design`. Na onda 2, o que é da F1a está logo abaixo.

#### F1a na onda 2 (`rts-motor-economia`)

- 31/10/2026, contratos v3 na `rts/base` em `a3a5ae2` (antes das outras frentes dependerem deles): C1 com PESQUISAR e RECICLAR e o que cada tipo de comando lê (PRODUZIR em duas faixas, CONSTRUIR para posicionar o prédio pronto do QG ou erguer no local com uma unidade, CANCELAR por faixa e posição, ponto de encontro, COLETAR), FAIXA, MOTIVO e ITEM_PESQUISA; C2 com progresso, carga, ocupação, ligação (cabo) e veterania por entidade, CATEGORIA, DONO_NEUTRO, bits novos, Carga, lotação, filas, fantasmas e próxima rajada por retrato, e `tipos`, `pesquisas`, `nos`, camadas ventosa, cobertura, solo e decoração no mapa estático; C3 com PREDIO_PRONTO, COMANDO_RECUSADO, CARGA_DERRAMADA, DESCARGA, RAJADA_ANUNCIADA, RAJADA, REDE_CORTADA, AVISO_ATAQUE e ONDA; C4 com Carga, lotação, filas e fantasmas; mensagem AVANCAR no worker para o gancho de teste da `rts-qualidade`.
- C5 e C6: `compilarDados()` em `sim/dados.js` valida os arquivos da `rts-design` (ms em múltiplos de 100, décimos de célula, centésimos de célula por segundo, enums em texto, referência por nome) e compila os tipos em passos e unidades de mundo; `lerMapaDeArquivos()` em `sim/mapa.js` valida mapa.json, camadas.bin e entidades.json (rampa de um nível, ventosa no alto, pegadas, pilhas e nós, etiquetas, áreas, pontos e rotas); `testes/rts-sim-dados.test.mjs` passa nos arquivos de verdade da `rts/base`.
- Economia (`sim/economia.js`): coletor vai a uma pilha do nó, espera a vez quando o nó está cheio (saturação dos dados, ordem de chegada), carrega, leva ao depósito mais perto e descarrega; pilha que esvazia fica apagada no mapa (RECURSO_ESGOTADO com o nó); carga de coletor morto vira faíscas que qualquer coletor recolhe (a Carroça de Pedal no dobro da velocidade) e que somem em 90 s; rajadas anunciadas 15 s antes pagam cada cata-vento de pé em célula ventosa.
- Construção (`sim/construcao.js`, `sim/pegadas.js`): pegadas bloqueiam uma grade à parte do terreno, com o pedágio refeito em volta e os campos recalculados no fim do passo; rede dos Religadores recalculada todo passo a partir das raízes (Escritório Regional, Poste Avançado), então um poste caído corta tudo depois dele (REDE_CORTADA) e prédio fora da rede produz a 50%; `motivoPosicao()` é a regra única e pura de posicionamento, que a página chama no retrato para o fantasma e a simulação no próprio estado; CONSTRUIR coloca o prédio pronto ou manda a construtora erguer a obra no local; RECICLAR devolve metade.
- Produção (`sim/producao.js`): duas faixas de 5 por prédio, custo pago ao enfileirar e devolvido inteiro ao cancelar, lotação de 60 segurando a cabeça (um COMANDO_RECUSADO com LOTACAO_CHEIA), prédios exigidos, limite por tipo, pesquisa pela faixa de unidades com `sim/pesquisas.js` (esboço que a `rts-motor-combate` substitui), ponto de encontro e coletor novo indo coletar sozinho.
- Fantasmas (`sim/fantasmas.js`): cada time guarda os prédios e pilhas dos outros que viu, como viu, até ver que sumiram; aparecem na `vistaDoTime` e no retrato do time local.
- Estado novo: `experiencia` e `veterania` (pedido da `rts-motor-combate`), `registrarExtras()` para estado que não é um valor por entidade (salvo, carregado e somado no subsistema novo `extras`), `trocarDono()`, `ultimoComando`; listas por papel montadas uma vez no começo do passo (`sim/listas.js`), para a economia não varrer todos os slots.
- Movimento: campo de fluxo por classe de movimento (infantaria e veículo), com pedágio para veículo atravessar fresta de uma célula e sem mirar em linha reta por ela; prédios, pilhas e faíscas não andam nem empurram.
- Envelope do comando congelado em `VERSAO_COMANDOS` 1 depois do spike S7, com teto de 1.024 unidades por comando (pedido da `rts-rede`); tipos novos continuam entrando com a `VERSAO_SIMULACAO`, hoje 4.
- Ferramentas: `ferramentas/rts/rtx-node.sh` roda um script Node da simulação no PC com a worktree como está; `medir-passo.mjs` (com `--caixa`, a caixa de areia da `rts-design` com cerca de 2.000 unidades, 100 coletores e os prédios), `medir-movimento.mjs` e `espiar-movimento.mjs`.
- Testes: `testes/rts-sim-economia.test.mjs` (coleta, saturação, carga derramada, vento, poste e rede, posicionamento igual no retrato e na simulação, produção, lotação, prédio pronto e Shift, obra erguida no local, fantasmas, salvar e carregar no meio de tudo, e a caixa de areia da `rts-design` jogada só por comandos, e o "sem trapaça" dos fantasmas) e o quarto replay dourado `caixa-economia` (10 minutos da caixa de exemplo com toda a economia).

| Medição | Máquina | Resultado | Fonte |
| --- | --- | --- | --- |
| Replays dourados v4, 4 de 18.000 passos | PC (Node 24) e Mac (Node 22) | finais `5e5cec91`, `61c969f8`, `0b06e9a1` e `0a5abe9c` (protótipo um comandante, dois comandantes, livre três times, caixa-economia), gerados no PC e iguais no Mac; iguais no Chromium, no Firefox e no WebKit dentro de Worker (`rts-determinismo`, 15 de 15, execução `20261031-013406` do PC) | `ferramentas/rts/gerar-replays.mjs`, 31/10/2026 |
| Passo com 2.000 unidades, protótipo, rajadas de 20 ordens | PC, CPU em 10 a 23% por outros processos | p50 2,9 ms, p99 5,0 ms, máximo 11,8 ms; economia 0,004 ms por passo | `medir-passo.mjs`, 31/10/2026 |
| O mesmo com o PC a 33% e um e2e de outra sessão rodando | PC | p99 12,4 ms, máximo 36,8 ms: o máximo depende da carga do PC | idem |
| Passo na caixa de areia com 2.600 entidades, 100 coletores trabalhando, 135 entregas | PC a 33%, com o e2e de outra sessão | p50 2,2 ms, p99 7,1 ms, máximo 29,8 ms (a rajada de 20 ordens no passo 900, em combate e movimento); economia média 0,09 ms e p99 0,35 ms | `medir-passo.mjs --caixa`, 31/10/2026 |
| 20 ordens simultâneas, 6 sementes, com o campo por classe | PC | pior unidade sem avançar: 74, 133, 140, 140, 206 e 256 passos (as mesmas da onda 1); com a regra de fresta diagonal: 82, 124, 454, 140, 206 e 289; com o desvio por densidade: 106, 120, 166, 184, 208 e 243; ficou a fresta ortogonal, sem o desvio | `medir-movimento.mjs`, 31/10/2026 |

E2e da integração no PC (`20261031-014929`): 49 funcionais, 5 de desempenho e 15 de determinismo verdes; os 4 de `testes/e2e/rts-fatia-partida.spec.mjs` (da `rts-qualidade`) pulam com motivo até a Carga inicial, a vitória e a derrota virem dos gatilhos da missão (avaliador da `rts-motor-combate`). Quando voltarem a rodar, o passo "coletores trazem Carga ao escritório" precisa construir o Acumulador antes, porque nos dados da `rts-design` o Escritório Regional não é depósito.

Pendências da F1a: as sementes 42 e 23 das 20 ordens seguem acima de 5 s (206 e 256 passos); a unidade que mais espera fica na saída do grupo, espremida numa quina de rocha com 2 a 4 unidades por célula em volta (`espiar-movimento.mjs 42`), então o próximo passo é escalonar a partida do grupo pela distância ao gargalo, não mais pedágio no campo; o máximo do passo abaixo de 20 ms com o PC sem nenhuma outra carga (o p99 já está abaixo de 10 ms); a Carga inicial da caixa de areia passou para o gatilho de início da missão, que só funciona quando o avaliador da `rts-motor-combate` entrar no passo; o nó de recurso da base da caixa de areia começa fora da visão (16 células do QG, visão 8), então o "nó mais próximo" automático só acha depois de explorar.

### F2 Renderização e 4K (`rts-render`)

- 30/10/2026: `site/rts/dados/projecao.json` v0 (contrato C8), enviado à `rts-arte` na primeira hora: câmera ortográfica a 55° olhando para o norte, 4 m por célula, 64 px por célula no `hd` e 128 no `uhd`, campo de visão de 30 colunas em 16:9 com as linhas fixas para qualquer proporção (colunas presas entre 24 e 40, o que dá exatamente 128 px por célula em 3840×2160 e 64 em 1920×1080), zooms 0,75, 1 e 1,25, sol vindo de 135° a 50° de altura, transformação Standard, exagero da infantaria 1,4 e oito cores de time provisórias; a coerência interna (câmera e sol do Blender batendo com elevação e azimute) é conferida em `testes/rts-render.test.mjs`.
- Renderizador em `site/rts/js/render/`: backend WebGL2 atrás de uma interface estreita (`backend-webgl2.js`, o único arquivo que fala com o GL), projeção com a correção sen(elevação) no terreno e nos sprites (`projecao.js`), canvas em CSS vezes DPR com teto na área de 3840×2160 e reajuste quando o DPR muda (`resolucao.js`), escala dinâmica 100, 85, 75, 67 e 50% com histerese e prova de subida (`escala.js`), todos os sprites da cena num draw só, ordenado de trás para a frente por radix estável, com as páginas em texture arrays (`ordenacao.js`, `sprites.js`), sombra derivada do alfa ao longo do sol, anéis de seleção e barras de vida instanciados (as barras na resolução nativa, depois da ampliação), unidades casadas entre retratos por id com geração (`unidades.js`) e efeitos em pool (`efeitos.js`).
- Leitor do manifesto de sprites (C9) com pontos de encaixe por quadro em `site/rts/js/ativos/manifesto.js`, conferido também contra os dois primeiros manifestos da `rts-arte`; o tanque do protótipo passa pelo mesmo caminho (`ativos/atlas.js`) e os tipos sem arte ganham fichas desenhadas na GPU.
- Visualizador de atlas do portão de estilo em `site/rts/ferramentas/visualizador.html` (sem link): asset, animação, uma direção ou todas num anel, torre, `hd` ou `uhd`, as 8 cores de time, os três zooms do jogo mais 2× e 4× de inspeção, régua de células, âncora e pontos de encaixe, e duas versões lado a lado com os mesmos controles; os parâmetros da URL (`a`, `b`, `anim`, `torre`, `dir`, `modo`, `nivel`, `time`, `zoom`, `sombra`, `chao`) deixam um link para cada comparação.
- Para o portão de estilo, o visualizador lê todas as peças da `rts-arte` (um teste de consumidor em `testes/rts-render.test.mjs` lê cada manifesto do `site/rts/assets/indice.json`, com as páginas no disco e a base de cada animação): sombra derivada do alfa, camada renderizada ou "comparar" (A alfa, B camada), animação da torre (`torre`, `torre-erguida`; as da camada `completo` já trazem a torre), camada `luzes` somada por cima da cor no mesmo draw, chão com o ladrilho `terreno-terra-batida` (o procedural fica de alternativa), todos os nomes de ponto e animações sem laço reiniciando; o render do jogo também lê o passe de sombra e o terreno, com a sombra do alfa como padrão até a decisão (`render.definirModoSombra`).
- Sem aceleração de GPU (SwiftShader, llvmpipe, WARP), a escala dinâmica começa em 50% e sobe por prova; foi o que deixou verde no Action do GitHub o teste de latência da `rts-interface`, que tinha dado 165 ms no servidor sem GPU (run 41146036513, 30/10/2026).
- Costura combinada com a `rts-interface`: `entrada/camera.js` tem `paraMundo`, `paraTela`, `definirZoom` e `pixelsCssPorCelula` sobre a projeção, e a câmera é `{ x, y, zoom }` com o zoom como fator do `projecao.json`.

| Medição | Máquina, navegador e tela | Resultado | Fonte |
| --- | --- | --- | --- |
| Render em 4K, 2.000 unidades, zoom padrão, escala fixa em 100% | MacBook Pro M5 Pro, Chromium 153 headless com Metal, janela 1920×1080 com DPR 2, canvas 3840×2160 | 600 quadros a 60 qps, 0 acima de 20 ms, quadro p99 16,8 ms, CPU do quadro p50/p95/p99 0,1/0,3/0,4 ms, 1.323 sprites na tela em média | `testes/e2e/rts-desempenho.spec.mjs`, e2e da integração de 30/10/2026 |
| Render em 4K, 2.000 unidades, zoom afastado (0,75) | idem | 600 quadros, 0 acima de 20 ms, CPU p95 0,3 ms, 1.508 sprites na tela | idem |
| Escala dinâmica no laço real, com quadros forçados a 28 ms por 3 s | idem | desce 100, 85, 75 e 67% (um degrau a cada 2 s) e volta a 100% por provas aos 9,7 s, 14,9 s e 20,4 s | script com `requestAnimationFrame` ocupado, 30/10/2026 |
| Tempo de GPU pela consulta de tempo (`EXT_disjoint_timer_query_webgl2`) | idem | cerca de 10 ms com 2 ou 2.000 unidades e também com a cena a 50% (1920×1080): na ANGLE sobre Metal o número não acompanha os pixels, então não serve para medir nem para guiar a escala | script de amostragem, 30/10/2026 |
| Alocação por quadro no caminho do render | idem, amostragem do HeapProfiler por 6 s depois de 15 s de partida | antes: cerca de 33 KB por quadro no laço das unidades (números empacotados); depois: o laço some da lista, e o render inteiro fica em poucos KB por segundo, fora do código otimizado; o que mais aloca no quadro é a chegada do retrato do Worker, que é o contrato C2 | script de amostragem, 30/10/2026 |
| Passo da simulação na página: 4K contra 1080p | PC da RTX 4090, Chromium com ANGLE D3D11 na NVIDIA (string da placa conferida), 2.000 unidades, escala fixa | 4K: passo p50/p95 1,7/3,0 ms, 0 de 600 quadros acima de 20 ms, GPU 2,7 ms; 1080p: passo 1,8/3,3 ms, GPU 0,75 ms; o passo não muda com os pixels, então não há disputa com o render (os 22 ms medidos antes eram de antes da soma de verificação passar a uma por segundo); no D3D11 a consulta de tempo de GPU acompanha os pixels, ao contrário do Metal | `scripts/rtx-testes.sh -- --project=desempenho testes/e2e/rts-desempenho.spec.mjs`, execução 20261030-205938 |
| Render em 4K no Safari 26 | MacBook Pro M5 Pro | pendente (Victor): abrir `/rts/?bench=1&res=4k&seg=20&avancar=600` em tela cheia e copiar o JSON que aparece no canto | — |

Onda 2 (E3, fatia cinza), 31/10/2026:

- Relevo (`render/relevo.js`): níveis 0 a 3 do mapa a 4 m por nível (`metrosPorNivel` e `nivelMaximo` no `projecao.json`, C8 v0 com campo novo), encosta suave entre células abertas de níveis diferentes, penhasco de 1/4 de célula onde há célula bloqueada entre níveis (a regra combinada com a `rts-design` para a caixa de areia), região bloqueada subindo ao nível mais alto que toca, água bloqueada no próprio nível e decoração que bloqueia (muro em ruína, carcaça de ônibus) como bloco de 2,5 m. O terreno marcha o raio de cada pixel até o chão só onde há relevo à frente, ilumina encostas e faces, sombreia o que o terreno mais alto esconde do sol e amostra a neblina no ponto atingido (neblina com altura). A câmera leva o relevo, então `paraMundo` e `paraTela` da interface acertam o clique num platô sem mudar nada do lado dela.
- Profundidade: o terreno escreve no buffer de profundidade quão perto da câmera está cada ponto, e sprites, sombras, anéis, efeitos e cabos testam contra ele, então unidade atrás de morro some atrás dele; unidades, barras e anéis ficam na altura do chão.
- Construções (C2 v3 da `rts-motor-economia`): tipos do mapa estático com a arte do índice (C9) ou forma provisória desenhada na GPU pela pegada (prédio, poste, cata-vento, torre, pilha de baterias, soldado, faísca), âncora no centro da pegada, ordem pela borda da frente junto com as unidades, obra subindo do chão com andaime pela máscara do shader, `produzindo`, `danificada` (ou fuligem sem arte) e `luzes` quando energizado, contorno da pegada na seleção, memória cinza dos prédios vistos sob a neblina (`fantasmas` do retrato), fantasma de colocação (`render.definirFantasma`, costura da `rts-interface`) e área de construção sombreada (`render.definirAreaDeConstrucao`).
- Cabos da rede de postes de cada prédio ao seu nó (`ligacao`), com flecha, acesos quando `ENERGIZADO`.
- Terreno por splatting (`render/solos.js`): solo por célula da camada do mapa (C6) com os nomes da tabela `solos`, ladrilho próprio `terreno-<solo>` quando o índice da arte tiver e o `terreno-terra-batida` tingido por solo até lá; `?terreno=procedural` volta ao terreno procedural para comparar.
- Sombra: a recomendação da onda 1 virou o padrão `recomendado` (derivada do alfa nas unidades, camada renderizada nas construções que a têm) até o Victor escolher no portão.
- Bench: `&predios=N` cerca a batalha com prédios de uma partida (escritório da arte, garagens, almoxarifados, torres, postes com cabos, um em cinco em obra); o resultado traz o modo do terreno e o tempo de GPU por quadro (p50 e p95).
- Kit cinza da `rts-arte` (C9), na segunda rodada: os tipos usam o `asset` dos dados como está (o kit tomou esses ids), a pilha e a faísca embutidas da simulação usam `neutro-recurso-pilha-de-baterias` e `neutro-recurso-faisca-de-carga`; a pilha mostra `carga-100` a `carga-25` pelo que resta e `apagada` quando seca, com o `brilho-*` pulsando por cima; a faísca passa por `viva`, `esfriando` e `sumindo`; unidades tocam `rodando` e `atirando` (na camada `torre` quando há), torres de prédio giram a camada `torre`, estruturas neutras mostram `morta` ou `religada`, a paliçada escolhe o quadro pela máscara de vizinhos (N1 L2 S4 O8), as decorações do mapa aparecem nas células exploradas com a variação pela célula (a ponte com a mureta em cada borda) e deixam de ser bloco no relevo quando a arte chega, e a face de penhasco usa o ladrilho `terreno-rocha-face`. As decorações dependem dos nomes `decoracoes` no `pronto`, pedidos à `rts-motor-economia`; sem eles fica o bloco.
- Atlas de fase: página que outro manifesto já subiu (mesma URL) reaproveita a camada (`665bb89`), e `render.estatisticas.bytesTexturas` dá a memória das camadas pela conta do orçamento da arte; o bench com `&kit=<fase>&atlas=0` carrega todo asset de sprite da fase listado no índice para conferir o critério de 20% da memória (o `atlas=0` tira o tanque do protótipo, de página 4096×256). As fichas só são desenhadas para tipos sem arte no índice e no tamanho da página do nível (2048 no `uhd`, 1024 no `hd`), e o índice e cada asset são buscados uma vez (`99ab6e2`).
- Conferido na partida real (`/rts/?partida=caixa-de-areia`, 31/10/2026, depois da economia da `rts-motor-economia`): Escritório Regional da arte, Guinchos, Turmas de Linha e Equipe de Manutenção do kit cinza, decorações com arte (árvore seca, pedras), solos por ladrilho e neblina, sem erro no console.
- Integrações da `rts-render` na onda 2: `312e299`, `c4e6de9` e `d30bfde`, cada uma com o PC verde antes (execuções 20261031-004503, -010543 e -013543) e o Action verde depois (41166799010, 41170054352; o de `d30bfde` é o 41172052153).

| Medição | Máquina, navegador e tela | Resultado | Fonte |
| --- | --- | --- | --- |
| Render da fatia cinza em 4K: 2.000 unidades e 60 prédios (escritório da arte, garagens, almoxarifados, torres, cata-ventos, pilhas, postes com cabos, 12 em obra), terreno com relevo e ladrilhos por solo, zoom padrão, escala fixa em 100% | PC da RTX 4090, Chromium 153 headless com ANGLE D3D11 na NVIDIA (placa conferida pelo executor), janela 1920×1080 com DPR 2, canvas 3840×2160 | 600 quadros a 60 qps, 0 acima de 20 ms (meta: menos de 1%), quadro p99 16,8 ms, CPU do quadro p50/p95/p99 0,3/0,5/0,6 ms, GPU p50/p95 2,41/2,55 ms, 984 sprites na tela; passo da simulação p50/p95 1,8/3,9 ms | `scripts/rtx-testes.sh`, execução 20261031-004503, `testes/e2e/rts-desempenho.spec.mjs` |
| O mesmo, zoom afastado (0,75) | idem | 600 quadros, 0 acima de 20 ms, p99 16,8 ms, GPU p50 2,24 ms, 1.288 sprites na tela | idem |
| O mesmo em 1080p | PC da RTX 4090, DPR 1, canvas 1920×1080 | 600 quadros, 0 acima de 20 ms, GPU p50 0,54 ms | idem |
| Terreno procedural contra ladrilhos por solo, quadro destravado (`--disable-gpu-vsync --disable-frame-rate-limit`), 4K, 2.000 unidades e 60 prédios, escala fixa | PC da RTX 4090, D3D11 | procedural: 1.687 qps, quadro p50/p95 0,4/0,5 ms, GPU p50/p95 1,01/1,04 ms; ladrilhos: 1.933 qps, quadro p50/p95 0,3/0,5 ms, GPU p50/p95 0,55/0,57 ms. Os ladrilhos custam 54% do procedural na GPU, e o caminho dos 120 Hz em 4K segue por eles (ficam como padrão; `?terreno=procedural` volta ao antigo). Com o quadro preso a 60 Hz a GPU fica em relógio baixo, por isso 2,4 ms lá e 0,55 ms aqui; o que vale é a comparação entre os dois | idem |
| Memória de textura com todos os assets da fase 1 do índice de hoje (`/rts/?bench=1&seg=3&kit=fase-1`) | MacBook Pro M5 Pro, navegador do app (Chromium), canvas 2048×1536, `uhd` | 7 assets (as peças do portão listadas em `fase-1`), 1.861 MiB: cada asset ainda traz páginas próprias de até 4096², e toda camada do array fica do tamanho da maior; refazer quando o atlas de fase da `rts-arte` entrar | `site/rts/js/render/medicao.js`, 31/10/2026 |
| Memória de textura do bench em 4K (camadas de sprite RGBA8 + R8 + R8 e ladrilhos de chão, com mipmaps) | idem | 325 MiB no `uhd` e 161 MiB no `hd`: toda camada do texture array tem o tamanho da maior página, e o atlas de 4096×256 do tanque do protótipo e as páginas do escritório puxam as camadas das fichas para o mesmo tamanho; com o atlas de fase da `rts-arte` (páginas de 2048² compartilhadas, camada reaproveitada por URL desde `665bb89`) a conta cai para 32 MiB por camada no `uhd` | idem, `mibTexturas` |

Pendências da F2: a medição no Safari e a referência no Metal do M5 Pro com o relevo e os prédios (Victor, em "Medições que esperam o Mac"); a escolha da sombra é do Victor no portão; entardecer na onda 3; decorações que não bloqueiam (pedra, árvore seca, poste caído, pneus) e a ponte como peça; silhueta de unidade escondida atrás de morro (hoje some inteira); cabos desenhados depois dos sprites passam por cima de unidade na frente deles; os ladrilhos dos outros solos dependem da `rts-arte`.

### F3 Arte e Blender (`rts-arte`)

O Blender 5.2.3 LTS foi instalado no PC da RTX 4090 pelo winget em 30/10/2026, pela sessão que fez o plano, para o teste do pipeline; fica nessa versão durante a fase 1.

- 30/10/2026, onda 0: no PC, `D:\rts\{scripts,config,fonte,saida,cache,logs}` e a trava `D:\rts\trava-gpu` (pasta criada de forma atômica, com arquivo `dono`); `ferramentas/arte/rtx.sh` com `checar`, `enviar`, `renderizar`, `acompanhar`, `buscar`, `reempacotar`, `limpar` e `trava`, que antes de cada lote confere o alcance pelo SSH, o espaço em C: e D:, o tamanho de `D:\rts` (teto de 12 GB) e a VRAM livre (mínimo de 6.000 MiB), lança o lote pelo WMI e deixa o próprio PC soltar a trava; os temporários do Blender vão para `D:\rts\cache`.
- 30/10/2026, onda 0: EEVEE pelo SSH na GPU, lote que sobrevive à queda do SSH e custo por quadro medidos (tabela de medições acima e `arte/blender/MEDICOES.md`); o cerca de 1 s por quadro do teste anterior era o denoiser na CPU, e a fábrica usa 256 amostras sem denoiser (0,056 s por quadro de 256 px, sem tremor entre quadros).
- 30/10/2026, onda 1: fábrica em `arte/blender/` (GPL-3.0-or-later): `comum/compat.py` com o que mudou na API 5.x conferido no 5.2.3 (motor EEVEE, actions com slots, compositor em node group, `media_type` antes do formato, `use_nodes`, `gpu.init()`), leitura do `projecao.json`, câmera ortográfica e luz canônica, passes `cor`, `time`, `normal` e `sombra` por troca de material, pontos de encaixe por direção e quadro, camadas que reusam (`usa`) ou recortam (`recorte`) outras, e o empacotador dentro do próprio Blender (recorte, âncora par, `hd` por redução 2×2 ponderada pela cobertura, MaxRects até 4096, WebP sem bloco de metadados e conferido byte a byte quando sem perda, hash no nome, manifesto C9, procedência e `site/rts/assets/indice.json`).
- 30/10/2026, onda 1: portão de estilo, tudo por script, sem modelagem à mão e sem IA generativa: `religadores-veiculo-cesto-blindado` (32 direções, camadas corpo, torre, torre-erguida e completo, 8 animações, também a 45° e 65° como `-e45` e `-e65`), `religadores-infantaria-turma-de-linha` (esqueleto comum da infantaria e as 4 ações em actions com slots: a prova do personagem 100% por script da D31), `desligados-veiculo-carro-vela` (vela de malha refeita a cada quadro, faixa de time na lona), `religadores-construcao-escritorio-regional` (atividade em laço, porta de enrolar, danificada e camada `luzes` separada), `efeito-explosao-media`, `terreno-terra-batida` (ladrilho de 8 células sem emenda), `interface-retrato-turma-de-linha` e `interface-icone-escritorio-regional`; o tanque do protótipo ficou só como `teste-veiculo-tanque`. Os 32 atlas de direção trazem as 16 direções como uma sim, outra não.
- Números: lote do Cesto de 32 direções com cor, time e sombra em 140 s (90 s de GPU), 74 MB no D:; 5,1 MB de WebP no `uhd` e 1,6 MB no `hd`; todos os assets do portão somam 26 MB no repositório, nenhum arquivo acima de 2 MB.
- 31/10/2026, onda 2 (E3, kit cinza): as 15 unidades e os 19 prédios e estruturas de `site/rts/dados/unidades.json` e `predios.json` em cinza procedural, com os mesmos ids de asset que os dados usam, mais `neutro-recurso-pilha-de-baterias`, `neutro-recurso-faisca-de-carga`, as 7 decorações `neutro-decoracao-*` (3 ou 4 variações cada), os 10 solos `terreno-<solo>` da tabela `solos` (com `terreno-rocha-face`, a face do penhasco vista de frente) e `interface-icones`, um atlas de ícones da grade com as 34 peças; tudo por script, sem modelagem à mão e sem IA, saído de `rtx.sh renderizar <asset>` com código 0. As peças do portão de estilo passaram a ids `-portao` (por exemplo `religadores-veiculo-cesto-blindado-portao` e `-portao-e45`), só na fase `portao`; a renomeação mexeu só em nomes e campos, sem render novo.
- Fábrica da onda 2: corpo-base único da infantaria em `arte/blender/comum/infantaria.py` (o da Turma de Linha, com as ações por função de pose); `comum/cinza.py` com a paleta cinza (cores dos briefs em cinza por luminância, toque frio nos Religadores e quente nos Desligados, máscara de time e brilho da carga mantidos), descrições padrão por categoria, destroço dos veículos, estragos das construções por papel das peças (parede, telhado, alto, detalhe) e enquadramento dos ícones; `comum/solo.py` para os ladrilhos e `comum/decoracao.py` para as decorações; quadros repetidos sem render (`igual`, `quadrosIguais`) e quadros de pixels idênticos num retângulo só. Uso e convenções em `arte/blender/README.md`.
- Animações do kit: infantaria em 16 direções com `parado`, `andando` (6), `atirando` (2, o segundo é o repouso) e `morrendo` (4 quadros em 8 direções); veículos em 16 com `parado`, `rodando` (os mesmos quadros), `atirando` (na camada `torre` quando há torre) e `destruido` (camada `destroco`, 4 direções); construções em 1 direção com `pronta`, `produzindo` (os quadros da pronta), `danificada`, `destruida` e o passe `sombra`; neutras com `morta` e `religada`; torres com a camada `torre` em 16 direções; paliçada com 16 quadros por estado, quadro = máscara de vizinhos (norte 1, leste 2, sul 4, oeste 8); ponto `cabo` nos postes e prédios dos Religadores, `topo` em todos. A obra é a máscara do shader da `rts-render`, sem quadros.
- Atlas de fase: o render dá a cada página uma camada de três texture arrays (cor RGBA8, time R8 e sombra R8, com mipmaps), 32 MiB por página de 2048 no `uhd`, então uma página por asset passaria de 1 GB na fase 1. `rtx.sh empacotar-fase fase-1` junta no PC, sem GPU, os quadros das execuções registradas na procedência em páginas compartilhadas em `site/rts/assets/sprites/fase-1/`, com `fase-1.json` trazendo o orçamento pela mesma conta do backend (camadas × largura × altura × 6 × 4/3); a `rts-render` reaproveita a camada quando a URL da página já foi enviada (seu commit `665bb89`).
- Testes: `testes/rts-arte.test.mjs` cobra o manifesto C9 do lado de quem produz, os metadados das páginas, a procedência (ferramentas com licença permitida, sem IA, script no repositório), o orçamento do atlas de fase (até 256 MiB no `uhd` e 96 MiB no `hd`) e que todo asset nomeado por `site/rts/dados` esteja no índice, na fase 1.

| Medição | Máquina | Resultado | Fonte |
| --- | --- | --- | --- |
| Primeira rodada completa do kit, antes dos cortes | PC da RTX 4090, Blender 5.2.3, OptiX | 32 peças com código 0, 26,6 Mpx de quadros únicos no `uhd` (cerca de 8 camadas, no teto de 256 MiB sem as peças que faltavam) | `rtx.sh renderizar`, 31/10/2026 |
| Cortes no orçamento | idem | destroço dos veículos de 8 para 4 direções, morte da infantaria de 6 para 4 quadros, Cesto apoiado, paliçada danificada e produzindo do Escritório reusando o repouso, paliçada destruída num quadro só, rotor do Cata-vento em 2 quadros; Ponte Basculante e Subestação (cerca de 2 Mpx cada, uma vez no mapa) saem com os quadros do `hd` também no `uhd`, declarados por `pxPorCelula` 64 | idem |
| Atlas de fase 1 | idem | 44 sprites, 2.118 quadros, 1.507 únicos, 24,8 Mpx no `uhd`; 7 camadas no `uhd` (224 MiB de textura, 5,7 MB de download) e 8 no `hd` (64 MiB, 2,0 MB), ocupação de 84%; 67 s no PC, sem GPU | `rtx.sh empacotar-fase fase-1`, execução `20261031-011653` |
| Tempo de render | idem | infantaria de 15 a 17 s por peça (192 quadros com cor e time), veículos de 4 a 16 s, construções de 3 a 9 s, ícones 451 s (as 34 peças montadas numa cena) | idem |
| Solos | idem | 10 ladrilhos de 1024 px (8 células), cada um 4 MiB de textura no `uhd` pela conta do orçamento (5,6 MiB com mipmaps no render) | idem |
| Orçamento da fase 1 pelo `testes/rts-orcamento.test.mjs` (só medido até a E5) | Mac, `npm test` | `uhd`: 271 de 256 MiB de textura (pacote 224, os 11 solos 44, interface 3) e 6,5 de 30 MiB de download; `hd`: 75,8 de 96 MiB e 2,7 de 12 MiB; o retrato da Turma, reempacotado, caiu de 16 MiB (página fixa de 2048) para 1 MiB | 31/10/2026 |
| Testes de ponta a ponta com o kit | PC da RTX 4090, `scripts/rtx-testes.sh rts` | funcionais 17 (4 pulados), desempenho 5, `rts-determinismo` 12, todos verdes | execução `20261031-012434`, commit `1d4853e` |
| Os mesmos depois do merge com a `rts/base` que liga o kit no render | idem | funcionais 17 (4 pulados), desempenho 5, `rts-determinismo` 15, todos verdes | execução `20261031-020757` |

- Leitura que fica para o portão: a 55°, a Ponte Basculante erguida (70°) e a baixada ocupam quase a mesma altura na tela, porque o tabuleiro de 20 m inclinado projeta o mesmo comprimento que deitado para o norte; o que as separa no cinza é o lado de baixo escuro e a sombra longa. Uma elevação maior para o tabuleiro erguido (80° a 85°) ou a elevação da câmera resolvem.

#### Portão de estilo (M2): links e recomendações

Para ver em 4K, numa cópia da `rts/base` que não prende a branch, servida numa porta livre (8830), com a janela em tela cheia num monitor 4K (o `nivel=uhd` força o nível 4K):

```bash
git -C /Users/vhccruz/Dev/salinha worktree add --detach ~/rts-portao rts/base
python3 -m http.server 8830 --directory ~/rts-portao/site
```

- Elevação (45, 55 ou 65): [45° contra 55°](http://localhost:8830/rts/ferramentas/visualizador.html?a=../assets/sprites/veiculo/religadores-veiculo-cesto-blindado-portao-e45.json&b=../assets/sprites/veiculo/religadores-veiculo-cesto-blindado-portao.json&anim=parado&modo=todas&nivel=uhd&zoom=1&time=1&chao=../assets/terreno/terreno-terra-batida.json) e [55° contra 65°](http://localhost:8830/rts/ferramentas/visualizador.html?a=../assets/sprites/veiculo/religadores-veiculo-cesto-blindado-portao.json&b=../assets/sprites/veiculo/religadores-veiculo-cesto-blindado-portao-e65.json&anim=parado&modo=todas&nivel=uhd&zoom=1&time=1&chao=../assets/terreno/terreno-terra-batida.json). Recomendação: 55°. A 45° as peças altas (Cata-vento, Torre Antiga, Holofote de Estrada, chaminé da Ferraria) escondem mais chão atrás de si e a pegada dos prédios encolhe; a 65° os veículos perdem o perfil (lança do Cesto, vela do Carro-Vela) e a infantaria vira só capacete e chapéu. O kit cinza está todo a 55°; mudar a elevação é refazer o kit pelo script, cerca de 25 minutos de PC, sem trabalho manual.
- Direções (16 ou 32): [32 contra 16](http://localhost:8830/rts/ferramentas/visualizador.html?a=../assets/sprites/veiculo/religadores-veiculo-cesto-blindado-portao.json&b=../assets/sprites/veiculo/religadores-veiculo-cesto-blindado.json&anim=parado&modo=uma&nivel=uhd&zoom=1.25&time=1&chao=../assets/terreno/terreno-terra-batida.json), marcando "girar" (A é o Cesto do portão, em 32; B é o cinza, em 16). Recomendação: 16. Com 16 o kit inteiro já usa 7 das 8 camadas que cabem em 256 MiB no `uhd`, e 32 dobraria as unidades; no zoom do jogo a diferença só aparece na inspeção a 2× ou 4×.
- Acabamento: [Turma de Linha do portão contra a cinza](http://localhost:8830/rts/ferramentas/visualizador.html?a=../assets/sprites/infantaria/religadores-infantaria-turma-de-linha-portao.json&b=../assets/sprites/infantaria/religadores-infantaria-turma-de-linha.json&anim=andando&modo=todas&nivel=uhd&zoom=1.25&time=1&chao=../assets/terreno/terreno-terra-batida.json) e [Carro-Vela](http://localhost:8830/rts/ferramentas/visualizador.html?a=../assets/sprites/veiculo/desligados-veiculo-carro-vela-portao.json&b=../assets/sprites/veiculo/desligados-veiculo-carro-vela.json&anim=parado&modo=todas&nivel=uhd&zoom=1&time=3&chao=../assets/terreno/terreno-terra-batida.json). Recomendação: aprovar o acabamento do portão para a arte final da E5 (paleta dos briefs com desgaste procedural, transformação Standard, sem contorno), e jogar o M3 com o cinza.
- Sombra: [Escritório, alfa contra camada](http://localhost:8830/rts/ferramentas/visualizador.html?a=../assets/sprites/construcao/religadores-construcao-escritorio-regional-portao.json&b=../assets/sprites/construcao/religadores-construcao-escritorio-regional-portao.json&anim=pronta&modo=uma&nivel=uhd&zoom=1&sombra=comparar&chao=../assets/terreno/terreno-terra-batida.json) e [Cesto, alfa contra camada](http://localhost:8830/rts/ferramentas/visualizador.html?a=../assets/sprites/veiculo/religadores-veiculo-cesto-blindado-portao.json&b=../assets/sprites/veiculo/religadores-veiculo-cesto-blindado-portao.json&anim=parado&modo=todas&nivel=uhd&zoom=1&sombra=comparar&chao=../assets/terreno/terreno-terra-batida.json). Recomendação: derivada do alfa nas unidades e camada renderizada nas construções, como o kit cinza já está; a camada renderizada das unidades corta na borda do quadro e só ganha de perto.
- Cores de time: [as 8 cores no Cesto](http://localhost:8830/rts/ferramentas/visualizador.html?a=../assets/sprites/veiculo/religadores-veiculo-cesto-blindado-portao.json&anim=parado&modo=todas&nivel=uhd&zoom=1&time=0&chao=../assets/terreno/terreno-terra-batida.json), trocando nos botões de cor.
- Decisão D31 (personagem 100% por script): a prova está feita; a Turma de Linha do portão e toda a infantaria do kit cinza saem do mesmo esqueleto, com as ações por script. Recomendação: aceitar e seguir sem modelagem à mão na fase 1.
- Quando o Victor escolher, a `rts-render` congela a `projecao.json` v1; se mudar a elevação ou as direções, a `rts-arte` refaz o kit (`rtx.sh renderizar` peça por peça e `rtx.sh empacotar-fase fase-1`).

- Memória medida contra a estimada (critério da E3), em 31/10/2026, com `/rts/?bench=1&seg=3&kit=fase-1&res=4k` no navegador do app (Chromium com Metal, MacBook Pro M5 Pro, canvas 3840×2160): 44 assets carregados, `mibTexturas` 634,7 MiB contra 285 estimados (224 do `fase-1.json` mais cerca de 61 dos 11 solos com mipmaps); não passa nos 20% porque `adicionarFichas` e `adicionarFichasPredios` criam páginas de 4096 de largura e o backend dimensiona todas as camadas pela maior, o que dobra cada página de 2048 (e multiplica por 4 a 8 as de 1024 do `hd`), além de 2 ou 3 camadas de fichas e do tanque do protótipo; correção pedida à `rts-render` (página das fichas do tamanho das páginas do nível, ou textura à parte). A medida do `hd` não saiu: o painel do app estava oculto e o bench pausa.
- Pendente: o teste de 5 segundos com 5 pessoas (Victor); a camada `luzes` dos prédios no cinza (só a pilha de baterias tem); retratos da Supervisora e do Locutor; KTX2 (BC7 ou ASTC) antes da arte final, que cortaria a textura por 4 se a E5 apertar.

### F5 Design, mundo e fase 1 (`rts-design`)

Onda 1 aberta em 30/10/2026, só para os briefs.

- 30/10/2026: 34 briefs em [arte/briefs/](../../arte/briefs/README.md) (os 33 do plano e o Poste Avançado, que a missão usa), com formato, convenções de render, máscara de time e checklist de originalidade no README; [faccoes.md](../../arte/briefs/faccoes.md) com as três facções e o bloco de originalidade de facção. Os 4 do portão de estilo (Cesto Blindado, Turma de Linha, Carro-Vela e Escritório Regional) foram mandados à `rts-arte` em 30/10/2026.
- Premissa dos Desligados reescrita como atravessadores e freteiros, sem ideologia contra a tecnologia; o conflito da fase 1 é de mercado (dono da rede contra atravessador). O checklist ganhou o bloco de facção, com a pergunta "a dupla jogador contra inimigo reproduz a dupla de algum jogo conhecido?".
- Trocas aprovadas pelo Victor em 30/10/2026 e já escritas nos briefs: a infantaria básica dos Desligados virou o Chapa (carabina de ar, alcance 4, a tocaia ficou); o batedor de bicicleta virou o Rolimã (carrinho de rolimã com estilingue, os estrepes ficaram); a artilharia que arma e desarma virou o Canhão de Caldeira (morteiro a vapor com apito de aviso). As duas primeiras ficavam perto de unidades de uma facção conhecida; a terceira tinha o nome, a função e a mecânica de uma máquina de cerco de outra série famosa nas versões em português.
- Mudanças de dados que as trocas pedem, para a onda 2: alcance da infantaria básica dos Desligados de 3 para 4 células, sem o bônus de dano de perto; valor da rajada do Cata-vento a definir (o vento virou rajadas anunciadas).
- Pendente da onda 1, passada à onda 2: revisão por alguém que jogou o jogo que inspirou o projeto ("isso te lembra algo específico?"); teste de combinação por alguém que não é fã; teste de 5 segundos no portão (`rts-arte`).

Onda 2 (E3), aberta em 30/10/2026; integrações na `rts/base` em `924e882`, `69c38f5` e nas seguintes.

- C5, dados de jogo em inteiros, no esquema e no validador da `rts-motor-economia` (`compilarDados` passa): `site/rts/dados/unidades.json` (as 15 unidades da fase 1), `predios.json` (8 prédios e o Poste Avançado dos Religadores, 6 dos Desligados, 4 estruturas neutras), `armas.json` (14 armas, matriz do plano, cobertura de ruína 75% de bala e explosivo ignorando cobertura, elevação, veterania com a dos coletores e do suporte), `economia.json` e `pesquisas.json` (Aterramento, Isolamento, Turno Extra e o nível 2 automático do Almoxarifado). Unidades: décimos de célula, ms múltiplos de 100, centésimos de célula por segundo, porcentos. As trocas da onda 1 entraram: Chapa com alcance 4 sem bônus de perto, rajada de 80 C a cada 120 s com 15 s de aviso (40 C por minuto por cata-vento). Teste: `testes/rts-dados.test.mjs` (inteiros, referências, um brief para cada entrada, nomes de asset, modelo de duelo).
- C6, mapa da caixa de areia: 96 × 96, simétrico por rotação de 180°, fonte no formato do Tiled escrita por script (`ferramentas/mapas/gerar-caixa-de-areia.mjs` para `arte/mapas-fonte/caixa-de-areia.tmj`, sem instalar o editor, D16) e convertida por `ferramentas/mapas/converter.mjs` para `site/rts/dados/mapas/caixa-de-areia/`; passa o `lerMapaDeArquivos` da `rts-motor-economia`. Platô de cada base com duas rampas, rio com ponte de 2 células no centro e um vau lento perto de cada base, ruínas e capim alto para tocaia, dois morros e o canto de cada platô com ventosas, cemitério da base de 7.500 C (5 pilhas), ferro-velho de 6.000 C e sucata do meio de 4.500 C, em pares espelhados; Torre Antiga e Holofote de Estrada religáveis; acampamento dos Desligados no platô espelhado; 3 rotas, 12 áreas e 5 pontos para os gatilhos. Teste: `testes/rts-mapas.test.mjs` (fonte e saída refeitas byte a byte, regras do formato, pares espelhados, travessias, modelo de viagem).
- C7, missão `site/rts/dados/missoes/caixa-de-areia.json`, no formato do avaliador da `rts-motor-combate` (`site/rts/js/sim/gatilhos.js`): 6 ondas por gatilho entre 2:45 e cerca de 18 minutos, que crescem de 2 a 15 unidades no Normal (Fácil e Difícil em cada número), cada uma pela ponte ou por um vau, e toda onda de 6 ou mais com aviso de 15 s (20 s nas duas últimas); vitória ao destruir a sexta onda ou o acampamento (Carroção-Mãe, Barracão e Ferraria a Vapor), derrota quando a base cai (sem Escritório Regional, Poste Avançado e Garagem; desde 31/10/2026 a Equipe de Manutenção sai da Garagem, para a grade do QG caber em 8 casas) e o jogador não pode erguer um Poste Avançado: sem Equipe, com menos de 1.000 C ou 90 s depois do aviso no rádio, para a partida sempre terminar (achado da `rts-qualidade` rodando a simulação no PC: uma Equipe escondida segurava a partida sem fim). Teste: `testes/rts-missoes.test.mjs` (referências, aviso de pelo menos 10 s em toda dificuldade, fim definido, linha do tempo).
- C11, `site/rts/dados/textos/pt-BR.json`: 212 textos por id, com todos os do HUD, da tela de fim e das recusas que a `rts-interface` pediu, nome e dica de cada unidade, prédio e pesquisa, e as falas de rádio da caixa de areia.
- C15, registro do kit de teste em `site/rts/js/telemetria/registro.js`: lê os comandos e os retratos na página, sem tocar na simulação nem na rede, e exporta em JSON primeiro tiro, lutas com unidades e mortes por lado, janelas de 15 s sem comando, cemitérios esgotados, coletores perdidos e ataques com o aviso medido; o `conferir-ritmo` da `rts-qualidade` lê o exemplo `testes/rts-registro-exemplo.json` e passa os sete critérios. Teste: `testes/rts-telemetria.test.mjs`.
- Briefs novos para o kit cinza: Pilha de Baterias, Faísca de Carga e Terreno do vale (10 solos e 7 decorações com os nomes das tabelas do mapa); 37 briefs no total.
- Convite e perfil dos testadores (2 da revisão dos briefs, 3 do M3, 3 novatos e 3 veteranos da E4) escritos para o Victor numa nota privada, fora do repositório, porque falam de pessoas; o convite passou no verificador de estilo dele.

| Medição | Resultado | Fonte |
| --- | --- | --- |
| 10 Turmas de Linha contra 10 Chapas, todos ao alcance, tiro espalhado | 10,1 s | modelo de duelo de `testes/rts-dados.test.mjs`, 31/10/2026 |
| 3 Soldadores contra 1 Cesto Blindado | o Cesto cai em 11,8 s, os Soldadores perdem 1 | modelo de duelo, rascunho de 31/10/2026 |
| 2 Rolimãs contra 1 Guincho de Células sem escolta | 22 s | `testes/rts-dados.test.mjs` |
| Cemitério da base esvaziando com 3 guinchos (depósito a pelo menos 5 células, carregar 12 s, descarregar 4 s) | 11,4 min; com o depósito colado nas pilhas e 4 s e 2 s, seriam 6,4 min | modelo de viagem de `testes/rts-mapas.test.mjs` |
| Primeiro tiro previsto da caixa de areia | cerca de 3:10 (onda de 2 Rolimãs aos 2:45, 83 células de rota) | `testes/rts-missoes.test.mjs` |

Pendências da F5 com outras frentes: a `rts-motor-economia` pôr no esquema `distanciaMinimaPilha` (a regra que segura o esgotamento do cemitério nos 10 a 13 minutos) e o bloco `holofote` dos prédios, e os eventos `AVISO_ATAQUE` e `ONDA` no C3, que o registro já lê; a `rts-motor-combate` aceitar os campos `mapa` e `titulo` no topo da missão (a missão já está no formato do `gatilhos.js` dela e compila nas três dificuldades com esses dois campos liberados); a `rts-interface` carregar a missão, o mapa e os dados na página e ligar o registro. O ajuste do ritmo pelos registros reais fica para depois do M3.

Depende do Victor:

- Escolher e chamar as 2 pessoas da revisão dos briefs (uma que jogou o jogo que inspirou o projeto, sem dizer qual antes da pergunta, e uma que não é fã), pelo link https://github.com/flashfabs/flashgames/tree/rts/base/arte/briefs; as respostas entram aqui e no checklist de cada brief.
- Escolher as 3 pessoas do M3 e os 6 testadores da E4; rascunho do convite e perfis na nota `rts-design-recrutamento.md` da pasta de notas das sessões.
- D16: o mapa segue escrito por script até o Tiled ser aprovado; aprovado, a fonte passa a ser editada nele e o teste deixa de exigir o gerador.

#### Busca simples de nomes das facções (30/10/2026)

Busca na web, sem consulta ao INPI, ao USPTO nem ao EUIPO, que fica para a decisão D20 junto com o nome do jogo.

| Nome | Busca | Resultado | Decisão |
| --- | --- | --- | --- |
| Religadores | "Religadores" com jogo, game e marca | nenhum jogo, facção ou marca com esse nome; "religador" é o nome técnico de um equipamento de rede elétrica | mantido |
| Desligados | "Desligados" com facção, jogo, game e faction | nenhuma facção ou jogo com esse nome | mantido |
| nome provisório anterior da terceira facção | o nome com faction, video game, marca e rádio Brasil | coincide com o nome de uma rede de rádio real e muito ouvida no Brasil, e a facção é uma rádio; nenhum uso como facção de jogo | em dúvida: virou o codinome neutro Facção 3 até a D20 |

Nomes de unidade e de construção: busca simples na web em lotes, em 30/10/2026, sem uso encontrado como unidade de jogo para os nomes novos; os termos comuns de dicionário (garagem, poste, torre de vigia, paliçada) passam pela combinação, e os pontos de atenção estão no checklist de cada brief.

### F7 Interface e controles (`rts-interface`)

- 30/10/2026: bateria de teclas e gestos em `prototipos/teclas/index.html` (um arquivo, sem nenhuma requisição), com `testes/e2e/rts-teclas.spec.mjs`; ela entra no roteiro de 15 minutos, e o "Copiar resultado" dela traz uma leitura automática de quais teclas servem em cada navegador.
- 30/10/2026: entrada da E1 ligada à página: seleção por clique, caixa, Shift (soma na caixa, alterna no clique) e duplo clique (todos do tipo na tela); ordem de contexto pelo botão direito, clique com dois dedos ou Control e clique no Mac (ataca o inimigo visível sob o ponteiro, senão move); A, M e R armam atacar-mover, mover e patrulhar para o próximo clique, Shift mantém armado para enfileirar, Esc ou botão direito cancelam; S para, H segura, P pausa; fila com os pontos no chão (`interface/sobreposicao.js`); grupos de 1 a 9; câmera por setas, bordas, botão do meio ou Espaço e arrasto, e dois dedos no trackpad; três zooms (0,75, 1 e 1,25) pela roda, pela pinça (roda com `ctrlKey` e `GestureEvent`) e por + e −; marca no chão, som provisório e latência do clique medida no painel; todo comando tem botão na barra de baixo.
- Decisões provisórias, a confirmar com a bateria no Safari 26, no Chrome do Mac e no Chrome do Windows: P é pausa e patrulha fica no R (no Mac, sem Fn, o F10 tira o som, então ele não serve de pausa); guardar grupo aceita Ctrl e Option/Alt com o número, porque cada sistema pode tomar um deles (abas no Windows, Mesas no Mac); WASD saiu da câmera porque A e S são comandos; a tecla do painel de medição (H) e a da tela cheia (F) saíram, e a tela cheia ficou no botão.
- Medido: clique até a marca no chão com p50 de 22 ms e p95 de 28 ms em 4 cliques, no navegador do app do Claude (Chromium 152) no MacBook Pro M5 Pro, pelo painel do jogo (30/10/2026); o `rts-entrada.spec.mjs` reprova p50 acima de 100 ms onde há GPU; no runner do GitHub, que desenha o WebGL por software (SwiftShader), deu 165 ms de p50 (Action 41144274818), e lá o teste só anota a medida. A medida vai até o fim do quadro que desenha a marca; o navegador ainda leva até uma atualização de tela para mostrar.
- 30/10/2026: a simulação passou a obedecer todas as ordens que a entrada envia (`rts-motor`, `b4f9daf`) e a câmera usa a projeção com elevação (`rts-render`, `39e9798`); os pontos da fila espelham as 8 ordens por unidade da simulação, e o da patrulha fica no chão enquanto ela vai e volta.
- Pendente: calibrar pela bateria a regra que separa a roda do mouse da rolagem do trackpad (hoje: evento isolado com Δy de 40 ou mais é roda; `?roda=zoom` ou `?roda=arrastar` forçam); conferir a pinça por `GestureEvent` no Safari de verdade; aviso na tela quando a ponte pausar por aba oculta; os e2e só rodam no Chromium até a decisão D16; o M1 com o Victor.

### F8 Qualidade e coordenação (`rts-qualidade`)

- 30/10/2026: `rts/base` criada da `main` (`94d4631`); protótipo em `prototipos/rts-4k/` sem as imagens do SDXL e com o cabeçalho SPDX no script do Blender; configuração `prototipo-rts` (porta 8811) no `.claude/launch.json`; `testes/rts-originalidade.test.mjs`; este arquivo e o [frentes.md](frentes.md).
- 30/10/2026: o Action roda em cada push da `rts/base`, com histórico completo e o texto do pull request no teste de originalidade; o primeiro run passou em 5m55s.
- 30/10/2026: página de diagnóstico em `prototipos/diagnostico/` (configuração `diagnostico-rts`, porta 8820), conferida no Chromium, no Firefox e no WebKit; [roteiro de medições](roteiro-medicoes.md) com o caminho do PC testado pelo SSH.
- 30/10/2026: projetos Playwright `rts-determinismo-chromium`, `-firefox` e `-webkit` (`testes/e2e/rts-determinismo.spec.mjs`) com o roteiro do protótipo num Worker, prontos para os replays dourados da `rts-motor` em `testes/rts-replays/` (formato combinado: `executarReplay(replay)` devolve `{ somas, final }`, e o arquivo traz `somas` e `final` esperados); a barreira de lint fica com a `rts-motor` em `testes/rts-sim-barreira.test.mjs`.
- 30/10/2026: primeiro Action com os três motores na `rts/base` (`c51ffb0`) verde em 6,5 minutos: 35 funcionais e `rts-determinismo` no Chromium, no Firefox e no WebKit; Firefox 155 e WebKit 26.6 instalados no Mac (D16).
- 30/10/2026: os 3 replays dourados da `rts-motor` entraram no `rts-determinismo` sem mudança no spec.
- 30/10/2026: executor de testes no PC da RTX 4090 (`scripts/rtx-testes.sh` e `scripts/pc-testes/`), com trava própria `D:\rts\trava-testes`, a trava da GPU nos passos de desempenho, lançamento pelo WMI e conferência da placa; números na seção Testes no PC da RTX 4090.
- 30/10/2026: página de diagnóstico publicada como rascunho na Netlify para os amigos (seção Onde estamos).
- Pendente: as respostas dos amigos pela página, as do roteiro e as medições que esperam o Mac.

Onda 2 (E3), a partir de 30/10/2026:

- Divisão do motor em F1a e F1b, porta 8829, critérios da E3 com dono por linha e a lista do que depende do Victor (`b4ffd05`).
- Gancho de teste `site/rts/js/teste/gancho.js`, carregado pela página só com `?teste=1`: retrato decodificado com o nome de cada tipo e as filas de produção, todos os eventos desde a abertura, comandos como o jogador local, pausa própria e avanço de passos no worker (mensagem `AVANCAR` da F1a, que só vale numa partida começada com `teste`), e o registro C15 (`registro()`); testado em `testes/rts-gancho.test.mjs`.
- Testes de ponta a ponta da fatia: `testes/e2e/rts-fatia.spec.mjs` (a página normal nunca carrega o gancho; com ele, ler, mandar e avançar, também com a aba oculta) e `testes/e2e/rts-fatia-partida.spec.mjs` (caixa de areia: forças iniciais, coletar, construir e pôr, produzir, lutar, derrota e vitória, com o registro lido pelo conferidor).
- Conferidor de ritmo em `ferramentas/rts/ritmo/` (`conferir-ritmo.mjs`, uma partida ou a mediana de várias) sobre o registro C15 da `rts-design`: duração e fim, primeiro tiro, 10 contra 10, janelas de 15 s sem comando, primeiro cemitério esgotado, coletores perdidos, diversão, "jogaria de novo?" e aviso de ataque (E4); passa os nove critérios no `testes/rts-registro-exemplo.json`.
- Testes de manifesto (C9), orçamento (C12, `testes/rts-orcamento.json`) e procedência (C13, `testes/rts-licencas.json` com as licenças permitidas por uso).
- [Kit do M3](kit-m3.md) para o Victor.
- Executor do PC: cada execução anota a espera pela trava (`D:\rts\testes\fila.log`), cada sessão usa a própria cópia do `execucao.ps1`, e o modo `rts` roda só os testes do RTS.

| Medição | Resultado | Fonte |
| --- | --- | --- |
| Orçamento da fase 1 com os assets do portão | textura uhd 676 MiB contra 256 (hd 169 contra 96), download uhd 17,9 MiB contra 30 (hd 6,1 contra 12); o Cesto e as variantes de elevação -e45 e -e65 davam 144 MiB cada no uhd e estavam marcadas para a fase 1 | `testes/rts-orcamento.test.mjs`, começo de 31/10/2026 |
| Orçamento da fase 1 com o kit cinza no atlas de fase | textura uhd 271 MiB contra 256 (atlas 224, solos 44, ícones e retrato 3), hd 75,8 contra 96; download uhd 6,6 MiB (assets 5,8, código e dados 0,7) contra 30, hd 2,8 contra 12 | `testes/rts-orcamento.test.mjs` em `76712e3`, 31/10/2026 |
| Fila do PC com as sessões da onda 2 | uma execução completa segura a trava de 8 a 15 minutos; às 00h35 de 31/10/2026 havia uma rodando e três esperando, com esperas de 5 a 16 minutos | registros das execuções em `D:\rts\testes\*\execucoes`, 31/10/2026 |
| Espera na fila do PC, sem a fila por ordem de chegada | 25 min 47 s de espera para 22 s de teste: duas execuções que chegaram depois passaram na frente (a trava era disputada a cada 15 s); daí a fila por senha | execução `20261031-011951` |
| Modo `rts` do executor | 14 min 15 s no total, dos quais 10 min esperando a trava; funcionais do RTS em 39 s (10 passaram, 6 pularam à espera da caixa de areia), desempenho em 52 s (4 de 4) e determinismo em 2 min 40 s (12 de 12): cerca de 4,5 min de trava contra 8 a 15 do completo | execução `20261031-003610` |

### F9 Rede (`rts-rede`)

- 31/10/2026, spike S7: [protótipo de lockstep](../../prototipos/rts-lockstep/README.md) sobre a sala de `site/js/sala.js`, sem alterá-la. O anfitrião é o relógio e o retransmissor: fecha um turno de 100 ms (3 passos) com os comandos que chegaram, manda o que chegou atrasado para o próximo turno aberto, carimba o passo, recusa comando com jogador falso ou `seq` repetido e manda o pacote a todos pelo canal confiável; cada página roda o turno n só com o pacote n. A cada 30 passos cada membro manda a soma por subsistema, que o anfitrião compara com a sua e usa como aviso de progresso (para de fechar turnos com um membro 5 s atrás). Mensagem de 16.000 bytes ou mais vai em fatias.
- O rascunho do C16 (mensagens `inicio`, `pronto`, `cmd`, `turno`, `soma`, `dessinc` e `fatia`, com `VERSAO_LOCKSTEP` 1) e a conferência do envelope do C1 estão no README do protótipo. A rede confere o envelope, não os tipos: tipo novo atravessa sem mudar o protocolo e todas as simulações descartam igual o que não conhecem.
- Testes: `testes/rts-lockstep.test.mjs` no `npm test` (envelope, fatias, regras do anfitrião, 400 turnos em memória com anfitrião e 3 membros em links com atraso aleatório e uma dessincronia de propósito achada pelo subsistema) e a rodada entre motores `prototipos/rts-lockstep/lockstep.spec.mjs`, fora da suíte, com configuração própria.
- Envelope: mandado à `rts-motor-economia` em 31/10/2026 que o C1 pode congelar em `VERSAO_COMANDOS` 1, com um teto de 1.024 unidades por comando no `comandoValido` antes (hoje ele aceita até 65.536, cerca de 720 KB de JSON num comando); tipos novos sobem a `VERSAO_SIMULACAO`, não a de comandos.

| Medição | Máquina e navegadores | Resultado | Fonte |
| --- | --- | --- | --- |
| 10 minutos de jogo com 4 páginas, 1.000 unidades, robô a 3 comandos/s por página com rajadas de 3 comandos de 1.024 unidades, atraso artificial de 60 a 100 ms com 1% de soluços de 250 ms, atraso de entrada de 2 turnos | PC da RTX 4090: Chromium 153 (anfitrião), Firefox 155, Chromium 153, Firefox 155 | 6.044 turnos, 1.812 somas comparadas, 0 dessincronias, as 604 somas comuns às 4 páginas iguais; 7.426 comandos, 0 recusados; 3.757 dos 5.605 dos membros (67%) chegaram depois de o turno pedido fechar e rodaram no seguinte | execução `20261031-001806`, `-g inteiro` |
| Bytes por turno, do anfitrião para cada membro | idem | turno vazio 29; mediana 126, p95 443, máximo 46.823 (fatiado); média 459 bytes, 4,6 KB/s por membro com as rajadas; 69 turnos fatiados; maior mensagem 15.660 bytes | idem |
| Bytes de cada membro para o anfitrião | idem | comando com mediana de 117 bytes por envio, soma de 101 bytes por segundo, cerca de 1,2 KB/s com as rajadas | idem |
| Latência do comando, de emitir até rodar | idem | anfitrião mediana 159 ms, p95 162; membros mediana 218 a 219 ms, p95 285 a 294, máximo 540 | idem |
| Turno no Worker (3 passos com 1.000 unidades) | idem | mediana de 4 a 5 ms, p95 de 8 a 10, máximo 28 | idem |
| 1 minuto, Chromium e WebKit | Mac, Chromium 153 e WebKit 26.6 do Playwright | 63 somas comparadas, 0 dessincronias, 4 turnos fatiados; latência do membro WebKit com mediana 219 ms e p95 313 | `-g curto` no Mac |
| WebKit no Windows | PC, WebKit 26.6 do Playwright | sem `RTCPeerConnection`: fica de fora no PC | idem |

Pendências da F9: o Safari de verdade (Victor, em "Medições que esperam o Mac"); rede de verdade entre máquinas; e, na E8, atraso de entrada adaptativo, relatório de dessincronia, reconexão por estado em pedaços, regra de queda (D26), sucessão do anfitrião e uma mensagem de turno no Worker do jogo.

### F4 e F6

A F4 e a F6 abrem na onda 3.
