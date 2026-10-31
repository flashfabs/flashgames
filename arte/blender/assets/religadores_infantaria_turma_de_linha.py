# SPDX-License-Identifier: GPL-3.0-or-later
"""Turma de Linha (brief arte/briefs/religadores-unidade-turma-de-linha.md): lineworker with a full-brim helmet
and lamp, battery backpack, coiled cable and a two-handed pin gun.

Proof that a character can be 100% script (decision D31): the body is rigid parts on a scripted armature
(the shared infantry skeleton in comum/infantaria.py), and the four actions are keyframed into Blender actions with slots, one per
animated ID, through comum.compat. Stylised on purpose: helmet and no realistic face.
"""

import math

import bpy
from mathutils import Vector

from comum import compat, infantaria
from comum import modelagem as m

LARANJA = "#E2711D"
BRANCO_ENCARDIDO = "#E6E1D3"
COBALTO = "#1F4E8C"
CINZA_CONCRETO = "#8A8C8E"

OSSOS = infantaria.OSSOS

DESCRICAO = {
    "asset": "religadores-infantaria-turma-de-linha",
    "brief": "religadores/turma-de-linha",
    "tipo": "unidade",
    "categoria": "infantaria",
    "fases": ["portao", "fase-1"],
    "direcoes": 16,
    "passes": ["cor", "time", "sombra"],
    "camadas": {"corpo": {"quadro": [128, 128], "ancora": [64, 84]}},
    "animacoes": [
        {"nome": "parado", "camada": "corpo", "quadros": 4, "fps": 4, "laco": True},
        {"nome": "andando", "camada": "corpo", "quadros": 8, "fps": 12, "laco": True},
        {"nome": "atirando", "camada": "corpo", "quadros": 4, "fps": 12, "laco": False},
        {"nome": "morrendo", "camada": "corpo", "quadros": 8, "fps": 10, "laco": False, "direcoes": 8},
    ],
}


_esqueleto = infantaria.esqueleto
_prender = infantaria.prender
girar = infantaria.girar


