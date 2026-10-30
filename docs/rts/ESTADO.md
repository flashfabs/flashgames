# Estado do RTS

Estado vivo do RTS original da Salinha: o que cada frente fez, o que foi medido e os critérios de cada etapa, com número e fonte.
Quem divide o trabalho e como integrar está em [frentes.md](frentes.md); o plano completo, com a pesquisa, fica fora do repositório, na base de conhecimento privada do Victor.
Cada sessão atualiza a sua seção no fim da onda; a `rts-qualidade` mantém as medições e os critérios.

Mundo provisório: Apagão. Uma tempestade solar queimou a rede elétrica e a carga guardada em baterias velhas virou o recurso; os Religadores (jogador) enfrentam os Desligados (atravessadores e freteiros), e a terceira facção (codinome Facção 3, a comunidade da emissora) entra depois.

## Onde estamos

- Etapa: E0 (pré-produção e higiene) junto com a onda 1 (E1 motor de produção e E2 fábrica de arte), por pedido do Victor em 30/10/2026.
- Integração: branch `rts/base`, criada em 30/10/2026 a partir da `main` em `94d4631`; nada do RTS foi para a `main` nem para a Netlify.
- Guarda da produção, 30/10/2026: `salinha-jogos.netlify.app/versao.json` em `45b1664`, `/rts/` responde 404 e a `rts/base` não tem deploy de branch na Netlify.
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
| Determinismo dentro do Worker, mesmo roteiro | Chromium 153 (Playwright 1.63), Firefox 153 e WebKit 26.5 (playwright-core 1.62.1) | soma final `897f4ba5` e as seis somas iguais à referência nos três; 1,50, 2,81 e 1,36 ms por passo | `prototipos/diagnostico/` e `testes/e2e/rts-determinismo.spec.mjs`, 30/10/2026 |
| Bench 4K pela página de diagnóstico, 2.000 unidades | MacBook Pro M5 Pro: Chromium 153 com Metal, Firefox 153, WebKit 26.5 (Playwright) | Chromium 60 qps, p99 16,8 ms, 0 de 600 quadros acima de 20 ms; Firefox 110,5 qps, p99 18,1 ms, 4 de 1.105; WebKit 59,9 qps, p99 20 ms, 3 de 600 | `prototipos/diagnostico/`, 30/10/2026 |
| Safari 26 de verdade: bench em 4K | MacBook Pro M5 Pro | pendente (Victor, [roteiro](roteiro-medicoes.md)) | — |
| Safari 26 de verdade: soma no Worker | MacBook Pro M5 Pro | pendente (Victor, roteiro) | — |
| Chrome e Edge no Windows: bench em 4K, soma e a string da placa | PC da RTX 4090, com o Victor no PC (pelo SSH os navegadores podem rodar sem GPU) | pendente (Victor, roteiro); servir as páginas em localhost pelo Python do Blender foi testado pelo SSH em 30/10/2026 | — |
| Firefox no Windows | PC da RTX 4090 | não deu: o Firefox não está instalado no PC (conferido em 30/10/2026), e instalar depende do Victor | — |
| Notebook comum com GPU integrada | máquina de um amigo | pendente (página de diagnóstico) | — |
| Extensões de textura e MAX_TEXTURE_SIZE | MacBook Pro M5 Pro, Playwright | Chromium 153 (ANGLE Metal, Apple M5 Pro): S3TC, RGTC, BPTC (BC7), ETC2, ASTC e PVRTC, 16384; Firefox 153 ("Apple M1, or similar"): só S3TC e RGTC, 8192; WebKit 26.5: todas, 16384 | `prototipos/diagnostico/`, 30/10/2026 |
| Extensões de textura | Safari 26, Chrome e Edge do Windows, notebook comum | pendente ([roteiro](roteiro-medicoes.md) e página de diagnóstico) | — |
| `decodeAudioData` de Opus em Ogg e de AAC em MP4 | Playwright no Mac | Opus decodifica no Chromium 153, no Firefox 153 e no WebKit 26.5; AAC decodifica no Chromium e no Firefox e falha no WebKit do Playwright, que vem sem os codecs proprietários (não vale pelo Safari) | `prototipos/diagnostico/`, 30/10/2026 |
| `decodeAudioData` de Opus e de AAC | Safari 26 | pendente (Victor, roteiro) | — |
| Bateria de teclas (Ctrl, Option e Shift com 1 a 9, Ctrl e clique, dois dedos, pinça, Espaço, setas, F10, P, atalhos de Mesa do Mission Control) | Safari e Chrome do Mac, Chrome do Windows | pendente (Victor, `prototipos/teclas/` da `rts-interface` pelo roteiro) | — |
| EEVEE pelo SSH na GPU | PC da RTX 4090 | usa a NVIDIA: `gpu.platform` depois de `gpu.init()` deu OPENGL, "NVIDIA GeForce RTX 4090/PCIe/SSE2", "4.6.0 NVIDIA 591.86"; o `nvidia-smi` listou o `blender.exe` a 50%; 266 quadros de 256 px em 25 s (94 ms por quadro) | `rts-arte`, 30/10/2026 |
| `ferramentas/arte/rtx.sh renderizar teste-veiculo-tanque` com trava, código 0 e `relatorio.json` | Mac para o PC da RTX 4090 | código 0; checagem antes do lote com C: 23,1 GB, D: 58,7 GB e 22.924 MiB de VRAM livres; trava pega e solta; OPTIX; 192 renders em 6,95 s, empacotar 2,6 s, lote de 10,4 s; atlas, manifesto, procedência e `indice.json` no repositório | `rts-arte`, 30/10/2026 |
| Lote longo com o SSH derrubado de propósito | PC da RTX 4090 | sobrevive: com o cliente morto aos 25 s de um lote de 192 quadros, o Blender terminou sozinho; como o `Start-Process` morre quando a sessão SSH termina normalmente, o `rtx.sh` lança o lote pelo WMI (`Win32_Process.Create`) e o próprio PC solta a trava, sem `schtasks`. Queda de rede sem FIN não foi testada (exigiria derrubar o Tailscale) | `rts-arte`, 30/10/2026 |
| Tamanho do git (`git count-objects -vH`) | clone oficial | 18,89 MiB soltos e 5,44 MiB empacotados antes do protótipo; 23,98 MiB soltos e 5,44 MiB empacotados com o protótipo e o passo zero (os atlas do protótipo e de `site/rts/assets/prototipo/` são os mesmos objetos) | 30/10/2026 |

