# SPDX-License-Identifier: GPL-3.0-or-later
"""Terrain "asfalto-velho" (brief arte/briefs/neutro-terreno-vale.md): the old road, free ground; dark grey cracked
asphalt with weeds in the cracks and a few worn flakes of yellow paint (no continuous lane line, because the tile
repeats in every direction the road takes)."""

from comum import modelagem as m
from comum import solo

DESCRICAO = solo.descricao("terreno-asfalto-velho")
ajustar_camera = solo.ajustar_camera


def construir(ctx):
    raiz = m.vazio("raiz")
    mat = solo.material("asfalto", "#4A4846", "#57544F", manchas=0.3, rugosidade=0.9, pedras=(3.0, "#5F5B55", 0.05), fendas=(0.35, 0.55),
                        tufos=(1.6, "#5E6440", 0.74))
    solo.chao(ctx, mat, raiz)
    tinta = m.material("tinta_gasta", "#9C8A4E", 0.0, 0.8)

    def lasca(k, sorteio, x, y):
        m.caixa(f"tinta{k}", (x, y, 0.005), (sorteio.uniform(0.6, 1.6), 0.18, 0.01), tinta, raiz, 0.0, (0, 0, sorteio.choice((0.0, 1.5708))))

    solo.espalhar(ctx, raiz, 6, 227, lasca)
    return {"raiz": raiz}
