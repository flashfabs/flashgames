# SPDX-License-Identifier: GPL-3.0-or-later
"""Pilha de Baterias, gray kit (brief arte/briefs/neutro-recurso-pilha-de-baterias.md): the resource, a low, wide
heap of wooden pallets with battery boxes on top, some knocked over, loose cables hanging and a torn tarp in one
corner, wider than tall so it never hides the collector that pulls up to it. The heap sinks as it empties (full,
75, 50 and 25 per cent, one model frame each) and the blue-green glow lives in the gaps between the boxes, in the
lights layer the renderer pulses (the body frames carry the glow too, so a pile reads even without that layer); spent, the pallets are empty and the boxes open, with no glow."""

import math
import random

from comum import cinza
from comum import modelagem as m

anim = cinza.anim
NIVEIS = (100, 75, 50, 25)
QUADRO, ANCORA = cinza.quadro_construcao(1, 1, 2.2, folga_lados=(24, 24, 0, 0))
DESCRICAO = {
    "asset": "neutro-recurso-pilha-de-baterias", "brief": "neutro/pilha-de-baterias", "tipo": "recurso", "categoria": "recurso", "fases": cinza.FASES,
    "acabamento": "cinza", "pegada": [1, 1], "direcoes": 1, "passes": ["cor", "sombra"], "camadasSombra": ["corpo"],
    "camadas": {"corpo": {"quadro": QUADRO, "ancora": ANCORA, "usa": ["corpo", "luzes"]}, "luzes": {"quadro": QUADRO, "ancora": ANCORA, "recorte": ["corpo"]}},
    "animacoes": [anim(f"carga-{n}", "corpo", 1) for n in NIVEIS] + [anim("apagada", "corpo", 1)]
                 + [anim(f"brilho-{n}", "luzes", 1) for n in NIVEIS],
}


def construir(ctx):
    pal = cinza.Paleta(ctx, "neutro")
    raiz = m.vazio("raiz")
    sorteio = random.Random(401)
    madeira = m.material("palete_gasto", "#8B6B4A", 0.0, 0.85)
    plastico = m.material("caixa_bateria", "#3A3B3D", 0.0, 0.55)
    chumbo = m.material("caixa_chumbo", "#5E6064", 0.0, 0.6)
    cobre = m.material("terminal_oxidado", "#5E8A72", 0.0, 0.6)
    brilho = m.material("brilho_carga", "#4FD1B5", 0.0, 0.3, emissao=("#4FD1B5", 4.0))
    for k, (x, y) in enumerate(((-0.9, -0.6), (0.7, -0.7), (-0.6, 0.8), (0.9, 0.6))):
        m.caixa(f"palete{k}", (x, y, 0.08), (1.4, 1.1, 0.16), madeira, raiz, 0.01, (0, 0, sorteio.uniform(-0.3, 0.3)))
    camadas = []
    caixas_abertas = []
    for nivel in range(4):
        grupo = m.vazio(f"nivel{nivel}", (0, 0, 0), raiz)
        n = 9 - 2 * nivel
        for k in range(n):
            angulo = 2 * math.pi * k / n + nivel
            raio = (1.25 - 0.28 * nivel) * sorteio.uniform(0.4, 1.0)
            x, y, z = raio * math.cos(angulo), raio * math.sin(angulo), 0.16 + 0.42 * nivel + 0.21
            tombada = sorteio.random() < 0.25
            caixa = m.caixa(f"bateria{nivel}_{k}", (x, y, z), (0.55, 0.38, 0.42), (plastico, chumbo)[k % 2], grupo, 0.03,
                            (math.radians(80) if tombada else 0, 0, sorteio.uniform(0, math.pi)))
            m.caixa(f"terminal{nivel}_{k}", (0.12, 0, 0.23), (0.08, 0.08, 0.06), cobre, caixa, 0.0)
            # the glow between the boxes: a lamp in the lights layer just under each box
            m.caixa(f"fresta{nivel}_{k}", (x, y, z - 0.18), (0.5, 0.42, 0.08), brilho, grupo, 0.0, (0, 0, sorteio.uniform(0, math.pi)), camada="luzes")
        camadas.append(grupo)
    for k in range(5):
        aberta = m.caixa(f"aberta{k}", (sorteio.uniform(-1.2, 1.2), sorteio.uniform(-1.0, 1.0), 0.32), (0.55, 0.38, 0.3), plastico, raiz, 0.02,
                         (0, sorteio.uniform(-0.3, 0.3), sorteio.uniform(0, math.pi)))
        caixas_abertas.append(aberta)
    lona = m.caixa("lona_rasgada", (1.2, 1.1, 0.5), (1.1, 0.9, 0.04), pal["oliva"], raiz, 0.0, (0.5, -0.3, 0.6))
    for k in range(3):
        m.barra(f"cabo_solto{k}", (sorteio.uniform(-0.8, 0.8), sorteio.uniform(-0.8, 0.8), 1.0), (sorteio.uniform(-1.6, 1.6), sorteio.uniform(-1.6, 1.6), 0.02), 0.025,
                pal["escuro"], raiz, 4)
    m.ponto("coleta", (0, -2.2, 0.0), raiz)
    m.ponto("topo", (0, 0, 2.4), raiz)
    return {"raiz": raiz, "niveis": camadas, "abertas": caixas_abertas, "lona": lona}


def posar(ctx, modelo, animacao, quadro):
    if animacao == "apagada":
        restantes = 0
    else:
        restantes = 4 - NIVEIS.index(int(animacao.split("-")[1]))
    for k, grupo in enumerate(modelo["niveis"]):
        grupo.scale = (1, 1, 1) if k < restantes else (0, 0, 0)
    for caixa in modelo["abertas"]:
        caixa.scale = (1, 1, 1) if animacao == "apagada" else (0, 0, 0)
