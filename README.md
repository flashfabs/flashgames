# Salinha

Site público para jogar com a galera direto no navegador, sem cadastro: alguém cria uma sala, manda o link e quem abre o link cai direto na sala. Pedido do Victor em 27/10/2026 (áudio): sala por link, conexão em tempo real por WebRTC, base para vários jogos, primeiro jogo de bombas para até 8 pessoas com WASD/setas e espaço.

O primeiro jogo é o **Pavio**, uma arena de bombas original (nome, personagens e visual próprios): explodir caixas, pegar itens e ser o último de pé. A morte súbita começa mais cedo a cada partida da rodada (de 2 minutos no Pátio a 90 s na Fornalha) e fecha a arena de fora para dentro.

Fluxo de uma sala (pedidos do Victor de 27/10/2026):

- **Lobby:** cada um marca "Estou pronto"; quando todos estão prontos, a rodada começa sozinha. Sozinho na sala vira treino.
- **Robôs:** no lobby, o anfitrião adiciona robôs (🤖 Nome) para treinar sozinho ou completar a sala até 8 jogadores, escolhe a dificuldade de cada um (fácil, médio, difícil) e tira quando quiser. Robôs estão sempre prontos, não contam para "se alguém sai, a rodada acaba" e cedem a vaga se entrar gente e a sala passar de 8.
- **Rodada de 5 partidas:** cada partida usa um mapa mais fechado, com desenho próprio e simétrico (todo ponto de nascimento tem os mesmos arredores) e duas variantes que se alternam: Pátio (uma praça sem pilares ou duas avenidas sem caixas), Depósito (corredores no meio das caixas), Muralhas (quatro pátios com portões), Labirinto (corredores apertados) e Fornalha (uma fornalha no meio). Cada partida libera poderes novos: 💣 mais bombas, 🔥 mais alcance e 🌀 atalho (empurrando uma caixa por um instante você aparece do outro lado; cada item dá uma carga, até 5, e cada caixa atravessada gasta uma) desde a primeira, 👟 tênis e 🦶 chute (andar contra uma bomba a faz deslizar até bater em algo) na segunda, 🛡️ escudo e 🎯 detonador (as bombas só explodem quando você aperta de novo sem bomba sobrando, ou depois de 10 s) na terceira, 💥 fogo perfurante (atravessa caixas) e 🧲 ímã (por 8 s, itens a até 3 casas voam até você) na quarta e 👻 fantasma (atravessa caixas e bombas por 8 s) e ❄️ gelo (cada item dá 3 tiros; o tiro voa até 6 casas para onde você olha e congela a primeira bomba por 3 s, com o pavio parado; o fogo de outra bomba ainda a explode) na quinta.
- **Pontos:** caixa destruída vale 1 ponto para o dono da bomba, eliminação vale 5 (explodir a si mesmo não conta) e partida vencida vale 15. Depois de cada partida aparece o placar com a quebra por tipo; no fim da rodada, o campeão é quem tem mais pontos (desempate por vitórias).
- **Se alguém sai** no meio da rodada, ela acaba, o placar final aparece com o motivo e todos voltam ao lobby.
- **Quem cai** (troca de Wi-Fi, celular bloqueado) tem 10 segundos para voltar: a vaga, a cor e os pontos ficam guardados, o boneco fica parado onde estava (e pode ser atingido) e a lista mostra "📶 reconectando". Passados 10 s sem notícia, vale a regra de cima. Pedido do Victor em 27/10/2026.

## Como funciona

