# SPDX-License-Identifier: GPL-3.0-or-later
"""Headless Blender test for the sprite pipeline.

Builds an original tracked scrap tank from primitives, renders it in N directions with an orthographic
3/4 camera (colour, team mask and normal passes), packs each pass into a horizontal atlas and renders
one beauty shot. Run on the RTX 4090 machine:

    blender -b --factory-startup -P renderizar_veiculo.py -- --saida D:/rts/renders/tanque
"""

import json
import math
import os
import random
import sys
import time

import bpy
import numpy as np

argumentos = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
SAIDA = argumentos[argumentos.index("--saida") + 1] if "--saida" in argumentos else os.path.abspath("renders")
DIRECOES = int(argumentos[argumentos.index("--direcoes") + 1]) if "--direcoes" in argumentos else 16
QUADRO = int(argumentos[argumentos.index("--quadro") + 1]) if "--quadro" in argumentos else 256
AMOSTRAS = int(argumentos[argumentos.index("--amostras") + 1]) if "--amostras" in argumentos else 64
os.makedirs(SAIDA, exist_ok=True)


def limpar_cena():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def usar_gpu():
    preferencias = bpy.context.preferences.addons["cycles"].preferences
    for tipo in ("OPTIX", "CUDA"):
        try:
            preferencias.compute_device_type = tipo
        except TypeError:
            continue
        preferencias.refresh_devices()
        dispositivos = [d for d in preferencias.devices if d.type == tipo]
        if dispositivos:
            for d in preferencias.devices:
                d.use = d.type == tipo
            return tipo, [d.name for d in dispositivos]
    return "CPU", []


