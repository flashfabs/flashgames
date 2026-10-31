# SPDX-License-Identifier: GPL-3.0-or-later
"""Prop "muro-em-ruina" (brief arte/briefs/neutro-terreno-vale.md): a standing piece of brick wall, blocks the cell;
three variations of broken top, a gap and fallen bricks at the foot."""

import random

from comum import decoracao
from comum import modelagem as m

DESCRICAO = decoracao.descricao("neutro-decoracao-muro-em-ruina", "neutro/terreno-vale", (1, 1), 3.2, 3)


def construir(ctx):
    raiz = m.vazio("raiz")
    tijolo = m.material("tijolo_muro", "#8E5E4C", 0.0, 0.9)
    reboco = m.material("reboco_muro", "#AFA593", 0.0, 0.9)
    variantes = []
    for v in range(3):
        sorteio = random.Random(320 + v)
        grupo = m.vazio(f"variante{v}", (0, 0, 0), raiz)
        x = -1.8
        while x < 1.8:
            largura = sorteio.uniform(0.4, 0.9)
            altura = sorteio.uniform(0.8, 2.8) if not (v == 1 and -0.5 < x < 0.4) else 0.3
            m.caixa(f"muro{v}_{x:+.1f}", (x + largura / 2, 0, altura / 2), (largura, 0.35, altura), tijolo, grupo, 0.02)
            if sorteio.random() < 0.4:
                m.caixa(f"reboco{v}_{x:+.1f}", (x + largura / 2, -0.19, altura * 0.4), (largura * 0.8, 0.03, altura * 0.5), reboco, grupo, 0.0)
            x += largura
        for k in range(5):
            m.caixa(f"caido{v}_{k}", (sorteio.uniform(-1.6, 1.6), sorteio.uniform(-1.4, -0.4), 0.12), (0.4, 0.2, 0.2), tijolo, grupo, 0.01,
                    (0, 0, sorteio.uniform(0, 3)))
        variantes.append(grupo)
    return {"raiz": raiz, "variantes": variantes}


def posar(ctx, modelo, animacao, quadro):
    for k, grupo in enumerate(modelo["variantes"]):
        grupo.scale = (1, 1, 1) if k == quadro else (0, 0, 0)
