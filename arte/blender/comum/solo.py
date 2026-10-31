# SPDX-License-Identifier: GPL-3.0-or-later
"""Ground kinds of the valley (brief arte/briefs/neutro-terreno-vale.md): one wrapping tile of 8 x 8 cells per kind,
seen straight down under the canonical sun, the way terreno-terra-batida was made for the style gate.

A tile is a flat plane with a procedural material (two-colour patches, optional stones, cracks and tufts) and,
when the kind needs relief that casts its own short shadows (rubble, tall grass, river stones), scattered
primitives on top. Mid values and low saturation, so the units stay readable on every kind.
"""

import math
import random

import bpy

from . import compat
from . import modelagem as m

CELULAS = 8


def descricao(asset, brief="neutro/terreno-vale"):
    return {
        "asset": asset, "brief": brief, "tipo": "terreno", "categoria": "terreno", "fases": ["fase-1"], "acabamento": "cinza",
        "direcoes": 1, "celulasPorLadrilho": CELULAS, "passes": ["cor"],
        "camadas": {"corpo": {"quadro": [1024, 1024], "ancora": [512, 512]}},
        "animacoes": [{"nome": "ladrilho", "camada": "corpo", "quadros": 1, "fps": 0, "laco": True}],
    }


def _no(arvore, tipo, **valores):
    no = arvore.nodes.new(tipo)
    for nome, valor in valores.items():
        no.inputs[nome].default_value = valor
    return no


def _misturar(arvore, base, cor, fator, modo="MIX"):
    mistura = _no(arvore, "ShaderNodeMix")
    mistura.data_type = "RGBA"
    mistura.blend_type = modo
    if isinstance(cor, tuple):
        mistura.inputs[7].default_value = cor
    else:
        arvore.links.new(cor, mistura.inputs[7])
    arvore.links.new(fator, mistura.inputs[0])
    arvore.links.new(base, mistura.inputs[6])
    return mistura.outputs[2]


def _rampa(arvore, entrada, de, ate, cor_de=None, cor_ate=None):
    rampa = arvore.nodes.new("ShaderNodeValToRGB")
    rampa.color_ramp.elements[0].position = de
    rampa.color_ramp.elements[1].position = ate
    if cor_de:
        rampa.color_ramp.elements[0].color = (*m.hex_para_linear(cor_de), 1)
    if cor_ate:
        rampa.color_ramp.elements[1].color = (*m.hex_para_linear(cor_ate), 1)
    arvore.links.new(entrada, rampa.inputs["Fac"])
    return rampa.outputs["Color"]


def material(nome, cor_a, cor_b, manchas=0.18, rugosidade=0.95, pedras=None, fendas=None, tufos=None, relevo=0.1):
    """Ground material: patches between cor_a and cor_b; pedras (scale, colour, size), fendas (scale, darkness)
    and tufos (scale, colour, threshold) are optional layers on top."""
    mat = bpy.data.materials.new(nome)
    arvore = compat.garantir_nos(mat)
    bsdf = compat.principled(mat)
    bsdf.inputs["Roughness"].default_value = rugosidade
    coord = arvore.nodes.new("ShaderNodeTexCoord").outputs["Object"]
    ruido = _no(arvore, "ShaderNodeTexNoise", Scale=manchas, Detail=6.0)
    arvore.links.new(coord, ruido.inputs["Vector"])
    cor = _rampa(arvore, ruido.outputs["Fac"], 0.35, 0.65, cor_a, cor_b)
    altura = None
    if pedras:
        escala, cor_pedra, tamanho = pedras
        voronoi = _no(arvore, "ShaderNodeTexVoronoi", Scale=escala)
        arvore.links.new(coord, voronoi.inputs["Vector"])
        corte = _rampa(arvore, voronoi.outputs["Distance"], tamanho, tamanho + 0.04)
        # inverted: 1 inside the stones
        inverte = _no(arvore, "ShaderNodeInvert")
        arvore.links.new(corte, inverte.inputs["Color"])
        cor = _misturar(arvore, cor, (*m.hex_para_linear(cor_pedra), 1), inverte.outputs["Color"])
        altura = inverte.outputs["Color"]
    if fendas:
        escala, escuro = fendas
        voronoi = _no(arvore, "ShaderNodeTexVoronoi", Scale=escala)
        voronoi.feature = "DISTANCE_TO_EDGE"
        arvore.links.new(coord, voronoi.inputs["Vector"])
        linha = arvore.nodes.new("ShaderNodeValToRGB")
        linha.color_ramp.elements[0].color = (escuro, escuro, escuro, 1)
        linha.color_ramp.elements[1].position = 0.02
        arvore.links.new(voronoi.outputs["Distance"], linha.inputs["Fac"])
        um = _no(arvore, "ShaderNodeValue")
        um.outputs[0].default_value = 1.0
        cor = _misturar(arvore, cor, linha.outputs["Color"], um.outputs[0], "MULTIPLY")
    if tufos:
        escala, cor_tufo, limiar = tufos
        ruido_tufo = _no(arvore, "ShaderNodeTexNoise", Scale=escala, Detail=10.0)
        arvore.links.new(coord, ruido_tufo.inputs["Vector"])
        mascara = _rampa(arvore, ruido_tufo.outputs["Fac"], limiar, limiar + 0.08)
        cor = _misturar(arvore, cor, (*m.hex_para_linear(cor_tufo), 1), mascara)
    arvore.links.new(cor, bsdf.inputs["Base Color"])
    if altura is not None and relevo:
        bump = arvore.nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = relevo
        arvore.links.new(altura, bump.inputs["Height"])
        arvore.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def chao(ctx, mat, raiz, z=0.0):
    lado = CELULAS * ctx.projecao.metros_por_celula
    meia = lado / 2
    malha = bpy.data.meshes.new("chao")
    malha.from_pydata([(-meia, -meia, z), (meia, -meia, z), (meia, meia, z), (-meia, meia, z)], [], [(0, 1, 2, 3)])
    obj = bpy.data.objects.new("chao", malha)
    obj.data.materials.append(mat)
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = raiz
    return obj


def espalhar(ctx, raiz, n, semente, fazer):
    """Scatter n pieces over the tile, keeping a margin so the wrap blend does not cut them in half."""
    sorteio = random.Random(semente)
    meia = CELULAS * ctx.projecao.metros_por_celula / 2 - 1.0
    for k in range(n):
        fazer(k, sorteio, sorteio.uniform(-meia, meia), sorteio.uniform(-meia, meia))


def ajustar_camera(ctx, camera, camada):
    """Straight down, one tile per frame: terrain lives in map space and the game projects it."""
    camera.rotation_euler = (0, 0, 0)
    camera.location = (0, 0, 50)
    camera.data.shift_x = camera.data.shift_y = 0
    camera.data.ortho_scale = CELULAS * ctx.projecao.metros_por_celula
    bpy.context.scene.render.film_transparent = False


def ajustar_camera_face(ctx, camera, camada):
    """Straight at a vertical wall facing south (-y): the cliff face the renderer stretches over a level step."""
    lado = CELULAS * ctx.projecao.metros_por_celula
    camera.rotation_euler = (math.radians(90), 0, 0)
    camera.location = (0, -50, lado / 2)
    camera.data.shift_x = camera.data.shift_y = 0
    camera.data.ortho_scale = lado
    bpy.context.scene.render.film_transparent = False
