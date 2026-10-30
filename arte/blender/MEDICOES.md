# Medições da fábrica de arte no PC da RTX 4090

Feitas pela sessão `rts-arte` em 30/10/2026, no Windows 11 da RTX 4090 (driver 591.86, i7-12700KF, 64 GB), com o Blender 5.2.3 LTS disparado do Mac pelo SSH.
Os logs brutos ficaram em `D:\rts\saida` e `D:\rts\cache` no PC; aqui fica o que eles provaram.

## EEVEE pelo SSH usa a GPU

- `gpu.platform`, consultado depois de `gpu.init()` dentro de um render em segundo plano pelo SSH: backend `OPENGL`, fabricante `NVIDIA Corporation`, renderizador `NVIDIA GeForce RTX 4090/PCIe/SSE2`, versão `4.6.0 NVIDIA 591.86`.
- Durante o render, o `nvidia-smi` listou o `blender.exe` como processo `C+G`, com 50% de uso da GPU.
- Tempo: 266 quadros de 256 px em 25 s (cerca de 94 ms por quadro); o primeiro quadro de uma cena leva de 0,7 a 1,2 s por causa da compilação dos shaders.
- O Workbench fez 0,033 s por quadro de 256 px.
- Conclusão: flipbooks podem usar o EEVEE; a fábrica fica no Cycles para todo o resto, porque ele saiu mais barato que o esperado (abaixo).

## Lote longo com o SSH derrubado

- Cliente SSH do Mac morto aos 25 s de um lote de 192 quadros a 128 amostras mais uma vitrine 1080p: o Blender seguiu sozinho e terminou tudo (197 arquivos e o `relatorio.json`, cerca de 3 min depois).
- Um processo lançado com `Start-Process` de dentro de uma sessão SSH que termina normalmente morre com ela (fica no job da sessão); um processo criado pelo WMI (`Win32_Process.Create`) sobrevive.
- Por isso o `rtx.sh` lança cada lote pelo WMI (`ferramentas/arte/pc/lancar.ps1`), o `lote.ps1` grava `estado.json` e solta a trava da GPU no próprio PC, e o Mac só acompanha o log, reconectando se a conexão cair; não precisou de `schtasks`.
- Não foi testada uma queda de rede sem aviso ao servidor, que pediria derrubar o Tailscale do Mac, usado por outras sessões.

## Custo por quadro no Cycles

Quadro de 256 px do tanque de teste, OptiX, média dos quadros depois do primeiro:

| Configuração | s por quadro | Erro contra 4096 amostras (RMSE em níveis de 255) |
| --- | --- | --- |
| 64 amostras, denoiser padrão (OpenImageDenoise na CPU), sem dados persistentes | 0,87 | — |
| 64 amostras, denoiser na CPU, dados persistentes | 0,20 a 0,75 | 0,88 |
| 64 amostras, OpenImageDenoise na GPU | 0,041 | 0,89 |
| 64 amostras, denoiser OptiX | 0,040 | 0,94 |
| 1 amostra, sem denoiser, dados persistentes | 0,028 | — |
| 64 amostras, sem denoiser | 0,037 | 1,07 |
| 128 amostras, sem denoiser | 0,043 | 0,75 |
| 256 amostras, sem denoiser | 0,056 | 0,56 |
| 512 amostras, sem denoiser | 0,085 | 0,44 |

- O cerca de 1 s por quadro do teste de 30/10 era o denoiser rodando na CPU (o padrão de fábrica), não custo fixo do Cycles.
- A fábrica usa 256 amostras sem denoiser na cor e 32 nas máscaras, com dados persistentes: menos erro que qualquer denoiser a 64 amostras, sem tremor entre quadros de animação (o denoiser decide quadro a quadro) e quase o mesmo tempo.
- Várias direções num quadro só (grade de 4 por 4 em 1024 px, 64 amostras com o denoiser padrão) levou 11,5 s, o mesmo que 16 quadros separados; sem o denoiser na CPU o custo fixo por quadro é de 0,03 s, e a grade deixou de valer a complicação.
- Workbench nas máscaras: 0,13 s por grade de 16 direções; desnecessário com o Cycles a 0,03 s e com a borda idêntica à da cor.

## Ponta a ponta

| Asset | Quadros | Render | Empacotar | Lote | Disco no PC |
| --- | --- | --- | --- | --- | --- |
| `teste-veiculo-tanque`, 16 direções, cor, time e normal | 64 por passe, 192 renders | 6,95 s | 2,6 s | 10,4 s | 6 MB |
| `religadores-veiculo-cesto-blindado`, 32 direções, cor, time, normal e sombra | 480 por passe, 1.920 renders | 129 s | 92 s | 222 s | 123 MB |

O critério da E2 pedia um veículo de 32 direções com todos os passes em até 10 minutos de GPU e até 1 GB de disco.
O Cesto tem 4 camadas (corpo, torre baixada, torre erguida e o veículo inteiro na transição) e 8 animações; com todos os passes, as páginas `uhd` somaram 21,5 MB de arquivo e cerca de 242 MB de memória de GPU estimada (4 bytes por pixel na cor e 1 em cada máscara), o que mostra que o número de direções e de quadros do Cesto ainda precisa caber no orçamento de memória no portão.
