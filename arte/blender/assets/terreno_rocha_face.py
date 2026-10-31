# SPDX-License-Identifier: GPL-3.0-or-later
"""Terrain "rocha", vertical face (brief arte/briefs/neutro-terreno-vale.md): the cliff wall between two levels,
seen straight on, with a light edge band at the top that meets the flat top tile, horizontal strata and cracks."""

import math

from comum import modelagem as m
from comum import solo

DESCRICAO = solo.descricao("terreno-rocha-face")
ajustar_camera = solo.ajustar_camera_face


def construir(ctx):
    raiz = m.vazio("raiz")
    lado = solo.CELULAS * ctx.projecao.metros_por_celula
    mat = solo.material("rocha_face", "#6E5044", "#87695B", manchas=0.6, rugosidade=0.9, pedras=(0.9, "#7C5E50", 0.12), fendas=(0.35, 0.4), relevo=0.4)
    parede = solo.chao(ctx, mat, raiz)
    parede.rotation_euler = (math.radians(90), 0, 0)
    parede.location = (0, 0, lado / 2)
    borda = m.material("borda_clara", "#B09888", 0.0, 0.85)
    m.caixa("borda", (0, -0.2, lado - 0.6), (lado, 0.4, 1.2), borda, raiz, 0.1)
    estrato = m.material("estrato", "#5E443A", 0.0, 0.9)
    for k, z in enumerate((lado * 0.25, lado * 0.52, lado * 0.78)):
        m.caixa(f"estrato{k}", (0, -0.1, z), (lado, 0.2, 0.35), estrato, raiz, 0.05)
    return {"raiz": raiz}
