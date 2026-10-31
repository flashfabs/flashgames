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
| Memória de textura | estimada dentro de 20% da medida no navegador | pendente |
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
| Testes de regra: carga derramada, saturação, vento, poste, lotação | verdes no `npm test` | `rts-motor-economia` | pendente |
| Testes de regra: matriz de dano, veterania, pesquisas, religar e gatilhos | verdes no `npm test` | `rts-motor-combate` | pendente |
| Fatia cinza de ponta a ponta | começar, coletar, construir, produzir, lutar, vitória e derrota verdes no `rts/base` com o gancho `window.__rts` (`?teste=1`) | `rts-qualidade` | pendente |
| Spike de lockstep | 10 minutos sem dessincronia entre Chrome e Firefox, mensagens abaixo de 16.000 bytes | `rts-rede` | feito em 31/10/2026: 10 minutos de jogo no PC com 4 páginas (Chromium 153 e Firefox 155, duas de cada), atraso artificial ligado, 1.812 somas por subsistema comparadas e 0 dessincronias, maior mensagem de 15.660 bytes, turnos acima de 16.000 fatiados (seção F9); WebKit 26.6 do Playwright só no Mac, 1 minuto sem dessincronia; Safari de verdade com o Victor |
| Formato de comando congelado | `VERSAO_COMANDOS` 1 depois do spike | `rts-motor-economia`, depois da `rts-rede` | pendente |
| Briefs | 33 aprovados no checklist de originalidade, sem lembrança específica de outro jogo na revisão | `rts-design`; a revisão por quem jogou o jogo que inspirou o projeto depende do Victor achar a pessoa | pendente |
| Kit cinza | todas as unidades e construções da fase 1 em cinza procedural, com manifesto e procedência | `rts-arte` | pendente |
| HUD da fatia | recursos, lotação, construção e produção com fila e grade, minimapa com alertas, coletor ocioso | `rts-interface` | pendente |
| Render da fatia | construções com pegada, cabos e o que a caixa de areia pede | `rts-render` | pendente |
| Manifesto, orçamento e procedência | testes verdes, com a lista de licenças permitidas | `rts-qualidade` | pendente |
| Tamanho do git | `git count-objects -vH` no fim da etapa | `rts-qualidade` | pendente |
| Som provisório | sintetizado e respostas gravadas pelo grupo | sem sessão na onda 2 (a `rts-som` abre na onda 3); a decisão de adiantar ou seguir sem som no M3 é do Victor | pendente |

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

Pendências da F1: as 20 ordens simultâneas em mapas com passagens de 1 célula e corredores diagonais estreitos (próximo passo: campo por classe de movimento com folga, para veículo não entrar em fresta, e custo por congestionamento); a medida limpa do passo no M5 Pro e o Safari de verdade (Victor); `VERSAO_COMANDOS` só congela depois do spike S7 da `rts-rede`; os fantasmas de prédios na `vistaDoTime` entram com as construções; os números de unidades saem de `DADOS_PROTOTIPO` quando a `rts-design` entregar os dados.
Na onda 2: economia, construção, produção, lotação, combate com a matriz, veterania, pesquisas, religar estruturas e o avaliador de gatilhos.

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

Pendências da F2: a medição no Safari (Victor); a escolha da sombra é do Victor no portão (a camada renderizada dos veículos sai cortada na borda do quadro de 256 px, e a `rts-arte` aumenta o quadro de quem precisar se ela for a escolhida); níveis de altura, penhascos, construções com pegada, cabos, neblina com altura e entardecer ficam para a próxima `rts-render` (ondas 2 e 3); o custo de GPU por passe ainda não tem medida confiável no Mac (a consulta de tempo da ANGLE não acompanha os pixels), e para 120 Hz em 4K vale medir o terreno procedural contra o splatting da onda 2 por tempo de quadro, com a escala fixa.

### F3 Arte e Blender (`rts-arte`)

O Blender 5.2.3 LTS foi instalado no PC da RTX 4090 pelo winget em 30/10/2026, pela sessão que fez o plano, para o teste do pipeline; fica nessa versão durante a fase 1.

