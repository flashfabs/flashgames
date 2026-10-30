# SPDX-License-Identifier: GPL-3.0-or-later
"""Medium explosion: a 16-frame flipbook with a hot core, a fireball that cools into smoke and flying debris.

One direction (the game may rotate it), colour pass only; random placement comes from a fixed seed, so a
re-render gives the same frames.
"""

import math
import random

import bpy

from comum import compat
from comum import modelagem as m

QUADROS = 16

DESCRICAO = {
    "asset": "efeito-explosao-media",
    "brief": None,
    "tipo": "efeito",
    "categoria": "efeito",
    "fases": ["portao", "fase-1"],
    "direcoes": 1,
    "passes": ["cor"],
    "camadas": {"corpo": {"quadro": [256, 256], "ancora": [128, 176]}},
    "animacoes": [{"nome": "explodindo", "camada": "corpo", "quadros": QUADROS, "fps": 24, "laco": False}],
}


def _fogo(nome):
    mat = bpy.data.materials.new(nome)
    arvore = compat.garantir_nos(mat)
    arvore.nodes.clear()
    emissao = arvore.nodes.new("ShaderNodeEmission")
    saida = arvore.nodes.new("ShaderNodeOutputMaterial")
    arvore.links.new(emissao.outputs["Emission"], saida.inputs["Surface"])
    return mat, emissao


def construir(ctx):
    sorteio = random.Random(7)
    raiz = m.vazio("raiz")
    bolas = []
    for k in range(14):
        mat, emissao = _fogo(f"fogo{k}")
        direcao = (sorteio.uniform(-1, 1), sorteio.uniform(-1, 1), sorteio.uniform(0.2, 1.2))
        bola = m.esfera(f"bola{k}", (0, 0, 0), 1.0, mat, raiz, segmentos=16)
        deslocar = bola.modifiers.new("irregular", "DISPLACE")
        textura = bpy.data.textures.new(f"nuvem{k}", "CLOUDS")
        textura.noise_scale = 0.45
        deslocar.texture = textura
        deslocar.strength = 0.35
        bolas.append({"obj": bola, "emissao": emissao, "direcao": direcao, "atraso": sorteio.uniform(0, 0.15), "tamanho": sorteio.uniform(0.6, 1.1)})
    fumaca = m.material("fumaca", (0.16, 0.15, 0.14), 0.0, 1.0)
    nuvens = []
    for k in range(9):
        nuvem = m.esfera(f"fumaca{k}", (0, 0, 0), 1.0, fumaca, raiz, segmentos=14)
        deslocar = nuvem.modifiers.new("irregular", "DISPLACE")
        deslocar.texture = bpy.data.textures.new(f"fumaca_ruido{k}", "CLOUDS")
        deslocar.strength = 0.4
        nuvens.append({"obj": nuvem, "direcao": (sorteio.uniform(-0.8, 0.8), sorteio.uniform(-0.8, 0.8), sorteio.uniform(0.6, 1.4)), "tamanho": sorteio.uniform(0.8, 1.3)})
    lascas = []
    escuro = m.material("lasca", (0.04, 0.035, 0.03), 0.3, 0.7)
    for k in range(12):
        lasca = m.caixa(f"lasca{k}", (0, 0, 0), (0.16, 0.1, 0.06), escuro, raiz, 0.0)
        angulo = sorteio.uniform(0, 2 * math.pi)
        lascas.append({"obj": lasca, "v": (math.cos(angulo) * sorteio.uniform(3, 6), math.sin(angulo) * sorteio.uniform(3, 6), sorteio.uniform(3, 7))})
    return {"raiz": raiz, "bolas": bolas, "nuvens": nuvens, "lascas": lascas}


def posar(ctx, modelo, animacao, quadro):
    t = quadro / (QUADROS - 1)
    for bola in modelo["bolas"]:
        vida = max(0.0, min(1.0, (t - bola["atraso"]) / 0.6))
        raio = bola["tamanho"] * (0.3 + 1.6 * math.sqrt(vida)) if vida > 0 else 0.0
        d = bola["direcao"]
        bola["obj"].location = (d[0] * 1.2 * vida, d[1] * 1.2 * vida, 0.6 + d[2] * 1.6 * vida)
        bola["obj"].scale = (raio, raio, raio)
        # white-yellow core cooling to deep orange, then out
        quente = max(0.0, 1.0 - vida * 1.3)
        bola["emissao"].inputs["Color"].default_value = (1.0, 0.25 + 0.7 * quente, 0.04 + 0.5 * quente * quente, 1.0)
        bola["emissao"].inputs["Strength"].default_value = 18.0 * quente + 1.5 * (1 - vida)
    for nuvem in modelo["nuvens"]:
        vida = max(0.0, (t - 0.25) / 0.75)
        raio = nuvem["tamanho"] * (0.4 + 1.8 * vida) if vida > 0 else 0.0
        d = nuvem["direcao"]
        nuvem["obj"].location = (d[0] * 1.5 * vida, d[1] * 1.5 * vida, 1.2 + d[2] * 2.6 * vida)
        nuvem["obj"].scale = (raio, raio, raio * 0.85)
    for lasca in modelo["lascas"]:
        tempo = t * 0.9
        v = lasca["v"]
        z = max(0.05, 0.5 + v[2] * tempo - 9.8 * tempo * tempo)
        lasca["obj"].location = (v[0] * tempo, v[1] * tempo, z)
        lasca["obj"].rotation_euler = (tempo * 9, tempo * 7, tempo * 5)