def construir(ctx):
    laranja = m.material("macacao", LARANJA, 0.0, 0.75, {"escala": 18.0, "cor": "#C8631A", "de": 0.5, "ate": 0.85, "detalhe": 2.0})
    refletivo = m.material("refletivo", BRANCO_ENCARDIDO, 0.0, 0.3)
    cobalto = m.material("cobalto", COBALTO, 0.3, 0.45)
    cinza = m.material("cinza_concreto", CINZA_CONCRETO, 0.5, 0.5)
    couro = m.material("couro", (0.06, 0.045, 0.03), 0.0, 0.7)
    pele = m.material("pele", "#9C6B4E", 0.0, 0.6)
    lanterna = m.material("lanterna", "#FFE6A8", 0.0, 0.2, emissao=("#FFE6A8", 6.0))
    time = m.material_time(ctx.projecao)

    raiz = m.vazio("raiz")
    escala = ctx.projecao.exagero_infantaria
    raiz.scale = (escala, escala, escala)
    esqueleto = _esqueleto(raiz)
    partes = []

    def parte(osso, obj):
        partes.append((obj, osso))
        return obj

    # body: overall, reflective bands, belt with tools, boots
    parte("quadril", m.caixa("pelve", (0, 0, 0.95), (0.26, 0.36, 0.22), laranja, raiz, 0.05))
    parte("tronco", m.caixa("torso", (0, 0, 1.25), (0.3, 0.44, 0.42), laranja, raiz, 0.07))
    parte("tronco", m.caixa("faixa_peito", (0.0, 0, 1.3), (0.32, 0.46, 0.06), refletivo, raiz, 0.0))
    parte("quadril", m.caixa("cinto", (0, 0, 1.03), (0.3, 0.4, 0.07), couro, raiz, 0.0))
    for y, nome in ((0.18, "alicate"), (-0.17, "trena")):
        parte("quadril", m.caixa(nome, (0.04, y, 0.96), (0.08, 0.06, 0.14), cinza, raiz, 0.01))
    parte("tronco", m.caixa("mochila", (-0.24, 0, 1.24), (0.2, 0.38, 0.46), cobalto, raiz, 0.03))
    parte("tronco", m.caixa("mochila_tampa", (-0.24, 0, 1.49), (0.22, 0.4, 0.05), cinza, raiz, 0.01))
    parte("cabeca", m.esfera("cabeca_pele", (0.02, 0, 1.58), 0.12, pele, raiz, (1.0, 0.95, 1.1)))
    capacete = parte("cabeca", m.esfera("capacete", (0, 0, 1.66), 0.16, time, raiz, (1.05, 1.0, 0.75)))
    aba = m.cilindro("capacete_aba", (0, 0, 1.63), 0.22, 0.025, time, raiz, vertices=24)
    luz = m.cilindro("lanterna", (0.17, 0, 1.68), 0.04, 0.05, lanterna, raiz, (0, math.radians(90), 0))
    for lado, sufixo in ((1, "e"), (-1, "d")):
        y = lado * 0.27
        parte(f"braco_{sufixo}", m.barra(f"braco_{sufixo}", (0, lado * 0.25, 1.38), (0.11, y, 1.13), 0.065, laranja, raiz, 10))
        parte(f"antebraco_{sufixo}", m.barra(f"antebraco_{sufixo}", OSSOS[4 if lado > 0 else 6][2], OSSOS[4 if lado > 0 else 6][3], 0.055, laranja, raiz, 10))
        parte(f"antebraco_{sufixo}", m.esfera(f"luva_{sufixo}", OSSOS[4 if lado > 0 else 6][3], 0.06, couro, raiz))
        parte(f"coxa_{sufixo}", m.barra(f"coxa_{sufixo}", (0, lado * 0.11, 0.9), (0, lado * 0.12, 0.5), 0.085, laranja, raiz, 10))
        parte(f"canela_{sufixo}", m.barra(f"canela_{sufixo}", (0, lado * 0.12, 0.5), (0, lado * 0.12, 0.12), 0.07, laranja, raiz, 10))
        parte(f"canela_{sufixo}", m.caixa(f"faixa_canela_{sufixo}", (0, lado * 0.12, 0.3), (0.16, 0.16, 0.05), refletivo, raiz, 0.0))
        parte(f"canela_{sufixo}", m.caixa(f"bota_{sufixo}", (0.05, lado * 0.12, 0.06), (0.26, 0.14, 0.12), couro, raiz, 0.03))
    parte("braco_e", m.barra("bracadeira", (0.03, 0.255, 1.3), (0.07, 0.265, 1.22), 0.072, time, raiz, 10))
    # pin gun held with both hands, with the coiled cable to the backpack
    parte("tronco", m.caixa("pregadeira", (0.36, -0.02, 1.04), (0.42, 0.11, 0.15), cobalto, raiz, 0.02))
    parte("tronco", m.cilindro("pregadeira_cano", (0.62, -0.02, 1.06), 0.04, 0.2, cinza, raiz, (0, math.radians(90), 0)))
    parte("tronco", m.caixa("pregadeira_bateria", (0.22, -0.02, 0.94), (0.12, 0.09, 0.12), cinza, raiz, 0.01))
    pontos = [(-0.3, -0.12, 1.02)]
    for k in range(1, 12):
        t = k / 11
        x = -0.3 + 0.5 * t
        pontos.append((x, -0.12 + 0.05 * math.sin(t * 9 * math.pi), 1.0 - 0.12 * math.sin(t * math.pi) + 0.05 * math.cos(t * 9 * math.pi)))
    for k in range(len(pontos) - 1):
        parte("tronco", m.barra(f"cabo{k}", pontos[k], pontos[k + 1], 0.016, couro, raiz, 6))
    boca = m.ponto("boca", (0.74, -0.02, 1.06), raiz)
    lanterna_ponto = m.ponto("lanterna", (0.2, 0, 1.68), raiz)
    topo = m.ponto("topo", (0, 0, 1.95), raiz)
    for obj, osso in partes + [(boca, "tronco"), (lanterna_ponto, "cabeca"), (topo, "cabeca")]:
        _prender(obj, esqueleto, osso)
    # brim and lamp ride on the helmet, which rolls away on its own when the worker falls
    bpy.context.view_layer.update()
    for obj in (aba, luz):
        mundo = obj.matrix_world.copy()
        obj.parent = capacete
        obj.matrix_parent_inverse = capacete.matrix_world.inverted()
        obj.matrix_world = mundo
    acoes = _acoes(esqueleto, capacete)
    return {"raiz": raiz, "esqueleto": esqueleto, "acoes": acoes, "capacete": capacete, "capacete_repouso": capacete.location.copy()}


