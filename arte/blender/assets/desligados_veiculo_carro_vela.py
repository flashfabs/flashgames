# SPDX-License-Identifier: GPL-3.0-or-later
"""Carro-Vela (brief arte/briefs/desligados-unidade-carro-vela.md): three-wheeled land sailer, tall patched
canvas sail, bumper of stacked old tyres, pilot lying at the back and a gunner on a swivel seat at the bow.

The hard case of the style gate: a thin, translucent sail with a team band across it. The sail is a real
mesh whose vertices are rewritten every frame (luffing when parked, full belly when running).
"""

import math

import bpy

from comum import compat
from comum import modelagem as m

LONA = "#CDBB94"
OCRE = "#B5832E"
TIJOLO = "#9B3B26"
OLIVA = "#6F7445"

MASTRO_X = 0.5
PE_Z = 1.25
TOPO_Z = 6.6
RETRANCA = 2.9  # boom length, backwards from the mast
COLUNAS, LINHAS = 14, 18
FAIXA = (0.28, 0.40)  # team band, as a fraction of the sail height

DESCRICAO = {
    "asset": "desligados-veiculo-carro-vela",
    "brief": "desligados/carro-vela",
    "tipo": "unidade",
    "categoria": "veiculo",
    "fases": ["portao", "fase-1"],
    "direcoes": 32,
    "passes": ["cor", "time", "sombra"],
    "camadas": {
        "corpo": {"quadro": [256, 320], "ancora": [128, 184]},
        "torre": {"quadro": [128, 128], "ancora": [64, 80], "pivo": "banco_pivo"},
    },
    "animacoes": [
        {"nome": "parado", "camada": "corpo", "quadros": 4, "fps": 6, "laco": True},
        {"nome": "rodando", "camada": "corpo", "quadros": 4, "fps": 12, "laco": True},
        {"nome": "torre", "camada": "torre", "quadros": 1, "fps": 0, "laco": True},
        {"nome": "atirando", "camada": "torre", "quadros": 2, "fps": 12, "laco": False},
    ],
}


def _material_lona():
    """Patched canvas: squares of raw canvas, ochre and brick, lit through when the sun is behind it."""
    mat = bpy.data.materials.new("lona")
    arvore = compat.garantir_nos(mat)
    bsdf = compat.principled(mat)
    bsdf.inputs["Roughness"].default_value = 0.85
    coordenadas = arvore.nodes.new("ShaderNodeTexCoord")
    remendos = arvore.nodes.new("ShaderNodeTexVoronoi")
    remendos.feature = "F1"
    remendos.distance = "CHEBYCHEV"
    remendos.inputs["Scale"].default_value = 1.1
    arvore.links.new(coordenadas.outputs["Object"], remendos.inputs["Vector"])
    rampa = arvore.nodes.new("ShaderNodeValToRGB")
    rampa.color_ramp.interpolation = "CONSTANT"
    cores = ((0.0, LONA), (0.55, OCRE), (0.72, LONA), (0.86, TIJOLO))
    while len(rampa.color_ramp.elements) < len(cores):
        rampa.color_ramp.elements.new(0.5)
    for elemento, (posicao, cor) in zip(rampa.color_ramp.elements, cores):
        elemento.position = posicao
        elemento.color = (*m.hex_para_linear(cor), 1.0)
    arvore.links.new(remendos.outputs["Color"], rampa.inputs["Fac"])
    arvore.links.new(rampa.outputs["Color"], bsdf.inputs["Base Color"])
    translucido = arvore.nodes.new("ShaderNodeBsdfTranslucent")
    arvore.links.new(rampa.outputs["Color"], translucido.inputs["Color"])
    mistura = arvore.nodes.new("ShaderNodeMixShader")
    mistura.inputs["Fac"].default_value = 0.35
    saida = next(no for no in arvore.nodes if no.type == "OUTPUT_MATERIAL")
    arvore.links.new(bsdf.outputs["BSDF"], mistura.inputs[1])
    arvore.links.new(translucido.outputs["BSDF"], mistura.inputs[2])
    arvore.links.new(mistura.outputs["Shader"], saida.inputs["Surface"])
    return mat


