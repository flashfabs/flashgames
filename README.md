# Salinha

Site público para jogar com a galera direto no navegador, sem cadastro: alguém cria uma sala, manda o link e quem abre o link cai direto na sala. Pedido do Victor em 27/10/2026 (áudio): sala por link, conexão em tempo real por WebRTC, base para vários jogos, primeiro jogo de bombas para até 8 pessoas com WASD/setas e espaço.

O primeiro jogo é o **Pavio**, uma arena de bombas original (nome, personagens e visual próprios): explodir caixas, pegar itens e ser o último de pé. Depois de 2 minutos (90 s no último mapa) começa a morte súbita e a arena fecha de fora para dentro.

Fluxo de uma sala (pedidos do Victor de 27/10/2026):

- **Lobby:** cada um marca "Estou pronto"; quando todos estão prontos, a rodada começa sozinha. Sozinho na sala vira treino.
- **Rodada de 5 partidas:** cada partida usa um mapa mais fechado (Pátio, Depósito, Muralhas, Labirinto, Fornalha) e libera poderes novos: 💣 mais bombas, 🔥 mais alcance e 🌀 atalho (empurrando uma caixa por um instante você aparece do outro lado; cada item dá uma carga, até 5, e cada caixa atravessada gasta uma) desde a primeira, 👟 tênis e 🦶 chute (andar contra uma bomba a faz deslizar até bater em algo) na segunda, 🛡️ escudo e 🎯 detonador (as bombas só explodem quando você aperta de novo sem bomba sobrando, ou depois de 10 s) na terceira, 💥 fogo perfurante (atravessa caixas) e 🧲 ímã (por 8 s, itens a até 3 casas voam até você) na quarta e 👻 fantasma (atravessa caixas e bombas por 8 s) e ❄️ gelo (cada item dá 3 tiros; o tiro voa até 6 casas para onde você olha e congela a primeira bomba por 3 s, com o pavio parado; o fogo de outra bomba ainda a explode) na quinta.
- **Pontos:** caixa destruída vale 1 ponto para o dono da bomba, eliminação vale 5 (explodir a si mesmo não conta) e partida vencida vale 15. Depois de cada partida aparece o placar com a quebra por tipo; no fim da rodada, o campeão é quem tem mais pontos (desempate por vitórias).
- **Se alguém sai** no meio da rodada, ela acaba, o placar final aparece com o motivo e todos voltam ao lobby.

## Como funciona

- `site/js/sala.js` é a camada de sala, comum a todos os jogos: conexões WebRTC (canais de dados) por meio do PeerJS, em estrela em volta de quem criou a sala (o anfitrião). O código da sala (5 letras) é o id do anfitrião no servidor de sinalização; o link é `https://<site>/#CODIGO`. A sala cuida de entrada e saída, lista de membros, ping e queda; o jogo só troca as próprias mensagens.
- O servidor de sinalização é o gratuito do PeerJS (`0.peerjs.com`), usado só para os navegadores se acharem; os dados do jogo vão direto entre os navegadores. A configuração padrão do PeerJS 1.5.4 inclui STUN do Google e TURN do próprio PeerJS para redes mais fechadas.
- Cada ligação tem dois canais: o confiável do PeerJS (controle da sala, estado da rodada, bombas) e um canal rápido pré-negociado, sem ordem e sem retransmissão (retratos e posições), para um pacote perdido nunca segurar os seguintes.
- `site/js/pavio/regras.js` é a simulação pura (sem DOM nem rede). O anfitrião roda a 60 passos por segundo e manda um retrato 20 vezes por segundo, com a grade só quando ela muda e eventos repetidos em 3 retratos seguidos.
- Cada jogador anda no próprio aparelho, sem esperar a rede, com a mesma função de movimento das regras (`moverComColisao`), e manda a posição ~30 vezes por segundo; o anfitrião aceita só posição plausível (velocidade e paredes) e o aparelho se corrige se ficar longe da versão do anfitrião. Os outros jogadores aparecem com um atraso que se ajusta à oscilação da rede. Chamas só machucam depois de 0,12 s, para compensar o atraso das posições.
- A lista da sala mostra o ping de cada um até o anfitrião, e 🐢 quando a ligação passa por retransmissor (TURN), que é mais lenta.
- Controles: teclado (duas direções seguradas viram "siga nesta e vire naquela"; espaço solta bomba e E ou Shift joga gelo), toque (o joystick aparece onde o dedo encosta no lado esquerdo, qualquer toque no lado direito solta bomba e, com gelo, aparece um botão ❄️ acima do de bomba) e controle de videogame (A e X soltam bomba; B e Y jogam gelo, ou soltam bomba quando não há gelo).
- iPad e celular: a tela da sala fica presa ao tamanho do aparelho (sem rolagem, zoom nem seleção), e o som é liberado no primeiro toque (soltar o dedo), que é o que o Safari exige.
- `site/js/relogio.js` usa um Web Worker como relógio para o anfitrião continuar simulando mesmo com a aba dele em segundo plano.
- Para plugar outro jogo: criar uma função no molde de `criarPavio({ sala, palco, som, aoMudarInfo })` e trocar a chamada em `site/js/app.js`.