- 30/10/2026, onda 0: no PC, `D:\rts\{scripts,config,fonte,saida,cache,logs}` e a trava `D:\rts\trava-gpu` (pasta criada de forma atômica, com arquivo `dono`); `ferramentas/arte/rtx.sh` com `checar`, `enviar`, `renderizar`, `acompanhar`, `buscar`, `reempacotar`, `limpar` e `trava`, que antes de cada lote confere o alcance pelo SSH, o espaço em C: e D:, o tamanho de `D:\rts` (teto de 12 GB) e a VRAM livre (mínimo de 6.000 MiB), lança o lote pelo WMI e deixa o próprio PC soltar a trava; os temporários do Blender vão para `D:\rts\cache`.
- 30/10/2026, onda 0: EEVEE pelo SSH na GPU, lote que sobrevive à queda do SSH e custo por quadro medidos (tabela de medições acima e `arte/blender/MEDICOES.md`); o cerca de 1 s por quadro do teste anterior era o denoiser na CPU, e a fábrica usa 256 amostras sem denoiser (0,056 s por quadro de 256 px, sem tremor entre quadros).
- 30/10/2026, onda 1: fábrica em `arte/blender/` (GPL-3.0-or-later): `comum/compat.py` com o que mudou na API 5.x conferido no 5.2.3 (motor EEVEE, actions com slots, compositor em node group, `media_type` antes do formato, `use_nodes`, `gpu.init()`), leitura do `projecao.json`, câmera ortográfica e luz canônica, passes `cor`, `time`, `normal` e `sombra` por troca de material, pontos de encaixe por direção e quadro, camadas que reusam (`usa`) ou recortam (`recorte`) outras, e o empacotador dentro do próprio Blender (recorte, âncora par, `hd` por redução 2×2 ponderada pela cobertura, MaxRects até 4096, WebP sem bloco de metadados e conferido byte a byte quando sem perda, hash no nome, manifesto C9, procedência e `site/rts/assets/indice.json`).
- 30/10/2026, onda 1: portão de estilo, tudo por script, sem modelagem à mão e sem IA generativa: `religadores-veiculo-cesto-blindado` (32 direções, camadas corpo, torre, torre-erguida e completo, 8 animações, também a 45° e 65° como `-e45` e `-e65`), `religadores-infantaria-turma-de-linha` (esqueleto comum da infantaria e as 4 ações em actions com slots: a prova do personagem 100% por script da D31), `desligados-veiculo-carro-vela` (vela de malha refeita a cada quadro, faixa de time na lona), `religadores-construcao-escritorio-regional` (atividade em laço, porta de enrolar, danificada e camada `luzes` separada), `efeito-explosao-media`, `terreno-terra-batida` (ladrilho de 8 células sem emenda), `interface-retrato-turma-de-linha` e `interface-icone-escritorio-regional`; o tanque do protótipo ficou só como `teste-veiculo-tanque`. Os 32 atlas de direção trazem as 16 direções como uma sim, outra não.
- Números: lote do Cesto de 32 direções com cor, time e sombra em 140 s (90 s de GPU), 74 MB no D:; 5,1 MB de WebP no `uhd` e 1,6 MB no `hd`; todos os assets do portão somam 26 MB no repositório, nenhum arquivo acima de 2 MB.
- Pendente para o M2 (Victor, no visualizador da `rts-render`): elevação (45, 55 ou 65), 16 ou 32 direções, acabamento e a sombra; a sombra renderizada sai mais bonita, mas corta na borda do quadro e pesa 1 byte por pixel, e a recomendação é sombra derivada do alfa nas unidades e camada renderizada só nas construções, com quadro maior.
- Pendente: o Cesto com 32 direções e todas as animações estima cerca de 150 MB de textura no `uhd` (páginas inteiras), acima do que cabe no orçamento de 256 MB da fase toda; as alavancas são 16 direções, menos quadros na transição e página menor; o teste de 5 segundos com 5 pessoas; destruído, carcaça, abalroar, construindo e o busto falante ficam para o kit da onda 2.

### F5 Design, mundo e fase 1 (`rts-design`)

Onda 1 aberta em 30/10/2026, só para os briefs.

- 30/10/2026: 34 briefs em [arte/briefs/](../../arte/briefs/README.md) (os 33 do plano e o Poste Avançado, que a missão usa), com formato, convenções de render, máscara de time e checklist de originalidade no README; [faccoes.md](../../arte/briefs/faccoes.md) com as três facções e o bloco de originalidade de facção. Os 4 do portão de estilo (Cesto Blindado, Turma de Linha, Carro-Vela e Escritório Regional) foram mandados à `rts-arte` em 30/10/2026.
- Premissa dos Desligados reescrita como atravessadores e freteiros, sem ideologia contra a tecnologia; o conflito da fase 1 é de mercado (dono da rede contra atravessador). O checklist ganhou o bloco de facção, com a pergunta "a dupla jogador contra inimigo reproduz a dupla de algum jogo conhecido?".
- Trocas aprovadas pelo Victor em 30/10/2026 e já escritas nos briefs: a infantaria básica dos Desligados virou o Chapa (carabina de ar, alcance 4, a tocaia ficou); o batedor de bicicleta virou o Rolimã (carrinho de rolimã com estilingue, os estrepes ficaram); a artilharia que arma e desarma virou o Canhão de Caldeira (morteiro a vapor com apito de aviso). As duas primeiras ficavam perto de unidades de uma facção conhecida; a terceira tinha o nome, a função e a mecânica de uma máquina de cerco de outra série famosa nas versões em português.
- Mudanças de dados que as trocas pedem, para a onda 2: alcance da infantaria básica dos Desligados de 3 para 4 células, sem o bônus de dano de perto; valor da rajada do Cata-vento a definir (o vento virou rajadas anunciadas).
- Pendente: revisão por alguém que jogou o jogo que inspirou o projeto ("isso te lembra algo específico?"); teste de combinação por alguém que não é fã; teste de 5 segundos no portão (`rts-arte`); briefs dos nós de recurso, do terreno e dos retratos.

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