Navegadores do Playwright: o 1.63 do projeto pede Firefox 155 e WebKit 26.6, que não estão no cache desta máquina; o Firefox 153 e o WebKit 26.5 do playwright-core 1.62.1 serviram para as medições de 30/10/2026.
Sem eles, `npm run e2e` pula os projetos `rts-determinismo-firefox` e `rts-determinismo-webkit` com um aviso; no Action eles são instalados e rodam.
Instalar no Mac (`npx playwright install firefox webkit`) depende de aprovação do Victor (decisão D16).

## Critérios por etapa

Cada critério tem o número que conta e de onde ele vem; "plano" é a seção Etapas do plano privado.

### E0. Pré-produção e higiene

| Critério | Meta | Estado |
| --- | --- | --- |
| Teste de originalidade no `npm test` e verde | 0 achados em arquivos, metadados, commits, refs e texto do pull request | verde em 30/10/2026 (`testes/rts-originalidade.test.mjs`, 6 testes) |
| A branch antiga nunca foi ao GitHub | 0 refs com termo proibido em `git ls-remote origin` | 0 de 13 em 30/10/2026 |
| `npm test` e `npm run e2e` verdes na `rts/base`, sem mexer no Pavio nem no Farm | tudo verde | verde em 30/10/2026 na primeira integração: `npm test` 182 de 182; e2e com 32 funcionais (2 pulados por condição do próprio teste) e 2 de desempenho |
| Tabela de medições preenchida | toda linha com número ou "não deu, motivo" | em andamento |
| `rtx.sh` confere espaço em C: e D:, VRAM livre e alcance antes de cada lote | código 0 e `relatorio.json` | feito em 30/10/2026 (`rts-arte`; números na tabela de medições) |
| EEVEE pelo SSH na GPU | log com a NVIDIA; senão, flipbooks no Cycles | feito em 30/10/2026: NVIDIA GeForce RTX 4090 no `gpu.platform` (`rts-arte`) |
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
| Render em 4K com 2.000 unidades, Chrome e Safari | menos de 1% dos quadros acima de 20 ms, CPU por quadro medida e a tela dita | Chromium com Metal: 0 de 600 quadros acima de 20 ms, CPU do quadro p95 0,3 ms, canvas 3840×2160 (seção F2); Safari pendente (Victor) |
| Clique até a marca no chão | abaixo de 100 ms | pendente |

