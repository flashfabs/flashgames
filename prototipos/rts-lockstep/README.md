# Lockstep do RTS (spike S7)

Protótipo de rede do RTS: a simulação da `rts/base` rodando em 2 a 4 abas ou navegadores em lockstep, sobre a sala de `site/js/sala.js` sem alterá-la.
O anfitrião é o relógio e o retransmissor: fecha um turno a cada 100 ms e manda o pacote do turno a todos pelo canal confiável; cada página só roda o turno quando tem o pacote.
Não vai ao ar e não tem render: só um minimapa e um painel com os números que o spike mede.

## Como rodar

- Na máquina: sirva a raiz do repositório (configuração `rts-lockstep` do `.claude/launch.json`, porta 8828) e abra `http://127.0.0.1:8828/prototipos/rts-lockstep/?criar=1&robo=1&rede=peerjs&atraso=60&variacao=40`; abra o link que aparece em outra aba ou outro navegador e clique em Começar.
- Parâmetros do endereço (descritos no começo de `pagina.js`): `jogadores` (o anfitrião começa sozinho quando a sala tem esse número), `atraso` e `variacao` (atraso artificial em ms em cada mensagem recebida, em ordem), `pico` e `picoms` (probabilidade e tamanho de um soluço), `d` (atraso de entrada em turnos, 2), `unidades` (por jogador, 250), `semente`, `robo=1` e `cps` (o robô joga, 3 comandos por segundo em média).
- Rodada inteira, no PC da RTX 4090: `scripts/rtx-testes.sh -- --config prototipos/rts-lockstep/playwright.config.mjs -g inteiro` (10 minutos de jogo em 4 páginas, a primeira como anfitriã, tiradas na ordem Chromium, Firefox, WebKit, Chromium, Firefox entre os motores que têm WebRTC); `-g curto` joga 1 minuto. O nome não é "longo" porque o executor trata como passo de desempenho, e segura a trava da GPU, qualquer argumento com essa palavra. As variáveis `LOCKSTEP_*` estão no começo de `lockstep.spec.mjs`.
- WebKit: o do Playwright no Windows (26.6) não tem `RTCPeerConnection`, então no PC ele fica de fora sozinho; no Mac ele roda, com `LOCKSTEP_MOTORES=chromium,webkit LOCKSTEP_PAGINAS=2 LOCKSTEP_EXIGIR=chromium,webkit` e `--workers=1`.
- Lógica do protocolo no `npm test`: `testes/rts-lockstep.test.mjs` (envelope, fatias, regras do anfitrião, uma partida inteira em memória com anfitrião e 3 membros em links com atraso aleatório, e uma dessincronia de propósito achada pelo subsistema).

## Arquivos

- `protocolo.js`: tipos de mensagem, conferência do envelope do comando, tamanho em bytes e fatias.
- `lockstep.js`: o anfitrião (fecha turnos, carimba o passo, recusa comando falso, compara somas, espera quem ficou para trás) e o participante (manda comandos com o atraso de entrada, roda os turnos em ordem, mede latência).
- `partida.js`: a partida que cada página monta só com a mensagem de início, e a execução de um pacote de turno; o Worker e o teste do Node usam o mesmo código.
- `trabalhador.js`: Worker com a simulação, sem relógio próprio.
- `pagina.js`, `index.html`: sala, relógio do anfitrião, atraso artificial, robô, painel e o gancho `window.__lockstep` dos testes.
- `robo.js`: comandos aleatórios, tipos que a simulação ainda não conhece e, a cada 25 a 35 s, uma rajada de três comandos com 1.024 unidades, que faz o pacote do turno passar de uma mensagem.
- `lockstep.spec.mjs`, `playwright.config.mjs`: a rodada entre motores, fora da suíte normal.

## Rascunho do C16: pacote de turno e somas

Versão `VERSAO_LOCKSTEP` 1, dentro da `VERSAO_PROTOCOLO` 33 da sala (nada mudou na sala).
Toda mensagem vai pelo canal confiável e ordenado da sala, em JSON, com o tipo no campo `t`; os tipos da sala começam com `$` e nunca chegam ao jogo.

