# SPDX-License-Identifier: GPL-3.0-or-later
"""Leiturista, gray kit (brief arte/briefs/religadores-unidade-leiturista.md): the scout, the thinnest and longest
piece of the faction: a small trail motorbike with a big square top box at the back (what reads first), a front
rack, and the rider in an open helmet and reflective vest, with a short radio antenna and pennant on the box."""

import math

from comum import cinza, infantaria
from comum import modelagem as m

Y = infantaria.Y
DESCRICAO = cinza.descricao_veiculo(
    "religadores-veiculo-leiturista", "religadores/leiturista", quadro=(192, 192), ancora=(96, 118),
    extras=[cinza.anim("lendo", "corpo", 1, 0, True, direcoes=8)],
)
SENTADO = infantaria.sentado(0, 1)


def _pose(braco_d=-35, braco_e=-35):
    angulos, z, x = SENTADO
    return [a for a in angulos if a[0] not in ("braco_e", "braco_d")] + [("braco_e", Y, braco_e), ("braco_d", Y, braco_d)], z, x


def construir(ctx):
    pal = cinza.Paleta(ctx, "religadores")
    raiz = m.vazio("raiz")
    chassi = cinza.chassi(raiz)
    for nome, x in (("roda_frente", 0.72), ("roda_tras", -0.68)):
        m.roda(nome, (x, 0, 0.33), 0.33, 0.12, pal["pneu"], chassi)
        m.caixa(f"{nome}_paralama", (x, 0, 0.7), (0.5, 0.16, 0.05), pal["concreto"], chassi, 0.01)
    m.barra("quadro", (-0.68, 0, 0.45), (0.55, 0, 0.85), 0.05, pal["cobalto"], chassi, 8)
    m.barra("garfo", (0.72, 0, 0.33), (0.55, 0, 1.0), 0.035, pal["metal"], chassi, 6)
    m.barra("guidao", (0.52, -0.32, 1.02), (0.52, 0.32, 1.02), 0.025, pal["escuro"], chassi, 6)
    m.caixa("tanque", (0.25, 0, 0.88), (0.45, 0.28, 0.2), pal["cobalto"], chassi, 0.05)
    m.caixa("banco", (-0.25, 0, 0.86), (0.6, 0.26, 0.08), pal["escuro"], chassi, 0.03)
    m.caixa("bagageiro_frente", (0.78, 0, 0.95), (0.3, 0.34, 0.04), pal["metal"], chassi, 0.0)
    m.barra("escapamento", (-0.2, -0.17, 0.42), (-0.8, -0.17, 0.55), 0.04, pal["escuro"], chassi, 6)
    # the big top box, its lid in the team colour, and the radio antenna with a pennant
    m.caixa("bau", (-0.78, 0, 1.12), (0.55, 0.52, 0.46), pal["branco"], chassi, 0.03)
    m.caixa("bau_faixa", (-0.78, 0, 1.0), (0.57, 0.54, 0.06), pal["laranja"], chassi, 0.0)
    m.caixa("bau_tampa", (-0.78, 0, 1.37), (0.57, 0.54, 0.05), pal["time"], chassi, 0.02)
    m.barra("antena", (-0.95, 0.18, 1.4), (-1.0, 0.18, 2.3), 0.012, pal["metal"], chassi, 4)
    m.caixa("bandeirola", (-1.12, 0.18, 2.2), (0.24, 0.015, 0.14), pal["time"], chassi, 0.0)

    def acessorios(parte, corpo_raiz):
        parte("tronco", m.caixa("colete", (0, 0, 1.25), (0.33, 0.47, 0.4), pal["laranja"], corpo_raiz, 0.06))
        parte("tronco", m.caixa("colete_faixa", (0, 0, 1.3), (0.35, 0.49, 0.05), pal["branco"], corpo_raiz, 0.0))
        parte("cabeca", m.esfera("capacete", (0, 0, 1.64), 0.15, pal["branco"], corpo_raiz, (1.05, 1.0, 0.8), segmentos=14))
        parte("antebraco_d", m.barra("pregadeira", (0.34, -0.1, 1.03), (0.52, -0.1, 1.02), 0.035, pal["cobalto"], corpo_raiz, 6))
        parte("antebraco_e", m.caixa("leitor", (0.4, 0.12, 1.0), (0.12, 0.08, 0.16), pal["escuro"], corpo_raiz, 0.01))

    _, piloto = cinza.pessoa(ctx, pal, chassi, "piloto", (-0.2, 0, 0.38), pose=SENTADO, escala=1.05, acessorios=acessorios,
                             roupa="cobalto", calca="cobalto")
    m.ponto("boca", (0.85, -0.3, 1.25), chassi)
    m.ponto("antena", (-1.0, 0.18, 2.35), chassi)
    m.ponto("topo", (-0.15, 0, 2.15), chassi)
    pecas = cinza.destroco(pal, raiz, 2.2, 1.0, 5)
    return {"raiz": raiz, "chassi": chassi, "piloto": piloto, "destroco": pecas}


def posar(ctx, modelo, animacao, quadro):
    destruido = animacao == "destruido"
    if animacao == "atirando":
        cinza.posar_pessoa(modelo["piloto"], _pose(braco_d=-75))
    elif animacao == "lendo":
        cinza.posar_pessoa(modelo["piloto"], _pose(braco_e=-95))
    else:
        cinza.posar_pessoa(modelo["piloto"], SENTADO)
    # the bike lies on its side when destroyed
    cinza.posar_destroco(modelo, destruido, inclinar=(72, 0), afundar=-0.05)
