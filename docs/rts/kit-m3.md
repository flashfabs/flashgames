# Kit do M3: a fatia cinza jogada por 3 pessoas

O marco M3 fecha a etapa E3: três pessoas do grupo jogam, cada uma a sua partida, a caixa de areia com arte cinza, e o jogo mede o ritmo pelo registro de cada uma.
Este kit é para o Victor: o que ele prepara, o que cada pessoa faz e o que volta para a `rts-qualidade` registrar no [ESTADO.md](ESTADO.md).
Ninguém manda nada em nome do Victor; quem convida e recolhe as respostas é ele.

## Antes de chamar o grupo

1. A `rts-qualidade` avisa quando a fatia estiver pronta: os testes de ponta a ponta da fatia (começar, coletar, construir, produzir, lutar, vitória e derrota) verdes na `rts/base`.
2. O Victor escolhe como os amigos abrem o jogo (decisão pendente na lista dele no ESTADO): um deploy de rascunho na Netlify com endereço próprio, como o da página de diagnóstico (`netlify deploy --alias fatia-cinza`, sem `--prod`, fora da produção), ou o Mac dele servindo a `rts/base` na rede de casa. O rascunho é o caminho para quem joga de outra casa.
3. O Victor joga uma partida inteira antes, para conferir que o endereço abre, que a partida termina e que o registro baixa.

## O que cada pessoa faz

- Usa um computador com mouse ou trackpad, no Chrome, no Edge ou no Safari atualizados, com uns 30 minutos livres. Celular e tablet ainda não servem.
- Abre o endereço que o Victor mandou; a partida começa na caixa de areia contra o computador, sem cadastro.
- Joga do jeito que quiser até a vitória ou a derrota. A vitória vem ao destruir a sexta onda de ataque ou o acampamento inimigo (Carroção-Mãe, Barracão e Ferraria a Vapor); a derrota, ao ficar sem Escritório Regional, sem Poste Avançado, sem Equipe de Manutenção e sem Garagem. As ondas avisam antes de chegar.
- Pausa (P) não atrapalha a medida: o registro conta o tempo de jogo, não o do relógio.
- No fim, a tela de resultado abre sozinha e faz duas perguntas, com um campo livre: "De 1 a 5, quanto você se divertiu?" (botões de 1 a 5), "Jogaria de novo?" (Sim ou Não) e "Comentário (opcional)".
- O botão "Baixar registro" salva um arquivo `registro-rts-AAAA-MM-DD-HHMM.json` (data e hora de quando baixou), com a partida e as respostas.
- Manda esse arquivo ao Victor (como documento, não como texto colado).
- Quem precisar parar antes do fim abre o menu (F10 ou o botão "Menu") e escolhe "Encerrar e responder": a tela de resultado abre do mesmo jeito, mas essa partida não conta para a duração, que pede vitória ou derrota. O menu também tem "Copiar registro", para quem não conseguir baixar o arquivo.

## Entrevista curta (opcional, cinco minutos)

Se der para conversar logo depois, estas perguntas ajudam a ajustar o jogo; as respostas podem vir por áudio ou texto e o Victor cola na sessão.

1. O jogo fez o que você mandou? (1 a 5)
2. Você sabia quanto recurso sobrava?
3. Alguma derrota pareceu injusta?
4. Qual unidade você lembra?
5. O que você fez que o jogo não ensinou?

## O que volta para a sessão

O Victor junta os três arquivos numa pasta e pede à `rts-qualidade` (ou a qualquer sessão do repositório) para rodar o conferidor:

```bash
node ferramentas/rts/ritmo/conferir-ritmo.mjs <pasta>/*.json
```

O conferidor mostra os números de cada partida e a mediana das três, e diz o que passou. A sessão registra tudo na seção E3 do [ESTADO.md](ESTADO.md), com a data e os três arquivos como fonte, e guarda os registros fora do repositório (eles trazem a data e o jeito de jogar de cada pessoa).

| Critério da E3 | Meta | De onde vem |
| --- | --- | --- |
| Duração | 15 a 25 minutos, com vitória ou derrota | evento `fim` do registro |
| Diversão | mediana de pelo menos 4 em 5 | resposta na tela de fim |
| Jogaria de novo? | sim das três pessoas | resposta na tela de fim |
| Primeiro tiro | entre 2:30 e 4:00 | primeiro `tiro` entre inimigos |
| 10 contra 10 | 8 a 20 s (mediana das lutas com 8 a 12 unidades de cada lado) | `lutaFim` |
| Janelas sem comando | menos de 20% das janelas de 15 s sem nenhum comando | eventos `comando` |
| Primeiro cemitério esgotado | entre 10 e 13 minutos | `noEsgotado` |
| Coletores perdidos | 1 a 4 por partida | `morte` de coletor do jogador |
| Aviso de ataque (E4, já medido aqui) | toda onda de 6 ou mais com pelo menos 10 s de aviso | `aviso` e `onda` do mesmo grupo |

Reprovado algum critério de ritmo, a `rts-design` ajusta os números e o grupo joga de novo; a diversão abaixo de 4 ou um "não" em "jogaria de novo?" vão para o Victor decidir antes de a produção de arte em série começar.
