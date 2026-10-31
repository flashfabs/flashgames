# SPDX-License-Identifier: GPL-3.0-or-later
"""Terrain "capim" (brief arte/briefs/neutro-terreno-vale.md): short sparse grass over the red earth, free ground;
greener patches at the same value as terra-batida."""

from comum import modelagem as m
from comum import solo

DESCRICAO = solo.descricao("terreno-capim")
ajustar_camera = solo.ajustar_camera


def construir(ctx):
    raiz = m.vazio("raiz")
    mat = solo.material("capim", "#76704E", "#7E7A50", manchas=0.22, tufos=(1.8, "#6E7444", 0.5))
    solo.chao(ctx, mat, raiz)
    return {"raiz": raiz}
