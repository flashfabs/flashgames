# SPDX-License-Identifier: GPL-3.0-or-later
"""Escritório Regional (brief arte/briefs/religadores-construcao-escritorio-regional.md): the Religadores HQ,
a two-storey bare-concrete office with vertical sun fins, a low shed with a roll-up door, a queue-number
panel, rooftop water tank, exhaust fan, patched solar panels, a flag and the corner pole with transformer.

Layers: corpo (the building, lamps off) and luzes (only the lamps, windows and the number panel, cut out by
the building), so the game switches the lights without new frames. States: ready with an 8-frame activity
loop, producing (door opening), damaged.
"""

import math

import bpy

from comum import modelagem as m

CINZA_CONCRETO = "#8A8C8E"
BRANCO_ENCARDIDO = "#E6E1D3"
LARANJA = "#E2711D"
COBALTO = "#1F4E8C"

DESCRICAO = {
    "asset": "religadores-construcao-escritorio-regional",
    "brief": "religadores/escritorio-regional",
    "tipo": "unidade",
    "categoria": "construcao",
    "fases": ["portao", "fase-1"],
    "direcoes": 1,
    "passes": ["cor", "time", "sombra"],
    "camadas": {
        "corpo": {"quadro": [768, 640], "ancora": [384, 392]},
        "luzes": {"quadro": [768, 640], "ancora": [384, 392], "recorte": ["corpo"]},
    },
    "animacoes": [
        {"nome": "pronta", "camada": "corpo", "quadros": 8, "fps": 8, "laco": True},
        {"nome": "produzindo", "camada": "corpo", "quadros": 6, "fps": 8, "laco": False},
        {"nome": "danificada", "camada": "corpo", "quadros": 1, "fps": 0, "laco": True},
        {"nome": "luzes", "camada": "luzes", "quadros": 4, "fps": 2, "laco": True},
    ],
    "edicaoHumana": "nenhuma ainda; o painel usa a fonte padrão embutida no Blender",
}


def _texto(nome, corpo, local, tamanho, mat, pai, camada=None):
    curva = bpy.data.curves.new(nome, "FONT")
    curva.body = corpo
    curva.size = tamanho
    curva.align_x = "CENTER"
    curva.align_y = "CENTER"
    curva.extrude = 0.01
    obj = bpy.data.objects.new(nome, curva)
    obj.location = local
    obj.rotation_euler = (math.radians(90), 0, 0)
    obj.data.materials.append(mat)
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = pai
    if camada:
        obj["camada"] = camada
    return obj


