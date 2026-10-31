# SPDX-License-Identifier: GPL-3.0-or-later
"""Neutral props of the valley (brief arte/briefs/neutro-terreno-vale.md) and the resource on the ground: one
direction, the rendered shadow, and variations as frames (frame k is variation k, picked by the renderer from the
cell's position), so the map does not repeat."""

from . import cinza


def descricao(asset, brief, pegada, altura, variantes, categoria="decoracao", tipo="decoracao", folga_lados=None, estados=("parado",)):
    quadro, ancora = cinza.quadro_construcao(*pegada, altura, folga_lados=folga_lados)
    return {
        "asset": asset, "brief": brief, "tipo": tipo, "categoria": categoria, "fases": cinza.FASES, "acabamento": "cinza",
        "pegada": list(pegada), "direcoes": 1, "passes": ["cor", "sombra"], "camadasSombra": ["corpo"],
        "camadas": {"corpo": {"quadro": quadro, "ancora": ancora}},
        "animacoes": [cinza.anim(estado, "corpo", variantes, 0, False) for estado in estados],
        "variantes": {"porQuadro": "posicao", "quantas": variantes},
    }
