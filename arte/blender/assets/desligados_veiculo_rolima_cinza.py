# SPDX-License-Identifier: GPL-3.0-or-later
"""Rolimã, gray kit (brief arte/briefs/desligados-unidade-rolima.md): the scout, the lowest and flattest piece of
the game: a long wooden plank on four big steel bearings, the driver sitting with legs stretched, steering with
his feet; a long pole to push the ground, a bucket of caltrops behind him and, standing at the back, a tall
flexible whip with a triangular pennant, the point the eye finds even at the smallest zoom."""

import math

from comum import cinza, infantaria
from comum import modelagem as m

Y = infantaria.Y
DESCRICAO = cinza.descricao_veiculo(
    "desligados-veiculo-rolima-cinza", "desligados/rolima", quadro=(192, 192), ancora=(96, 124),
    extras=[cinza.anim("espalhando", "corpo", 1, 0, True, igual="parado")],
)
PERNAS = [("coxa_e", Y, -88), ("coxa_d", Y, -88), ("tronco", Y, -8)]


def construir(ctx):
    pal = cinza.Paleta(ctx, "desligados")
    raiz = m.vazio("raiz")
    chassi = cinza.chassi(raiz)
    m.caixa("prancha", (0, 0, 0.3), (1.9, 0.5, 0.06), pal["madeira"], chassi, 0.01)
    m.caixa("remendo", (0.5, 0.05, 0.335), (0.4, 0.3, 0.01), pal["metal"], chassi, 0.0)
    m.caixa("faixa_ponta", (0.88, 0, 0.335), (0.12, 0.5, 0.01), pal["time"], chassi, 0.0)
    for x in (0.75, -0.75):
        m.barra(f"eixo{x:+.2f}", (x, -0.35, 0.14), (x, 0.35, 0.14), 0.02, pal["metal"], chassi, 6)
        for lado in (-1, 1):
            m.roda(f"rolamento{x:+.2f}{lado:+d}", (x, lado * 0.33, 0.14), 0.14, 0.07, pal["metal"], chassi)
    m.cilindro("balde", (-0.65, 0.0, 0.46), 0.14, 0.26, pal["tijolo"], chassi, vertices=14)
    m.barra("haste", (-0.9, 0.12, 0.33), (-1.0, 0.12, 2.6), 0.012, pal["madeira"], chassi, 4)
    m.malha_de_pontos("bandeirola", [(-1.0, 0.12, 2.6), (-1.0, 0.12, 2.25), (-1.5, 0.12, 2.45)], [(0, 1, 2)], [pal["time"]], chassi)
    m.barra("vara", (0.05, -0.32, 0.95), (-1.6, -0.6, 0.05), 0.022, pal["madeira"], chassi, 6)

    def acessorios(parte, corpo_raiz):
        parte("tronco", m.caixa("poncho", (0, 0, 1.25), (0.36, 0.5, 0.36), pal["lona"], corpo_raiz, 0.06))
        parte("cabeca", m.esfera("bone", (0, 0, 1.66), 0.14, pal["ocre"], corpo_raiz, (1.05, 1.0, 0.6), segmentos=14))
        parte("cabeca", m.caixa("bone_aba", (0.14, 0, 1.64), (0.14, 0.2, 0.02), pal["ocre"], corpo_raiz, 0.0))
        parte("antebraco_d", m.toro("estilingue", (0.44, -0.1, 1.06), 0.06, 0.012, pal["escuro"], corpo_raiz, (0, math.radians(90), 0)))

    _, piloto = cinza.pessoa(ctx, pal, chassi, "piloto", (-0.2, 0, -0.05), pose=(PERNAS + [("braco_d", Y, 20)], -0.55, -0.05),
                             escala=1.0, acessorios=acessorios, roupa="lona", calca="oliva", botas="escuro", luvas="pele")
    m.ponto("boca", (0.45, -0.2, 0.95), chassi)
    m.ponto("balde", (-0.65, 0, 0.6), chassi)
    m.ponto("topo", (-1.0, 0.12, 2.65), chassi)
    pecas = cinza.destroco(pal, raiz, 2.0, 1.0, 29)
    return {"raiz": raiz, "chassi": chassi, "piloto": piloto, "destroco": pecas}


def posar(ctx, modelo, animacao, quadro):
    destruido = animacao == "destruido"
    braco = -80 if animacao == "atirando" and quadro == 0 else 20
    cinza.posar_pessoa(modelo["piloto"], (PERNAS + [("braco_d", Y, braco)], -0.55, -0.05))
    # flipped over, bearings in the air
    cinza.posar_destroco(modelo, destruido, inclinar=(170, 0), afundar=-0.45)
