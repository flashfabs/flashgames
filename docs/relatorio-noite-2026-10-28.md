# Relatório da noite de 28/10/2026 — Salinha e Pavio

Relatório para o Victor ler de manhã, mantido pela frente 5 (`pavio-testes`) a cada publicação. O plano da noite está em [plano-noite-2026-10-28.md](plano-noite-2026-10-28.md) e o protocolo de integração no [AGENTS.md](../AGENTS.md). Horários no fuso de Brasília.

## Estado agora

- Produção (https://salinha-jogos.netlify.app): `c749169`, publicado às 00:50; a versão publicada aparece em https://salinha-jogos.netlify.app/versao.json.
- `main`: igual à produção no que vai ao ar, com `npm test` (54) e `npm run e2e` (5 cenários) passando.

## O que testar primeiro de manhã

A preencher no fim da noite.

## Publicações

| Hora | Frente | Commit na `main` | O que foi ao ar | Verificação |
| --- | --- | --- | --- | --- |
| 00:50 | 5 (testes) | `c749169` | Script de publicação (`scripts/preparar-publicacao.sh`, com `versao.json`), teste de fumaça (`npm run fumaca`), passo 4 do protocolo no AGENTS.md e este relatório. O site em si não mudou desde `684f7e3`. | `npm test` 54, `npm run e2e` 5 de 5, fumaça 3 de 3 em produção (18 s). |

## O que foi testado e como

- `npm test`: testes de regras, rede e poderes, em Node, a cada integração.
- `npm run e2e`: cenários Playwright com Chromium sem janela, cada jogador num navegador próprio, contra a `main` servida em `127.0.0.1:8805`: entrada pelo link e prontos com 5 jogadores, andar e bomba vistos pelo anfitrião, saída no meio da rodada, eliminação com o placar certo, iPad com toque (camada, joystick, bomba, sem rolagem nem zoom) e desempenho com 8 jogadores.
- `npm run fumaca`: contra a produção, depois de cada publicação: `versao.json` com o commit da `main`, `/api/ice` respondendo e dois jogadores começando uma rodada pelo servidor de sinalização real.

## Problemas conhecidos

Nenhum até agora.

## Decisões tomadas

- 00:40, frente 5: a pasta de publicação leva só `netlify.toml`, `site/` e `netlify/`; quando as funções precisarem de pacotes, eles entram em `dependencies` do `package.json` da raiz e o script os instala com `npm ci --omit=dev`, sem levar o Playwright.
- 00:52, frente 5: integração só de documentação ou de testes (sem mudar `site/`, `netlify/`, `netlify.toml` nem `package.json`) roda `npm test` e não republica; a fumaça aceita produção num commit anterior da `main` quando os arquivos publicados são os mesmos.

## Pendências do Victor

- Chave do TURN da Cloudflare (`CLOUDFLARE_TURN_KEY_ID` e `CLOUDFLARE_TURN_API_TOKEN` no Netlify); até lá `/api/ice` responde 503 e o site usa o TURN do PeerJS.
- Login com Google ou e-mail (provedor, custo, tela de consentimento).
- Sinalização própria (conta no Fly.io ou outro serviço) e microtransações.
