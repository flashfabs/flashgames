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

Testes das regras do jogo (Node 22, sem dependências):

```bash
node --test testes/*.test.mjs
```

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
