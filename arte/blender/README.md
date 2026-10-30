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
