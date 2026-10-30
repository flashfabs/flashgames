# SPDX-License-Identifier: GPL-3.0-or-later
"""Render passes by material swap, never by Object Index (which has no anti-aliasing): the masks come out of the
same Cycles camera and pixel filter as the colour, so their edges match it pixel for pixel.

- cor: the real materials, Standard view, 256 samples.
- time: emission white on the reserved "time" material, black elsewhere, Raw view (linear coverage).
- normal: world-space geometry normal encoded as n * 0.5 + 0.5, Raw view.
- sombra: the model is invisible to the camera but still casts shadows on a shadow-catcher ground plane;
  the alpha of the result is the shadow, a separate layer for the game (decision pending at the style gate).
"""

import bpy

from . import cena, compat
from .modelagem import NOME_TIME

PASSES = ("cor", "time", "normal", "sombra")
RENDERIZAVEIS = ("MESH", "CURVE", "FONT")


def _emissao(nome, cor=None, normal=False):
    m = bpy.data.materials.new(nome)
    arvore = compat.garantir_nos(m)
    arvore.nodes.clear()
    emissao = arvore.nodes.new("ShaderNodeEmission")
    saida = arvore.nodes.new("ShaderNodeOutputMaterial")
    arvore.links.new(emissao.outputs["Emission"], saida.inputs["Surface"])
    if normal:
        geometria = arvore.nodes.new("ShaderNodeNewGeometry")
        escala = arvore.nodes.new("ShaderNodeVectorMath")
        escala.operation = "MULTIPLY_ADD"
        escala.inputs[1].default_value = (0.5, 0.5, 0.5)
        escala.inputs[2].default_value = (0.5, 0.5, 0.5)
        arvore.links.new(geometria.outputs["Normal"], escala.inputs[0])
        arvore.links.new(escala.outputs["Vector"], emissao.inputs["Color"])
    else:
        emissao.inputs["Color"].default_value = cor
    return m


def _e_time(material):
    return material is not None and (material.name == NOME_TIME or material.name.startswith(NOME_TIME + "."))


class Trocador:
    """Applies one pass to the model's meshes and undoes it, keeping every material slot."""

    def __init__(self, objetos):
        self.malhas = [o for o in objetos if o.type in RENDERIZAVEIS]
        self.originais = {o.name: [s.material for s in o.material_slots] for o in self.malhas}
        self.branco = _emissao("passe_branco", (1, 1, 1, 1))
        self.preto = _emissao("passe_preto", (0, 0, 0, 1))
        self.normal = _emissao("passe_normal", normal=True)
        self.chao = None

    def aplicar(self, passe, projecao):
        self.restaurar()
        if passe == "cor":
            cena.configurar_cycles(projecao, cena.AMOSTRAS_COR)
            return
        if passe == "sombra":
            cena.configurar_cycles(projecao, cena.AMOSTRAS_MASCARA * 2)
            for obj in self.malhas:
                obj.visible_camera = False
            self.chao = self._chao_captador()
            return
        cena.configurar_cycles(projecao, cena.AMOSTRAS_MASCARA, transformacao="Raw")
        for obj in self.malhas:
            for slot in obj.material_slots:
                if passe == "time":
                    slot.material = self.branco if _e_time(slot.material) else self.preto
                else:
                    slot.material = self.normal

    def restaurar(self):
        for obj in self.malhas:
            for slot, original in zip(obj.material_slots, self.originais[obj.name]):
                slot.material = original
            obj.visible_camera = True
        if self.chao is not None:
            bpy.data.objects.remove(self.chao)
            self.chao = None

    @staticmethod
    def _chao_captador():
        malha = bpy.data.meshes.new("chao_sombra")
        lado = 60.0
        malha.from_pydata([(-lado, -lado, 0), (lado, -lado, 0), (lado, lado, 0), (-lado, lado, 0)], [], [(0, 1, 2, 3)])
        chao = bpy.data.objects.new("chao_sombra", malha)
        chao.is_shadow_catcher = True
        bpy.context.scene.collection.objects.link(chao)
        return chao
