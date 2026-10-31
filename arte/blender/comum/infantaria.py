# SPDX-License-Identifier: GPL-3.0-or-later
"""Shared infantry body (the plan's single infantry base): a scripted armature, rigid parts bound to its bones
and keyframed actions with slots, first written for the Turma de Linha (the D31 proof that a character can be
100% script) and reused by every foot unit and by the drivers and crews of vehicles.

Rest pose: character facing +X, Y to its left, Z up, metres before the infantry exaggeration of the
projection contract, which the asset applies on its root. Each frame k of an action lives at scene frame k + 1.
"""

import math

import bpy
from mathutils import Matrix, Quaternion, Vector

from . import compat

# Bones of the shared infantry skeleton: name, parent, head, tail (metres, character facing +X)
OSSOS = [
    ("quadril", None, (0, 0, 0.92), (0, 0, 1.05)),
    ("tronco", "quadril", (0, 0, 1.05), (0, 0, 1.45)),
    ("cabeca", "tronco", (0, 0, 1.47), (0, 0, 1.72)),
    ("braco_e", "tronco", (0, 0.24, 1.4), (0.12, 0.27, 1.12)),
    ("antebraco_e", "braco_e", (0.12, 0.27, 1.12), (0.4, 0.12, 1.0)),
    ("braco_d", "tronco", (0, -0.24, 1.4), (0.1, -0.27, 1.12)),
    ("antebraco_d", "braco_d", (0.1, -0.27, 1.12), (0.34, -0.1, 1.03)),
    ("coxa_e", "quadril", (0, 0.11, 0.92), (0, 0.12, 0.5)),
    ("canela_e", "coxa_e", (0, 0.12, 0.5), (0, 0.12, 0.08)),
    ("coxa_d", "quadril", (0, -0.11, 0.92), (0, -0.12, 0.5)),
    ("canela_d", "coxa_d", (0, -0.12, 0.5), (0, -0.12, 0.08)),
]
OSSO = {nome: (cabeca, cauda) for nome, _pai, cabeca, cauda in OSSOS}

# Positive turns about Y tilt the top of a bone forward (+X) and the bottom of a bone backward: knees and elbows
# (the tails of thighs and upper arms) go forward with negative turns.
Y = (0, 1, 0)
X = (1, 0, 0)
Z = (0, 0, 1)


def esqueleto(raiz, nome="esqueleto"):
    dados = bpy.data.armatures.new(f"{nome}_infantaria")
    obj = bpy.data.objects.new(nome, dados)
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = raiz
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    for osso_nome, pai, cabeca, cauda in OSSOS:
        osso = dados.edit_bones.new(osso_nome)
        osso.head, osso.tail = cabeca, cauda
        if pai:
            osso.parent = dados.edit_bones[pai]
            osso.use_connect = False
    bpy.ops.object.mode_set(mode="OBJECT")
    for osso in obj.pose.bones:
        osso.rotation_mode = "QUATERNION"
    return obj


def prender(obj, armacao, osso):
    """Rigid skinning: the part follows the bone and keeps its rest placement."""
    bpy.context.view_layer.update()
    mundo = obj.matrix_world.copy()
    obj.parent = armacao
    obj.parent_type = "BONE"
    obj.parent_bone = osso
    pose = armacao.pose.bones[osso]
    obj.matrix_parent_inverse = (armacao.matrix_world @ pose.matrix @ Matrix.Translation((0, pose.bone.length, 0))).inverted()
    obj.matrix_world = mundo


def girar(osso, eixo_mundo, graus):
    """Rotate a pose bone about an axis given in the rest frame of the character (X forward, Y left, Z up)."""
    base = osso.bone.matrix_local.to_3x3()
    rotacao = Quaternion(Vector(eixo_mundo), math.radians(graus)).to_matrix()
    local = base.inverted() @ rotacao @ base
    osso.rotation_quaternion = osso.rotation_quaternion @ local.to_quaternion()


def pose(armacao, angulos, quadril_z=0.0, quadril_x=0.0):
    for osso in armacao.pose.bones:
        osso.rotation_quaternion = (1, 0, 0, 0)
        osso.location = (0, 0, 0)
    for nome, eixo, graus in angulos:
        girar(armacao.pose.bones[nome], eixo, graus)
    quadril = armacao.pose.bones["quadril"]
    # pose-space offset of the hips, given in the character frame
    quadril.location = quadril.bone.matrix_local.to_3x3().inverted() @ Vector((quadril_x, 0, quadril_z))


