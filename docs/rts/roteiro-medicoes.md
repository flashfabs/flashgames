# Roteiro de medições da E0

O que só dá para medir com você na frente da máquina: o Safari 26 de verdade, o Chrome e o Edge no PC da RTX 4090 com a placa ligada (pelo SSH os navegadores podem rodar sem GPU), o renderizador do jogo em 4K e a bateria de teclas.
São cerca de 15 minutos no Mac e 10 no PC, e dá para fazer em duas vezes.
Cada página tem um botão de copiar; cole o que ela copiar numa mensagem para a sessão de qualidade do RTS, que registra no [ESTADO.md](ESTADO.md).
Nada é enviado pelas páginas: elas só leem o navegador e medem.

## Preparar (1 minuto, no Mac)

Baixar a `rts/base` atual numa pasta solta, fora do repositório:

```bash
git -C /Users/vhccruz/Dev/salinha fetch origin rts/base
```

```bash
rm -rf ~/rts-medir && mkdir ~/rts-medir && git -C /Users/vhccruz/Dev/salinha archive origin/rts/base prototipos site/rts | tar -x -C ~/rts-medir
```

Servir a pasta no próprio Mac (deixe rodando até terminar a parte do Mac):

```bash
python3 -m http.server 8820 --bind 127.0.0.1 --directory ~/rts-medir
```

## Parte 1: Safari 26 no Mac (10 minutos)

1. Feche os apps pesados, ligue o carregador e abra http://localhost:8820/prototipos/diagnostico/ no Safari, numa janela grande.
2. Em "Mesmo resultado em todo navegador", aperte Conferir e espere "pronto" (uns 5 segundos). O esperado é "Igual à referência: sim".
3. Em "Desempenho do protótipo", deixe 2000 unidades e 4K e aperte Medir. A tela inteira vira o protótipo por uns 20 segundos; não troque de aba nem de janela.
4. Aperte "Copiar o resultado" e cole na mensagem.
5. Abra http://localhost:8820/site/rts/?bench=1&res=4k&seg=20&avancar=600 no Safari e ponha em tela cheia (Ctrl+Cmd+F). Depois de uns 30 segundos aparece um JSON no canto da tela: selecione, copie e cole na mensagem. É o renderizador do jogo, não o do protótipo.
6. Abra http://localhost:8820/prototipos/teclas/ no Safari e siga a faixa do topo até o fim (uns 5 minutos). Antes, confira em Ajustes do Sistema, Teclado, Atalhos de Teclado, Mission Control, se "Ir para a Mesa N" está ligado e quantas Mesas você tem; a página pergunta. No fim, "Copiar resultado" e cole na mensagem.

## Parte 2: Chrome no Mac (5 minutos)

1. Abra http://localhost:8820/prototipos/teclas/ no Chrome e faça a bateria de novo; "Copiar resultado" e cole.
2. O diagnóstico e o bench do jogo no Chrome do Mac já foram medidos pelo Playwright com Metal; rodar de novo é opcional (os passos 2 a 5 da Parte 1).

Pode parar o servidor do Mac (Ctrl+C) depois disso.

## Parte 3: Chrome e Edge no PC da RTX 4090 (10 minutos)

Do Mac, mande a pasta para o PC e sirva por lá, com o Python que vem junto do Blender (não instala nada; servindo em localhost, as páginas valem como contexto seguro):

```bash
scp -r ~/rts-medir rtx4090:C:/Users/vhccruz/rts-medir
```

```bash
ssh rtx4090 "& 'C:\Program Files\Blender Foundation\Blender 5.2\5.2\python\bin\python.exe' -m http.server 8820 --bind 127.0.0.1 --directory C:\Users\vhccruz\rts-medir"
```

Depois, sentado no PC, com o monitor 4K ligado:

1. No Chrome, abra http://localhost:8820/prototipos/diagnostico/ em tela grande. Confira se em "Placa de vídeo" aparece a RTX 4090 e se "Desenho pela CPU" está "não".
2. Conferir, depois Medir com 2000 unidades e 4K, e "Copiar o resultado"; cole numa mensagem (pelo próprio PC ou mande para o Mac).
3. Abra http://localhost:8820/site/rts/?bench=1&res=4k&seg=20&avancar=600 em tela cheia (F11) e copie o JSON que aparece no canto depois de uns 30 segundos.
4. Ainda no Chrome, abra http://localhost:8820/prototipos/teclas/, faça a bateria e copie o resultado.
5. No Edge, só o diagnóstico e o bench do jogo: passos 1 a 3.

O Firefox não está instalado no PC (conferido em 30/10/2026); instalar fica para quando você quiser.
No fim, Ctrl+C no Terminal do Mac encerra o servidor do PC, e a pasta `C:\Users\vhccruz\rts-medir` pode ser apagada.

## O que cada medição responde

| Medição | Por quê |
| --- | --- |
| Soma no Worker igual à referência | O multiplayer em lockstep só funciona se todo navegador calcular o mesmo estado; o Safari de verdade e o Windows ainda não foram conferidos |
| Bench em 4K com 2.000 unidades, no protótipo e no jogo | A meta da E1 é menos de 1% dos quadros acima de 20 ms em 4K no Chrome e no Safari com o renderizador do jogo; a da E6, p95 até 6,9 ms na 4090 |
| Placa, MAX_TEXTURE_SIZE e texturas comprimidas | Decide o tamanho dos atlas e se vale comprimir as texturas (BC7 no Windows, ASTC e ETC2 no Mac) |
| `decodeAudioData` de Opus e de AAC | Diz se o som pode ir em Opus no Safari ou se precisa da reserva em AAC |
| Bateria de teclas | Escolhe a tecla dos grupos de controle e mostra quais atalhos o navegador ou o sistema tomam (Mesas do Mission Control, F10, Esc, pinça) |
