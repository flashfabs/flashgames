# SPDX-License-Identifier: GPL-3.0-or-later
"""Terrain "agua-rasa" (brief arte/briefs/neutro-terreno-vale.md): the ford, slow ground; clear shallow water over
sand with visible stones and a little foam around them."""

from comum import modelagem as m
from comum import solo

DESCRICAO = solo.descricao("terreno-agua-rasa")
ajustar_camera = solo.ajustar_camera


def construir(ctx):
    raiz = m.vazio("raiz")
    mat = solo.material("agua_rasa", "#5E7A70", "#6E8A7E", manchas=0.2, rugosidade=0.3, pedras=(1.8, "#8C8676", 0.12), tufos=(2.2, "#A9BDB4", 0.72),
                        relevo=0.2)
    solo.chao(ctx, mat, raiz)
    pedra = m.material("pedra_rio", "#857F70", 0.0, 0.5)
    espuma = m.material("espuma", "#B9CCC4", 0.0, 0.6)

    def pedra_com_espuma(k, sorteio, x, y):
        tamanho = sorteio.uniform(0.3, 0.8)
        m.esfera(f"pedra{k}", (x, y, 0.0), tamanho, pedra, raiz, (1.0, sorteio.uniform(0.6, 1.0), 0.4), segmentos=8)
        m.toro(f"espuma{k}", (x, y, 0.02), tamanho * 1.1, 0.06, espuma, raiz)

    solo.espalhar(ctx, raiz, 14, 223, pedra_com_espuma)
    return {"raiz": raiz}
