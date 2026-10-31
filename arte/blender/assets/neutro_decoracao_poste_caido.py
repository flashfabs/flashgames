# SPDX-License-Identifier: GPL-3.0-or-later
"""Prop "poste-caido" (brief arte/briefs/neutro-terreno-vale.md): an old concrete pole lying on the ground with
its wires, does not block; three variations of angle, broken stump and tangled wire."""

import math
import random

from comum import decoracao
from comum import modelagem as m

DESCRICAO = decoracao.descricao("neutro-decoracao-poste-caido", "neutro/terreno-vale", (1, 1), 1.5, 3, folga_lados=(60, 60, 20, 20))


def construir(ctx):
    raiz = m.vazio("raiz")
    concreto = m.material("concreto_velho", "#8C8780", 0.0, 0.85)
    fio = m.material("fio", "#2A2826", 0.0, 0.7)
    variantes = []
    for v in range(3):
        sorteio = random.Random(330 + v)
        grupo = m.vazio(f"variante{v}", (0, 0, 0), raiz, rotacao=(0, 0, math.radians(sorteio.uniform(-60, 60))))
        m.cone(f"fuste{v}", (0, 0, 0.18), 0.2, 0.13, 6.0, concreto, grupo, (0, math.radians(90), 0), 10)
        m.caixa(f"cruzeta{v}", (2.9, 0, 0.3), (0.15, 1.8, 0.15), concreto, grupo, 0.02, (0, 0, 0.3))
        m.cilindro(f"toco{v}", (-3.4, 0.3, 0.4), 0.21, 0.8, concreto, grupo, vertices=10)
        pontos = [(2.9, -0.8, 0.3)]
        for k in range(6):
            pontos.append((2.9 - k * 0.8, -0.8 - sorteio.uniform(0.2, 0.9), 0.03))
        for k in range(len(pontos) - 1):
            m.barra(f"fio{v}_{k}", pontos[k], pontos[k + 1], 0.015, fio, grupo, 4)
        variantes.append(grupo)
    return {"raiz": raiz, "variantes": variantes}


def posar(ctx, modelo, animacao, quadro):
    for k, grupo in enumerate(modelo["variantes"]):
        grupo.scale = (1, 1, 1) if k == quadro else (0, 0, 0)
