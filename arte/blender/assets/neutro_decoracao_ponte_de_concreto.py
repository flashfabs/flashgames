# SPDX-License-Identifier: GPL-3.0-or-later
"""Prop "ponte-de-concreto" (brief arte/briefs/neutro-terreno-vale.md): one cell of the old bridge deck over the
river, the path across it (does not block), laid in a strip two cells wide running north-south. Frames: 0 and 1 are
the west and east halves (parapet on the outer side), 2 and 3 the same halves with holes in the deck."""

import random

from comum import decoracao
from comum import modelagem as m

DESCRICAO = decoracao.descricao("neutro-decoracao-ponte-de-concreto", "neutro/terreno-vale", (1, 1), 2.5, 4, folga_lados=(0, 0, 0, 60))
DESCRICAO["variantes"] = {"porQuadro": "lado-e-estado", "quadros": ["oeste", "leste", "oeste-esburacada", "leste-esburacada"]}


def construir(ctx):
    raiz = m.vazio("raiz")
    concreto = m.material("concreto_ponte", "#8E8A82", 0.0, 0.85)
    sombra = m.material("concreto_baixo", "#5E5A54", 0.0, 0.9)
    buraco = m.material("buraco", "#1E2A2A", 0.0, 0.6)
    variantes = []
    for v in range(4):
        lado = -1 if v % 2 == 0 else 1
        grupo = m.vazio(f"variante{v}", (0, 0, 0), raiz)
        m.caixa(f"tabuleiro{v}", (0, 0, 0.6), (4.0, 4.0, 0.5), concreto, grupo, 0.02)
        m.caixa(f"viga{v}", (0, 0, 0.1), (3.6, 4.0, 0.5), sombra, grupo, 0.02)
        m.caixa(f"mureta{v}", (lado * 1.85, 0, 1.25), (0.3, 4.0, 0.8), concreto, grupo, 0.03)
        if v >= 2:
            sorteio = random.Random(350 + v)
            for k in range(2):
                m.cilindro(f"buraco{v}_{k}", (sorteio.uniform(-1.2, 1.0) * -lado, sorteio.uniform(-1.4, 1.4), 0.86), sorteio.uniform(0.3, 0.6), 0.02, buraco, grupo,
                           vertices=10, suave=False)
        variantes.append(grupo)
    return {"raiz": raiz, "variantes": variantes}


def posar(ctx, modelo, animacao, quadro):
    for k, grupo in enumerate(modelo["variantes"]):
        grupo.scale = (1, 1, 1) if k == quadro else (0, 0, 0)