| Mensagem | Sentido | Campos |
| --- | --- | --- |
| `inicio` | anfitrião para todos | `v` (lockstep), `vc` (`VERSAO_COMANDOS`), `vs` (`VERSAO_SIMULACAO`), `semente`, `porJogador`, `atrasoTurnos`, `jogadores` (id do membro na sala para o índice do jogador) |
| `pronto` | membro para o anfitrião | a partida está montada e espera o turno 1 |
| `cmd` | membro para o anfitrião | `n` (turno pedido), `c` (comandos na forma compacta do C1) |
| `turno` | anfitrião para todos | `n`, `c` (comandos com o passo definitivo, em ordem de jogador e `seq`) |
| `soma` | membro para o anfitrião | `k` (passo), `s` (total e uma por subsistema: `entidades`, `ordens`, `caminhos`, `neblina`, `comandos`, `geral`) |
| `dessinc` | anfitrião para todos | `tick`, `membro`, `jogador`, `subsistemas` (os que divergiram), `local`, `remoto`; a partida para |
| `fatia` | qualquer sentido | `id`, `i`, `n`, `p` (pedaço do JSON de uma mensagem maior) |

Regras:

- Turno de 100 ms, 3 passos de 30 por segundo; os comandos do turno `n` rodam todos no primeiro passo dele, `(n - 1) × 3 + 1`.
- O membro pede o turno "último que rodou + `atrasoTurnos`" (2 no spike); o próprio anfitrião usa o mesmo caminho, sem vantagem.
- O anfitrião fecha cada turno no horário com o que chegou; comando que chega depois do fechamento entra no próximo turno aberto, então ninguém espera um link lento; o canal ordenado mantém a ordem de cada jogador.
- O anfitrião confere o envelope de cada comando, recusa o que diz ser de outro jogador (o índice vem da conexão) e o que repete ou volta o `seq`, e carimba o passo.
- A cada 30 passos cada membro manda a soma por subsistema; ela também serve de aviso de progresso: o anfitrião para de fechar turnos enquanto algum membro estiver mais de 150 passos (5 s) atrás.
- Soma diferente: o anfitrião avisa todos com os subsistemas que divergiram e a partida para (relatório e ressincronização ficam para a E8).
- Mensagem com 16.000 bytes ou mais de JSON em UTF-8 vai em fatias (o PeerJS 1.5.4 descarta a partir de 16.300 e avisa só no console); quem recebe junta pelo `id` do remetente.

## O envelope do comando (C1)

O que a rede confere, sem olhar os tipos (`envelopeValido` em `protocolo.js`): array com os 9 campos fixos e as unidades, todos inteiros de 32 bits, `tick` e `seq` não negativos, `jogador` de 0 a 7, `tipo` de 1 a 255, `fila` 0 ou 1, ids de unidade positivos e no máximo 1.024 unidades.
Tipos que a simulação ainda não conhece passam pela rede e são descartados igual em todas as páginas (o robô manda tipos de 100 a 139 o tempo todo; na rodada de 10 minutos ainda eram de 15 a 54, desconhecidos na `VERSAO_SIMULACAO` 2).

## Medições

Rodada inteira no PC da RTX 4090, em 31/10/2026 (execução `20261031-001806` do executor, `lockstep.json` na pasta de resultados): 4 páginas (Chromium 153 como anfitrião, Firefox 155, Chromium 153 e Firefox 155), 250 unidades por jogador (1.000 no total), o robô a 3 comandos por segundo em cada página, com uma rajada de três comandos de 1.024 unidades a cada 25 a 35 s, atraso artificial de 60 a 100 ms em toda mensagem recebida, com 1% de soluços de mais 250 ms, e atraso de entrada de 2 turnos.
O ping entre as páginas é de 1 ms (mesma máquina): a rede ruim é só a do atraso artificial.

