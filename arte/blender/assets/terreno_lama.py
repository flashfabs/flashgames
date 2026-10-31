# SPDX-License-Identifier: GPL-3.0-or-later
"""Terrain "lama" (brief arte/briefs/neutro-terreno-vale.md): the soaked bank, slow ground; dark glossy brown with
puddles that catch the sky."""

from comum import modelagem as m
from comum import solo

DESCRICAO = solo.descricao("terreno-lama")
ajustar_camera = solo.ajustar_camera


def construir(ctx):
    raiz = m.vazio("raiz")
    mat = solo.material("lama", "#4E3E32", "#5C4A3C", manchas=0.4, rugosidade=0.35, tufos=(1.2, "#5A5A52", 0.68))
    solo.chao(ctx, mat, raiz)
    return {"raiz": raiz}
