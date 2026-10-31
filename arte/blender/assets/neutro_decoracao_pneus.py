# SPDX-License-Identifier: GPL-3.0-or-later
"""Prop "pneus" (brief arte/briefs/neutro-terreno-vale.md): a pile of old tyres, does not block; three variations
of stack and spill."""

import math
import random

from comum import decoracao
from comum import modelagem as m

DESCRICAO = decoracao.descricao("neutro-decoracao-pneus", "neutro/terreno-vale", (1, 1), 1.8, 3)


def construir(ctx):
    raiz = m.vazio("raiz")
    borracha = m.material("pneu_velho", "#2A2A2A", 0.0, 0.9)
    variantes = []
    for v in range(3):
        sorteio = random.Random(340 + v)
        grupo = m.vazio(f"variante{v}", (0, 0, 0), raiz)
        for k in range(3 + v):
            empilhado = k < 2 + v % 2
            x, y = (0.0, 0.0) if empilhado else (sorteio.uniform(-0.9, 0.9), sorteio.uniform(-0.9, 0.9))
            z = 0.15 + 0.26 * k if empilhado else 0.15
            m.toro(f"pneu{v}_{k}", (x, y, z), 0.42, 0.14, borracha, grupo, (sorteio.uniform(-0.1, 0.1), sorteio.uniform(-0.1, 0.1), 0))
        variantes.append(grupo)
    return {"raiz": raiz, "variantes": variantes}


def posar(ctx, modelo, animacao, quadro):
    for k, grupo in enumerate(modelo["variantes"]):
        grupo.scale = (1, 1, 1) if k == quadro else (0, 0, 0)
