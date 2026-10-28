# Salinha

Site público para jogar com a galera direto no navegador, sem cadastro: alguém cria uma sala, manda o link e quem abre o link cai direto na sala. Pedido do Victor em 27/10/2026 (áudio): sala por link, conexão em tempo real por WebRTC, base para vários jogos, primeiro jogo de bombas para até 8 pessoas com WASD/setas e espaço.

O primeiro jogo é o **Pavio**, uma arena de bombas original (nome, personagens e visual próprios): explodir caixas, pegar itens e ser o último de pé. Depois de 2 minutos (90 s no último mapa) começa a morte súbita e a arena fecha de fora para dentro.

Fluxo de uma sala (pedidos do Victor de 27/10/2026):

- **Lobby:** cada um marca "Estou pronto"; quando todos estão prontos, a rodada começa sozinha. Sozinho na sala vira treino.
- **Rodada de 5 partidas:** cada partida usa um mapa mais fechado (Pátio, Depósito, Muralhas, Labirinto, Fornalha) e libera um poder novo: 💣 mais bombas e 🔥 mais alcance desde a primeira, depois 👟 tênis, 🛡️ escudo, 💥 fogo perfurante (atravessa caixas) e 👻 fantasma (atravessa caixas e bombas por 8 s).
- **Pontos:** caixa destruída vale 1 ponto para o dono da bomba, eliminação vale 5 (explodir a si mesmo não conta) e partida vencida vale 15. Depois de cada partida aparece o placar com a quebra por tipo; no fim da rodada, o campeão é quem tem mais pontos (desempate por vitórias).
- **Se alguém sai** no meio da rodada, ela acaba, o placar final aparece com o motivo e todos voltam ao lobby.
- **Quem cai** (troca de Wi-Fi, celular bloqueado) tem 10 segundos para voltar: a vaga, a cor e os pontos ficam guardados, o boneco fica parado onde estava (e pode ser atingido) e a lista mostra "📶 reconectando". Passados 10 s sem notícia, vale a regra de cima. Pedido do Victor em 27/10/2026.

## Como funciona

- `site/js/sala.js` é a camada de sala, comum a todos os jogos: conexões WebRTC (canais de dados) por meio do PeerJS, em estrela em volta de quem criou a sala (o anfitrião). O código da sala (5 letras) é o id do anfitrião no servidor de sinalização; o link é `https://<site>/#CODIGO`. A sala cuida de entrada e saída, lista de membros, ping e queda; o jogo só troca as próprias mensagens.
- O servidor de sinalização é o gratuito do PeerJS (`0.peerjs.com`), usado só para os navegadores se acharem; os dados do jogo vão direto entre os navegadores.
- Para redes mais fechadas (NAT simétrico, alguns 4G, Wi-Fi de empresa), o retransmissor (TURN) é o da Cloudflare, que tem servidores no Brasil: `site/js/rede.js` pede credenciais de 24 h à Netlify Function `netlify/functions/ice.mjs` (`/api/ice`), e a chave do TURN fica só nas variáveis de ambiente da Netlify. Se a função faltar ou falhar, vale a configuração embutida do PeerJS 1.5.4, a mesma de antes (STUN do Google e TURN do próprio PeerJS). Esse TURN do PeerJS (`eu-0` e `us-0.turn.peerjs.com`) não responde: os nomes não tinham DNS em 27 e 28/10/2026, então sem a chave da Cloudflare quem está em rede fechada continua sem conseguir entrar, como antes.
- Modos de rede para teste, no endereço: `?rede=peerjs` volta à configuração embutida do PeerJS (a de antes) e `?rede=retransmissor` força todas as ligações pelo TURN.
- Cada ligação tem dois canais: o confiável do PeerJS (controle da sala, estado da rodada, bombas) e um canal rápido pré-negociado, sem ordem e sem retransmissão (retratos e posições), para um pacote perdido nunca segurar os seguintes.
- `site/js/pavio/regras.js` é a simulação pura (sem DOM nem rede). O anfitrião roda a 60 passos por segundo e manda um retrato 20 vezes por segundo, com a grade só quando ela muda e eventos repetidos em 3 retratos seguidos.
- Cada jogador anda no próprio aparelho, sem esperar a rede, com a mesma função de movimento das regras (`moverComColisao`), e manda a posição ~30 vezes por segundo; o anfitrião aceita só posição plausível (velocidade e paredes) e o aparelho se corrige se ficar longe da versão do anfitrião. Os outros jogadores aparecem com um atraso que se ajusta à oscilação da rede. Chamas só machucam depois de 0,12 s, para compensar o atraso das posições.
- A lista da sala mostra o ping de cada um até o anfitrião, e 🐢 quando a ligação passa por retransmissor (TURN), que é mais lenta.
- Reconexão: o anfitrião pinga todos a cada segundo; 3,5 s sem notícia marca a pessoa como fora e 10 s a tiram da sala. Ao entrar, cada membro recebe uma chave; quem cai tenta voltar sozinho com essa chave (até com um id novo no PeerJS) e retoma a mesma vaga. Quem sai de propósito, ou o anfitrião, manda um "tchau" e ninguém espera os 10 s.
- Banda medida em 27/10/2026 (8 jogadores, mesmo formato de retrato): cada retrato tem em média 350 a 420 bytes (máximo de ~1.025, abaixo do limite de fragmentação), e o anfitrião envia ~0,55 Mbps para 7 membros, no pior caso ~0,9 Mbps; recebe ~0,3 Mbps.
- Controles: teclado (duas direções seguradas viram "siga nesta e vire naquela"), toque (o joystick aparece onde o dedo encosta no lado esquerdo, e qualquer toque no lado direito solta bomba) e controle de videogame.
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

