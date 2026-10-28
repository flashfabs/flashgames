# AGENTS.md — Salinha

Instruções para quem trabalhar nesta pasta (Claude Code ou Codex). Elas se somam ao `AGENTS.md` da pasta pai e às regras globais do Victor.

## O que é

Site público de jogos com a galera, sem cadastro: alguém cria uma sala, manda o link e quem abre entra direto; todos ligados por WebRTC. O primeiro jogo é o Pavio, arena de bombas original para até 8 pessoas. Arquitetura, limitações e próximos passos no [README.md](README.md).

## Estrutura

- `site/` é o que vai para o ar (estático, sem build). `site/js/sala.js` é a camada de sala comum a todos os jogos; `site/js/pavio/` é o jogo (`regras.js` simulação pura, `pavio.js` fluxo de rodada, rede e quadro, `desenho.js` canvas, `controles.js` teclado, toque e controle).
- `site/js/rede.js` escolhe os servidores STUN/TURN e `netlify/functions/ice.mjs` gera as credenciais do TURN da Cloudflare (`/api/ice`).
- `testes/` tem os testes das regras e da rede (`npm test`, Node 22, sem dependências) e `testes/e2e/` os de ponta a ponta com Playwright (`npm run e2e`, porta livre escolhida sozinha, precisa de internet); detalhes na seção Testes do README.

## Trabalho em paralelo (várias sessões ao mesmo tempo)

- Este é um repositório git próprio (a pasta pai não é git, de propósito). A branch `main` é a base; cada sessão trabalha na sua worktree e na sua branch, com commits pequenos em Conventional Commits, em inglês.
- O plano em vigor, com as frentes, os donos de cada arquivo e os contratos entre elas, está em [docs/plano-noite-2026-10-28.md](docs/plano-noite-2026-10-28.md). Mexa só nos arquivos da sua frente; ligar o seu código em arquivo de outra frente com uma ou duas linhas é aceito, desde que dito no commit.
- Para testar, servir a própria worktree numa porta só sua (a que veio no pedido da sessão), por exemplo `python3 -m http.server <porta> --directory site`, e abrir duas abas: uma cria a sala e a outra entra pelo link. Aba em segundo plano não desenha nem anda (o navegador pausa o `requestAnimationFrame`); trazer para a frente a aba que se quer testar.
- Mudou o formato de alguma mensagem entre navegadores? Subir `VERSAO_PROTOCOLO` em `site/js/sala.js`, para página velha e nova não se misturarem numa sala. Em conflito de merge, vale o maior número mais um.

## Integração e publicação (protocolo da noite de 28/10/2026)

Desde 28/10/2026, por pedido do Victor, cada frente integra e publica a própria entrega, uma de cada vez, seguindo estes passos à risca. A pasta principal `/Users/vhccruz/Dev/claude-code-config/salinha` fica sempre na `main` e sem alterações; ninguém edita nada nela à mão.

1. Pegue a trava: `until mkdir /Users/vhccruz/Dev/claude-code-config/salinha/.git/integracao.lock 2>/dev/null; do sleep 20; done` e escreva nela quem você é e a hora (`echo "<sessão> $(date)" > .../integracao.lock/dono`). Esperando a trava, use a ferramenta Monitor com esse laço, não fique consultando em volta.
2. Na sua worktree: `git merge main`, resolva conflitos (você conhece o seu código; preserve o das outras frentes), e rode `npm test` e `npm run e2e` (antes, `npm ci` se faltar `node_modules`). Tudo tem que passar.
3. Avance a `main`: `git -C /Users/vhccruz/Dev/claude-code-config/salinha merge --ff-only <sua-branch>`. Se não for avanço direto, alguém integrou antes: volte ao passo 2.
4. Publique a `main`: `pasta=$(scripts/preparar-publicacao.sh <sua área de rascunho>/publicacoes)`. O script monta, a partir da `main` da pasta principal (ou de `REF=<commit>`), uma pasta nova só com `netlify.toml`, `site/` e `netlify/`, grava `site/versao.json` com commit e hora, instala as dependências de produção das funções, se houver, e imprime o caminho da pasta na última linha. Chame `deploy-site` do MCP `netlify-pessoal` com `deployDirectory` igual a essa pasta e `siteId` `dddafa63-ffb4-434e-b394-c39aad054106`. Nunca publique da worktree nem da pasta do repositório (ela tem `node_modules` e worktrees). Não use `rm -rf`: o script cria sempre uma pasta nova. Pacote de que uma função precisa em produção vai em `dependencies` do `package.json` da raiz (nunca em `devDependencies`), para o script instalar.
5. Confira produção: `npm run fumaca`. Ele espera até 2 minutos `https://salinha-jogos.netlify.app/versao.json` mostrar o commit da `main` (ou `COMMIT=<commit>`), confere as funções e joga uma rodada com dois jogadores no site publicado. Falhou? Corrija ou reverta antes de soltar a trava.
6. Solte a trava (`rm .../integracao.lock/dono && rmdir .../integracao.lock`) e mande à frente 5 (`pavio-testes`) um resumo de uma linha do que foi publicado e o commit.

Se algo quebrar em produção depois da sua publicação, corrigir é a sua prioridade número um. Trava presa há mais de 45 minutos com o dono parado pode ser removida, registrando isso no relatório da noite. Nunca force push, nunca `reset` na `main`; para desfazer, `git revert`.

## Convenções

- Textos da interface em português do Brasil; comentários e commits em inglês.
- Os identificadores do código ficam em português neste projeto, por decisão do Victor em 27/10/2026 (exceção à regra global de nomes em inglês). Código novo segue o mesmo padrão.
- Nunca usar hard wrap em texto (uma frase por linha), inclusive em Markdown e commits.
- Rodar `npm test` antes de cada commit; teste novo para regra nova. Mudou fluxo de sala, rede, controles ou tela? Rodar também `npm run e2e`.
- Nada de conta nova, serviço pago ou credencial sem o Victor aprovar antes. Na noite de 28/10/2026, ninguém faz pergunta ao Victor: decida, registre no relatório da noite e siga.
