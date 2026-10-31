# SPDX-License-Identifier: GPL-3.0-or-later
"""Terrain "entulho" (brief arte/briefs/neutro-terreno-vale.md): rubble of a fallen house, free ground that gives
ruin cover; light blocks of brick and plaster with short shadows, bits of rebar, on dusty ground."""

import math

from comum import modelagem as m
from comum import solo

DESCRICAO = solo.descricao("terreno-entulho")
ajustar_camera = solo.ajustar_camera


def construir(ctx):
    raiz = m.vazio("raiz")
    mat = solo.material("po_entulho", "#857A6C", "#968A7A", manchas=0.4, rugosidade=0.95, pedras=(2.6, "#A89C8A", 0.1), relevo=0.2)
    solo.chao(ctx, mat, raiz)
    tijolo = m.material("tijolo", "#8C5A48", 0.0, 0.9)
    reboco = m.material("reboco", "#B4AA98", 0.0, 0.9)
    ferro = m.material("ferragem", "#4A4440", 0.4, 0.6)

    def peca(k, sorteio, x, y):
        tamanho = sorteio.uniform(0.3, 1.0)
        material = (tijolo, reboco)[k % 2]
        m.caixa(f"bloco{k}", (x, y, tamanho * 0.2), (tamanho, tamanho * 0.6, tamanho * 0.4), material, raiz, 0.03,
                (sorteio.uniform(-0.4, 0.4), sorteio.uniform(-0.4, 0.4), sorteio.uniform(0, math.pi)))
        if k % 5 == 0:
            m.barra(f"vergalhao{k}", (x, y, 0.1), (x + sorteio.uniform(-1, 1), y + sorteio.uniform(-1, 1), 0.5), 0.02, ferro, raiz, 4)

    solo.espalhar(ctx, raiz, 60, 229, peca)
    return {"raiz": raiz}
