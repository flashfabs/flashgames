# Kit do M4: "Morro Aceso" em cinza jogada por 6 pessoas que nunca viram o jogo

O marco M4 fecha a etapa E4: seis pessoas que nunca viram o jogo, três novatas em estratégia em tempo real e três veteranas, jogam a missão inteira no Normal, cada uma no seu computador, e o jogo mede duração, avisos de ataque, lições e briefings pelo registro de cada uma.
Este kit é para o Victor: o que ele prepara, o que cada pessoa faz e o que volta para a `rts-qualidade` registrar no [ESTADO.md](ESTADO.md).
Ninguém manda nada em nome do Victor; quem convida e recolhe é ele. Os perfis e os rascunhos de convite estão na nota de recrutamento da `rts-design`, fora do repositório (`rts-design-recrutamento.md` na pasta de notas das sessões).

## Antes de chamar as pessoas

1. A `rts-qualidade` avisa quando a missão estiver pronta: vitória e derrota de ponta a ponta verdes nas três dificuldades na `rts/base`, e todo ataque de 6 ou mais unidades avisado com pelo menos 10 s.
2. O endereço é o mesmo caminho escolhido para o M3 (rascunho na Netlify com endereço próprio, sem `--prod`, ou o Mac do Victor em casa), agora abrindo a missão.
3. O Victor joga a missão inteira uma vez antes, para conferir que ela abre, termina e baixa o registro.
4. As 3 pessoas do M3 ficam de fora: a E4 pede gente que nunca viu o jogo.

## Quem joga

- 3 novatas: nunca jogaram estratégia em tempo real, ou jogaram uma ou duas vezes; sabem usar mouse.
- 3 veteranas: jogaram bastante estratégia em tempo real nos anos 90 ou 2000.
- Todas no Normal, sem ajuda de ninguém durante a partida.

## O que cada pessoa faz

- Usa um computador com mouse (ou trackpad), no Chrome, no Edge ou no Safari atualizados, com uns 40 minutos livres.
- Abre o endereço que o Victor mandou; a missão começa com o briefing, que pode ser assistido ou pulado (o registro anota qual).
- Joga até a vitória ou a derrota. Pausa (P) não atrapalha a medida.
- No fim, a tela de resultado pergunta "De 1 a 5, quanto você se divertiu?" e "Jogaria a próxima fase?", com um campo livre, e o botão "Baixar registro" salva o arquivo `registro-rts-AAAA-MM-DD-HHMM.json`.
- Manda esse arquivo ao Victor como documento, dizendo se é novata ou veterana (o Victor renomeia para `novato-<nome>.json` ou `veterano-<nome>.json`).

## Entrevista (cinco minutos, logo depois)

As respostas podem vir por áudio ou texto e o Victor cola na sessão; a primeira é a que decide o critério de justiça.

1. Alguma derrota pareceu injusta? Qual e por quê?
2. O jogo fez o que você mandou? (1 a 5)
3. Você sabia quanto recurso sobrava?
4. Qual unidade você lembra? Qual fala?
5. O que você fez que o jogo não ensinou?
6. Pulou o briefing? Por quê?

## O que volta para a sessão

O Victor junta os seis arquivos numa pasta e pede à `rts-qualidade` (ou a qualquer sessão do repositório) para rodar o conferidor:

```bash
node ferramentas/rts/ritmo/conferir-ritmo.mjs <pasta>/*.json
```

O conferidor separa novatos e veteranos pelo começo do nome do arquivo, mostra os números de cada partida e as medianas, e conta as lições da fase pela lista da `rts-design`. A sessão registra tudo na seção E4 do [ESTADO.md](ESTADO.md), com a data e os arquivos como fonte, e guarda os registros fora do repositório.

| Critério da E4 | Meta | De onde vem |
| --- | --- | --- |
| Duração | mediana de 20 a 25 min entre os 3 novatos e de 15 a 18 entre os 3 veteranos | evento `fim` de cada registro |
| Aviso de ataque | todo ataque com 6 ou mais unidades avisado com pelo menos 10 s | `aviso` e `onda` do mesmo grupo |
| Lições | cada lição da fase no registro de pelo menos 4 das 6 pessoas | lista de lições da `rts-design` aplicada a cada registro |
| Justiça | ninguém chama derrota de injusta | entrevista |
| Briefings | no máximo 1 pessoa pula | evento de briefing pulado |
| Diversão | mediana de pelo menos 4 em 5 | resposta na tela de fim |
| Próxima fase | "jogaria a próxima fase?" com sim de pelo menos 5 das 6 | resposta na tela de fim |

Reprovado algum critério, a `rts-design` ajusta a missão e até duas rodadas de ajuste acontecem antes de levar ao Victor; a produção de arte em série só começa depois do M4 aprovado.
