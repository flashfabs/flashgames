# SPDX-License-Identifier: GPL-3.0-or-later
"""Terrain "rocha" (brief arte/briefs/neutro-terreno-vale.md): the flat top of the reddish plateau rock, blocked
ground; slabs with dark joints and a few loose boulders. The vertical face of the step is terreno-rocha-face."""

from comum import modelagem as m
from comum import solo

DESCRICAO = solo.descricao("terreno-rocha")
ajustar_camera = solo.ajustar_camera


def construir(ctx):
    raiz = m.vazio("raiz")
    mat = solo.material("rocha", "#7E5E4E", "#957565", manchas=0.25, rugosidade=0.85, pedras=(1.3, "#A08676", 0.16), fendas=(0.45, 0.45), relevo=0.3)
    solo.chao(ctx, mat, raiz)
    pedra = m.material("pedra_rocha", "#8A6A5A", 0.0, 0.85)

    def bloco(k, sorteio, x, y):
        tamanho = sorteio.uniform(0.5, 1.4)
        m.esfera(f"bloco{k}", (x, y, tamanho * 0.15), tamanho, pedra, raiz, (1.0, sorteio.uniform(0.6, 1.0), 0.45), segmentos=8)

    solo.espalhar(ctx, raiz, 9, 211, bloco)
    return {"raiz": raiz}
