# SPDX-License-Identifier: GPL-3.0-or-later
"""Paliçada, gray kit (brief arte/briefs/desligados-construcao-palicada.md): the wall, a low, uneven fence of
pointed eucalyptus stakes mixed with old doors, pallets standing on end and hand-painted boards, tied with wire and
rope, low enough not to hide the units behind it.

One cell per piece, chosen by the game from the four neighbours: each state has 16 frames, and frame k is the
piece for neighbour mask k (north 1, east 2, south 4, west 8); a lone piece is a short stub. Damaged pieces lean
and lose a door, destroyed ones lie on the ground."""

import math
import random

from comum import cinza
from comum import modelagem as m

anim = cinza.anim
PEGADA = (1, 1)
DESCRICAO = cinza.descricao_construcao("desligados-construcao-palicada", "desligados/palicada", "desligados", PEGADA, 2.8,
                                       folga_lados=(16, 16, 0, 0))
# damaged pieces look like ready ones in gray, and every destroyed piece is the same heap (the full cross, frame 15)
DESCRICAO["animacoes"] = [anim("pronta", "corpo", 16, 0, False), anim("danificada", "corpo", 16, 0, False, igual="pronta"),
                          anim("destruida", "corpo", 16, 0, False, quadrosIguais={str(k): ["destruida", 15] for k in range(15)})]
DESCRICAO["variantes"] = {"porQuadro": "mascaraDeVizinhos", "bits": {"norte": 1, "leste": 2, "sul": 4, "oeste": 8}}
# arm directions on the map (Blender x east, y north)
BRACOS = {1: (0, 1), 2: (1, 0), 4: (0, -1), 8: (-1, 0)}


def _braco(nome, direcao, pal, pai, sorteio):
    """Half a cell of fence from the centre to the edge: stakes and one piece of junk."""
    grupo = m.vazio(nome, (0, 0, 0), pai, rotacao=(0, 0, math.atan2(direcao[1], direcao[0])))
    estacas = []
    for k in range(5):
        x = 0.35 + k * 0.36
        altura = sorteio.uniform(1.6, 2.2)
        estaca = m.vazio(f"{nome}_estaca{k}", (x, sorteio.uniform(-0.05, 0.05), 0.0), grupo)
        m.cilindro(f"{nome}_estaca{k}_corpo", (0, 0, altura / 2), 0.08, altura, pal["madeira"], estaca, vertices=8, suave=False)
        m.cone(f"{nome}_estaca{k}_ponta", (0, 0, altura + 0.12), 0.08, 0.0, 0.24, pal["madeira"], estaca, vertices=8)
        estacas.append(estaca)
    tipo = sorteio.choice(("porta", "palete", "placa"))
    sucata = m.vazio(f"{nome}_sucata", (1.05, 0.12, 0.0), grupo)
    if tipo == "porta":
        m.caixa(f"{nome}_porta", (0, 0, 0.95), (0.85, 0.06, 1.9), pal["ocre"], sucata, 0.02)
    elif tipo == "palete":
        for k in range(4):
            m.caixa(f"{nome}_ripa{k}", (0, 0, 0.2 + k * 0.38), (1.0, 0.05, 0.2), pal["madeira"], sucata, 0.0)
    else:
        m.caixa(f"{nome}_placa", (0, 0, 0.9), (0.9, 0.04, 0.7), pal["tijolo"], sucata, 0.01)
    m.barra(f"{nome}_arame", (0.2, 0, 1.2), (1.95, 0, 1.2), 0.012, pal["metal"], grupo, 4)
    fita = m.caixa(f"{nome}_fita", (0.35 + 2 * 0.36, 0.06, 1.7), (0.05, 0.03, 0.45), pal["time"], grupo, 0.0)
    return {"grupo": grupo, "estacas": estacas, "sucata": sucata, "fita": fita}


def construir(ctx):
    pal = cinza.Paleta(ctx, "desligados")
    raiz = m.vazio("raiz")
    sorteio = random.Random(101)
    centro = m.vazio("centro", (0, 0, 0), raiz)
    m.cilindro("poste_centro", (0, 0, 1.15), 0.14, 2.3, pal["madeira"], centro, vertices=8, suave=False)
    m.cone("poste_centro_ponta", (0, 0, 2.42), 0.14, 0.0, 0.25, pal["madeira"], centro, vertices=8)
    bracos = {bit: _braco(f"braco{bit}", direcao, pal, raiz, sorteio) for bit, direcao in BRACOS.items()}
    toco = _braco("toco", (1, 0), pal, raiz, sorteio)
    for estaca in toco["estacas"][2:]:
        estaca.scale = (0, 0, 0)
    toco["sucata"].scale = (0, 0, 0)
    pecas = cinza.Estragos(raiz, 103)
    pecas.detritos(pal, *PEGADA, 4, mats=("madeira", "ocre"))
    return {"raiz": raiz, "centro": centro, "bracos": bracos, "toco": toco, "entulho": pecas}


def _estado(braco, estado, semente):
    sorteio = random.Random(semente)
    for estaca in braco["estacas"]:
        if estado == "danificada":
            estaca.rotation_euler = (sorteio.uniform(-0.35, 0.35), sorteio.uniform(-0.2, 0.2), 0)
        elif estado == "destruida":
            estaca.rotation_euler = (sorteio.choice((-1, 1)) * math.radians(sorteio.uniform(70, 88)), 0, sorteio.uniform(-0.4, 0.4))
        else:
            estaca.rotation_euler = (0, 0, 0)
    caida = estado in ("danificada", "destruida")
    braco["sucata"].rotation_euler = (math.radians(-80) if caida else 0, 0, 0)


def posar(ctx, modelo, animacao, quadro):
    mascara = quadro
    sozinho = mascara == 0
    for bit, braco in modelo["bracos"].items():
        braco["grupo"].scale = (1, 1, 1) if mascara & bit else (0, 0, 0)
        if mascara & bit:
            _estado(braco, animacao, bit * 31 + mascara)
    modelo["toco"]["grupo"].scale = (1, 1, 1) if sozinho else (0, 0, 0)
    _estado(modelo["toco"], animacao, 7)
    modelo["centro"].rotation_euler = (math.radians(80) if animacao == "destruida" else (0.2 if animacao == "danificada" else 0), 0, 0)
    modelo["entulho"].aplicar(animacao)
