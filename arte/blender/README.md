# Fábrica de arte do RTS (Blender)

Todo sprite do RTS nasce de um script Python nesta pasta, renderizado pelo Blender 5.2.3 LTS no PC da RTX 4090 e empacotado sem passo manual.
Os scripts são GPL-3.0-or-later (decisão D05, texto em [LICENSE](LICENSE)); o que eles produzem (atlas, manifestos) pertence ao projeto.

## Uso

```bash
ferramentas/arte/rtx.sh renderizar religadores-veiculo-cesto-blindado
```

O `rtx.sh` confere o PC (alcance pelo SSH, espaço em C: e D:, tamanho de `D:\rts`, VRAM livre), envia esta pasta e o `site/rts/dados/projecao.json`, pega a trava da GPU `D:\rts\trava-gpu`, lança o lote pelo WMI (sobrevive à queda do SSH), acompanha o log, e no fim traz para o repositório o atlas, o manifesto e a procedência, e refaz o `site/rts/assets/indice.json`.
Opções do script vão como `chave=valor`: `direcoes=16`, `elevacao=45` (vira o asset `<id>-e45`), `passes=cor+time`, `qualidade-cor=100`.
Outros comandos: `checar`, `enviar`, `acompanhar <asset> <execução>`, `buscar <asset> [execução]`, `reempacotar <asset> [execução]` (refaz só o empacotamento, sem GPU), `limpar [--apagar]` e `trava [estado|soltar <asset>/<execução>]`; `RTX_BRUTOS=1` traz também os quadros brutos para `~/rts-arte/saida/`, fora do repositório.

## Estrutura

- `renderizar.py`: ponto de entrada no Blender (`-b --factory-startup --python-exit-code 1`).
- `comum/compat.py`: o que mudou na API 5.x e que a fábrica usa, conferido no 5.2.3.
- `comum/projecao.py`: lê o contrato de projeção e luz (C8, da `rts-render`).
- `comum/cena.py`: cena vazia, GPU (OptiX), luz canônica, câmera ortográfica em 3/4, Cycles.
- `comum/modelagem.py`: materiais, primitivas, partes por camada e pontos de encaixe.
- `comum/passes.py`: passes por troca de material (`cor`, `time`, `normal`, `sombra`), nunca por Object Index.
- `comum/fabrica.py`: laço de passes, camadas, animações, direções e quadros, com a projeção dos pontos.
- `comum/empacotar.py` e `comum/maxrects.py`: recorte, âncora, `hd` por redução do `uhd`, páginas até 4096, WebP, hash no nome, manifesto (C9) e procedência.
- `assets/<asset>.py`: um script por asset, com `DESCRICAO`, `construir(ctx)` e `posar(ctx, modelo, animacao, quadro)`.
- [MEDICOES.md](MEDICOES.md): o que foi medido no PC e de onde vêm os números do código.

## Convenções

- 4 m por célula, pivô no centro da pegada no chão, frente para +X; o script gira o modelo, nunca a câmera; direção 0 é o leste e as seguintes giram no sentido horário da tela.
- Partes que se movem são objetos separados e nomeados; cada objeto diz a sua camada na propriedade `camada` (herdada do pai, `corpo` por padrão), e cada camada renderiza só os seus objetos.
- Áreas da cor do time usam o material de nome reservado `time` (cinza neutro no passe de cor, branco na máscara).
- Pontos de encaixe são vazios criados com `modelagem.ponto(nome, ...)`: `encaixe_torre` (chão sob o eixo da torre), `boca`, `escape`, `topo` e os que o brief pedir; o manifesto guarda, por quadro, o deslocamento da âncora em px do `uhd`.
- Quadro e âncora de cada camada em números pares, para o `hd` ser a metade exata do `uhd`.
- Cycles na GPU, 256 amostras sem denoiser na cor e 32 nas máscaras, semente fixa, filtro de 1 px, transformação `Standard` na cor e `Raw` nas máscaras.
- Nenhum nome, termo, imagem ou referência de outro jogo em script, nome de objeto ou material; metadados das imagens saem limpos (o empacotador recusa bloco EXIF, XMP ou ICCP).

## No PC

`D:\rts\scripts` recebe esta pasta a cada envio (nunca editar lá), `D:\rts\config` o contrato de projeção, `D:\rts\saida\<asset>\<execução>` os quadros, o log, o `estado.json`, o `relatorio.json` e o pacote, e `D:\rts\cache` os temporários do Blender (nunca no C:).
`D:\rts\fonte` fica para `.blend` feitos à mão, se um dia houver, com cópia de segurança (decisão D09).

## Kit cinza da fase 1 (etapa E3)

Cada unidade, construção, estrutura neutra, recurso, decoração e solo da fase 1 tem um script em `assets/` com o mesmo id que `site/rts/dados/unidades.json` e `predios.json` usam (`religadores-infantaria-soldador`, `desligados-construcao-paiol`...); as peças do portão de estilo ficaram com ids `-portao`, só na fase `portao`.
O módulo `comum/cinza.py` traz a paleta cinza (as cores dos briefs viram cinza por luminância, com um toque frio nos Religadores e quente nos Desligados; a máscara de time e o brilho da carga ficam), as descrições padrão por categoria, as rodas e o destroço dos veículos, os estragos das construções (grupos por papel: parede, telhado, alto, detalhe) e o enquadramento dos ícones; `comum/infantaria.py` é o corpo-base único da infantaria, com as ações por função de pose; `comum/solo.py` faz os ladrilhos de solo e `comum/decoracao.py` as decorações com variações por quadro.

- Infantaria: 16 direções; `parado` (1), `andando` (6), `atirando` (2, o segundo é o repouso), `morrendo` (6 quadros em 8 direções) e as especiais do brief.
- Veículos: 16 direções; `parado`, `rodando` (os mesmos quadros), `atirando` na camada `torre` quando há torre, `destruido` na camada `destroco` (casco e torre juntos, 8 direções).
- Construções e estruturas: 1 direção, passe `sombra`, quadro calculado pela pegada e pela altura (`cinza.quadro_construcao`); `pronta`, `produzindo` (os mesmos quadros no cinza), `danificada`, `destruida`; as neutras têm `morta` e `religada`; torres com a camada `torre` em 16 direções; a paliçada tem 16 quadros por estado, quadro = máscara de vizinhos (norte 1, leste 2, sul 4, oeste 8).
- Quadros repetidos não são renderizados: `"igual": "<animação>"` reusa outra animação inteira e `"quadrosIguais": {"<k>": ["<animação>", <quadro>]}` reusa quadros soltos; o empacotador também junta quadros de pixels idênticos num retângulo só.

## Atlas de fase

O render dá a cada página de atlas uma camada de três texture arrays (cor RGBA8, time R8 e sombra R8, com mipmaps), 32 MiB por página de 2048 no `uhd`; com uma página por asset, a fase 1 passaria de 1 GB.
Por isso, depois de renderizar os assets, `ferramentas/arte/rtx.sh empacotar-fase fase-1` junta no PC, sem GPU, os quadros das execuções registradas na procedência de cada asset da fase em páginas compartilhadas em `site/rts/assets/sprites/fase-1/`, reescreve os manifestos para apontar para elas e grava `fase-1.json` com as páginas e o orçamento estimado pela mesma conta do backend (camadas × largura × altura × 6 × 4/3).
Fluxo: `rtx.sh renderizar <asset>` para cada peça que mudou e, no fim, `rtx.sh empacotar-fase fase-1`; o `testes/rts-arte.test.mjs` cobra o manifesto, a procedência, o orçamento da fase e que todo asset dos dados da design esteja no índice.
