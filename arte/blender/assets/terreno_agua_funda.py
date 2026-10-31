# SPDX-License-Identifier: GPL-3.0-or-later
"""Terrain "agua-funda" (brief arte/briefs/neutro-terreno-vale.md): the river, blocked ground; dark blue-green water
with slow ripple bands and a sheen, no foam (the muddy bank is the transition to lama, which the renderer blends)."""

from comum import modelagem as m
from comum import solo

DESCRICAO = solo.descricao("terreno-agua-funda")
ajustar_camera = solo.ajustar_camera


def construir(ctx):
    raiz = m.vazio("raiz")
    mat = solo.material("agua_funda", "#24413F", "#2E5250", manchas=0.12, rugosidade=0.25, tufos=(0.9, "#3A6260", 0.66))
    solo.chao(ctx, mat, raiz)
    return {"raiz": raiz}
