# SPDX-License-Identifier: GPL-3.0-or-later
"""Scene setup shared by every asset: empty scene, GPU, canonical light, orthographic 3/4 camera and Cycles.

Axes follow the projection contract: Blender x is east, y is north, z is up, and the camera looks north,
so the map's south is the bottom of the screen. The model turns, the camera never does.
"""

import math
import os

import bpy
from bpy_extras.object_utils import world_to_camera_view

from . import compat

# Measured on the RTX 4090 on 30/10/2026 (arte/blender/MEDICOES.md): 256 samples without the denoiser
# cost 0.056 s per 256 px frame with persistent data and land closer to a 4096-sample reference
# (RMSE 0.56 of 255) than 64 samples with any denoiser (0.88 to 0.94), with no flicker between frames.
AMOSTRAS_COR = 256
AMOSTRAS_MASCARA = 32


def limpar(cache="D:/rts/cache"):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if os.path.isdir(cache):
        caminhos = bpy.context.preferences.filepaths
        caminhos.temporary_directory = os.path.join(cache, "tmp")
        caminhos.render_cache_directory = os.path.join(cache, "render")
        caminhos.texture_cache_directory = os.path.join(cache, "texturas")


def usar_gpu():
    """OptiX, then CUDA, then CPU; returns the device type and the names of the devices in use."""
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


def luz_canonica(projecao):
    """Sun and sky from the contract: the same light on every sprite and on the game's terrain."""
    cena = bpy.context.scene
    mundo = bpy.data.worlds.new("mundo")
    cena.world = mundo
    fundo = next(no for no in compat.garantir_nos(mundo).nodes if no.type == "BACKGROUND")
    fundo.inputs["Color"].default_value = (*projecao.ceu["cor"], 1.0)
    fundo.inputs["Strength"].default_value = projecao.ceu["forca"]
    dados = bpy.data.lights.new("sol", "SUN")
    dados.energy = projecao.sol["energia"]
    dados.angle = math.radians(projecao.sol.get("anguloGraus", 6))
    sol = bpy.data.objects.new("sol", dados)
    sol.rotation_euler = projecao.rotacao_sol()
    cena.collection.objects.link(sol)
    return sol


def camera_ortografica(projecao):
    cena = bpy.context.scene
    dados = bpy.data.cameras.new("camera")
    dados.type = "ORTHO"
    dados.clip_start = 0.1
    dados.clip_end = 500.0
    camera = bpy.data.objects.new("camera", dados)
    cena.collection.objects.link(camera)
    cena.camera = camera
    inclinacao = math.radians(90.0 - projecao.elevacao)
    distancia = 100.0
    camera.location = (0.0, -distancia * math.sin(inclinacao), distancia * math.cos(inclinacao))
    camera.rotation_euler = (inclinacao, 0.0, 0.0)
    return camera


def enquadrar(camera, projecao, largura, altura, ancora, nivel="uhd"):
    """Size the frame so that 1 px is metros_por_px and the world origin lands exactly on the anchor pixel."""
    cena = bpy.context.scene
    cena.render.resolution_x = largura
    cena.render.resolution_y = altura
    cena.render.resolution_percentage = 100
    maior = max(largura, altura)
    camera.data.sensor_fit = "AUTO"
    camera.data.ortho_scale = maior * projecao.metros_por_px(nivel)
    camera.data.shift_x = (largura / 2 - ancora[0]) / maior
    camera.data.shift_y = (ancora[1] - altura / 2) / maior


def projetar(camera, ponto, largura, altura, ancora):
    """Screen offset in px of a world point from the anchor (x right, y down), as the manifest stores it."""
    cena = bpy.context.scene
    normalizado = world_to_camera_view(cena, camera, ponto)
    return [round(normalizado.x * largura - ancora[0], 2), round((1.0 - normalizado.y) * altura - ancora[1], 2)]


def configurar_cycles(projecao, amostras=AMOSTRAS_COR, transformacao=None):
    cena = bpy.context.scene
    cena.render.engine = compat.MOTOR_CYCLES
    cena.cycles.device = "GPU"
    cena.cycles.samples = amostras
    cena.cycles.use_adaptive_sampling = False
    cena.cycles.use_denoising = False
    cena.cycles.seed = 0
    cena.cycles.use_animated_seed = False
    cena.cycles.pixel_filter_type = "BLACKMAN_HARRIS"
    cena.cycles.filter_width = 1.0
    cena.render.use_persistent_data = True
    cena.render.film_transparent = True
    compat.formato_imagem(cena.render.image_settings, "PNG", "RGBA", "8")
    cena.view_settings.view_transform = transformacao or projecao.transformacao
    cena.view_settings.look = projecao.aparencia if transformacao is None else "None"
    cena.view_settings.exposure = projecao.exposicao if transformacao is None else 0.0
    cena.view_settings.gamma = projecao.gama if transformacao is None else 1.0


def renderizar(caminho):
    cena = bpy.context.scene
    cena.render.filepath = caminho
    bpy.ops.render.render(write_still=True)