def _vela_base():
    """Rest positions of the sail grid: a triangle between mast foot, mast head and boom end."""
    pontos = []
    for j in range(LINHAS + 1):
        v = j / LINHAS
        largura = 1.0 - v
        for i in range(COLUNAS + 1):
            u = i / COLUNAS * largura
            pontos.append((u, v))
    return pontos


def construir(ctx):
    madeira = m.material("madeira", "#7B5A36", 0.0, 0.8, {"escala": 22.0, "cor": "#5E4328", "de": 0.4, "ate": 0.7})
    ferro = m.material("tubo_ferro", OLIVA, 0.5, 0.55, {"escala": 9.0, "cor": "#5A4A30", "de": 0.45, "ate": 0.8})
    borracha = m.material("borracha_gasta", (0.03, 0.03, 0.03), 0.0, 0.9)
    corda = m.material("corda", "#D9CDB0", 0.0, 0.9)
    roupa = m.material("roupa", "#6B5A3E", 0.0, 0.85)
    pele = m.material("pele", "#8A5E44", 0.0, 0.6)
    lona = _material_lona()
    time = m.material_time(ctx.projecao)

    raiz = m.vazio("raiz")
    # long narrow chassis, front steering wheel and a wide rear axle
    m.barra("longarina", (-2.3, 0, 0.75), (2.5, 0, 0.6), 0.13, ferro, raiz, 10)
    m.caixa("deque", (-1.0, 0, 0.82), (2.4, 0.9, 0.08), madeira, raiz, 0.02)
    m.barra("eixo_tras", (-1.6, -1.55, 0.55), (-1.6, 1.55, 0.55), 0.08, ferro, raiz, 10)
    for lado in (-1, 1):
        m.barra(f"escora{lado:+d}", (-1.6, lado * 1.4, 0.55), (-0.4, 0, 0.8), 0.06, ferro, raiz, 8)
    rodas = [m.roda(f"roda_tras{lado:+d}", (-1.6, lado * 1.55, 0.55), 0.55, 0.22, borracha, raiz) for lado in (-1, 1)]
    garfo = m.vazio("garfo", (2.45, 0, 0.55), raiz)
    rodas.append(m.roda("roda_frente", (0, 0, 0), 0.55, 0.2, borracha, garfo))
    for roda in rodas:
        for k in range(3):
            m.caixa(f"{roda.name}_raio{k}", (0, 0, 0), (0.9, 0.06, 0.05), ferro, roda, 0.0, (0, 0, math.pi / 3 * k))
    m.barra("garfo_haste", (2.45, 0, 0.55), (2.35, 0, 1.0), 0.06, ferro, raiz, 8)
    # bumper of stacked tyres tied with rope: the ram
    for k, (dy, dz) in enumerate(((-0.35, 0.5), (0.35, 0.5), (0.0, 0.85))):
        m.toro(f"pneu_ariete{k}", (3.05, dy, dz), 0.32, 0.13, borracha, raiz, (0, math.radians(90), 0))
    m.barra("amarra", (3.05, -0.7, 0.66), (3.05, 0.7, 0.66), 0.03, corda, raiz, 6)
    # mast, boom and the pilot lying behind the sail
    m.barra("mastro", (MASTRO_X, 0, 0.8), (MASTRO_X, 0, TOPO_Z + 0.3), 0.07, madeira, raiz, 10)
    m.barra("retranca", (MASTRO_X, 0, PE_Z), (MASTRO_X - RETRANCA, 0, PE_Z), 0.05, madeira, raiz, 8)
    m.barra("estai", (MASTRO_X, 0, TOPO_Z), (2.5, 0, 0.9), 0.015, corda, raiz, 6)
    m.caixa("piloto_corpo", (-1.3, 0, 1.0), (1.1, 0.36, 0.26), roupa, raiz, 0.08)
    m.esfera("piloto_cabeca", (-0.72, 0, 1.1), 0.14, pele, raiz)
    m.esfera("piloto_gorro", (-0.74, 0, 1.17), 0.14, ferro, raiz, (1.0, 1.0, 0.6))
    # sail: a grid triangle; the team band is a second material on a row range
    base = _vela_base()
    faces, materiais = [], []
    linha = COLUNAS + 1
    for j in range(LINHAS):
        for i in range(COLUNAS):
            a = j * linha + i
            faces.append((a, a + 1, a + linha + 1, a + linha))
            v = (j + 0.5) / LINHAS
            materiais.append(1 if FAIXA[0] <= v <= FAIXA[1] else 0)
    vela = m.malha_de_pontos("vela", [(0, 0, 0)] * len(base), faces, [lona, time], raiz, indices_material=materiais)
    vela.modifiers.new("espessura", "SOLIDIFY").thickness = 0.02
    flamula = m.malha_de_pontos("flamula", [(0, 0, 0)] * 8, [(0, 1, 2, 3), (3, 2, 4, 5), (5, 4, 6, 7)], [time], raiz)
    m.ponto("topo", (MASTRO_X, 0, TOPO_Z + 0.6), raiz)
    m.ponto("poeira", (-1.6, 0, 0.0), raiz)
    m.ponto("encaixe_torre", (1.55, 0, 0), raiz)
    # gunner on the swivel seat with a big-reservoir air carbine: the small turret layer
    banco = m.vazio("banco_pivo", (1.55, 0, 0), raiz, camada="torre")
    m.cilindro("banco_coluna", (0, 0, 0.95), 0.07, 0.35, ferro, banco)
    m.cilindro("banco_assento", (0, 0, 1.15), 0.22, 0.06, madeira, banco)
    m.caixa("atirador_tronco", (-0.05, 0, 1.45), (0.3, 0.38, 0.5), roupa, banco, 0.06)
    m.esfera("atirador_cabeca", (-0.02, 0, 1.8), 0.13, pele, banco)
    m.esfera("atirador_chapeu", (-0.02, 0, 1.87), 0.2, madeira, banco, (1.0, 1.0, 0.25))
    arma = m.vazio("carabina", (0.15, -0.12, 1.45), banco)
    m.cilindro("carabina_cano", (0.45, 0, 0.0), 0.035, 0.8, ferro, arma, (0, math.radians(90), 0))
    m.cilindro("carabina_reservatorio", (0.1, 0, -0.1), 0.09, 0.55, ferro, arma, (0, math.radians(90), 0))
    m.ponto("boca", (0.88, 0, 0.0), arma)
    return {"raiz": raiz, "rodas": rodas, "vela": vela, "base": base, "flamula": flamula, "arma": arma}