def material(nome, cor, metalico=0.0, rugosidade=0.6, ruido=None):
    m = bpy.data.materials.new(nome)
    m.use_nodes = True
    nos = m.node_tree.nodes
    bsdf = nos["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*cor, 1.0)
    bsdf.inputs["Metallic"].default_value = metalico
    bsdf.inputs["Roughness"].default_value = rugosidade
    if ruido:
        # rust variation: noise drives a colour ramp between the base and a second colour
        textura = nos.new("ShaderNodeTexNoise")
        textura.inputs["Scale"].default_value = ruido["escala"]
        textura.inputs["Detail"].default_value = 8.0
        rampa = nos.new("ShaderNodeValToRGB")
        rampa.color_ramp.elements[0].color = (*cor, 1.0)
        rampa.color_ramp.elements[1].color = (*ruido["cor"], 1.0)
        rampa.color_ramp.elements[0].position = 0.42
        rampa.color_ramp.elements[1].position = 0.62
        m.node_tree.links.new(textura.outputs["Fac"], rampa.inputs["Fac"])
        m.node_tree.links.new(rampa.outputs["Color"], bsdf.inputs["Base Color"])
    return m


def caixa(nome, local, escala, mat, chanfro=0.04, rotacao=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(location=local, rotation=rotacao)
    obj = bpy.context.active_object
    obj.name = nome
    obj.scale = escala
    bpy.ops.object.transform_apply(scale=True)
    if chanfro:
        mod = obj.modifiers.new("chanfro", "BEVEL")
        mod.width = chanfro
        mod.segments = 2
    obj.data.materials.append(mat)
    return obj


def cilindro(nome, local, raio, profundidade, mat, rotacao=(0, 0, 0), vertices=24):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=raio, depth=profundidade, location=local, rotation=rotacao)
    obj = bpy.context.active_object
    obj.name = nome
    obj.data.materials.append(mat)
    if vertices >= 16:
        bpy.ops.object.shade_smooth()
    else:
        # low-poly welded parts keep hard facets, with a small bevel to catch the light
        mod = obj.modifiers.new("chanfro", "BEVEL")
        mod.width = 0.03
        mod.segments = 1
    return obj


def construir_tanque():
    ferrugem = material("ferrugem", (0.26, 0.15, 0.08), 0.5, 0.75, {"escala": 6.0, "cor": (0.34, 0.29, 0.22)})
    chapa = material("chapa", (0.30, 0.29, 0.25), 0.6, 0.6, {"escala": 11.0, "cor": (0.24, 0.14, 0.08)})
    escuro = material("metal_escuro", (0.05, 0.05, 0.05), 0.8, 0.45)
    borracha = material("borracha", (0.02, 0.02, 0.02), 0.0, 0.92)
    time = material("time", (0.6, 0.6, 0.58), 0.25, 0.5)

    partes = []
    partes.append(caixa("casco", (0, 0, 0.95), (2.5, 1.25, 0.5), ferrugem, 0.09))
    partes.append(caixa("rampa", (2.35, 0, 1.02), (0.55, 1.2, 0.32), chapa, 0.06, (0, math.radians(28), 0)))
    for lado in (-1, 1):
        partes.append(caixa(f"esteira{lado}", (0, lado * 1.55, 0.5), (2.85, 0.36, 0.44), borracha, 0.12))
        partes.append(caixa(f"para_lama{lado}", (0, lado * 1.55, 1.0), (2.95, 0.46, 0.05), chapa, 0.02))
        for k in range(6):
            partes.append(cilindro(f"roda{lado}{k}", (-2.1 + k * 0.84, lado * 1.74, 0.42), 0.33, 0.12, escuro, (math.radians(90), 0, 0)))
        partes.append(caixa(f"faixa{lado}", (0.1, lado * 1.27, 1.05), (1.6, 0.03, 0.14), time, 0.0))
    partes.append(cilindro("torre", (-0.25, 0, 1.75), 0.95, 0.62, ferrugem, vertices=10))
    partes.append(caixa("caixa_traseira", (-1.15, 0, 1.75), (0.42, 0.85, 0.3), chapa, 0.05))
    partes.append(cilindro("anel_time", (-0.25, 0, 2.08), 0.62, 0.08, time, vertices=10))
    partes.append(cilindro("cano", (1.55, 0, 1.8), 0.12, 2.6, escuro, (0, math.radians(90), 0)))
    partes.append(cilindro("freio_boca", (2.9, 0, 1.8), 0.2, 0.36, escuro, (0, math.radians(90), 0)))
    for lado in (-1, 1):
        partes.append(cilindro(f"escape{lado}", (-2.25, lado * 0.75, 1.55), 0.13, 0.75, escuro))
    partes.append(cilindro("estepe", (-2.62, 0, 1.1), 0.42, 0.22, borracha, (0, math.radians(90), 0)))
    partes.append(cilindro("antena", (-0.9, 0.55, 2.6), 0.015, 1.3, escuro, vertices=6))
    sorteio = random.Random(11)
    for k in range(7):
        # welded scrap plates: the asymmetric silhouette is part of the identity
        x = sorteio.uniform(-1.9, 1.6)
        y = sorteio.choice((-1, 1)) * sorteio.uniform(0.35, 1.0)
        partes.append(caixa(f"remendo{k}", (x, y, 1.46), (sorteio.uniform(0.2, 0.45), sorteio.uniform(0.15, 0.3), 0.04), chapa, 0.015, (0, 0, sorteio.uniform(-0.4, 0.4))))

    bpy.ops.object.empty_add(location=(0, 0, 0))
    pivo = bpy.context.active_object
    pivo.name = "pivo"
    for parte in partes:
        parte.parent = pivo
    return pivo, {"time": time}


def preparar_luz_e_camera(ortografica=True):
    mundo = bpy.data.worlds.new("mundo")
    bpy.context.scene.world = mundo
    mundo.use_nodes = True
    fundo = mundo.node_tree.nodes["Background"]
    fundo.inputs["Color"].default_value = (0.42, 0.44, 0.48, 1.0)
    fundo.inputs["Strength"].default_value = 0.35

    # sun from the top left of the screen, as in the game's terrain shader
    bpy.ops.object.light_add(type="SUN", location=(0, 0, 10))
    sol = bpy.context.active_object
    sol.data.energy = 2.6
    sol.data.angle = math.radians(6)
    sol.rotation_euler = (math.radians(40), 0, math.radians(-135))

    alvo = (0.0, 0.0, 0.9)
    elevacao = math.radians(55)
    inclinacao = math.radians(90) - elevacao
    distancia = 30.0
    bpy.ops.object.camera_add(
        location=(alvo[0], alvo[1] - distancia * math.sin(inclinacao), alvo[2] + distancia * math.cos(inclinacao)),
        rotation=(inclinacao, 0, 0),
    )
    camera = bpy.context.active_object
    bpy.context.scene.camera = camera
    if ortografica:
        camera.data.type = "ORTHO"
        camera.data.ortho_scale = 8.4
    return camera, sol


def configurar_render(amostras, largura, altura, transparente=True):
    cena = bpy.context.scene
    cena.render.engine = "CYCLES"
    cena.cycles.device = "GPU"
    cena.cycles.samples = amostras
    cena.cycles.use_denoising = amostras >= 16
    cena.render.resolution_x = largura
    cena.render.resolution_y = altura
    cena.render.resolution_percentage = 100
    cena.render.film_transparent = transparente
    cena.render.image_settings.file_format = "PNG"
    cena.render.image_settings.color_mode = "RGBA"
    cena.view_settings.view_transform = "Standard"


def trocar_materiais(objetos, para):
    """Swap every material for a flat emission one ('time' mask or 'normal'); returns a restore function."""
    originais = {}
    branco = bpy.data.materials.new("mascara_branca")
    preto = bpy.data.materials.new("mascara_preta")
    normal = bpy.data.materials.new("normal_mundo")
    for m, cor in ((branco, (1, 1, 1, 1)), (preto, (0, 0, 0, 1))):
        m.use_nodes = True
        nos = m.node_tree.nodes
        nos.clear()
        emissao = nos.new("ShaderNodeEmission")
        emissao.inputs["Color"].default_value = cor
        saida = nos.new("ShaderNodeOutputMaterial")
        m.node_tree.links.new(emissao.outputs["Emission"], saida.inputs["Surface"])
    normal.use_nodes = True
    nos = normal.node_tree.nodes
    nos.clear()
    geometria = nos.new("ShaderNodeNewGeometry")
    escala = nos.new("ShaderNodeVectorMath")
    escala.operation = "MULTIPLY_ADD"
    escala.inputs[1].default_value = (0.5, 0.5, 0.5)
    escala.inputs[2].default_value = (0.5, 0.5, 0.5)
    emissao = nos.new("ShaderNodeEmission")
    saida = nos.new("ShaderNodeOutputMaterial")
    normal.node_tree.links.new(geometria.outputs["Normal"], escala.inputs[0])
    normal.node_tree.links.new(escala.outputs["Vector"], emissao.inputs["Color"])
    normal.node_tree.links.new(emissao.outputs["Emission"], saida.inputs["Surface"])
    for obj in objetos:
        if obj.type != "MESH":
            continue
        originais[obj.name] = obj.data.materials[0]
        if para == "time":
            obj.data.materials[0] = branco if originais[obj.name].name == "time" else preto
        else:
            obj.data.materials[0] = normal

    def restaurar():
        for obj in objetos:
            if obj.name in originais:
                obj.data.materials[0] = originais[obj.name]

    return restaurar


def renderizar_direcoes(pivo, passe):
    caminhos = []
    tempos = []
    for k in range(DIRECOES):
        # frame k faces map angle k * 360/N, clockwise on screen from east (map y points down)
        pivo.rotation_euler = (0, 0, -2 * math.pi * k / DIRECOES)
        caminho = os.path.join(SAIDA, f"{passe}_{k:02d}.png")
        bpy.context.scene.render.filepath = caminho
        inicio = time.perf_counter()
        bpy.ops.render.render(write_still=True)
        tempos.append(time.perf_counter() - inicio)
        caminhos.append(caminho)
    return caminhos, tempos


def montar_atlas(caminhos, destino):
    faixas = []
    for caminho in caminhos:
        imagem = bpy.data.images.load(caminho)
        pixels = np.empty(imagem.size[0] * imagem.size[1] * 4, dtype=np.float32)
        imagem.pixels.foreach_get(pixels)
        faixas.append(pixels.reshape(imagem.size[1], imagem.size[0], 4))
        bpy.data.images.remove(imagem)
    atlas = np.concatenate(faixas, axis=1)
    altura, largura = atlas.shape[:2]
    saida = bpy.data.images.new(os.path.basename(destino), largura, altura, alpha=True)
    saida.pixels.foreach_set(atlas.ravel())
    saida.filepath_raw = destino
    saida.file_format = "PNG"
    saida.save()
    return largura, altura


def principal():
    limpar_cena()
    dispositivo, nomes = usar_gpu()
    pivo, _ = construir_tanque()
    preparar_luz_e_camera()
    objetos = list(pivo.children)
    relatorio = {"blender": bpy.app.version_string, "dispositivo": dispositivo, "gpus": nomes, "direcoes": DIRECOES, "quadro": QUADRO, "amostras": AMOSTRAS}

    configurar_render(AMOSTRAS, QUADRO, QUADRO)
    cores, tempos_cor = renderizar_direcoes(pivo, "cor")
    configurar_render(16, QUADRO, QUADRO)
    restaurar = trocar_materiais(objetos, "time")
    mascaras, tempos_time = renderizar_direcoes(pivo, "time")
    restaurar()
    restaurar = trocar_materiais(objetos, "normal")
    normais, tempos_normal = renderizar_direcoes(pivo, "normal")
    restaurar()

    relatorio["segundos_por_quadro"] = {
        "cor": round(sum(tempos_cor[1:]) / max(1, len(tempos_cor) - 1), 3),
        "primeiro_quadro_cor": round(tempos_cor[0], 2),
        "time": round(sum(tempos_time) / len(tempos_time), 3),
        "normal": round(sum(tempos_normal) / len(tempos_normal), 3),
    }
    for passe, caminhos in (("cor", cores), ("time", mascaras), ("normal", normais)):
        relatorio[f"atlas_{passe}"] = montar_atlas(caminhos, os.path.join(SAIDA, f"tanque-{passe}.png"))

    # beauty shot with perspective camera over a sand ground plane, for the plan document
    bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, 0.0))
    chao = bpy.context.active_object
    chao.data.materials.append(material("areia", (0.62, 0.50, 0.34), 0.0, 0.95, {"escala": 3.0, "cor": (0.48, 0.38, 0.26)}))
    pivo.rotation_euler = (0, 0, math.radians(-28))
    camera = bpy.context.scene.camera
    camera.data.type = "PERSP"
    camera.data.lens = 60
    camera.location = (9.5, -11.5, 6.4)
    camera.rotation_euler = (math.radians(66), 0, math.radians(39.5))
    configurar_render(256, 1920, 1080, transparente=False)
    bpy.context.scene.render.filepath = os.path.join(SAIDA, "tanque-vitrine.png")
    inicio = time.perf_counter()
    bpy.ops.render.render(write_still=True)
    relatorio["segundos_vitrine_1080p_256amostras"] = round(time.perf_counter() - inicio, 2)

    with open(os.path.join(SAIDA, "relatorio.json"), "w", encoding="utf-8") as arquivo:
        json.dump(relatorio, arquivo, ensure_ascii=False, indent=2)
    print("RELATORIO " + json.dumps(relatorio, ensure_ascii=False))


principal()
