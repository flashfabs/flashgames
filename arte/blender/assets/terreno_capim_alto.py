# SPDX-License-Identifier: GPL-3.0-or-later
"""Terrain "capim-alto" (brief arte/briefs/neutro-terreno-vale.md): knee-high tussocks, free ground that gives bush
cover (it hides an ambush); darker and broken, with the tufts casting their own short shadows."""

from comum import modelagem as m
from comum import solo

DESCRICAO = solo.descricao("terreno-capim-alto")
ajustar_camera = solo.ajustar_camera


def construir(ctx):
    raiz = m.vazio("raiz")
    mat = solo.material("capim_base", "#5E5C3C", "#6A6842", manchas=0.3, tufos=(1.4, "#56583A", 0.5))
    solo.chao(ctx, mat, raiz)
    tufo = m.material("touceira", "#6C6C44", 0.0, 0.9)

    def touceira(k, sorteio, x, y):
        m.cone(f"touceira{k}", (x, y, 0.3), sorteio.uniform(0.3, 0.6), 0.05, 0.6, tufo, raiz, (0, 0, sorteio.uniform(0, 3)), 7)

    solo.espalhar(ctx, raiz, 110, 233, touceira)
    return {"raiz": raiz}
