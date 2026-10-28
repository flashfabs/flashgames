# Relatório da noite de 28/10/2026 — Salinha e Pavio

Relatório para o Victor ler de manhã, mantido pela frente 5 (`pavio-testes`) a cada publicação. O plano da noite está em [plano-noite-2026-10-28.md](plano-noite-2026-10-28.md) e o protocolo de integração no [AGENTS.md](../AGENTS.md). Horários no fuso de Brasília.

## Estado agora

- Produção (https://salinha-jogos.netlify.app): `902c5c2`, publicado às 00:59; a versão publicada aparece em https://salinha-jogos.netlify.app/versao.json.
- `main`: igual à produção no que vai ao ar, com `npm test` (104) e `npm run e2e` (9 cenários) passando.

## O que testar primeiro de manhã

A preencher no fim da noite.

## Publicações

| Hora | Frente | Commit na `main` | O que foi ao ar | Verificação |
| --- | --- | --- | --- | --- |
| 00:40 | 5 (testes) | `c749169` | Script de publicação (`scripts/preparar-publicacao.sh`, com `versao.json`), teste de fumaça (`npm run fumaca`), passo 4 do protocolo no AGENTS.md e este relatório. O site em si não mudou desde `684f7e3`. | `npm test` 54, `npm run e2e` 5 de 5, fumaça 3 de 3 em produção (18 s). |
| 00:45 | 1 (jornada, robôs) | `d26cf8f` | Robôs no lobby: o anfitrião adiciona e tira robôs de nível fácil, médio ou difícil; eles jogam a partida, usam os poderes (detonador, gelo, chute, atalho) e só as pessoas precisam ficar prontas. | Frente 1: `npm test`, `npm run e2e` e fumaça. Frente 5, depois: `npm test` 73, `npm run e2e` 6 de 6 (com o cenário novo dos robôs), fumaça 3 de 3. |
| 00:48 | 4 (rede, contas) | `8648563` | Perfil do aparelho: `site/js/conta.js` (com alternativa local) e a API `/api/perfil` e `/api/ranking` em Netlify Functions com Netlify Blobs; ainda sem tela que use. Primeira publicação com dependência de função (`@netlify/blobs`), instalada pelo script. | Frente 5, depois: `npm test` 88, `/api/perfil` sem credencial responde 401 e `/api/ranking` 200 em produção. |
| 00:50 | 2 (jogo, poderes) | `3ea6b3f` | Temas de mapa (`MAPAS[n].tema`), estatísticas de cada partida no estado do resultado (contrato da seção 5 do plano), buffer de bomba (apertar um pouco antes não se perde), assistência de esquina mais larga e previsão do convidado conferida com o anfitrião. | Frente 5, depois: `npm test` 104, `npm run e2e` 9 de 9; no ar desde 00:59 pelo menos (dentro de `902c5c2`). |
| 00:59 | 5 (testes) | `902c5c2` | Só testes e documentação: porta livre nos testes, desempenho com CPU 4x mais lenta, acessibilidade com axe-core, rede ruim, regressão visual (`npm run visual`), fumaça cobrindo a API de perfis e correção de uma corrida no cenário dos robôs. | `npm test` 104, `npm run e2e` 9 de 9, `npm run visual` 3 de 3, fumaça 4 de 4. |

## O que foi testado e como

- `npm test`: testes de regras, rede e poderes, em Node, a cada integração.
- `npm run e2e`: cenários Playwright com Chromium sem janela, cada jogador num navegador próprio, contra a `main` servida numa porta livre de `127.0.0.1`: entrada pelo link e prontos com 5 jogadores, andar e bomba vistos pelo anfitrião, saída no meio da rodada, eliminação com o placar certo, iPad com toque (camada, joystick, bomba, sem rolagem nem zoom) e desempenho com 8 jogadores, normal e com a CPU 4x mais lenta.
- `npm run fumaca`: contra a produção, depois de cada publicação: `versao.json` com o commit da `main`, `/api/ice` respondendo, `/api/ranking` lido e `/api/perfil` recusando sem credencial (só leitura, nenhum perfil é criado) e dois jogadores começando uma rodada pelo servidor de sinalização real.
- Acessibilidade (`acessibilidade.spec.mjs`, dentro do `npm run e2e`): axe-core com as regras WCAG 2.1 A e AA na tela inicial e no lobby, no computador e no celular; problema sério ou crítico reprova.
- Rede ruim (`rede-ruim.spec.mjs`, dentro do `npm run e2e`): 120 a 200 ms de atraso em todos os canais e 10% de perda no canal rápido; o convidado anda sem ser puxado para trás, o anfitrião vê o movimento e a bomba na casa certa, o convidado vê o anfitrião andar e o ping aparece alto na lista.
- Regressão visual (`npm run visual`, fora do `npm run e2e`): tela inicial e lobby no computador, no iPad e no celular comparados com as imagens em `testes/e2e/visual/`; a frente 5 roda depois de cada integração, olha cada diferença e atualiza as imagens quando a mudança foi de propósito.

## Problemas conhecidos

Nenhum até agora.

## Decisões tomadas

- 00:38, frente 5: a pasta de publicação leva só `netlify.toml`, `site/` e `netlify/`; quando as funções precisarem de pacotes, eles entram em `dependencies` do `package.json` da raiz e o script os instala com `npm ci --omit=dev`, sem levar o Playwright.
- 00:42, frente 5: integração só de documentação ou de testes (sem mudar `site/`, `netlify/`, `netlify.toml` nem `package.json`) roda `npm test` e não republica; a fumaça aceita produção num commit anterior da `main` quando os arquivos publicados são os mesmos.
- 00:55, frente 5: as checagens novas de acessibilidade e rede ruim entram no `npm run e2e` (todos rodam antes de integrar); a regressão visual fica fora dele, porque as telas mudam de propósito a noite toda, e a frente 5 cuida das imagens de referência.
- 00:55, frente 5: o cenário dos robôs falhava às vezes porque conferia na hora que o convidado via um robô quebrar caixa, e o convidado desenha os outros um pouco no passado; virou uma espera de até 15 s.
- 00:50, frente 5: o servidor dos testes passou a usar uma porta livre a cada execução, porque a porta fixa 8805 colidia quando duas frentes rodavam a suíte ao mesmo tempo.

## Pendências do Victor

- Chave do TURN da Cloudflare (`CLOUDFLARE_TURN_KEY_ID` e `CLOUDFLARE_TURN_API_TOKEN` no Netlify); até lá `/api/ice` responde 503 e o site usa o TURN do PeerJS.
- Login com Google ou e-mail (provedor, custo, tela de consentimento).
- Sinalização própria (conta no Fly.io ou outro serviço) e microtransações.