- `site/js/sala.js` é a camada de sala, comum a todos os jogos: conexões WebRTC (canais de dados) por meio do PeerJS, em estrela em volta de quem criou a sala (o anfitrião). O código da sala (5 letras) é o id do anfitrião no servidor de sinalização; o link é `https://<site>/#CODIGO`. A sala cuida de entrada e saída, lista de membros, ping e queda; o jogo só troca as próprias mensagens.
- O servidor de sinalização é o gratuito do PeerJS (`0.peerjs.com`), usado só para os navegadores se acharem; os dados do jogo vão direto entre os navegadores.
- Para redes mais fechadas (NAT simétrico, alguns 4G, Wi-Fi de empresa), o retransmissor (TURN) é o da Cloudflare, que tem servidores no Brasil: `site/js/rede.js` pede credenciais de 24 h à Netlify Function `netlify/functions/ice.mjs` (`/api/ice`), e a chave do TURN fica só nas variáveis de ambiente da Netlify. Se a função faltar ou falhar, vale a configuração embutida do PeerJS 1.5.4, a mesma de antes (STUN do Google e TURN do próprio PeerJS). Esse TURN do PeerJS (`eu-0` e `us-0.turn.peerjs.com`) não responde: os nomes não tinham DNS em 27 e 28/10/2026, então sem a chave da Cloudflare quem está em rede fechada continua sem conseguir entrar, como antes.
- Modos de rede para teste, no endereço: `?rede=peerjs` volta à configuração embutida do PeerJS (a de antes) e `?rede=retransmissor` força todas as ligações pelo TURN.
- Cada ligação tem dois canais: o confiável do PeerJS (controle da sala, estado da rodada, bombas) e um canal rápido pré-negociado, sem ordem e sem retransmissão (retratos e posições), para um pacote perdido nunca segurar os seguintes.
- `site/js/pavio/robo.js` é a IA dos robôs, que só existem no anfitrião: a cada passo da simulação cada robô lê a partida e devolve a mesma entrada de uma pessoa (`{ d, d2 }` e bomba). Ela calcula um mapa de perigo (quando cada célula vai pegar fogo, com reação em cadeia e morte súbita) e uma rota de fuga com tempo, e nunca solta bomba sem ter para onde correr. Bomba de detonador alheia conta como podendo explodir a qualquer momento, bomba congelada espera o gelo passar e bomba chutada pode parar em qualquer casa do caminho; com o detonador e uma bomba só, o robô solta, foge e detona de um lugar seguro, e por isso deixa de buscar bombas extras; sem saída e com gelo, congela a bomba que o mataria e foge; chute e atalho ele não usa (nunca anda contra bomba ou caixa). Quando a morte súbita começa, todos os níveis vão atrás dos outros, para a partida não acabar empatada com todo mundo esmagado. O fácil reage devagar, vagueia e só quebra caixas; o médio caça os outros; o difícil reage rápido, prefere fugas longe dos adversários e procura encurralar quem está perto.
- `site/js/pavio/regras.js` é a simulação pura (sem DOM nem rede). O anfitrião roda a 60 passos por segundo e manda um retrato 20 vezes por segundo, com a grade só quando ela muda e eventos repetidos em 3 retratos seguidos.
- Cada jogador anda no próprio aparelho, sem esperar a rede, com a mesma função de movimento das regras (`moverComColisao`), e manda a posição ~30 vezes por segundo; o anfitrião aceita só posição plausível (velocidade e paredes) e o aparelho se corrige se ficar longe da versão do anfitrião. Os outros jogadores aparecem com um atraso que se ajusta à oscilação da rede. Chamas só machucam depois de 0,12 s, para compensar o atraso das posições.
- A lista da sala mostra o ping de cada um até o anfitrião, e 🐢 quando a ligação passa por retransmissor (TURN), que é mais lenta.
- Reconexão: o anfitrião pinga todos a cada segundo; 3,5 s sem notícia marca a pessoa como fora e 10 s a tiram da sala. Ao entrar, cada membro recebe uma chave; quem cai tenta voltar sozinho com essa chave (até com um id novo no PeerJS) e retoma a mesma vaga. Quem sai de propósito, ou o anfitrião, manda um "tchau" e ninguém espera os 10 s.
- Banda medida em 27/10/2026 (8 jogadores, mesmo formato de retrato): cada retrato tem em média 350 a 420 bytes (máximo de ~1.025, abaixo do limite de fragmentação), e o anfitrião envia ~0,55 Mbps para 7 membros, no pior caso ~0,9 Mbps; recebe ~0,3 Mbps.
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

Três comandos, todos rodando na raiz do repositório:

- `npm test`: testes das regras do jogo (`testes/*.test.mjs`, Node 22, sem dependências, menos de 1 s).
- `npm run e2e`: testes de ponta a ponta (`testes/e2e/*.spec.mjs`) com Playwright e Chromium sem janela; cada jogador é um navegador de verdade na sua própria página. A suíte toda leva cerca de 1 min 45 s.
- `npm run fumaca`: teste de fumaça contra a produção (`testes/e2e/producao.fumaca.mjs`, cerca de 15 s): espera `/versao.json` mostrar o commit da `main` (ou `COMMIT=<commit>`), confere que `/api/ice` responde (503 enquanto a chave do TURN não existir) e joga o começo de uma rodada com dois jogadores no site publicado. `SALINHA_URL=<endereço>` aponta para outro lugar, como uma prévia da Netlify.

Para publicar, `scripts/preparar-publicacao.sh <pasta>` monta uma pasta nova a partir da `main` (só `netlify.toml`, `site/` e `netlify/`, com `site/versao.json` contendo commit e hora, e as `dependencies` das funções instaladas quando houver) e imprime o caminho dela; o passo a passo está no `AGENTS.md`.

