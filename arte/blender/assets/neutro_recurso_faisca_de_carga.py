# SPDX-License-Identifier: GPL-3.0-or-later
"""Faísca de Carga, gray kit (brief arte/briefs/neutro-recurso-faisca-de-carga.md): spilled charge, two or three
battery cells fallen and half buried in the ground with short arcs jumping between them; half a cell, always on the
ground. Alive, the arcs snap in a 3-frame loop; cooling, they are rarer and fainter; picked up or gone, a last
crackle and the cells are gone."""

import math
import random

from comum import cinza
from comum import modelagem as m

anim = cinza.anim
DESCRICAO = {
    "asset": "neutro-recurso-faisca-de-carga", "brief": "neutro/faisca-de-carga", "tipo": "recurso", "categoria": "recurso", "fases": cinza.FASES,
    "acabamento": "cinza", "direcoes": 1, "passes": ["cor"],
    "camadas": {"corpo": {"quadro": [128, 128], "ancora": [64, 72]}},
    "animacoes": [anim("viva", "corpo", 3, 10, True), anim("esfriando", "corpo", 3, 6, True), anim("sumindo", "corpo", 2, 8, False)],
}


def _arco(nome, a, b, sorteio, mats, pai):
    pontos = [a]
    for k in range(1, 4):
        t = k / 4
        pontos.append((a[0] + (b[0] - a[0]) * t + sorteio.uniform(-0.12, 0.12), a[1] + (b[1] - a[1]) * t + sorteio.uniform(-0.12, 0.12),
                       a[2] + 0.35 * math.sin(math.pi * t) + sorteio.uniform(-0.05, 0.05)))
    pontos.append(b)
    pecas = []
    for k in range(len(pontos) - 1):
        pecas.append(m.barra(f"{nome}_{k}", pontos[k], pontos[k + 1], 0.025, mats[0], pai, 4))
        pecas.append(m.barra(f"{nome}_halo{k}", pontos[k], pontos[k + 1], 0.06, mats[1], pai, 6))
    return pecas


def construir(ctx):
    raiz = m.vazio("raiz")
    plastico = m.material("celula", "#3A3B3D", 0.0, 0.55)
    cobre = m.material("terminal", "#8A6A4A", 0.0, 0.5)
    nucleo = m.material("arco", "#CFF6FF", 0.0, 0.3, emissao=("#CFF6FF", 8.0))
    halo = m.material("arco_borda", "#4FD1B5", 0.0, 0.3, emissao=("#4FD1B5", 2.5))
    celulas = m.vazio("celulas", (0, 0, 0), raiz)
    posicoes = [(-0.45, -0.2), (0.4, -0.25), (0.05, 0.4)]
    for k, (x, y) in enumerate(posicoes):
        celula = m.caixa(f"celula{k}", (x, y, 0.05), (0.42, 0.28, 0.3), plastico, celulas, 0.03, (0.4 * (k - 1), 0.3, 0.7 * k))
        m.caixa(f"celula{k}_terminal", (0.18, 0, 0.16), (0.06, 0.06, 0.05), cobre, celula, 0.0)
    quadros = []
    for q in range(8):
        sorteio = random.Random(500 + q)
        grupo = m.vazio(f"arcos{q}", (0, 0, 0), raiz)
        n = 3 if q < 3 else (1 if q < 6 else 2)
        for k in range(n):
            a, b = sorteio.sample(posicoes, 2)
            _arco(f"arco{q}_{k}", (a[0], a[1], 0.2), (b[0], b[1], 0.2), sorteio, (nucleo, halo), grupo)
        quadros.append(grupo)
    m.ponto("centro", (0, 0, 0.0), raiz)
    return {"raiz": raiz, "celulas": celulas, "arcos": quadros}


def posar(ctx, modelo, animacao, quadro):
    # frames 0-2 alive, 3-5 cooling (fewer arcs, shown smaller), 6-7 the last crackle
    indice = {"viva": 0, "esfriando": 3, "sumindo": 6}[animacao] + quadro
    for k, grupo in enumerate(modelo["arcos"]):
        visivel = k == indice and not (animacao == "esfriando" and quadro == 1)
        escala = 0.7 if animacao == "esfriando" else 1.0
        grupo.scale = (escala, escala, escala) if visivel else (0, 0, 0)
    modelo["celulas"].scale = (0, 0, 0) if animacao == "sumindo" and quadro == 1 else (1, 1, 1)
