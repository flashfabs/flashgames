# SPDX-License-Identifier: GPL-3.0-or-later
"""Arpoador, gray kit (brief arte/briefs/desligados-unidade-arpoador.md): the anti-armour harpooner. What reads
first is the thick tube on the shoulder with the harpoon point at the front and an air bottle at the back, then
the big steel-cable reel on the hip; no hat, a headscarf with goggles on the forehead, leather vest."""

import math

from comum import cinza, infantaria
from comum import modelagem as m

DESCRICAO = cinza.descricao_infantaria("desligados-infantaria-arpoador", "desligados/arpoador")


def construir(ctx):
    pal = cinza.Paleta(ctx, "desligados")
    raiz, armacao, parte, partes = cinza.corpo(ctx, pal, None, roupa="lona", calca="oliva")
    parte("tronco", m.caixa("colete", (0, 0, 1.27), (0.34, 0.48, 0.36), pal["couro"], raiz, 0.05))
    parte("cabeca", m.esfera("lenco", (-0.01, 0, 1.64), 0.14, pal["time"], raiz, (1.05, 1.0, 0.8), segmentos=16))
    parte("cabeca", m.caixa("oculos", (0.11, 0, 1.68), (0.06, 0.22, 0.07), pal["vidro"], raiz, 0.01))
    # launcher tube on the right shoulder, pointing forward
    parte("tronco", m.cilindro("tubo", (0.25, -0.22, 1.5), 0.1, 1.15, pal["ocre"], raiz, (0, math.radians(90), 0), 14))
    parte("tronco", m.cilindro("tubo_faixa", (0.45, -0.22, 1.5), 0.105, 0.16, pal["time"], raiz, (0, math.radians(90), 0), 14))
    parte("tronco", m.cone("arpao", (0.92, -0.22, 1.5), 0.06, 0.0, 0.22, pal["metal"], raiz, (0, math.radians(90), 0), 8))
    parte("tronco", m.cilindro("garrafa_ar", (-0.36, -0.22, 1.38), 0.07, 0.45, pal["tijolo"], raiz, (0, math.radians(60), 0), 10))
    parte("quadril", m.cilindro("molinete", (0.04, 0.22, 0.95), 0.14, 0.1, pal["metal"], raiz, (math.radians(90), 0, 0), 16))
    parte("quadril", m.caixa("manivela", (0.04, 0.3, 1.02), (0.04, 0.03, 0.14), pal["escuro"], raiz, 0.0))
    parte("tronco", m.ponto("boca", (1.03, -0.22, 1.5), raiz))
    parte("quadril", m.ponto("molinete", (0.04, 0.29, 0.95), raiz))
    parte("cabeca", m.ponto("topo", (0, 0, 1.9), raiz))
    cinza.prender_partes(armacao, partes)
    acoes = infantaria.acoes(armacao, cinza.ANIMACOES_INFANTARIA)
    return {"raiz": raiz, "esqueleto": armacao, "acoes": acoes}


def posar(ctx, modelo, animacao, quadro):
    cinza.posar_infantaria(modelo, animacao, quadro)