Na primeira vez numa máquina nova, instalar as dependências e o Chromium do Playwright:

```bash
npm install
```

```bash
npx playwright install chromium
```

Como funcionam os de ponta a ponta:

- O Playwright sobe o site numa porta livre de `127.0.0.1` escolhida a cada execução (`python3 -m http.server`; `SALINHA_PORTA=<porta>` fixa uma) e o derruba no fim, então várias worktrees podem rodar a suíte ao mesmo tempo.
- A sinalização é a do PeerJS na internet (`0.peerjs.com`), igual à produção, então os testes precisam de internet; a fonte e o PeerJS também vêm de CDN. Por isso há 1 nova tentativa automática por teste: um teste que só passa na segunda aparece como `flaky` no relatório, o que aponta rede instável e não defeito do jogo.
- Cada jogador tem o seu próprio contexto de navegador (página e armazenamento próprios), porque página em segundo plano não roda `requestAnimationFrame`. Para rodar um arquivo só, `npx playwright test <nome>` (um teste de cada vez).
- O estado do jogo é lido pelo gancho `window.__salinha`, que `site/js/app.js` só instala quando o endereço tem `?teste=1` (os testes abrem `/?teste=1` e o link do convite com `?teste=1`). Ele só lê: `__salinha.sala()` devolve código, link, id e membros, e `__salinha.jogo()` devolve uma cópia do estado da rodada e da partida, vinda de `espiar()` no objeto que `criarPavio` devolve em `site/js/pavio/pavio.js`. Quem mexer no formato do estado do Pavio deve manter `espiar()` funcionando.
- Para planejar os movimentos, a página do anfitrião de alguns testes recebe um `Math.random` puxado para `[0,9, 1)` (função `semCaixas` em `testes/e2e/mesa.mjs`): a arena sai sem caixas e sem itens e cada jogador nasce no canto da sua ordem de entrada (anfitrião em (1, 1), o segundo em (19, 13) e assim por diante). O teste de desempenho usa o mapa normal, com caixas e itens.
- Os jogadores andam pelas setas do teclado (ou por toque, no iPad), seguindo um caminho calculado sobre a grade lida do jogo (`andarAte` em `testes/e2e/mesa.mjs`).
- Qualquer erro de JavaScript numa página reprova o teste. Quando um teste falha, o console de todas as páginas e o rastro do Playwright ficam em `test-results/` (`npx playwright show-trace <arquivo>`).

O que cada cenário cobre:

