# SPDX-License-Identifier: GPL-3.0-or-later
"""Prop "arvore-seca" (brief arte/briefs/neutro-terreno-vale.md): a small leafless tree, does not block; three
variations of trunk and branches, all from recursive straight segments."""

import math
import random

from comum import decoracao
from comum import modelagem as m

DESCRICAO = decoracao.descricao("neutro-decoracao-arvore-seca", "neutro/terreno-vale", (1, 1), 7.0, 3)


def _galho(nome, inicio, direcao, comprimento, raio, nivel, mat, pai, sorteio):
    fim = tuple(a + b * comprimento for a, b in zip(inicio, direcao))
    m.barra(nome, inicio, fim, raio, mat, pai, 6)
    if nivel == 0:
        return
    for k in range(2 + (nivel > 1)):
        angulo = sorteio.uniform(0, 2 * math.pi)
        abre = sorteio.uniform(0.35, 0.8)
        nova = (direcao[0] * (1 - abre) + math.cos(angulo) * abre, direcao[1] * (1 - abre) + math.sin(angulo) * abre, max(0.25, direcao[2] * (1 - abre * 0.6)))
        norma = math.sqrt(sum(c * c for c in nova))
        _galho(f"{nome}_{k}", fim, tuple(c / norma for c in nova), comprimento * sorteio.uniform(0.55, 0.75), raio * 0.62, nivel - 1, mat, pai, sorteio)


def construir(ctx):
    raiz = m.vazio("raiz")
    casca = m.material("casca", "#5E4E42", 0.0, 0.9)
    variantes = []
    for v in range(3):
        sorteio = random.Random(310 + v)
        grupo = m.vazio(f"variante{v}", (0, 0, 0), raiz)
        _galho(f"tronco{v}", (0, 0, 0), (sorteio.uniform(-0.15, 0.15), sorteio.uniform(-0.15, 0.15), 1.0), sorteio.uniform(2.2, 3.0), 0.16, 3, casca, grupo, sorteio)
        variantes.append(grupo)
    return {"raiz": raiz, "variantes": variantes}


def posar(ctx, modelo, animacao, quadro):
    for k, grupo in enumerate(modelo["variantes"]):
        grupo.scale = (1, 1, 1) if k == quadro else (0, 0, 0)