| Medição | Resultado |
| --- | --- |
| Turnos e somas | 6.044 turnos (18.132 passos) em 604 s de relógio; 1.812 somas comparadas pelo anfitrião (3 membros vezes 604), 0 dessincronias; as 604 somas que as quatro páginas têm em comum (passos 30 a 18.120) são iguais também na conferência do teste, fora do anfitrião |
| Comandos | 7.426 aceitos, 0 recusados; 3.757 dos 5.605 dos membros (67%) chegaram depois de o turno pedido fechar e rodaram no seguinte (os do anfitrião nunca se atrasam) |
| Bytes por turno, do anfitrião para cada membro | turno vazio 29; mediana 126, p95 443, p99 20.222, máximo 46.823; média 459, ou 4,6 KB/s por membro, puxada pelas rajadas; 69 turnos passaram de 16.000 bytes e foram fatiados; 72% dos turnos levaram algum comando |
| Bytes de cada membro para o anfitrião | comando: mediana 117 por envio, p95 291, máximo 8.245; soma: 101 por segundo; cerca de 1,2 KB/s por membro, com as rajadas |
| Maior mensagem que saiu | 15.660 bytes (uma fatia), abaixo dos 16.000 |
| Latência do comando, de emitir até rodar | anfitrião: mediana 159 ms, p95 162; membros: mediana 218 a 219 ms, p95 285 a 294, p99 453 a 469, máximo 540 |
| Chegada dos turnos nos membros | intervalo mediano de 100 ms, p95 129, p99 141 a 327, máximo 387 (os soluços) |
| Turno no Worker (3 passos com 1.000 unidades) | mediana de 4 a 5 ms, p95 de 8 a 10, máximo 28 |

Outras rodadas:

- 1 minuto no PC, Chromium 153 com Firefox 155 (execução `20261031-001604`): 63 somas comparadas, 0 dessincronias, 3 turnos fatiados; latência do membro com mediana 218 ms e p95 396.
- 1 minuto no Mac, Chromium 153 com WebKit 26.6 do Playwright: 63 somas comparadas, 0 dessincronias, 4 turnos fatiados; latência do membro WebKit com mediana 219 ms e p95 313.
- Nas duas abas do navegador do app (Chromium), com o mesmo atraso: 23 somas comparadas, 0 dessincronias, latência do membro com mediana 222 ms.

## O que isto diz

- O envelope do C1 serviu como formato de rede sem mudança: o array compacto, o `seq` por jogador e o passo carimbado pelo anfitrião bastam para o lockstep. Pedido à `rts-motor-economia` antes de congelar `VERSAO_COMANDOS` em 1: um teto de unidades por comando no `comandoValido` (1.024, como aqui), porque hoje ele aceita até 65.536, o que daria cerca de 720 KB de JSON num comando só.
- Tipo novo de comando não mexe no envelope: sobe a `VERSAO_SIMULACAO`, que o início da partida também confere.
- Com 160 a 200 ms de ida e volta e atraso de entrada de 2 turnos, dois terços dos comandos dos membros perdem o turno pedido e entram no seguinte, e a latência fica perto de 220 ms na mediana e 290 no p95; com 100 ms de ida e volta, a conta do plano (250 a 300 ms) fica folgada. O atraso de entrada adaptativo da E8 pode usar o ping que a sala já mede.
- A banda é de poucos KB/s e não depende do número de unidades; o que pesa são as seleções enormes, que as fatias resolvem.

## O que fica para a E8 e para o Victor

- Safari 26 de verdade e uma rodada inteira com o WebKit (só no Mac): na lista "Medições que esperam o Mac" do `docs/rts/ESTADO.md`.
- Rede de verdade entre máquinas e redes diferentes (aqui as páginas estão na mesma máquina, com atraso artificial).
- Na E8, em `site/rts/js/rede/`: atraso de entrada adaptativo, relatório de dessincronia para baixar, reconexão pelo estado em pedaços, regra de queda (D26), sucessão do anfitrião e uma mensagem de turno no Worker do jogo, que hoje carimba o passo do comando sozinho.
