# SPDX-License-Identifier: GPL-3.0-or-later
"""Portrait of the Turma de Linha for the HUD and the briefing: the same scripted character, framed close in
perspective with the shared rim light, in an 8-frame idle loop. Transparent background; the HUD frame tints it.
"""

import math

import bpy
from mathutils import Vector

from assets import religadores_infantaria_turma_de_linha_portao as turma

DESCRICAO = {
    "asset": "interface-retrato-turma-de-linha",
    "brief": "religadores/turma-de-linha",
    "tipo": "interface",
    "categoria": "retrato",
    "fases": ["portao", "fase-1"],
    "direcoes": 1,
    "passes": ["cor"],
    "camadas": {"corpo": {"quadro": [256, 256], "ancora": [128, 128]}},
    "animacoes": [{"nome": "parado", "camada": "corpo", "quadros": 8, "fps": 10, "laco": True}],
}


def luz_de_recorte():
    """Rim light shared by every portrait: a cool sun from behind and above the subject."""
    dados = bpy.data.lights.new("recorte", "SUN")
    dados.energy = 4.0
    dados.color = (0.75, 0.85, 1.0)
    luz = bpy.data.objects.new("recorte", dados)
    luz.rotation_euler = (math.radians(-60), 0, math.radians(-150))
    bpy.context.scene.collection.objects.link(luz)


def construir(ctx):
    modelo = turma.construir(ctx)
    luz_de_recorte()
    return modelo


def posar(ctx, modelo, animacao, quadro):
    turma.posar(ctx, modelo, "parado", quadro % 4)


def ajustar_camera(ctx, camera, camada):
    escala = ctx.projecao.exagero_infantaria
    alvo = Vector((0.05, 0.0, 1.5 * escala))
    camera.data.type = "PERSP"
    camera.data.lens = 85
    camera.data.shift_x = camera.data.shift_y = 0
    camera.location = alvo + Vector((3.6, -2.4, 0.9))
    camera.rotation_mode = "QUATERNION"
    camera.rotation_quaternion = (alvo - camera.location).to_track_quat("-Z", "Y")
