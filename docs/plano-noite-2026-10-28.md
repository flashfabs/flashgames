# Plano da noite de 28/10/2026 — Salinha e Pavio

Pedido do Victor ao ir dormir: melhorar tudo o que der na experiência (interface, detalhe, realismo, resolução, animações, transições, comportamento do jogo e da interface, fluidez e consistência) e na jornada completa (login, entrada e saída, lobby, feedbacks, resumo das partidas), com as cinco sessões trabalhando em paralelo a noite toda, validando, integrando e publicando em produção sem fazer perguntas a ele. De manhã ele testa.

Este arquivo é o plano. As regras de integração e publicação ficam em [AGENTS.md](../AGENTS.md) e valem para todas as frentes. O relatório para o Victor fica em [relatorio-noite-2026-10-28.md](relatorio-noite-2026-10-28.md).

## 1. Ponto de partida

- Produção (https://salinha-jogos.netlify.app) é igual à `main` no commit `684f7e3`, protocolo 5: lobby com pronto, rodada de 5 partidas, poderes (atalho, chute, detonador, ímã, gelo, além dos antigos), pontos (caixa 1, eliminação 5, vitória 15), visual e som novos, reconexão de 10 s, TURN da Cloudflare preparado (sem chave, usa o do PeerJS), 54 testes de regras e 5 cenários Playwright.
- Os robôs estão prontos na branch `claude/robos-58453b` (commit `13747d9`, já com a `main` dentro), ainda fora da `main` e da produção.
- A sessão principal rodou uma revisão de integração das cinco frentes; os achados confirmados chegam a cada frente por mensagem e entram como primeira tarefa de quem for dono do arquivo.

## 2. Princípios para a noite

- Autonomia total: ninguém pergunta nada ao Victor. Decida, registre a decisão no relatório e siga. Dúvida entre frentes vai por mensagem para a sessão dona do assunto (lista de ids na seção 6); conflito que nenhuma das duas resolve vai para a sessão principal.
- Qualidade antes de quantidade: cada entrega passa por `npm test`, `npm run e2e`, conferência no navegador (desktop, iPad e celular) e teste de fumaça em produção. Produção quebrada é prioridade de todos sobre qualquer outra tarefa.
- Entregas pequenas e frequentes: integre e publique a cada pedaço pronto (de preferência a cada 1 a 2 horas), em vez de uma entrega gigante de manhã.
- Respeite as regras do Victor que valem para o projeto: textos em pt-BR, comentários e commits em inglês, identificadores em português, nunca hard wrap, pontos (caixa 1, eliminação 5, vitória 15), "se alguém sai, a rodada acaba" (com a tolerância de 10 s de reconexão), nada de conta nova, serviço pago ou credencial nova.
- Subagentes e workflows só quando trouxerem um fato que você ainda não tem, com teto explícito (no máximo ~10 agentes por workflow) e nunca para revisar o que você mesmo acabou de verificar.
- Desempenho é requisito: 60 quadros por segundo com 8 jogadores num iPad. Qualquer efeito novo precisa caber nisso e respeitar `prefers-reduced-motion`.

## 3. Frentes, donos e arquivos

Cada arquivo tem um dono por noite. Mudança em arquivo de outra frente só se for de uma ou duas linhas para ligar o seu código (por exemplo, um `import` e uma chamada), descrita no commit; acima disso, peça ao dono por mensagem. `pavio.js` é o ponto quente: código novo vai em módulo novo, e `pavio.js` só recebe a ligação.

| Frente | Sessão | É dona de |
| --- | --- | --- |
| 1. Jornada, telas e perfil | `pavio-robos` | `site/js/app.js`, `site/index.html`, `site/css/telas.css` (novo), `site/js/pavio/telas.js` (novo, extraído de `pavio.js`), `site/js/pavio/resumo.js` (novo), `site/js/perfil.js` (novo, interface do perfil), fluxo de fases em `pavio.js` |
| 2. Jogo, mapas, poderes e robôs | `pavio-poderes` | `site/js/pavio/regras.js`, `site/js/pavio/robo.js`, `site/js/pavio/mapas.js` (novo, se extrair `MAPAS`), `testes/regras*`, `testes/poderes*`, `testes/robo*` |
| 3. Visual, animação, som e desempenho | `pavio-visual` | `site/js/pavio/desenho.js`, `site/js/som.js`, `site/css/estilo.css`, `site/js/pavio/hud.js` (novo, extraído de `pavio.js`), `site/js/pavio/efeitos.js` (novo, se precisar) |
| 4. Contas, rede e infraestrutura | `pavio-rede` | `site/js/sala.js`, `site/js/rede.js`, `site/js/conta.js` (novo), `netlify/functions/*`, `netlify.toml`, a parte de rede de `pavio.js` (retratos, previsão, interpolação) |
| 5. Qualidade, integração e publicação | `pavio-testes` | `testes/e2e/*`, `playwright.config.mjs`, `package.json`, `scripts/*` (novo), `docs/relatorio-noite-2026-10-28.md` |

`site/js/pavio/controles.js` fica com a frente 3 (sensação de toque e joystick); mudanças de regra de entrada (buffer de bomba, por exemplo) vêm da frente 2 por mensagem.

## 4. Backlog por frente

Ordem: P0 primeiro, depois P1, depois P2. Cada item termina com teste (de regra ou Playwright) quando der para testar.

### Frente 1 — Jornada, telas e perfil (`pavio-robos`)

P0, nesta ordem:
- Integrar e publicar os robôs (`claude/robos-58453b`) seguindo o protocolo do AGENTS.md. É a primeira integração da noite.
- Extrair as telas de `pavio.js` para `site/js/pavio/telas.js` (cartões de lobby, contagem, resultado e final, tabela de placar, pódio, confetes, legendas), sem mudar comportamento, e integrar em seguida (meta: até 1 hora), para as outras frentes não esbarrarem nisso.
- Página inicial nova: perfil persistente (nome, cor e símbolo, boneco animado) usando `conta.js` da frente 4, botão grande de criar sala, entrar com código, convite recebido em destaque, estados de carregamento e erros com texto humano.
- Lobby novo: cartões dos jogadores com o boneco animado, pronto e esperando bem visíveis, qualidade de conexão, robôs (adicionar, remover, dificuldade) integrados ao visual, convite por link, compartilhar e QR code para o celular (gerado no navegador, biblioteca pequena e de versão fixa ou código próprio), transição quando todos ficam prontos.
- Entrada e saída: entrar no meio (explicação clara de que assiste e entra na próxima), sair com confirmação quando isso encerra a rodada dos outros, anfitrião saindo, queda e reconexão com contagem dos 10 s, página desatualizada (protocolo) com botão de recarregar, sala cheia, código inválido.

P1:
- Resumo da partida (tela depois de cada partida): vencedor, destaques (mais caixas, mais eliminações, mais tempo vivo, reação em cadeia, eliminação mais rápida), estatísticas por jogador (contrato na seção 5), linha do tempo das eliminações, pontos subindo com animação, próxima partida com mapa e poderes, e "pular" quando todos votarem.
- Resumo da rodada (final): pódio, quebra completa de pontos, conquistas, histórico do perfil atualizado, "jogar de novo" que volta todo mundo ao lobby já com um clique.
- Transições entre todas as telas (entrada, lobby, contagem, jogo, resultado, final), feedback consistente em botões e avisos, vibração curta no celular onde fizer sentido.
- Primeira vez: dicas rápidas de controle (andar, bomba, poderes) que somem depois de usadas, e tela de configurações (volume de efeitos e música, sensibilidade do joystick, mostrar ping e quadros por segundo).

P2: navegação completa por teclado nas telas, leitor de tela, revisão de todos os textos, telas com 8 jogadores em celular pequeno.

### Frente 2 — Jogo, mapas, poderes e robôs (`pavio-poderes`)

P0:
- Achados da revisão de integração na sua área.
- Estatísticas da partida para o resumo (contrato na seção 5), com testes.
- `MAPAS[n].tema` com chaves estáveis (`patio`, `deposito`, `muralhas`, `labirinto`, `fornalha`) logo cedo, para a frente 3 desenhar os temas.
- Sensação de jogo: buffer de bomba e de curva (apertar um pouco antes de chegar à célula não se perde), assistência de esquina afinada, previsão do convidado sem "puxões" (o que o convidado prevê bate com o anfitrião em todos os poderes).

P1:
- Mapas com identidade, e não só densidade: layouts próprios e mais complexos a cada partida, sempre conectados e justos (spawns equivalentes), com variações sorteadas para a rodada não repetir; elementos de cenário que o desenho possa explorar.
- Robôs (a frente passa a ser dona de `robo.js`): níveis bem diferentes, comportamento mais humano no fácil, uso esperto de todos os poderes, nunca travar, custo baixo com 7 robôs; testes.
- Balanceamento de pavio, alcance, itens por mapa e morte súbita, sem mexer nos valores de pontos.

P2: elementos novos de mapa (teleportes fixos, esteiras, blocos que voltam) se houver tempo, com testes.

### Frente 3 — Visual, animação, som e desempenho (`pavio-visual`)

P0:
- Achados da revisão de integração na sua área.
- Resolução e nitidez: densidade de pixels adaptativa (até 3x quando o tempo de quadro permite, caindo sozinha quando não), sprites e textos nítidos, camadas em cache.
- Arte por tema de mapa (`MAPAS[n].tema`): pisos com textura procedural, paredes e pilares com volume e sombra projetada, caixas detalhadas, luz das explosões no chão, vinheta e profundidade.
- Personagens com animação de verdade: compressão e esticada, ciclo de caminhada, piscar, reação ao pegar item, morte em etapas, comemoração.
- Explosões: onda de choque, fumaça, faíscas, estilhaços com física simples, clarão, tremor dosado.

P1:
- Transições no canvas: abertura da partida (varredura do mapa e nomes aparecendo), fim da partida (câmera lenta visual no último golpe e foco no vencedor), morte súbita com blocos caindo animados.
- HUD extraído para `hud.js` e redesenhado: poderes ativos com tempo restante, pontos subindo, tempo, destaque de "você" no começo.
- Controles de toque (`controles.js`): joystick com resposta e visual melhores, botões de poder claros, feedback ao tocar.
- Som: mixagem coerente, música por fase e por mapa com transições, sons posicionados pela posição na arena, menos repetição.
- Desempenho: medir com a frente 5 (CPU 4x mais lenta no Playwright) e otimizar até caber em 16,7 ms com 8 jogadores.

P2: tema de alto contraste, detalhes de ambiente baratos.

### Frente 4 — Contas, rede e infraestrutura (`pavio-rede`)

Decisão desta noite sobre login: "perfil do aparelho", sem senha, sem e-mail e sem provedor externo, porque login com Google ou e-mail exige conta e custo que o Victor ainda não aprovou. O perfil é real e fica no servidor, e pode ser ligado a Google ou e-mail depois.

P0:
- Achados da revisão de integração na sua área.
- Na primeira hora: `site/js/conta.js` com a interface da seção 5 e alternativa local (`localStorage`), publicada, para a frente 1 não esperar.
- Backend com Netlify Functions e Netlify Blobs (já incluídos no plano Pro do time, sem conta nova): criar perfil (id e segredo gerados, segredo só como hash no servidor), ler e editar perfil, registrar partidas, histórico e recordes do perfil, ranking; código de recuperação (e QR) para levar o perfil a outro aparelho. Nada de dado pessoal (LGPD): só apelido, cor, símbolo e estatísticas.
- Registro das partidas: no fim de cada partida e de cada rodada, o anfitrião envia o resumo; cada perfil acumula.
- Segurança: validação de tudo nas funções, limite de taxa, tamanho máximo, segredos nunca no cliente, origem restrita ao domínio do site.

P1:
- Reconexão do anfitrião: a sala sobrevive se ele voltar em até 10 s.
- Qualidade de conexão para a interface (ping, perda, retransmissor) e aviso proativo de conexão ruim.
- Banda: retratos em delta ou compactação maior, se a medição mostrar necessidade.

P2: troca de anfitrião (se couber na noite com segurança; senão, deixar estimado no relatório). Sinalização própria exige conta nova (Fly.io ou outra): não criar, só documentar como pendência.

### Frente 5 — Qualidade, integração e publicação (`pavio-testes`)

P0:
- `scripts/preparar-publicacao.sh`: monta a pasta limpa a partir da `main` (`git archive`) com `site/versao.json` (commit e hora), pronta para o `deploy-site` do MCP `netlify-pessoal`; `npm run fumaca`: teste de fumaça contra a produção (dois jogadores, rodada começa, `versao.json` bate com o commit). Avise as outras frentes quando estiver na `main`.
- Guardião da `main` e da produção: a cada integração das outras frentes, rode a suíte inteira na `main` e a fumaça em produção. Quebrou? Avise a frente responsável na hora; se ela não corrigir em 30 minutos, reverta o merge dela na `main` (`git revert -m 1`, nunca reset) e republique.
- Cobertura nova a cada entrega: perfil, lobby novo, resumo, robôs, poderes, reconexão do anfitrião.

P1:
- Regressão visual (capturas em desktop, iPad e celular com tolerância), desempenho com CPU 4x mais lenta, acessibilidade (axe-core como dependência de desenvolvimento), rede ruim (latência e perda).
- Relatório da manhã em `docs/relatorio-noite-2026-10-28.md`, atualizado a cada publicação: o que entrou em produção (por frente, com commits), o que foi testado e como, problemas conhecidos, decisões tomadas e pendências para o Victor. As outras frentes mandam um resumo curto à frente 5 a cada publicação.

## 5. Contratos entre frentes

Estatísticas da partida (frente 2 → frente 1 e frente 4). `Partida.estatisticas()` devolve, por jogador: `{ id, caixas, eliminacoes, bombas, itens: { [item]: quantidade }, morte: null | { tempo, por: id | null, causa: 'bomba' | 'propria' | 'subita' }, tempoVivo, distancia, maiorCadeia }`. O anfitrião manda a lista no `estado` da fase `resultado` (campo `estatisticas`) e soma na rodada. A frente 1 mostra o que existir e ignora o que faltar.

Perfil e conta (frente 4 → frente 1). `site/js/conta.js` exporta: `obterPerfil()` → `{ id, nome, cor, simbolo, criadoEm, estatisticas }` (cria um local na primeira vez); `salvarPerfil({ nome, cor, simbolo })`; `registrarPartida(resumo)`; `historico()`; `ranking()`; `codigoDeRecuperacao()`; `recuperar(codigo)`. Tudo assíncrono, e tudo com alternativa local quando a API falhar.

Temas de mapa (frente 2 → frente 3): `MAPAS[n].tema` com as chaves da frente 2; o desenho usa `tema` e cai no padrão se vier um tema desconhecido.

Telas (frente 1): `telas.js` recebe o estado e devolve elementos; quem precisar de algo novo numa tela pede à frente 1.

Protocolo: quem mudar mensagem entre navegadores sobe `VERSAO_PROTOCOLO`; em conflito de merge, vale o maior número mais um.

## 6. Sessões

- Frente 1, `pavio-robos`: `local_a16aefa0-222f-4319-b404-2ff6c5f3867f`
- Frente 2, `pavio-poderes`: `local_9169802a-5fbf-4a63-9ef3-05d49925f395`
- Frente 3, `pavio-visual`: `local_e98dfaaa-c701-4433-b218-9824cdaea675`
- Frente 4, `pavio-rede`: `local_71872e7b-cc8f-426e-9737-22f5fb309478`
- Frente 5, `pavio-testes`: `local_7e93cdcb-97f0-45e6-b178-5bf1dcd6586c`
- Sessão principal (desempate e coordenação): `local_c0fa5248-1b11-43d7-8f0a-95d38111ee2d`

## 7. Ritmo da noite

- Onda 0, primeira hora: robôs integrados e publicados (frente 1), telas extraídas (frente 1), `conta.js` com alternativa local (frente 4), `tema` nos mapas e contrato de estatísticas (frente 2), script de publicação e fumaça (frente 5), achados da revisão corrigidos por cada dono.
- Onda 1: P0 de cada frente, com pelo menos uma publicação por frente.
- Onda 2: P1.
- Onda 3, até de manhã: P2, polimento, regressão visual e de desempenho, relatório final.
- Fim: a frente 5 roda a suíte inteira na `main` e a fumaça em produção uma última vez e fecha o relatório com o estado final, o commit publicado e o que o Victor deve testar primeiro.

## 8. Pendências que só o Victor resolve

- Chave do TURN da Cloudflare (`CLOUDFLARE_TURN_KEY_ID` e `CLOUDFLARE_TURN_API_TOKEN` no Netlify).
- Login com Google ou e-mail (provedor, custo, tela de consentimento do Google).
- Sinalização própria (conta no Fly.io ou outro serviço) e microtransações.
