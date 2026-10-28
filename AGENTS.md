# AGENTS.md — Salinha

Instruções para quem trabalhar nesta pasta (Claude Code ou Codex). Elas se somam ao `AGENTS.md` da pasta pai e às regras globais do Victor.

## O que é

Site público de jogos com a galera, sem cadastro: alguém cria uma sala, manda o link e quem abre entra direto; todos ligados por WebRTC. O primeiro jogo é o Pavio, arena de bombas original para até 8 pessoas. Arquitetura, limitações e próximos passos no [README.md](README.md).

## Estrutura

- `site/` é o que vai para o ar (estático, sem build). `site/js/sala.js` é a camada de sala comum a todos os jogos; `site/js/pavio/` é o jogo (`regras.js` simulação pura, `pavio.js` fluxo de rodada, rede e quadro, `desenho.js` canvas, `controles.js` teclado, toque e controle).
- `site/js/rede.js` escolhe os servidores STUN/TURN e `netlify/functions/ice.mjs` gera as credenciais do TURN da Cloudflare (`/api/ice`).
- `testes/` tem os testes das regras e da rede (`npm test`, Node 22, sem dependências) e `testes/e2e/` os de ponta a ponta com Playwright (`npm run e2e`, porta 8805, precisa de internet); detalhes na seção Testes do README.

## Trabalho em paralelo (várias sessões ao mesmo tempo)

- Este é um repositório git próprio (a pasta pai não é git, de propósito). A branch `main` é a base; cada sessão trabalha na sua worktree e na sua branch, com commits pequenos em Conventional Commits, em inglês.
- Não fazer merge na `main` nem rebase dela por conta própria: quem integra é a sessão principal, quando o Victor pedir. Ao terminar, avisar o nome da branch e o que mudou.
- Não publicar em produção (Netlify `salinha-jogos`): só a sessão principal publica, a partir da `main` integrada.
- Para testar, servir a própria worktree numa porta só sua (a que veio no pedido da sessão), por exemplo `python3 -m http.server <porta> --directory site`, e abrir duas abas: uma cria a sala e a outra entra pelo link. Aba em segundo plano não desenha nem anda (o navegador pausa o `requestAnimationFrame`); trazer para a frente a aba que se quer testar.
- Mudou o formato de alguma mensagem entre navegadores? Subir `VERSAO_PROTOCOLO` em `site/js/sala.js`, para página velha e nova não se misturarem numa sala.
- Mexer o mínimo fora da sua área, para o merge com as outras sessões ser simples. Se precisar mudar algo comum (por exemplo o formato do retrato em `pavio.js`), dizer no relatório final.

## Convenções

- Textos da interface em português do Brasil; comentários e commits em inglês.
- Os identificadores do código ficam em português neste projeto, por decisão do Victor em 27/10/2026 (exceção à regra global de nomes em inglês). Código novo segue o mesmo padrão.
- Nunca usar hard wrap em texto (uma frase por linha), inclusive em Markdown e commits.
- Rodar `npm test` antes de cada commit; teste novo para regra nova. Mudou fluxo de sala, rede, controles ou tela? Rodar também `npm run e2e`.
- Nada de conta nova, serviço pago ou credencial sem o Victor aprovar antes.