Netlify, time pessoal `vhccruz-projects`, projeto `salinha-jogos` (id `dddafa63-ffb4-434e-b394-c39aad054106`; o nome `salinha` já era de outra pessoa), em https://salinha-jogos.netlify.app. A pasta publicada é `site/` e as funções ficam em `netlify/functions/` (ambas no `netlify.toml`); pela CLI, `netlify deploy --prod --dir site --functions netlify/functions`.

O TURN da Cloudflare depende de duas variáveis de ambiente no projeto da Netlify, criadas pelo Victor numa conta Cloudflare pessoal (Realtime → TURN Server → criar chave): `CLOUDFLARE_TURN_KEY_ID` e `CLOUDFLARE_TURN_API_TOKEN`. Sem elas, `/api/ice` responde 503 e o site segue com a configuração embutida do PeerJS, igual à de antes. Custo: 1.000 GB por mês grátis, depois US$ 0,05/GB; o uso esperado fica abaixo de 10 GB por mês.

## Limitações conhecidas

- Se o anfitrião fechar a aba, a sala acaba para todos (não há troca de anfitrião).
- O anfitrião joga sem atraso de rede e os outros com o atraso da conexão até ele; numa mesma cidade isso fica em dezenas de milissegundos.
- O servidor de sinalização do PeerJS é gratuito e sem garantia; se ficar fora do ar, ninguém consegue criar nem entrar em sala (quem já está jogando continua).
- Se a rede do próprio anfitrião cair, os membros tentam voltar por 10 s, mas isso só dá certo se o anfitrião recuperar o mesmo código no servidor de sinalização; esse caso não foi testado.
- Quem recarrega a página perde a vaga (a chave de volta fica só na memória da aba).
- Não há login; o placar vale só enquanto a rodada existir.
- Aba em segundo plano para de desenhar e de andar (o navegador pausa o quadro); o anfitrião continua simulando.

## Próximos passos possíveis

- Login e microtransações (o passo seguinte que o Victor citou), por exemplo com Supabase Auth.
- Sinalização própria, para não depender do servidor gratuito do PeerJS (o TURN já é da Cloudflare). Comparativo de 27/10/2026: servidor PeerJS no Fly.io em São Paulo (~US$ 2 a 3 por mês, conta nova) ou WebRTC próprio com Supabase Realtime (grátis, mas projeto grátis pausa depois de uma semana sem uso).
- Troca de anfitrião quando ele sai (estimativa de 27/10/2026: 1,5 a 2 dias para a sala sobreviver e a partida em andamento recomeçar com o placar mantido; continuar a partida do ponto exato custa mais uns 2 dias), e mais jogos sobre a mesma sala.