def _deformar_vela(modelo, animacao, quadro):
    fase = 2 * math.pi * quadro / 4
    vertices = modelo["vela"].data.vertices
    for vertice, (u, v) in zip(vertices, modelo["base"]):
        x = MASTRO_X - u * RETRANCA
        z = PE_Z + v * (TOPO_Z - PE_Z)
        livre = u * (1 - v)  # free edge away from mast and boom moves most
        if animacao == "rodando":
            # full belly to leeward, a small flutter on the leech
            y = 0.55 * math.sin(math.pi * min(1.0, u / max(0.05, 1 - v))) * (1 - v) + 0.04 * livre * math.sin(fase + 6 * v)
        else:
            # luffing: ripples running aft along the canvas
            y = 0.12 * livre * math.sin(fase - 7 * u - 3 * v) + 0.05 * math.sin(math.pi * u) * (1 - v)
        vertice.co = (x, y, z)
    modelo["vela"].data.update()
    # pennant from the mast head, flapping
    tremula = 0.12 if animacao == "rodando" else 0.2
    pontos = []
    for k in range(4):
        x = MASTRO_X - 0.45 * k
        y = tremula * math.sin(fase + 1.6 * k) * k / 3
        meia = 0.12 * (1 - k / 4)
        pontos += [(x, y, TOPO_Z + 0.25 - meia), (x, y, TOPO_Z + 0.25 + meia)]
    for vertice, co in zip(modelo["flamula"].data.vertices, pontos):
        vertice.co = co
    modelo["flamula"].data.update()


def posar(ctx, modelo, animacao, quadro):
    _deformar_vela(modelo, animacao, quadro)
    for roda in modelo["rodas"]:
        roda.rotation_euler = (math.radians(90), math.radians(30) * quadro if animacao == "rodando" else 0.0, 0)
    modelo["arma"].location = (0.15 - (0.1 if animacao == "atirando" and quadro == 0 else 0.0), -0.12, 1.45)