### E2. Fábrica de arte e portão de estilo (plano, E2)

| Critério | Meta | Estado |
| --- | --- | --- |
| `rtx.sh renderizar <asset>` | atlas, manifesto e procedência sem passo manual, testes verdes | pendente |
| Veículo de 32 direções com todos os passes | até 10 minutos de GPU e até 1 GB de disco | medido em 30/10/2026 pela `rts-arte`: Cesto Blindado com cor, time, normal e sombra, 1.920 renders em 129 s de GPU e 222 s de lote, 123 MB no D:; sem o denoiser na CPU, 0,03 a 0,06 s por quadro de 256 px |
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

## Roteiro para o Victor

O [roteiro de medições](roteiro-medicoes.md) cobre o Safari 26, o Chrome e o Edge no PC da RTX 4090 e a bateria de teclas: cerca de 15 minutos no Mac e 10 no PC. As respostas entram na tabela de medições acima.

## Frentes

### F1 Motor e simulação (`rts-motor`)

Onda 1 aberta em 30/10/2026; nada integrado ainda.

### F2 Renderização e 4K (`rts-render`)

- 30/10/2026: `site/rts/dados/projecao.json` v0 (contrato C8), enviado à `rts-arte` na primeira hora: câmera ortográfica a 55° olhando para o norte, 4 m por célula, 64 px por célula no `hd` e 128 no `uhd`, campo de visão de 30 colunas em 16:9 com as linhas fixas para qualquer proporção (colunas presas entre 24 e 40, o que dá exatamente 128 px por célula em 3840×2160 e 64 em 1920×1080), zooms 0,75, 1 e 1,25, sol vindo de 135° a 50° de altura, transformação Standard, exagero da infantaria 1,4 e oito cores de time provisórias; a coerência interna (câmera e sol do Blender batendo com elevação e azimute) é conferida em `testes/rts-render.test.mjs`.
- Renderizador em `site/rts/js/render/`: backend WebGL2 atrás de uma interface estreita (`backend-webgl2.js`, o único arquivo que fala com o GL), projeção com a correção sen(elevação) no terreno e nos sprites (`projecao.js`), canvas em CSS vezes DPR com teto na área de 3840×2160 e reajuste quando o DPR muda (`resolucao.js`), escala dinâmica 100, 85, 75, 67 e 50% com histerese e prova de subida (`escala.js`), todos os sprites da cena num draw só, ordenado de trás para a frente por radix estável, com as páginas em texture arrays (`ordenacao.js`, `sprites.js`), sombra derivada do alfa ao longo do sol, anéis de seleção e barras de vida instanciados (as barras na resolução nativa, depois da ampliação), unidades casadas entre retratos por id com geração (`unidades.js`) e efeitos em pool (`efeitos.js`).
- Leitor do manifesto de sprites (C9) com pontos de encaixe por quadro em `site/rts/js/ativos/manifesto.js`, conferido também contra os dois primeiros manifestos da `rts-arte`; o tanque do protótipo passa pelo mesmo caminho (`ativos/atlas.js`) e os tipos sem arte ganham fichas desenhadas na GPU.
- Visualizador de atlas do portão de estilo em `site/rts/ferramentas/visualizador.html` (sem link): asset, animação, uma direção ou todas num anel, torre, `hd` ou `uhd`, as 8 cores de time, os três zooms do jogo mais 2× e 4× de inspeção, régua de células, âncora e pontos de encaixe, e duas versões lado a lado com os mesmos controles; os parâmetros da URL (`a`, `b`, `anim`, `dir`, `modo`, `nivel`, `time`, `zoom`) deixam um link para cada comparação.
- Costura combinada com a `rts-interface`: `entrada/camera.js` tem `paraMundo`, `paraTela`, `definirZoom` e `pixelsCssPorCelula` sobre a projeção, e a câmera é `{ x, y, zoom }` com o zoom como fator do `projecao.json`.

