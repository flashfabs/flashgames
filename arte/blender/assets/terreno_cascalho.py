# SPDX-License-Identifier: GPL-3.0-or-later
"""Terrain "cascalho" (brief arte/briefs/neutro-terreno-vale.md): gravel and broken concrete, free ground; warm grey
with a fine grain."""

from comum import modelagem as m
from comum import solo

DESCRICAO = solo.descricao("terreno-cascalho")
ajustar_camera = solo.ajustar_camera


def construir(ctx):
    raiz = m.vazio("raiz")
    mat = solo.material("cascalho", "#7E776C", "#8A8276", manchas=0.35, pedras=(6.0, "#9A9286", 0.09), relevo=0.25)
    solo.chao(ctx, mat, raiz)
    return {"raiz": raiz}