def construir(ctx):
    concreto = m.material("concreto", CINZA_CONCRETO, 0.0, 0.85, {"escala": 2.5, "cor": "#74726C", "de": 0.45, "ate": 0.85, "detalhe": 6.0})
    branco = m.material("branco_encardido", BRANCO_ENCARDIDO, 0.0, 0.8, {"escala": 3.0, "cor": "#BDB39A", "de": 0.5, "ate": 0.9, "detalhe": 4.0})
    laranja = m.material("laranja_seguranca", LARANJA, 0.2, 0.5, {"escala": 8.0, "cor": "#B95A18", "de": 0.55, "ate": 0.85})
    cobalto = m.material("cobalto", COBALTO, 0.3, 0.45)
    vidro = m.material("vidro_apagado", (0.025, 0.035, 0.045), 0.0, 0.1)
    escuro = m.material("metal_escuro", (0.05, 0.05, 0.055), 0.7, 0.45)
    telha = m.material("telhado", "#5D5F60", 0.3, 0.7, {"escala": 6.0, "cor": "#4E4A44"})
    fibra = m.material("caixa_dagua", "#4F7FA6", 0.0, 0.5)
    solar = m.material("painel_solar", "#1B2433", 0.6, 0.25)
    fuligem = m.material("fuligem", (0.03, 0.028, 0.026), 0.0, 0.95)
    luz_janela = m.material("luz_janela", "#F6C77E", 0.0, 0.5, emissao=("#F2B866", 1.1))
    luz_painel = m.material("luz_painel", "#FF5A2A", 0.0, 0.5, emissao=("#FF5A2A", 6.0))
    time = m.material_time(ctx.projecao)

    raiz = m.vazio("raiz")
    # two-storey block on the west half, shed on the east half; the facade faces south (towards the camera)
    m.caixa("bloco", (-4, 0, 3.6), (8, 12, 7.2), concreto, raiz, 0.08)
    m.caixa("platibanda", (-4, 0, 7.45), (8.2, 12.2, 0.5), branco, raiz, 0.04)
    m.caixa("faixa_platibanda", (-4, -6.12, 7.45), (8.22, 0.04, 0.36), time, raiz, 0.0)
    m.caixa("faixa_platibanda_oeste", (-8.12, 0, 7.45), (0.04, 12.22, 0.36), time, raiz, 0.0)
    m.caixa("telhado_bloco", (-4, 0, 7.25), (7.8, 11.8, 0.1), telha, raiz, 0.0)
    m.caixa("galpao", (4, 0.5, 2.6), (8, 11, 5.2), branco, raiz, 0.06)
    m.caixa("telhado_galpao", (4, 0.5, 5.25), (8.3, 11.3, 0.15), telha, raiz, 0.02)
    janelas, brises = [], []
    for k in range(9):
        x = -7.5 + 0.875 * k + 0.44
        m.caixa(f"janela_alta{k}", (x, -6.02, 5.4), (0.7, 0.05, 1.8), vidro, raiz, 0.0)
        janelas.append(m.caixa(f"vidro_quebrado_alto{k}", (x, -6.08, 5.4), (0.72, 0.02, 1.82), fuligem, raiz, 0.0))
        m.caixa(f"luz_alta{k}", (x, -6.06, 5.4), (0.66, 0.02, 1.7), luz_janela, raiz, 0.0, camada="luzes")
    for k in range(10):
        brises.append(m.caixa(f"brise{k}", (-7.95 + 0.875 * k, -6.25, 5.4), (0.12, 0.5, 2.6), laranja, raiz, 0.02))
    for k, x in enumerate((-7.0, -1.2)):
        m.caixa(f"janela_terreo{k}", (x, -6.02, 1.6), (1.4, 0.05, 1.4), vidro, raiz, 0.0)
        janelas.append(m.caixa(f"vidro_quebrado_terreo{k}", (x, -6.08, 1.6), (1.42, 0.02, 1.42), fuligem, raiz, 0.0))
        m.caixa(f"luz_terreo{k}", (x, -6.06, 1.6), (1.36, 0.02, 1.36), luz_janela, raiz, 0.0, camada="luzes")
    # entrance with the marquee and the queue-number panel
    m.caixa("porta_entrada", (-4.1, -6.03, 1.2), (2.2, 0.06, 2.4), vidro, raiz, 0.0)
    marquise = m.caixa("marquise", (-4.1, -6.9, 3.0), (4.8, 1.8, 0.22), laranja, raiz, 0.03)
    m.caixa("borda_marquise", (-4.1, -7.82, 3.0), (4.82, 0.05, 0.26), time, raiz, 0.0)
    for x in (-6.2, -2.0):
        m.cilindro(f"pilar{x:+.0f}", (x, -7.6, 1.45), 0.1, 2.9, concreto, raiz)
    for k in range(4):
        m.esfera(f"lampada{k}", (-5.6 + k, -7.3, 2.82), 0.09, luz_janela, raiz, camada="luzes")
    painel = m.caixa("painel_senha", (-1.1, -6.12, 3.6), (2.2, 0.12, 0.7), escuro, raiz, 0.02)
    letreiro = m.caixa("letreiro", (-4.1, -6.12, 4.1), (3.4, 0.1, 0.45), cobalto, raiz, 0.02)
    m.caixa("letreiro_faixa", (-4.1, -6.18, 4.1), (3.0, 0.02, 0.12), branco, raiz, 0.0)
    numero = _texto("senha", "SENHA 042", (-1.1, -6.2, 3.6), 0.42, luz_painel, raiz, "luzes")
    # shed: wide roll-up door with reflective edges
    porta = m.caixa("porta_enrolar", (3.6, -5.02, 2.0), (5.0, 0.08, 4.0), laranja, raiz, 0.0)
    m.caixa("caixa_porta", (3.6, -5.1, 4.2), (5.4, 0.3, 0.4), concreto, raiz, 0.02)
    for lado in (-1, 1):
        m.caixa(f"batente{lado:+d}", (3.6 + lado * 2.6, -5.06, 2.0), (0.2, 0.14, 4.0), branco, raiz, 0.0)
    m.caixa("vao_porta", (3.6, -4.9, 2.0), (4.9, 0.05, 3.95), escuro, raiz, 0.0)
    # roof: water tank, exhaust fan, patched solar panels and the flag mast
    m.cilindro("caixa_dagua", (-6.3, 3.5, 7.9), 0.9, 1.3, fibra, raiz)
    m.cilindro("exaustor_base", (-2.0, 3.0, 7.45), 0.55, 0.3, escuro, raiz)
    exaustor = m.vazio("exaustor", (-2.0, 3.0, 7.7), raiz)
    for k in range(4):
        m.caixa(f"pa{k}", (0, 0, 0), (0.95, 0.16, 0.03), concreto, exaustor, 0.0, (0, math.radians(18), math.pi / 4 * k))
    for k in range(3):
        m.caixa(f"solar{k}", (2.0 + 2.1 * k, 2.5, 5.7), (1.9, 3.2, 0.08), solar, raiz, 0.01, (math.radians(-18), 0, 0))
    m.barra("mastro", (-7.3, -4.8, 7.6), (-7.3, -4.8, 11.2), 0.05, escuro, raiz, 8)
    bandeira = m.malha_de_pontos("bandeira", [(0, 0, 0)] * 12, [(0, 1, 3, 2), (2, 3, 5, 4), (4, 5, 7, 6), (6, 7, 9, 8), (8, 9, 11, 10)], [time], raiz)
    # corner pole with crossarm and transformer, where the grid starts
    m.cilindro("poste", (8.6, -6.6, 5.0), 0.17, 10.0, concreto, raiz, vertices=10, suave=False)
    m.caixa("cruzeta", (8.6, -6.6, 9.4), (0.18, 2.6, 0.18), concreto, raiz, 0.0)
    m.cilindro("transformador", (8.6, -6.25, 7.6), 0.42, 1.1, escuro, raiz)
    for y in (-1.1, 0, 1.1):
        m.cilindro(f"isolador{y:+.1f}", (8.6, -6.6 + y, 9.62), 0.06, 0.26, branco, raiz)
    sujeira = [m.caixa(f"escombro{k}", (x, -6.6, 0.25), (1.6, 1.2, 0.5), fuligem, raiz, 0.08, (0.3, 0.2, k)) for k, x in enumerate((-6.5, -2.4))]
    m.ponto("porta", (3.6, -6.6, 0.0), raiz)
    m.ponto("topo", (-4.0, -6.0, 8.2), raiz)
    m.ponto("topo_mastro", (-7.3, -4.8, 11.3), raiz)
    m.ponto("cruzeta", (8.6, -7.9, 9.62), raiz)
    return {"raiz": raiz, "exaustor": exaustor, "bandeira": bandeira, "porta": porta, "numero": numero,
            "brises": brises, "janelas": janelas, "marquise": marquise, "painel": painel, "letreiro": letreiro,
            "escombros": sujeira}


