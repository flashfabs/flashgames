# SPDX-License-Identifier: GPL-3.0-or-later
"""Small modelling vocabulary for asset scripts: materials, primitives, parts by layer and attachment points.

Conventions (plan, pipeline rules): real metres with 4 m per map cell, pivot at the centre of the footprint
on the ground, front towards +X, moving parts as separate named objects, team areas with the reserved
material name "time".
"""

import math

import bpy
from mathutils import Matrix, Vector

from . import compat

NOME_TIME = "time"


def hex_para_linear(cor):
    """'#E2711D' to linear RGB, so the palette of the brief is what the Standard view shows."""
    cor = cor.lstrip("#")
    canais = [int(cor[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
    return tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in canais)


def material(nome, cor, metalico=0.0, rugosidade=0.6, ruido=None, emissao=None):
    """Procedural material: base colour (hex or linear tuple), optional noise towards a second colour."""
    if isinstance(cor, str):
        cor = hex_para_linear(cor)
    m = bpy.data.materials.new(nome)
    bsdf = compat.principled(m)
    bsdf.inputs["Base Color"].default_value = (*cor, 1.0)
    bsdf.inputs["Metallic"].default_value = metalico
    bsdf.inputs["Roughness"].default_value = rugosidade
    if emissao:
        bsdf.inputs["Emission Color"].default_value = (*hex_para_linear(emissao[0]), 1.0)
        bsdf.inputs["Emission Strength"].default_value = emissao[1]
    if ruido:
        segunda = ruido["cor"]
        if isinstance(segunda, str):
            segunda = hex_para_linear(segunda)
        arvore = m.node_tree
        textura = arvore.nodes.new("ShaderNodeTexNoise")
        textura.inputs["Scale"].default_value = ruido.get("escala", 6.0)
        textura.inputs["Detail"].default_value = ruido.get("detalhe", 8.0)
        rampa = arvore.nodes.new("ShaderNodeValToRGB")
        rampa.color_ramp.elements[0].color = (*cor, 1.0)
        rampa.color_ramp.elements[1].color = (*segunda, 1.0)
        rampa.color_ramp.elements[0].position = ruido.get("de", 0.42)
        rampa.color_ramp.elements[1].position = ruido.get("ate", 0.62)
        arvore.links.new(textura.outputs["Fac"], rampa.inputs["Fac"])
        arvore.links.new(rampa.outputs["Color"], bsdf.inputs["Base Color"])
    return m


def material_time(projecao, rugosidade=0.5):
    """The reserved team material: neutral grey in the colour pass, white in the team mask."""
    cinza = projecao.cinza_time_linear()
    return material(NOME_TIME, (cinza, cinza, cinza), 0.1, rugosidade)


def _vincular(obj, pai, camada):
    bpy.context.scene.collection.objects.link(obj)
    if pai is not None:
        obj.parent = pai
    if camada:
        obj["camada"] = camada
    return obj


def vazio(nome, local=(0, 0, 0), pai=None, camada=None, rotacao=(0, 0, 0)):
    obj = bpy.data.objects.new(nome, None)
    obj.location = local
    obj.rotation_euler = rotacao
    obj.empty_display_size = 0.3
    return _vincular(obj, pai, camada)


def ponto(nome, local, pai):
    """Named attachment point (muzzle, exhaust, top...), projected per direction and frame into the manifest."""
    obj = vazio(nome, local, pai)
    # the manifest uses this name, never obj.name, which Blender suffixes (.001) when a mesh has the same name
    obj["ponto"] = nome
    return obj


def _malha(nome, dados_bpy, local, rotacao, mat, pai, camada):
    obj = bpy.data.objects.new(nome, dados_bpy)
    obj.location = local
    obj.rotation_euler = rotacao
    obj.data.materials.append(mat)
    return _vincular(obj, pai, camada)


def _primitiva(operador, **argumentos):
    """Run a primitive operator and detach the new object from the scene, returning its mesh."""
    operador(**argumentos)
    obj = bpy.context.active_object
    malha = obj.data
    bpy.data.objects.remove(obj)
    return malha


def caixa(nome, local, dimensoes, mat, pai=None, chanfro=0.04, rotacao=(0, 0, 0), camada=None):
    """Box with full dimensions in metres (x, y, z), optionally bevelled."""
    malha = _primitiva(bpy.ops.mesh.primitive_cube_add, size=1.0)
    malha.transform(Matrix.Diagonal((*dimensoes, 1.0)))
    obj = _malha(nome, malha, local, rotacao, mat, pai, camada)
    if chanfro:
        mod = obj.modifiers.new("chanfro", "BEVEL")
        mod.width = chanfro
        mod.segments = 2
        mod.limit_method = "ANGLE"
    return obj


def cilindro(nome, local, raio, comprimento, mat, pai=None, rotacao=(0, 0, 0), vertices=24, camada=None, suave=True):
    malha = _primitiva(bpy.ops.mesh.primitive_cylinder_add, vertices=vertices, radius=raio, depth=comprimento)
    obj = _malha(nome, malha, local, rotacao, mat, pai, camada)
    if suave and vertices >= 12:
        for poligono in obj.data.polygons:
            poligono.use_smooth = True
        mod = obj.modifiers.new("chanfro", "BEVEL")
        mod.width = min(0.02, raio * 0.2)
        mod.segments = 1
        mod.limit_method = "ANGLE"
    return obj


def cone(nome, local, raio1, raio2, comprimento, mat, pai=None, rotacao=(0, 0, 0), vertices=16, camada=None):
    malha = _primitiva(bpy.ops.mesh.primitive_cone_add, vertices=vertices, radius1=raio1, radius2=raio2, depth=comprimento)
    return _malha(nome, malha, local, rotacao, mat, pai, camada)


def esfera(nome, local, raio, mat, pai=None, escala=(1, 1, 1), camada=None, segmentos=24):
    malha = _primitiva(bpy.ops.mesh.primitive_uv_sphere_add, segments=segmentos, ring_count=segmentos // 2, radius=raio)
    obj = _malha(nome, malha, local, (0, 0, 0), mat, pai, camada)
    obj.scale = escala
    for poligono in obj.data.polygons:
        poligono.use_smooth = True
    return obj


def barra(nome, inicio, fim, raio, mat, pai=None, vertices=8, camada=None):
    """Cylinder from point to point (tubes, rods, cables seen as straight pieces)."""
    a, b = Vector(inicio), Vector(fim)
    direcao = b - a
    obj = cilindro(nome, (a + b) / 2, raio, direcao.length, mat, pai, vertices=vertices, camada=camada, suave=vertices >= 12)
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = direcao.to_track_quat("Z", "Y")
    return obj


def roda(nome, local, raio, largura, mat, pai=None, eixo="y", camada=None):
    rotacao = (math.radians(90), 0, 0) if eixo == "y" else (0, math.radians(90), 0)
    return cilindro(nome, local, raio, largura, mat, pai, rotacao, vertices=20, camada=camada)


def toro(nome, local, raio_maior, raio_menor, mat, pai=None, rotacao=(0, 0, 0), camada=None):
    malha = _primitiva(bpy.ops.mesh.primitive_torus_add, major_radius=raio_maior, minor_radius=raio_menor, major_segments=24, minor_segments=10)
    obj = _malha(nome, malha, local, rotacao, mat, pai, camada)
    for poligono in obj.data.polygons:
        poligono.use_smooth = True
    return obj


def malha_de_pontos(nome, vertices, faces, mats, pai=None, camada=None, indices_material=None):
    """Mesh from raw vertices and faces, with several material slots (indices_material: one slot index per face)."""
    malha = bpy.data.meshes.new(nome)
    malha.from_pydata(vertices, [], faces)
    obj = bpy.data.objects.new(nome, malha)
    for mat in mats:
        obj.data.materials.append(mat)
    if indices_material:
        for poligono, indice in zip(malha.polygons, indices_material):
            poligono.material_index = indice
    return _vincular(obj, pai, camada)