_pose = infantaria.pose
_chave = infantaria.chave
Y, X, Z = infantaria.Y, infantaria.X, infantaria.Z


def _acoes(esqueleto, capacete):
    """Keyframe the four actions; each frame k of an action lives at scene frame k + 1."""
    acoes = {}

    def nova(nome):
        acao = bpy.data.actions.new(nome)
        compat.atribuir_acao(esqueleto, acao)
        acoes[nome] = acao
        return acao

    nova("parado")
    for q in range(4):
        respira = math.sin(2 * math.pi * q / 4)
        _pose(esqueleto, [("tronco", Y, 2 * respira), ("cabeca", Z, 6 * math.sin(2 * math.pi * q / 4 + 1))], 0.008 * respira)
        _chave(esqueleto, q + 1)

    nova("andando")
    for q in range(8):
        fase = 2 * math.pi * q / 8
        passo = math.sin(fase)
        _pose(esqueleto, [
            ("coxa_e", Y, -28 * passo), ("coxa_d", Y, 28 * passo),
            ("canela_e", Y, 35 * max(0.0, math.sin(fase + math.pi / 2))),
            ("canela_d", Y, 35 * max(0.0, math.sin(fase - math.pi / 2))),
            ("tronco", Y, 4), ("tronco", Z, 4 * passo),
        ], 0.03 * abs(math.cos(fase)))
        _chave(esqueleto, q + 1)

    nova("atirando")
    for q, (recuo, inclina) in enumerate(((1.0, 5), (0.6, 3), (1.0, 5), (0.2, 1))):
        _pose(esqueleto, [("tronco", Y, -inclina), ("braco_d", Y, -8 * recuo), ("braco_e", Y, -8 * recuo)], 0.0, -0.03 * recuo)
        _chave(esqueleto, q + 1)

    acao = nova("morrendo")
    for q in range(8):
        t = q / 7
        cai = min(1.0, t * 1.6)
        deita = max(0.0, (t - 0.45) / 0.55)
        _pose(esqueleto, [
            ("coxa_e", Y, -85 * cai), ("coxa_d", Y, -80 * cai),
            ("canela_e", Y, 70 * cai * (1 - deita)), ("canela_d", Y, 75 * cai * (1 - deita)),
            ("tronco", Y, -15 * cai - 70 * deita), ("cabeca", Y, -20 * deita),
            ("braco_e", Y, 40 * deita), ("braco_d", X, -30 * deita),
        ], -0.45 * cai - 0.12 * deita, -0.25 * deita)
        _chave(esqueleto, q + 1)
    # the helmet rolls off: a second slot in the same action, for the helmet object
    compat.atribuir_acao(capacete, acao)
    repouso = capacete.location.copy()
    for q in range(8):
        t = max(0.0, (q - 3) / 4)
        capacete.location = repouso + Vector((-0.5 * t, 0.35 * t, -0.9 * t))
        capacete.keyframe_insert("location", frame=q + 1)
    capacete.animation_data.action = None
    capacete.location = repouso
    for nome, a in acoes.items():
        for slot in a.slots:
            compat.interpolacao(a, slot, "LINEAR")
    return acoes


def posar(ctx, modelo, animacao, quadro):
    esqueleto, capacete = modelo["esqueleto"], modelo["capacete"]
    acao = modelo["acoes"][animacao]
    esqueleto.animation_data.action = acao
    esqueleto.animation_data.action_slot = compat.slot_para(acao, esqueleto)
    if animacao == "morrendo":
        compat.atribuir_acao(capacete, acao)
        capacete.animation_data.action_slot = compat.slot_para(acao, capacete)
    else:
        # passes render every animation in turn: put the helmet back after the fall of the previous pass
        if capacete.animation_data:
            capacete.animation_data.action = None
        capacete.location = modelo["capacete_repouso"]
    bpy.context.scene.frame_set(quadro + 1)