def _bandeira(modelo, quadro):
    fase = 2 * math.pi * quadro / 8
    pontos = []
    for k in range(6):
        x = -7.3 + 0.32 * k
        y = -4.8 + 0.18 * math.sin(fase - 1.3 * k) * k / 5
        pontos += [(x, y, 10.3), (x, y, 11.1)]
    for vertice, co in zip(modelo["bandeira"].data.vertices, pontos):
        vertice.co = co
    modelo["bandeira"].data.update()


def posar(ctx, modelo, animacao, quadro):
    danificada = animacao == "danificada"
    _bandeira(modelo, quadro if animacao == "pronta" else 0)
    modelo["exaustor"].rotation_euler = (0, 0, math.radians(11.25) * quadro if animacao == "pronta" else 0.0)
    abertura = math.sin(math.pi * quadro / 5) if animacao == "produzindo" else 0.0
    porta = modelo["porta"]
    porta.scale = (1.0, 1.0, max(0.02, 1.0 - 0.95 * abertura))
    porta.location = (3.6, -5.02, 4.0 - 2.0 * porta.scale[2])
    modelo["numero"].data.body = f"SENHA {42 + (quadro if animacao == 'luzes' else 0):03d}"
    # damage: torn fins, broken windows, a fallen piece of marquee, a crooked sign and rubble
    for k, brise in enumerate(modelo["brises"]):
        brise.scale = (1, 1, 0.0 if danificada and k in (2, 3, 7) else 1.0)
    # broken, sooted panes sit just in front of the glass; materials never change here, the pass swapper owns them
    for janela in modelo["janelas"]:
        janela.scale = (1, 1, 1) if danificada else (0, 0, 0)
    modelo["marquise"].rotation_euler = (math.radians(-14) if danificada else 0.0, 0, 0)
    modelo["letreiro"].rotation_euler = (0, math.radians(9) if danificada else 0.0, 0)
    for escombro in modelo["escombros"]:
        escombro.scale = (1, 1, 1) if danificada else (0, 0, 0)