- `sala.spec.mjs`, entrada e largada: o anfitrião cria a sala e 4 convidados entram pelo link do convite; todos veem os 5 nomes e a coroa do anfitrião; com 4 prontos o anfitrião vê "Só falta você." e a rodada não começa; quando ele marca pronto, todos veem "Partida 1 de 5 · Pátio" e a partida começa. Um convidado anda 2 casas e o anfitrião vê a posição nova; ele solta uma bomba, que aparece para o anfitrião e para outro convidado, foge da explosão e continua vivo depois que ela estoura.
- `sala.spec.mjs`, saída no meio: anfitrião e 2 convidados em partida; um convidado clica em "Sair" e volta ao início; para os outros dois a rodada acaba com "Rodada interrompida" e o motivo "<nome> saiu da sala, então a rodada acabou.", o placar final lista os 3 e "Voltar ao lobby agora" leva todos de volta ao lobby.
- `pontos.spec.mjs`, eliminação e placar: anfitrião e convidada andam até se encontrar na linha de cima; a bomba da convidada elimina o anfitrião; a tela de resultado mostra "Íris venceu a partida! 🏆" (e "Você venceu a partida! 🏆" para ela), o placar com 1 vitória, 0 caixas, 1 eliminação e 20 pontos (5 + 15) para ela e tudo zero para ele, a legenda dos pontos e ⭐ 20 na lista da sala; as estatísticas da partida que chegam ao convidado batem com o que aconteceu (bomba solta, eliminação, morte do anfitrião pela bomba dela, distância andada, tempo vivo); depois do resultado, a partida 2 (Depósito) começa sozinha.
- `toque.spec.mjs`, iPad: um iPad (7ª geração, deitado, toque ativo) entra na sala de um computador. Antes, numa página comum, o teste confirma que os gestos de pinça e de rolar do navegador de teste funcionam, para a checagem valer. No lobby o iPad mostra as instruções de toque e ainda não tem camada de toque, e a sala não rola nem aumenta com pinça; com a partida começando, a camada de toque e a dica 💣 aparecem (no computador, não); arrastar o dedo no lado esquerdo anda e o anfitrião vê; tocar no lado direito solta bomba; rolar e fazer pinça durante o jogo não mexem na página.
- `jornada.spec.mjs`, casos da jornada: código digitado errado e sala que não existe mais deixam a pessoa na tela inicial com uma explicação, e de lá criar sala continua funcionando; quem chega no meio de uma partida fica assistindo, fora da escalação, com aviso na tela e "assistindo" na lista, e não solta bomba. As checagens olham o que a pessoa consegue fazer, não o texto exato.
- `acessibilidade.spec.mjs`, acessibilidade: axe-core (WCAG 2.1 A e AA) na tela inicial e no lobby, no computador e no celular; problema sério ou crítico reprova.
- `rede-ruim.spec.mjs`, rede ruim: todos os canais de dados dos dois jogadores com 120 a 200 ms de atraso e 10% de perda no canal rápido; o ping aparece alto na lista, o convidado anda sem ser puxado para trás, o anfitrião vê o movimento e a bomba na casa certa, e o convidado vê o anfitrião andar.
- `reconexao.spec.mjs`, queda e volta: um script de teste corta todos os canais de dados de um convidado nos dois sentidos (como uma queda de Wi-Fi, com a sinalização no ar); com 6 s de corte o anfitrião marca o convidado como fora, ele volta sozinho com o mesmo id, a partida segue e o anfitrião o vê andar de novo; com 20 s de corte, passados os 10 s de tolerância, a rodada acaba com o nome dele no motivo e a página dele mostra a queda.
- `robos.spec.mjs`, robôs: o anfitrião adiciona um robô de cada nível pelo lobby, tira um quarto e troca o nível de outro; o convidado vê os 3 robôs prontos ("robô fácil", "robô médio", "robô difícil") sem os botões do anfitrião; com só as 2 pessoas prontas a partida começa com os 3 robôs na escalação, e eles andam e quebram caixas na simulação do anfitrião e na tela do convidado.
- `desempenho.spec.mjs`, desempenho com 8 jogadores: sala cheia (os 7 convidados entram ao mesmo tempo, e no fim uma nona pessoa é recusada com a explicação de sala cheia), mapa normal, convidados andando a esmo e 3 deles soltando bombas; mede por 8 s o intervalo entre quadros e o tempo gasto em cada quadro no anfitrião e num convidado, e o tempo de cada tique da simulação no anfitrião; depois repete por mais 8 s com a CPU desses dois 4x mais lenta (limitação do Chrome DevTools, parecido com um tablet). Os números saem no console a cada execução e anexados ao relatório; os limites que reprovam são folgados (quadro p95 abaixo de 40 ms, trabalho por quadro e tique p95 abaixo de 8 ms; com a CPU 4x mais lenta, 60 ms e 16 ms), feitos para pegar uma piora grande e não variação de máquina. O anfitrião e o convidado medidos rodam cada um no seu próprio Chromium: com as 8 páginas num navegador só, o processo de GPU em software que elas dividem segura tudo em ~20 fps, mesmo com o jogo gastando 0,3 ms por quadro (com 2 páginas são 60 fps).

Números medidos em 27/10/2026, MacBook Pro M5 Pro, Chromium 153 sem janela, 8 jogadores: anfitrião e convidado a 60 fps (quadro p50 e p95 de 16,7 ms, pior quadro 50 ms), trabalho por quadro de 0,3 ms (p50) e 0,6 ms (p95), tique da simulação do anfitrião de 0,1 a 0,2 ms (p95), nenhuma tarefa longa.

Com a CPU 4x mais lenta, medido em 28/10/2026 na `main` com os poderes e o visual novos: anfitrião e convidado continuam a 60 fps, trabalho por quadro de 1,2 a 1,5 ms (p50) e 2,4 a 2,6 ms (p95), tique da simulação do anfitrião de 0,8 ms (p95).

Um segundo teste de desempenho põe o anfitrião sozinho com 7 robôs difíceis, que rodam dentro da simulação dele: em 28/10/2026, 60 fps, tique da simulação de 0,6 ms (p95) e 2,1 ms com a CPU 4x mais lenta (pior tique 4,5 ms), trabalho por quadro de 0,6 ms e 1,8 ms (p95).

O que os testes de ponta a ponta ainda não cobrem: Safari e Firefox (só Chromium), rede ruim ou retransmissor TURN (as páginas estão na mesma máquina), fechar a aba em vez de clicar em "Sair" (a queda só é percebida pelo silêncio de 12 s), o anfitrião saindo, a morte súbita, os poderes de cada mapa, pontos por caixa na tela de resultado, a rodada completa de 5 partidas e o controle de videogame.

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