def chave(armacao, quadro):
    for osso in armacao.pose.bones:
        osso.keyframe_insert("rotation_quaternion", frame=quadro)
        osso.keyframe_insert("location", frame=quadro)


# Pose functions: (frame, frame count) -> (bone turns, hip height offset, hip forward offset).

def parado(q, n):
    respira = math.sin(2 * math.pi * q / max(n, 1)) if n > 1 else 0.0
    return [("tronco", Y, 2 * respira)], 0.008 * respira, 0.0


def andando(q, n):
    fase = 2 * math.pi * q / n
    passo = math.sin(fase)
    return [
        ("coxa_e", Y, -28 * passo), ("coxa_d", Y, 28 * passo),
        ("canela_e", Y, 35 * max(0.0, math.sin(fase + math.pi / 2))),
        ("canela_d", Y, 35 * max(0.0, math.sin(fase - math.pi / 2))),
        ("tronco", Y, 4), ("tronco", Z, 4 * passo),
        ("braco_e", Y, 14 * passo), ("braco_d", Y, -14 * passo),
    ], 0.03 * abs(math.cos(fase)), 0.0


def atirando(q, n):
    recuo = 1.0 if q == 0 else 0.3
    return [("tronco", Y, -4 * recuo), ("braco_d", Y, -8 * recuo), ("braco_e", Y, -8 * recuo)], 0.0, -0.03 * recuo


def morrendo(q, n):
    t = q / max(n - 1, 1)
    cai = min(1.0, t * 1.6)
    deita = max(0.0, (t - 0.45) / 0.55)
    return [
        ("coxa_e", Y, -85 * cai), ("coxa_d", Y, -80 * cai),
        ("canela_e", Y, 70 * cai * (1 - deita)), ("canela_d", Y, 75 * cai * (1 - deita)),
        ("tronco", Y, -15 * cai - 70 * deita), ("cabeca", Y, -20 * deita),
        ("braco_e", Y, 40 * deita), ("braco_d", X, -30 * deita),
    ], -0.45 * cai - 0.12 * deita, -0.25 * deita


def sentado(q, n):
    """Seated rider or driver, hands forward on the handlebar or wheel."""
    return [
        ("coxa_e", Y, -80), ("coxa_d", Y, -80), ("canela_e", Y, 75), ("canela_d", Y, 75),
        ("braco_e", Y, -35), ("braco_d", Y, -35), ("tronco", Y, 6),
    ], -0.42, -0.1


def empurrando(q, n):
    """Leaning forward with both arms out, walking: crews pushing a cart."""
    angulos, z, x = andando(q, max(n, 2))
    return angulos + [("tronco", Y, 22), ("braco_e", Y, -55), ("braco_d", Y, -55)], z - 0.04, x


POSES = {"parado": parado, "andando": andando, "atirando": atirando, "morrendo": morrendo, "sentado": sentado, "empurrando": empurrando}


def acoes(armacao, animacoes, poses=None):
    """One action per animation, keyed from the pose functions; animacoes is a list of (name, frames, pose name or function)."""
    tabela = dict(POSES, **(poses or {}))
    resultado = {}
    for nome, quadros, fonte in animacoes:
        funcao = fonte if callable(fonte) else tabela[fonte]
        acao = bpy.data.actions.new(f"{armacao.name}_{nome}")
        compat.atribuir_acao(armacao, acao)
        resultado[nome] = acao
        for q in range(quadros):
            angulos, z, x = funcao(q, quadros)
            pose(armacao, angulos, z, x)
            chave(armacao, q + 1)
        for slot in acao.slots:
            compat.interpolacao(acao, slot, "LINEAR")
    return resultado


def usar_acao(armacao, acao, quadro):
    """Pose the armature at a frame of an action (frame k of an action lives at scene frame k + 1)."""
    armacao.animation_data.action = acao
    armacao.animation_data.action_slot = compat.slot_para(acao, armacao)
    bpy.context.scene.frame_set(quadro + 1)
