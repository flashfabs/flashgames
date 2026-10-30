# AGENTS.md — Salinha

Instruções para quem trabalhar neste repositório (Claude Code ou Codex). Elas se somam às regras globais do Victor.

O repositório é `flashfabs/flashgames` no GitHub, da organização Flash Fabs, público para receber outros colaboradores. Ele nasceu como `vhccruz/salinha` em 28/10/2026 e foi renomeado e transferido em 29/10/2026; o GitHub redireciona o endereço antigo, e o produto no site continua se chamando Salinha. O clone de trabalho do Victor fica em `/Users/vhccruz/Dev/salinha`. Até 28/10/2026 o projeto morava em `~/Dev/claude-code-config/salinha`, e é dessa época o histórico da noite em `docs/`.

## O que é

Site público de jogos com a galera, sem cadastro: alguém cria uma sala, manda o link e quem abre entra direto; todos ligados por WebRTC. O primeiro jogo é o Pavio, arena de bombas original para até 8 pessoas. Arquitetura, limitações e próximos passos no [README.md](README.md).

## Estrutura

- `site/` é o que vai para o ar (estático, sem build). `site/js/sala.js` é a camada de sala comum a todos os jogos; `site/js/pavio/` é o jogo (`regras.js` simulação pura, `pavio.js` fluxo de rodada, rede e quadro, `desenho.js` canvas, `controles.js` teclado, toque e controle).
- `site/js/rede.js` escolhe os servidores STUN/TURN e `netlify/functions/ice.mjs` gera as credenciais do TURN da Cloudflare (`/api/ice`).
- `testes/` tem os testes das regras e da rede (`npm test`, Node 22, sem dependências) e `testes/e2e/` os de ponta a ponta com Playwright (`npm run e2e`, porta livre escolhida sozinha, precisa de internet); detalhes na seção Testes do README.

## Trabalho em paralelo (várias sessões ao mesmo tempo)

- A branch `main` é a base e vive no GitHub (`origin`). Com várias sessões ao mesmo tempo, cada uma trabalha na sua worktree e na sua branch, com commits pequenos em Conventional Commits, em inglês.
- O último plano de trabalho em paralelo, com as frentes, os donos de cada arquivo e os contratos entre elas, é o da noite de 28/10/2026, em [docs/plano-noite-2026-10-28.md](docs/plano-noite-2026-10-28.md). Numa divisão por frentes, cada sessão mexe só nos arquivos da sua; ligar o seu código em arquivo de outra frente com uma ou duas linhas é aceito, desde que dito no commit.
- Para testar, servir a própria worktree numa porta só sua (a que veio no pedido da sessão), por exemplo `python3 -m http.server <porta> --directory site`, e abrir duas abas: uma cria a sala e a outra entra pelo link. Aba em segundo plano não desenha nem anda (o navegador pausa o `requestAnimationFrame`); trazer para a frente a aba que se quer testar.
- Mudou o formato de alguma mensagem entre navegadores? Subir `VERSAO_PROTOCOLO` em `site/js/sala.js`, para página velha e nova não se misturarem numa sala. Em conflito de merge, vale o maior número mais um.

## Integração e publicação

Desde 29/10/2026 o projeto `salinha-jogos` da Netlify está ligado a este repositório pelo app da Netlify no GitHub. Publicar é juntar na `main`: cada push na `main` vira deploy de produção em um ou dois minutos, e cada pull request ganha uma prévia com endereço próprio. Quem tem escrita no repositório (o Criba, `Cribaaa` no GitHub, desde 28/10/2026) integra e publica sozinho por estes passos, sem precisar do Victor nem de conta na Netlify. Variáveis de ambiente, domínio e o resto do painel da Netlify continuam com o Victor (time `vhccruz-projects`).

