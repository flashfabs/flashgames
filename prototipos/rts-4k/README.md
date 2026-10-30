# Protótipo RTS 4K

Protótipo técnico de 30/10/2026 para validar as apostas do RTS original no navegador: renderização em 4K com milhares de unidades, simulação determinística entre motores JavaScript e sprites pré-renderizados no Blender da RTX 4090. Fica fora de `site/`, então não vai para o ar.

## Arquivos

- `simulacao.js`: simulação pura e determinística, só com inteiros (1 célula = 1.024 unidades de mundo), a 30 passos por segundo: mapa gerado por ruído inteiro, campos de fluxo por Dijkstra, separação por baldes espaciais, combate, renascimento, ondas do computador e neblina de guerra do time 0.
- `trabalhador.js`: Web Worker com o relógio fixo, a fila de comandos por passo e um retrato transferível por passo.
- `render.js`: renderizador WebGL2: terreno procedural com neblina num passe de tela cheia, veículos instanciados (formas por SDF ou atlas do Blender com cor de time por máscara), sombras e efeitos.
- `principal.js` e `index.html`: resolução (`?res=nativa|4k|1080p`), câmera, seleção e ordens, interpolação, efeitos, minimapa, painel e medição automática (`?bench=1`).
- `verificar-determinismo.mjs`: partida roteirizada que imprime as somas de verificação; roda em Node e no `jsc` do macOS.
- `medir.mjs` e `capturar.mjs`: medição e capturas em 3840×2160 pelo Playwright.
- `blender/renderizar_veiculo.py`: monta por script um blindado de sucata original e renderiza N direções com passes de cor, máscara de time e normal, mais uma imagem de vitrine; roda sem interface no Windows da RTX 4090.
- `conceito/gerar_conceitos.py` e `conceito/prompts-ambiente.json`: arte conceitual local com SDXL base 1.0 no WSL da RTX 4090; os prompts descrevem só o mundo, sem citar jogo, estúdio ou artista.
- `sprites/`: atlas gerados pelo Blender (16 direções, 256 px por quadro) e o `manifesto.json` que o protótipo carrega.

As imagens de conceito que o SDXL gerou não entram no repositório: o `gerar_conceitos.py` as recria a partir dos prompts e das sementes. O script do Blender usa a API do Blender e por isso tem licença GPL-3.0-or-later, declarada no cabeçalho SPDX; o resto do protótipo segue o repositório.

## Rodar

```bash
python3 -m http.server 8811 --directory prototipos/rts-4k
```

Abrir `http://localhost:8811/`. Arrastar seleciona, botão direito move, WASD ou setas movem a câmera, a roda dá zoom, F põe em tela cheia, H esconde o painel e P pausa. Parâmetros: `unidades=2000`, `res=4k`, `zoom=46`, `atlas=0` (formas por código), `avancar=1500` (adianta a partida), `bench=1&seg=10` (medição; o resultado fica em `window.__bench`).

```bash
node prototipos/rts-4k/verificar-determinismo.mjs
```

```bash
/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -m prototipos/rts-4k/verificar-determinismo.mjs
```

```bash
node prototipos/rts-4k/medir.mjs http://localhost:8811
```

Blender na RTX 4090, a partir do Mac (o shell do SSH no Windows é o PowerShell, então o caminho do executável precisa do operador `&`):

```bash
scp prototipos/rts-4k/blender/renderizar_veiculo.py rtx4090:D:/rts/scripts/
```

```bash
ssh rtx4090 "& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' -b --factory-startup -P 'D:\rts\scripts\renderizar_veiculo.py' -- --saida 'D:/rts/renders/tanque'"
```

## Resultados de 30/10/2026

- 4K (3840×2160) no MacBook Pro M5 Pro, Chromium com Metal: 60 quadros por segundo (teto da tela) com 2.000, 6.000 e 10.000 unidades, nenhum quadro acima de 20 ms; passo da simulação de 2,1 ms (2.000 unidades) a 13,7 ms (10.000), dentro dos 33 ms de orçamento. Firefox 153: 120 quadros por segundo com 2.000 unidades. WebKit 26.5: 60.
- Determinismo: a mesma partida de 3.600 passos com 2.000 unidades dá as mesmas seis somas (`897f4ba5` no fim) no Node 22, no Chromium 151, no Firefox 153, no WebKit 26.5 e no `jsc` do macOS 26.
- Blender 5.2.3 com OptiX na RTX 4090, pelo SSH: cerca de 1 s por quadro de 256 px com 64 amostras; vitrine em 1080p com 256 amostras em 23 s.
- SDXL base 1.0 fp16 no WSL: cerca de 4 s por imagem de 1344×768, pico de 11,3 GB de VRAM.
- Defeitos conhecidos: o campo de fluxo puro em 8 direções enfileira as unidades em corredores; calcular um campo novo no mapa inteiro custa de 10 a 14 ms num único passo; o tanque é arte de programador, feita de primitivas.