| Medição | Máquina, navegador e tela | Resultado | Fonte |
| --- | --- | --- | --- |
| Render em 4K, 2.000 unidades, zoom padrão, escala fixa em 100% | MacBook Pro M5 Pro, Chromium 153 headless com Metal, janela 1920×1080 com DPR 2, canvas 3840×2160 | 600 quadros a 60 qps, 0 acima de 20 ms, quadro p99 16,8 ms, CPU do quadro p50/p95/p99 0,1/0,3/0,4 ms, 1.323 sprites na tela em média, GPU cerca de 10 ms pela consulta de tempo | `testes/e2e/rts-desempenho.spec.mjs`, e2e da integração de 30/10/2026 |
| Render em 4K, 2.000 unidades, zoom afastado (0,75) | idem | 600 quadros, 0 acima de 20 ms, CPU p95 0,3 ms, 1.508 sprites na tela, GPU cerca de 13 ms | idem |
| Alocação por quadro no caminho do render | idem, amostragem do HeapProfiler por 6 s depois de 15 s de partida | antes: cerca de 33 KB por quadro no laço das unidades (números empacotados); depois: o laço some da lista, e o render inteiro fica em poucos KB por segundo, fora do código otimizado; o que mais aloca no quadro é a chegada do retrato do Worker, que é o contrato C2 | script de amostragem, 30/10/2026 |
| Render em 4K no Safari 26 | MacBook Pro M5 Pro | pendente (Victor): abrir `/rts/?bench=1&res=4k&seg=20&avancar=600` em tela cheia e copiar o JSON que aparece no canto | — |

Pendências da F2: a medição no Safari (Victor); a sombra (camada renderizada ou alfa) e os pontos de encaixe reais entram com o portão de estilo, e a próxima integração lê o passe de sombra da `rts-arte`; níveis de altura, penhascos, construções com pegada, cabos, neblina com altura e entardecer ficam para a próxima `rts-render` (ondas 2 e 3); o tempo de GPU em 4K (10 a 13 ms) deixa pouca folga para 120 Hz, e o terreno procedural em tela cheia é o primeiro suspeito, a confirmar antes do splatting da onda 2.

### F3 Arte e Blender (`rts-arte`)

Onda 1 aberta em 30/10/2026; nada integrado ainda.
O Blender 5.2.3 LTS foi instalado no PC da RTX 4090 pelo winget em 30/10/2026, pela sessão que fez o plano, para o teste do pipeline; fica nessa versão durante a fase 1.

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

Onda 1 aberta em 30/10/2026; nada integrado ainda.

### F8 Qualidade e coordenação (`rts-qualidade`)

- 30/10/2026: `rts/base` criada da `main` (`94d4631`); protótipo em `prototipos/rts-4k/` sem as imagens do SDXL e com o cabeçalho SPDX no script do Blender; configuração `prototipo-rts` (porta 8811) no `.claude/launch.json`; `testes/rts-originalidade.test.mjs`; este arquivo e o [frentes.md](frentes.md).
- 30/10/2026: o Action roda em cada push da `rts/base`, com histórico completo e o texto do pull request no teste de originalidade; o primeiro run passou em 5m55s.
- 30/10/2026: página de diagnóstico em `prototipos/diagnostico/` (configuração `diagnostico-rts`, porta 8820), conferida no Chromium, no Firefox e no WebKit; [roteiro de medições](roteiro-medicoes.md) com o caminho do PC testado pelo SSH.
- 30/10/2026: projetos Playwright `rts-determinismo-chromium`, `-firefox` e `-webkit` (`testes/e2e/rts-determinismo.spec.mjs`) com o roteiro do protótipo num Worker, prontos para os replays dourados da `rts-motor` em `testes/rts-replays/` (formato combinado: `executarReplay(replay)` devolve `{ somas, final }`, e o arquivo traz `somas` e `final` esperados); a barreira de lint fica com a `rts-motor` em `testes/rts-sim-barreira.test.mjs`.
- Pendente: Firefox e WebKit do Playwright 1.63 no Mac (decisão D16), endereço para a página de diagnóstico chegar aos amigos, as respostas do roteiro, os replays dourados no `rts-determinismo`.

### F4, F6 e F9

Abrem nas ondas 3 (F4 e F6) e 2 (F9, spike curto).
