# SPDX-License-Identifier: GPL-3.0-or-later
"""Render loop of the art factory: every pass, layer, animation, direction and frame of one asset.

An asset script (arte/blender/assets/<asset>.py) exposes:

- DESCRICAO: asset id, brief, type, category, phases, directions, passes, layers (frame size and anchor
  in uhd px, optional pivot object) and the ordered list of animations (name, layer, frames, fps, loop,
  optional directions);
- construir(ctx) -> dict with "raiz" (the root empty, pivot on the ground, front to +X) and whatever the
  asset needs later;
- posar(ctx, modelo, animacao, quadro) to pose one frame (optional when nothing moves);
- ajustar_camera(ctx, camera, camada) to frame a portrait, an icon or a terrain tile (optional).

Objects carry their layer in the custom property "camada" (inherited from the parent, "corpo" by default).
A layer may render the objects of other layers through "usa" (a list of layer names): the raised turret
uses the turret's objects in another pose, the whole-vehicle transition uses body and turret together.
A layer may also cut its objects out of others through "recorte" (layer names rendered as holdout): a lights
layer shows only the lamps, hidden where walls stand in front of them.
Each layer renders only its own objects (the others are hidden from the render, shadows included).
Directions turn the model, never the camera: direction k faces map angle k * 360 / N, clockwise on screen
from east. A layer with a pivot (a turret) is rendered with that pivot over the world origin, turning on
its own axis; the body layer exports where the pivot sits through the point "encaixe_torre".
"""

import json
import math
import os
import time

import bpy

from . import cena
from .passes import RENDERIZAVEIS, Trocador


class Contexto:
    def __init__(self, projecao, argumentos, descricao):
        self.projecao = projecao
        self.argumentos = argumentos
        self.descricao = descricao


def camada_de(obj):
    while obj is not None:
        if "camada" in obj:
            return obj["camada"]
        obj = obj.parent
    return "corpo"


def descendentes(raiz):
    return [raiz] + list(raiz.children_recursive)


def ordem_dos_quadros(descricao):
    """(animation, direction, frame) in manifest order: base(animation) + direction * frames + frame."""
    for animacao in descricao["animacoes"]:
        for direcao in range(animacao.get("direcoes", descricao["direcoes"])):
            for quadro in range(animacao["quadros"]):
                yield animacao, direcao, quadro


def caminho_quadro(saida, animacao, passe, direcao, quadro):
    return os.path.join(saida, "quadros", animacao["camada"], animacao["nome"], passe, f"d{direcao:02d}_q{quadro:03d}.png")


def _girar(objeto, repouso, direcao, direcoes):
    objeto.rotation_euler = (repouso[0], repouso[1], repouso[2] - 2 * math.pi * direcao / direcoes)


def executar(modulo, projecao, argumentos, saida, progresso=print):
    descricao = modulo.DESCRICAO
    ctx = Contexto(projecao, argumentos, descricao)
    cena.limpar()
    dispositivo, gpus = cena.usar_gpu()
    cena.luz_canonica(projecao)
    camera = cena.camera_ortografica(projecao)
    modelo = modulo.construir(ctx)
    raiz = modelo["raiz"]
    objetos = descendentes(raiz)
    pontos = [o for o in objetos if o.type == "EMPTY" and o.get("ponto")]
    posar = getattr(modulo, "posar", None)
    trocador = Trocador(objetos)
    passes = descricao["passes"]
    sequencia = list(ordem_dos_quadros(descricao))
    tempos = {passe: [] for passe in passes}
    tabela_pontos = {o.name: [None] * len(sequencia) for o in pontos}
    repouso_raiz = tuple(raiz.rotation_euler)
    camadas_sombra = descricao.get("camadasSombra", [next(iter(descricao["camadas"]))])
    total = len(sequencia) * len(passes)
    feitos = 0
    inicio = time.perf_counter()

    for passe in passes:
        trocador.aplicar(passe, projecao)
        for camada, config in descricao["camadas"].items():
            animacoes = [a for a in descricao["animacoes"] if a["camada"] == camada]
            if not animacoes:
                continue
            usa = set(config.get("usa", [camada]))
            largura, altura = config["quadro"]
            ancora = config["ancora"]
            cena.enquadrar(camera, projecao, largura, altura, ancora)
            if hasattr(modulo, "ajustar_camera"):
                # portraits, icons and terrain tiles frame themselves
                modulo.ajustar_camera(ctx, camera, camada)
            # Each layer renders only its own parts: a hidden turret must not shade the hull, since it turns.
            recorte = set(config.get("recorte", []))
            for obj in objetos:
                if obj.type in RENDERIZAVEIS:
                    dono = camada_de(obj)
                    obj.hide_render = passe != "sombra" and dono not in usa and dono not in recorte
                    obj.is_holdout = passe != "sombra" and dono in recorte
            pivo = bpy.data.objects[config["pivo"]] if config.get("pivo") else None
            girado = pivo or raiz
            repouso = tuple(girado.rotation_euler)
            raiz.rotation_euler = repouso_raiz
            raiz.location = (0.0, 0.0, 0.0)
            if pivo is not None:
                bpy.context.view_layer.update()
                centro = pivo.matrix_world.translation
                raiz.location = (-centro.x, -centro.y, 0.0)
            for indice, (animacao, direcao, quadro) in enumerate(sequencia):
                if animacao["camada"] != camada:
                    continue
                if passe == "sombra" and camada not in camadas_sombra:
                    # only the whole model casts the ground shadow; other layers keep empty frames
                    feitos += 1
                    continue
                if posar:
                    posar(ctx, modelo, animacao["nome"], quadro)
                _girar(girado, repouso, direcao, animacao.get("direcoes", descricao["direcoes"]))
                caminho = caminho_quadro(saida, animacao, passe, direcao, quadro)
                t = time.perf_counter()
                cena.renderizar(caminho)
                tempos[passe].append(time.perf_counter() - t)
                if passe == passes[0]:
                    bpy.context.view_layer.update()
                    for obj in pontos:
                        if camada_de(obj) in usa:
                            tabela_pontos[obj.name][indice] = cena.projetar(camera, obj.matrix_world.translation, largura, altura, ancora)
                feitos += 1
                if feitos % 50 == 0 or feitos == total:
                    progresso(f"PROGRESSO {feitos}/{total} quadros ({passe}, {animacao['nome']})")
            girado.rotation_euler = repouso
            raiz.location = (0.0, 0.0, 0.0)
    trocador.restaurar()
    for obj in objetos:
        obj.hide_render = False
        obj.is_holdout = False

    relatorio = {
        "blender": bpy.app.version_string,
        "dispositivo": dispositivo,
        "gpus": gpus,
        "projecao": projecao.resumo(),
        "quadros_por_passe": len(sequencia),
        "passes": passes,
        "segundos_por_quadro": {p: round(sum(v) / len(v), 4) for p, v in tempos.items() if v},
        "segundos_render": round(time.perf_counter() - inicio, 2),
    }
    with open(os.path.join(saida, "quadros", "pontos.json"), "w", encoding="utf-8") as arquivo:
        json.dump(tabela_pontos, arquivo)
    return relatorio, tabela_pontos
