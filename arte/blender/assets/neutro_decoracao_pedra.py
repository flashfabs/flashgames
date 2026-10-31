# SPDX-License-Identifier: GPL-3.0-or-later
"""Prop "pedra" (brief arte/briefs/neutro-terreno-vale.md): a loose stone of half a metre, does not block; four
variations of the same reddish rock as the plateau."""

import random

from comum import decoracao
from comum import modelagem as m

DESCRICAO = decoracao.descricao("neutro-decoracao-pedra", "neutro/terreno-vale", (1, 1), 1.5, 4)


def construir(ctx):
    raiz = m.vazio("raiz")
    pedra = m.material("pedra", "#8A6E60", 0.0, 0.85)
    musgo = m.material("pedra_escura", "#6A5448", 0.0, 0.9)
    variantes = []
    for v in range(4):
        sorteio = random.Random(300 + v)
        grupo = m.vazio(f"variante{v}", (0, 0, 0), raiz)
        for k in range(1 + v % 3):
            tamanho = sorteio.uniform(0.35, 0.7) / (k + 1)
            m.esfera(f"pedra{v}_{k}", (sorteio.uniform(-0.4, 0.4) * k, sorteio.uniform(-0.4, 0.4) * k, tamanho * 0.25), tamanho, (pedra, musgo)[k % 2], grupo,
                     (1.0, sorteio.uniform(0.6, 0.95), sorteio.uniform(0.5, 0.8)), segmentos=8)
        variantes.append(grupo)
    return {"raiz": raiz, "variantes": variantes}


def posar(ctx, modelo, animacao, quadro):
    for k, grupo in enumerate(modelo["variantes"]):
        grupo.scale = (1, 1, 1) if k == quadro else (0, 0, 0)