1. Trabalhe numa branch, com commits pequenos, e rode `npm test`; se mexeu em fluxo de sala, rede, controles ou tela, rode também `npm run e2e` (na primeira vez numa máquina, `npm ci` e `npx playwright install chromium`). Tudo tem que passar.
2. Abra um pull request contra a `main`. A Netlify comenta no PR o endereço da prévia (`https://deploy-preview-<número do PR>--salinha-jogos.netlify.app`) e marca a checagem do deploy como aprovada ou com falha. Jogue na prévia; `SALINHA_URL=<endereço da prévia> COMMIT=<último commit do PR> npm run fumaca` confere a versão e joga uma rodada com dois jogadores nela. Prévias gravam perfis e salas em armazéns de teste (`perfis-teste`, `salas-farm-teste`), nunca nos de produção.
3. Junte o PR na `main` pelo GitHub (ou `git merge` e `git push origin main`). O push dispara o deploy de produção.
4. Confira a produção: com a `main` local atualizada (`git pull --ff-only origin main`), `npm run fumaca` espera até 2 minutos `https://salinha-jogos.netlify.app/versao.json` mostrar o commit da `main`, confere as funções e joga uma rodada com dois jogadores no site publicado. Quem escreve o `versao.json` é o comando de build do `netlify.toml` (`scripts/gerar-versao.mjs`).

Se a produção quebrar depois de um merge seu, corrigir é a sua prioridade número um: `git revert` do commit e push na `main` publica a volta pelo mesmo caminho. Nunca force push, nunca `reset` na `main`.

Pacote de que uma função precisa em produção vai em `dependencies` do `package.json` da raiz, nunca em `devDependencies`: o build da Netlify instala só as `dependencies` (`NPM_FLAGS = "--omit=dev"` no `netlify.toml`).

Com várias sessões no Mac do Victor juntando na `main` ao mesmo tempo, use a trava antes do passo 3: `until mkdir /Users/vhccruz/Dev/salinha/.git/integracao.lock 2>/dev/null; do sleep 20; done` (esperando com a ferramenta Monitor, não consultando em volta), escreva nela quem você é e a hora (`echo "<sessão> $(date)" > .../integracao.lock/dono`), traga a `main` para a sua branch e rode os testes de novo, e solte a trava (`rm .../integracao.lock/dono && rmdir .../integracao.lock`) depois do passo 4. Trava presa há mais de 45 minutos com o dono parado pode ser removida, avisando as outras sessões. Se houver uma sessão cuidando da qualidade, mande a ela um resumo de uma linha do que foi publicado e o commit.

Publicação à mão, só para quem tem acesso ao time da Netlify e só quando o build da Netlify não servir: `pasta=$(scripts/preparar-publicacao.sh <sua área de rascunho>/publicacoes)` monta uma pasta limpa da `main` (recusa quando a `main` local está atrás da `origin/main`; `REF=<commit>` monta outro commit), e o `deploy-site` do MCP `netlify-pessoal` publica essa pasta com `siteId` `dddafa63-ffb4-434e-b394-c39aad054106`; depois, `npm run fumaca`. Nunca publique da worktree nem da pasta do repositório (ela tem `node_modules` e worktrees). Um deploy à mão vale até o próximo push na `main`, que publica de novo pelo GitHub.

## Convenções

- Textos da interface em português do Brasil; comentários e commits em inglês.
- Os identificadores do código ficam em português neste projeto, por decisão do Victor em 27/10/2026 (exceção à regra global de nomes em inglês). Código novo segue o mesmo padrão.
- Nunca usar hard wrap em texto (uma frase por linha), inclusive em Markdown e commits.
- Rodar `npm test` antes de cada commit; teste novo para regra nova. Mudou fluxo de sala, rede, controles ou tela? Rodar também `npm run e2e`.
- Nada de conta nova, serviço pago ou credencial sem o Victor aprovar antes.
- Para ver o site local no navegador do app, `.claude/launch.json` tem a configuração `salinha` (porta 8792, pasta `site/`).