## Rodar e testar

O site é estático, sem build. Para abrir localmente (abrir duas abas, criar a sala numa e colar o link na outra):

```bash
python3 -m http.server 8792 --directory site
```

Os testes automáticos estão na seção [Testes](#testes).

## Testes

Duas suítes, as duas rodando na raiz do repositório:

- `npm test`: testes das regras do jogo (`testes/*.test.mjs`, Node 22, sem dependências, menos de 1 s).
- `npm run e2e`: testes de ponta a ponta (`testes/e2e/*.spec.mjs`) com Playwright e Chromium sem janela; cada jogador é um navegador de verdade na sua própria página. A suíte toda leva cerca de 1 min 30 s.

Na primeira vez numa máquina nova, instalar as dependências e o Chromium do Playwright:

```bash
npm install
```

```bash
npx playwright install chromium
```

Como funcionam os de ponta a ponta:

- O Playwright sobe o site em `http://127.0.0.1:8805` (`python3 -m http.server`) e o derruba no fim; a porta precisa estar livre.
- A sinalização é a do PeerJS na internet (`0.peerjs.com`), igual à produção, então os testes precisam de internet; a fonte e o PeerJS também vêm de CDN. Por isso há 1 nova tentativa automática por teste: um teste que só passa na segunda aparece como `flaky` no relatório, o que aponta rede instável e não defeito do jogo.
- Cada jogador tem o seu próprio contexto de navegador (página e armazenamento próprios), porque página em segundo plano não roda `requestAnimationFrame`. Os testes rodam um de cada vez.
- O estado do jogo é lido pelo gancho `window.__salinha`, que `site/js/app.js` só instala quando o endereço tem `?teste=1` (os testes abrem `/?teste=1` e o link do convite com `?teste=1`). Ele só lê: `__salinha.sala()` devolve código, link, id e membros, e `__salinha.jogo()` devolve uma cópia do estado da rodada e da partida, vinda de `espiar()` no objeto que `criarPavio` devolve em `site/js/pavio/pavio.js`. Quem mexer no formato do estado do Pavio deve manter `espiar()` funcionando.
- Para planejar os movimentos, a página do anfitrião de alguns testes recebe um `Math.random` puxado para `[0,9, 1)` (função `semCaixas` em `testes/e2e/mesa.mjs`): a arena sai sem caixas e sem itens e cada jogador nasce no canto da sua ordem de entrada (anfitrião em (1, 1), o segundo em (19, 13) e assim por diante). O teste de desempenho usa o mapa normal, com caixas e itens.
- Os jogadores andam pelas setas do teclado (ou por toque, no iPad), seguindo um caminho calculado sobre a grade lida do jogo (`andarAte` em `testes/e2e/mesa.mjs`).
- Qualquer erro de JavaScript numa página reprova o teste. Quando um teste falha, o console de todas as páginas e o rastro do Playwright ficam em `test-results/` (`npx playwright show-trace <arquivo>`).

O que cada cenário cobre:

- `sala.spec.mjs`, entrada e largada: o anfitrião cria a sala e 4 convidados entram pelo link do convite; todos veem os 5 nomes e a coroa do anfitrião; com 4 prontos o anfitrião vê "Só falta você." e a rodada não começa; quando ele marca pronto, todos veem "Partida 1 de 5 · Pátio" e a partida começa. Um convidado anda 2 casas e o anfitrião vê a posição nova; ele solta uma bomba, que aparece para o anfitrião e para outro convidado, foge da explosão e continua vivo depois que ela estoura.
- `sala.spec.mjs`, saída no meio: anfitrião e 2 convidados em partida; um convidado clica em "Sair" e volta ao início; para os outros dois a rodada acaba com "Rodada interrompida" e o motivo "<nome> saiu da sala, então a rodada acabou.", o placar final lista os 3 e "Voltar ao lobby agora" leva todos de volta ao lobby.
- `pontos.spec.mjs`, eliminação e placar: anfitrião e convidada andam até se encontrar na linha de cima; a bomba da convidada elimina o anfitrião; a tela de resultado mostra "Íris venceu a partida! 🏆" (e "Você venceu a partida! 🏆" para ela), o placar com 1 vitória, 0 caixas, 1 eliminação e 20 pontos (5 + 15) para ela e tudo zero para ele, a legenda dos pontos e ⭐ 20 na lista da sala; depois do resultado, a partida 2 (Depósito) começa sozinha.
- `toque.spec.mjs`, iPad: um iPad (7ª geração, deitado, toque ativo) entra na sala de um computador. Antes, numa página comum, o teste confirma que os gestos de pinça e de rolar do navegador de teste funcionam, para a checagem valer. No lobby o iPad mostra as instruções de toque e ainda não tem camada de toque, e a sala não rola nem aumenta com pinça; com a partida começando, a camada de toque e a dica 💣 aparecem (no computador, não); arrastar o dedo no lado esquerdo anda e o anfitrião vê; tocar no lado direito solta bomba; rolar e fazer pinça durante o jogo não mexem na página.
- `desempenho.spec.mjs`, desempenho com 8 jogadores: sala cheia (os 7 convidados entram ao mesmo tempo), mapa normal, convidados andando a esmo e 3 deles soltando bombas; por 8 s mede o intervalo entre quadros e o tempo gasto em cada quadro no anfitrião e num convidado, e o tempo de cada tique da simulação no anfitrião. Os números saem no console a cada execução e anexados ao relatório; os limites que reprovam são folgados (quadro p95 abaixo de 40 ms, trabalho por quadro e tique p95 abaixo de 8 ms), feitos para pegar uma piora grande e não variação de máquina. O anfitrião e o convidado medidos rodam cada um no seu próprio Chromium: com as 8 páginas num navegador só, o processo de GPU em software que elas dividem segura tudo em ~20 fps, mesmo com o jogo gastando 0,3 ms por quadro (com 2 páginas são 60 fps).

Números medidos em 27/10/2026, MacBook Pro M5 Pro, Chromium 153 sem janela, 8 jogadores: anfitrião e convidado a 60 fps (quadro p50 e p95 de 16,7 ms, pior quadro 50 ms), trabalho por quadro de 0,3 ms (p50) e 0,6 ms (p95), tique da simulação do anfitrião de 0,1 a 0,2 ms (p95), nenhuma tarefa longa.

O que os testes de ponta a ponta ainda não cobrem: Safari e Firefox (só Chromium), rede ruim ou retransmissor TURN (as páginas estão na mesma máquina), fechar a aba em vez de clicar em "Sair" (a queda só é percebida pelo silêncio de 12 s), o anfitrião saindo, a morte súbita, os poderes de cada mapa, pontos por caixa na tela de resultado, a rodada completa de 5 partidas e o controle de videogame.

## Publicação

Netlify, time pessoal `vhccruz-projects`, projeto `salinha-jogos` (id `dddafa63-ffb4-434e-b394-c39aad054106`; o nome `salinha` já era de outra pessoa), em https://salinha-jogos.netlify.app. A pasta publicada é `site/`.

## Limitações conhecidas

- Se o anfitrião fechar a aba, a sala acaba para todos (não há troca de anfitrião).
- O anfitrião joga sem atraso de rede e os outros com o atraso da conexão até ele; numa mesma cidade isso fica em dezenas de milissegundos.
- O servidor de sinalização e o TURN do PeerJS são gratuitos e sem garantia; se ficarem fora do ar, ninguém consegue criar nem entrar em sala.
- Não há login; o placar vale só enquanto a rodada existir.
- Aba em segundo plano para de desenhar e de andar (o navegador pausa o quadro); o anfitrião continua simulando.

## Próximos passos possíveis

- Login e microtransações (o passo seguinte que o Victor citou), por exemplo com Supabase Auth.
- Sinalização e TURN próprios, para não depender do serviço gratuito do PeerJS.
- Troca de anfitrião quando ele sai, e mais jogos sobre a mesma sala.
