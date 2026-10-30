# SPDX-License-Identifier: GPL-3.0-or-later
"""Pipeline test only: the tracked scrap tank of the prototype, split into body and turret layers.

It is not part of the game's cast (the style gate uses pieces of the chosen world); it exists to prove
rtx.sh, the render loop, the attachment points and the packer end to end.
"""

import math
import random

from comum import modelagem as m

DESCRICAO = {
    "asset": "teste-veiculo-tanque",
    "brief": None,
    "tipo": "unidade",
    "categoria": "veiculo",
    "fases": ["teste"],
    "direcoes": 16,
    "passes": ["cor", "time", "normal"],
    "camadas": {
        "corpo": {"quadro": [256, 256], "ancora": [128, 150]},
        "torre": {"quadro": [256, 256], "ancora": [128, 150], "pivo": "torre_pivo"},
    },
    "animacoes": [
        {"nome": "parado", "camada": "corpo", "quadros": 1, "fps": 0, "laco": True},
        {"nome": "andando", "camada": "corpo", "quadros": 2, "fps": 10, "laco": True},
        {"nome": "torre", "camada": "torre", "quadros": 1, "fps": 0, "laco": True},
    ],
}


def construir(ctx):
    escala = 0.62  # the prototype tank was 6 m long; scale it to about 1.25 cells
    ferrugem = m.material("ferrugem", (0.26, 0.15, 0.08), 0.5, 0.75, {"escala": 6.0, "cor": (0.34, 0.29, 0.22)})
    chapa = m.material("chapa", (0.30, 0.29, 0.25), 0.6, 0.6, {"escala": 11.0, "cor": (0.24, 0.14, 0.08)})
    escuro = m.material("metal_escuro", (0.05, 0.05, 0.05), 0.8, 0.45)
    borracha = m.material("borracha", (0.02, 0.02, 0.02), 0.0, 0.92)
    time = m.material_time(ctx.projecao)

    raiz = m.vazio("raiz")
    corpo = m.vazio("corpo", pai=raiz)
    corpo.scale = (escala, escala, escala)
    m.caixa("casco", (0, 0, 0.95), (5.0, 2.5, 1.0), ferrugem, corpo, 0.09)
    m.caixa("rampa", (2.35, 0, 1.02), (1.1, 2.4, 0.64), chapa, corpo, 0.06, (0, math.radians(28), 0))
    rodas = []
    for lado in (-1, 1):
        m.caixa(f"esteira{lado}", (0, lado * 1.55, 0.5), (5.7, 0.72, 0.88), borracha, corpo, 0.12)
        m.caixa(f"para_lama{lado}", (0, lado * 1.55, 1.0), (5.9, 0.92, 0.1), chapa, corpo, 0.02)
        for k in range(6):
            rodas.append(m.roda(f"roda{lado}{k}", (-2.1 + k * 0.84, lado * 1.74, 0.42), 0.33, 0.12, escuro, corpo))
        m.caixa(f"faixa{lado}", (0.1, lado * 1.27, 1.05), (3.2, 0.06, 0.28), time, corpo, 0.0)
    for lado in (-1, 1):
        m.cilindro(f"escape{lado}", (-2.25, lado * 0.75, 1.55), 0.13, 0.75, escuro, corpo)
    m.cilindro("estepe", (-2.62, 0, 1.1), 0.42, 0.22, borracha, corpo, (0, math.radians(90), 0))
    sorteio = random.Random(11)
    for k in range(7):
        x = sorteio.uniform(-1.9, 1.6)
        y = sorteio.choice((-1, 1)) * sorteio.uniform(0.35, 1.0)
        m.caixa(f"remendo{k}", (x, y, 1.46), (sorteio.uniform(0.4, 0.9), sorteio.uniform(0.3, 0.6), 0.08), chapa, corpo, 0.015, (0, 0, sorteio.uniform(-0.4, 0.4)))
    m.ponto("encaixe_torre", (-0.25, 0, 0), corpo)
    m.ponto("escape", (-2.25, 0.75, 1.95), corpo)
    m.ponto("topo", (0, 0, 2.7), corpo)

    torre_pivo = m.vazio("torre_pivo", (-0.25, 0, 0), corpo, camada="torre")
    m.cilindro("torre_casco", (0, 0, 1.75), 0.95, 0.62, ferrugem, torre_pivo, vertices=10, suave=False)
    m.caixa("caixa_traseira", (-0.9, 0, 1.75), (0.84, 1.7, 0.6), chapa, torre_pivo, 0.05)
    m.cilindro("anel_time", (0, 0, 2.08), 0.62, 0.08, time, torre_pivo, vertices=10, suave=False)
    m.cilindro("cano", (1.8, 0, 1.8), 0.12, 2.6, escuro, torre_pivo, (0, math.radians(90), 0))
    m.cilindro("freio_boca", (3.15, 0, 1.8), 0.2, 0.36, escuro, torre_pivo, (0, math.radians(90), 0))
    m.cilindro("antena", (-0.65, 0.55, 2.6), 0.015, 1.3, escuro, torre_pivo, vertices=6, suave=False)
    m.ponto("boca", (3.35, 0, 1.8), torre_pivo)
    return {"raiz": raiz, "rodas": rodas}


def posar(ctx, modelo, animacao, quadro):
    giro = math.pi * quadro / 2 if animacao == "andando" else 0.0
    for roda in modelo["rodas"]:
        roda.rotation_euler = (math.radians(90), giro, 0)
