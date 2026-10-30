# SPDX-License-Identifier: GPL-3.0-or-later
"""Build icon of the Escritório Regional for the HUD grid: the same scripted building with its lights on,
in the game's 3/4 view, fitted to 128 px (to be checked at 64 px as well)."""

import math

from assets import religadores_construcao_escritorio_regional as escritorio

DESCRICAO = {
    "asset": "interface-icone-escritorio-regional",
    "brief": "religadores/escritorio-regional",
    "tipo": "interface",
    "categoria": "icone",
    "fases": ["portao", "fase-1"],
    "direcoes": 1,
    "passes": ["cor"],
    "camadas": {"corpo": {"quadro": [128, 128], "ancora": [64, 64], "usa": ["corpo", "luzes"]}},
    "animacoes": [{"nome": "icone", "camada": "corpo", "quadros": 1, "fps": 0, "laco": True}],
}


def construir(ctx):
    return escritorio.construir(ctx)


def posar(ctx, modelo, animacao, quadro):
    escritorio.posar(ctx, modelo, "pronta", 0)


def ajustar_camera(ctx, camera, camada):
    inclinacao = math.radians(90 - ctx.projecao.elevacao)
    camera.data.ortho_scale = 18.0
    camera.data.shift_x = camera.data.shift_y = 0
    camera.location = (0.4, -100 * math.sin(inclinacao) - 0.6, 100 * math.cos(inclinacao) + 2.6)
