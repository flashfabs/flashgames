# SPDX-License-Identifier: GPL-3.0-or-later
"""Terrain material "terra batida": dry packed earth with pebbles, cracks and dry grass, as one wrapping
1024 px tile (8 cells of 4 m) seen from above under the canonical sun. Mid values, low saturation, so units
stay readable on it; the packer makes the tile wrap.
"""

import math

import bpy

from comum import compat
from comum import modelagem as m

CELULAS = 8

DESCRICAO = {
    "asset": "terreno-terra-batida",
    "brief": None,
    "tipo": "terreno",
    "categoria": "terreno",
    "fases": ["portao", "fase-1"],
    "direcoes": 1,
    "celulasPorLadrilho": CELULAS,
    "passes": ["cor"],
    "camadas": {"corpo": {"quadro": [1024, 1024], "ancora": [512, 512]}},
    "animacoes": [{"nome": "ladrilho", "camada": "corpo", "quadros": 1, "fps": 0, "laco": True}],
}


def _no(arvore, tipo, **valores):
    no = arvore.nodes.new(tipo)
    for nome, valor in valores.items():
        no.inputs[nome].default_value = valor
    return no


def construir(ctx):
    lado = CELULAS * ctx.projecao.metros_por_celula
    mat = bpy.data.materials.new("terra_batida")
    arvore = compat.garantir_nos(mat)
    bsdf = compat.principled(mat)
    bsdf.inputs["Roughness"].default_value = 0.95
    coord = arvore.nodes.new("ShaderNodeTexCoord")
    manchas = _no(arvore, "ShaderNodeTexNoise", Scale=0.18, Detail=6.0)
    arvore.links.new(coord.outputs["Object"], manchas.inputs["Vector"])
    rampa = arvore.nodes.new("ShaderNodeValToRGB")
    rampa.color_ramp.elements[0].color = (*m.hex_para_linear("#7A6A55"), 1)
    rampa.color_ramp.elements[1].color = (*m.hex_para_linear("#8E7B5E"), 1)
    arvore.links.new(manchas.outputs["Fac"], rampa.inputs["Fac"])
    pedras = _no(arvore, "ShaderNodeTexVoronoi", Scale=4.0)
    arvore.links.new(coord.outputs["Object"], pedras.inputs["Vector"])
    corte = arvore.nodes.new("ShaderNodeValToRGB")
    corte.color_ramp.elements[0].position = 0.05
    corte.color_ramp.elements[1].position = 0.09
    arvore.links.new(pedras.outputs["Distance"], corte.inputs["Fac"])
    cor_pedra = _no(arvore, "ShaderNodeMix")
    cor_pedra.data_type = "RGBA"
    cor_pedra.inputs[7].default_value = (*m.hex_para_linear("#9C9384"), 1)
    arvore.links.new(corte.outputs["Color"], cor_pedra.inputs[0])
    arvore.links.new(rampa.outputs["Color"], cor_pedra.inputs[6])
    fendas = _no(arvore, "ShaderNodeTexVoronoi", Scale=0.6)
    fendas.feature = "DISTANCE_TO_EDGE"
    arvore.links.new(coord.outputs["Object"], fendas.inputs["Vector"])
    linha = arvore.nodes.new("ShaderNodeValToRGB")
    linha.color_ramp.elements[0].position = 0.0
    linha.color_ramp.elements[0].color = (0.72, 0.72, 0.72, 1)
    linha.color_ramp.elements[1].position = 0.02
    arvore.links.new(fendas.outputs["Distance"], linha.inputs["Fac"])
    escurece = _no(arvore, "ShaderNodeMix")
    escurece.data_type = "RGBA"
    escurece.blend_type = "MULTIPLY"
    escurece.inputs[0].default_value = 1.0
    arvore.links.new(cor_pedra.outputs[2], escurece.inputs[6])
    arvore.links.new(linha.outputs["Color"], escurece.inputs[7])
    capim = _no(arvore, "ShaderNodeTexNoise", Scale=1.4, Detail=10.0)
    arvore.links.new(coord.outputs["Object"], capim.inputs["Vector"])
    tufo = arvore.nodes.new("ShaderNodeValToRGB")
    tufo.color_ramp.elements[0].position = 0.62
    tufo.color_ramp.elements[1].position = 0.7
    arvore.links.new(capim.outputs["Fac"], tufo.inputs["Fac"])
    verde = _no(arvore, "ShaderNodeMix")
    verde.data_type = "RGBA"
    verde.inputs[7].default_value = (*m.hex_para_linear("#7F7A4A"), 1)
    arvore.links.new(tufo.outputs["Color"], verde.inputs[0])
    arvore.links.new(escurece.outputs[2], verde.inputs[6])
    arvore.links.new(verde.outputs[2], bsdf.inputs["Base Color"])
    relevo = arvore.nodes.new("ShaderNodeBump")
    relevo.inputs["Strength"].default_value = 0.12
    arvore.links.new(corte.outputs["Color"], relevo.inputs["Height"])
    arvore.links.new(relevo.outputs["Normal"], bsdf.inputs["Normal"])
    raiz = m.vazio("raiz")
    malha = bpy.data.meshes.new("chao")
    meia = lado / 2
    malha.from_pydata([(-meia, -meia, 0), (meia, -meia, 0), (meia, meia, 0), (-meia, meia, 0)], [], [(0, 1, 2, 3)])
    chao = bpy.data.objects.new("chao", malha)
    chao.data.materials.append(mat)
    bpy.context.scene.collection.objects.link(chao)
    chao.parent = raiz
    return {"raiz": raiz}


def ajustar_camera(ctx, camera, camada):
    """Straight down, one tile per frame: terrain lives in map space and the game projects it."""
    camera.rotation_euler = (0, 0, 0)
    camera.location = (0, 0, 50)
    camera.data.shift_x = camera.data.shift_y = 0
    camera.data.ortho_scale = CELULAS * ctx.projecao.metros_por_celula
    bpy.context.scene.render.film_transparent = False
