# SPDX-License-Identifier: GPL-3.0-or-later
"""Cesto Blindado (brief arte/briefs/religadores-unidade-cesto-blindado.md): armoured three-axle utility
truck with a two-segment boom on a turntable, a basket that stays level and a pin driver on its rail.

Layers: corpo (chassis, cab, outriggers), torre (turntable, boom lowered like a long barrel, basket),
torre-erguida (the same turret objects with the boom up) and completo (the whole truck, for the raise
transition). Every part is built here from primitives; nothing is modelled by hand.
"""

import math

from comum import modelagem as m

# Palette of the brief, sRGB hex
BRANCO_ENCARDIDO = "#E6E1D3"
CINZA_CONCRETO = "#8A8C8E"
LARANJA = "#E2711D"
COBALTO = "#1F4E8C"
TERRA = "#7A4A30"
AMBAR = "#F2A516"

PIVO_X = -1.7
LANCA1 = 3.1
LANCA2 = 2.3
BAIXADA = (4.0, 0.0)  # boom angles in degrees (lower segment from horizontal, upper segment from horizontal)
ERGUIDA = (80.0, 50.0)
QUADROS_ERGUER = 12

DESCRICAO = {
    "asset": "religadores-veiculo-cesto-blindado",
    "brief": "religadores/cesto-blindado",
    "tipo": "unidade",
    "categoria": "veiculo",
    "fases": ["portao", "fase-1"],
    "direcoes": 32,
    "passes": ["cor", "time", "sombra"],
    "camadasSombra": ["corpo", "completo"],
    "camadas": {
        "corpo": {"quadro": [256, 256], "ancora": [128, 150]},
        "torre": {"quadro": [416, 384], "ancora": [208, 208], "pivo": "torre_pivo"},
        "torre-erguida": {"quadro": [256, 384], "ancora": [128, 280], "pivo": "torre_pivo", "usa": ["torre"]},
        "completo": {"quadro": [384, 448], "ancora": [192, 300], "usa": ["corpo", "torre"]},
    },
    "animacoes": [
        {"nome": "parado", "camada": "corpo", "quadros": 1, "fps": 0, "laco": True},
        {"nome": "rodando", "camada": "corpo", "quadros": 4, "fps": 12, "laco": True},
        {"nome": "apoiado", "camada": "corpo", "quadros": 1, "fps": 0, "laco": True},
        {"nome": "torre", "camada": "torre", "quadros": 1, "fps": 0, "laco": True},
        {"nome": "atirando", "camada": "torre", "quadros": 2, "fps": 12, "laco": False},
        {"nome": "erguida", "camada": "torre-erguida", "quadros": 1, "fps": 0, "laco": True},
        {"nome": "atirando-erguida", "camada": "torre-erguida", "quadros": 2, "fps": 12, "laco": False},
        {"nome": "erguer", "camada": "completo", "quadros": QUADROS_ERGUER, "fps": 12, "laco": False, "direcoes": 8},
    ],
}


def _faixas(prefixo, inicio, fim, altura, espessura, pai, materiais, n=6, eixo="y", x=0.0, y=0.0):
    """Alternating reflective stripes along one axis (bumpers and outriggers)."""
    passo = (fim - inicio) / n
    for i in range(n):
        centro = inicio + passo * (i + 0.5)
        local = (x, centro, altura) if eixo == "y" else (centro, y, altura)
        dims = (espessura, abs(passo), 0.16) if eixo == "y" else (abs(passo), espessura, 0.16)
        m.caixa(f"{prefixo}{i}", local, dims, materiais[i % 2], pai, 0.0)


def _roda(nome, local, materiais, pai):
    pneu, aro = materiais
    roda = m.roda(nome, local, 0.5, 0.36, pneu, pai)
    lado = 1 if local[1] > 0 else -1
    # four lugs on the outer face, so the 4-frame rolling loop is visible (90 degree symmetry)
    for k in range(4):
        angulo = math.pi / 2 * k
        m.caixa(f"{nome}_cubo{k}", (0.22 * math.cos(angulo), 0.22 * math.sin(angulo), lado * -0.19), (0.12, 0.12, 0.04), aro, roda, 0.0)
    m.cilindro(f"{nome}_aro", (0, 0, lado * -0.17), 0.3, 0.04, aro, roda)
    return roda


def construir(ctx):
    branco = m.material("branco_encardido", BRANCO_ENCARDIDO, 0.1, 0.55, {"escala": 3.0, "cor": "#D2C9B2", "de": 0.5, "ate": 0.9, "detalhe": 3.0})
    chapa = m.material("chapa_concreto", CINZA_CONCRETO, 0.5, 0.5, {"escala": 4.0, "cor": "#7C7E80", "de": 0.5, "ate": 0.9, "detalhe": 3.0})
    sujo = m.material("terra", "#5E5A54", 0.2, 0.85, {"escala": 5.0, "cor": TERRA, "de": 0.35, "ate": 0.7})
    laranja = m.material("laranja_seguranca", LARANJA, 0.2, 0.45, {"escala": 12.0, "cor": "#C2601A", "de": 0.5, "ate": 0.8})
    cobalto = m.material("cobalto", COBALTO, 0.3, 0.45)
    pneu = m.material("pneu", (0.025, 0.025, 0.025), 0.0, 0.9)
    escuro = m.material("metal_escuro", (0.05, 0.05, 0.055), 0.8, 0.4)
    vidro = m.material("vidro", (0.03, 0.05, 0.07), 0.0, 0.08)
    refletivo_vermelho = m.material("refletivo_vermelho", "#B3201C", 0.0, 0.3)
    refletivo_branco = m.material("refletivo_branco", "#F2F0E8", 0.0, 0.3)
    giroflex = m.material("giroflex", AMBAR, 0.0, 0.3, emissao=(AMBAR, 2.0))
    pele = m.material("macacao", LARANJA, 0.0, 0.7)
    time = m.material_time(ctx.projecao)
    faixas = (refletivo_vermelho, refletivo_branco)

    raiz = m.vazio("raiz")
    # chassis and running gear
    m.caixa("longarina", (0, 0, 0.75), (6.0, 1.5, 0.35), sujo, raiz, 0.05)
    m.caixa("plataforma", (-1.15, 0, 1.12), (3.7, 2.5, 0.28), branco, raiz, 0.06)
    for k, x in enumerate((-2.55, -1.15, 0.25)):
        m.caixa(f"chapa_deque{k}", (x, 0, 1.28), (0.9, 2.3, 0.05), chapa, raiz, 0.015)
    rodas = []
    for x in (2.0, -0.85, -1.95):
        for lado in (-1, 1):
            rodas.append(_roda(f"roda{x:+.1f}{lado:+d}", (x, lado * 1.12, 0.5), (pneu, escuro), raiz))
    for x in (2.0, -1.4):
        for lado in (-1, 1):
            m.caixa(f"paralama{x:+.1f}{lado:+d}", (x, lado * 1.12, 1.08), (1.3 if x > 0 else 2.3, 0.5, 0.08), chapa, raiz, 0.03)
    # armoured cab, flat front
    m.caixa("cabine", (2.25, 0, 1.75), (1.5, 2.4, 1.6), branco, raiz, 0.08)
    m.caixa("chapa_teto", (2.2, 0, 2.6), (1.6, 2.5, 0.12), chapa, raiz, 0.03)
    for lado in (-1, 1):
        m.caixa(f"chapa_porta{lado:+d}", (2.25, lado * 1.23, 1.75), (1.2, 0.08, 0.9), chapa, raiz, 0.02)
        m.caixa(f"placa_porta{lado:+d}", (2.25, lado * 1.28, 1.85), (0.6, 0.04, 0.4), time, raiz, 0.0)
        m.caixa(f"janela{lado:+d}", (2.45, lado * 1.205, 2.25), (0.7, 0.04, 0.4), vidro, raiz, 0.0)
    m.caixa("para_brisa_grade", (3.02, 0, 2.15), (0.06, 2.1, 0.55), escuro, raiz, 0.0)
    m.caixa("para_choque", (3.1, 0, 0.85), (0.22, 2.5, 0.35), chapa, raiz, 0.04)
    _faixas("faixa_frente", -1.2, 1.2, 0.85, 0.24, raiz, faixas, 8, "y", x=3.12)
    m.caixa("para_choque_tras", (-3.05, 0, 0.8), (0.2, 2.4, 0.3), chapa, raiz, 0.03)
    _faixas("faixa_tras", -1.15, 1.15, 0.8, 0.22, raiz, faixas, 8, "y", x=-3.07)
    m.cilindro("giroflex", (2.2, 0, 2.78), 0.13, 0.2, giroflex, raiz)
    m.cilindro("escapamento", (1.38, -1.0, 2.2), 0.08, 1.9, escuro, raiz)
    m.caixa("caixa_ferramentas", (-0.2, 1.05, 1.42), (1.2, 0.4, 0.35), branco, raiz, 0.03)
    m.ponto("encaixe_torre", (PIVO_X, 0, 0), raiz)
    m.ponto("escape", (1.38, -1.0, 3.2), raiz)
    m.ponto("giroflex", (2.2, 0, 2.95), raiz)
    m.ponto("topo", (2.2, 0, 3.1), raiz)

    # outriggers: a beam that swings out from each corner to 45 degrees and a leg that goes down to the ground
    patolas = []
    for x, frente in ((1.25, 1), (-2.75, -1)):
        for lado in (-1, 1):
            base = m.vazio(f"patola{frente:+d}{lado:+d}", (x, lado * 0.8, 0.95), raiz)
            m.caixa(f"viga{frente:+d}{lado:+d}", (0, lado * 0.85, 0), (0.24, 1.7, 0.24), chapa, base, 0.02)
            _faixas(f"faixa_patola{frente:+d}{lado:+d}", 0.1 * lado, 1.6 * lado, 0.0, 0.26, base, faixas, 4, "y")
            perna = m.vazio(f"perna{frente:+d}{lado:+d}", (0, lado * 1.65, 0), base)
            m.caixa(f"cilindro_perna{frente:+d}{lado:+d}", (0, 0, -0.45), (0.18, 0.18, 0.9), laranja, perna, 0.02)
            m.caixa(f"sapata{frente:+d}{lado:+d}", (0, 0, -0.92), (0.45, 0.45, 0.06), escuro, perna, 0.01)
            patolas.append((base, perna, frente, lado))

    # turret: turntable, two boom segments, levelled basket with the pin driver and the operator
    torre = m.vazio("torre_pivo", (PIVO_X, 0, 0), raiz, camada="torre")
    m.cilindro("mesa_giratoria", (0, 0, 1.4), 0.75, 0.25, escuro, torre)
    m.caixa("pedestal", (0, 0, 1.75), (0.9, 0.8, 0.6), laranja, torre, 0.05)
    junta1 = m.vazio("junta_lanca1", (0, 0, 2.0), torre)
    m.caixa("lanca1", (LANCA1 / 2, 0, 0), (LANCA1, 0.42, 0.42), laranja, junta1, 0.04)
    m.cilindro("hidraulico1", (LANCA1 * 0.35, 0, -0.3), 0.09, LANCA1 * 0.6, escuro, junta1, (0, math.radians(90), 0))
    junta2 = m.vazio("junta_lanca2", (LANCA1, 0, 0), junta1)
    m.caixa("lanca2", (LANCA2 / 2, 0, 0), (LANCA2, 0.34, 0.34), laranja, junta2, 0.04)
    m.caixa("faixa_lanca", (LANCA2 * 0.72, 0, 0), (LANCA2 * 0.4, 0.37, 0.37), time, junta2, 0.0)
    cesto = m.vazio("cesto_pivo", (LANCA2, 0, 0), junta2)
    m.caixa("cesto_fundo", (0.3, 0, -0.35), (1.0, 1.0, 0.08), cobalto, cesto, 0.02)
    for lado in (-1, 1):
        m.caixa(f"cesto_lado{lado:+d}", (0.3, lado * 0.48, -0.05), (1.0, 0.06, 0.6), time, cesto, 0.01)
    m.caixa("cesto_frente", (0.78, 0, -0.05), (0.06, 1.0, 0.6), cobalto, cesto, 0.01)
    m.caixa("cesto_tras", (-0.18, 0, -0.05), (0.06, 1.0, 0.6), cobalto, cesto, 0.01)
    m.caixa("operador_tronco", (0.25, 0.1, 0.25), (0.32, 0.4, 0.5), pele, cesto, 0.05)
    m.esfera("operador_capacete", (0.25, 0.1, 0.62), 0.17, branco, cesto, (1.0, 1.0, 0.8))
    arma = m.vazio("cravadeira", (0.85, -0.25, 0.25), cesto)
    m.caixa("cravadeira_corpo", (0.15, 0, 0), (0.6, 0.26, 0.3), escuro, arma, 0.03)
    m.cilindro("cravadeira_cano", (0.7, 0, 0.02), 0.08, 0.7, escuro, arma, (0, math.radians(90), 0))
    m.ponto("boca", (1.08, 0, 0.02), arma)
    m.ponto("topo_cesto", (0.3, 0, 1.1), cesto)
    return {"raiz": raiz, "rodas": rodas, "patolas": patolas, "juntas": (junta1, junta2, cesto), "arma": arma}


def _lanca(modelo, angulos):
    junta1, junta2, cesto = modelo["juntas"]
    a1, a2 = (math.radians(a) for a in angulos)
    # Blender's positive rotation about Y tilts +X down, so a boom going up turns by a negative angle
    junta1.rotation_euler = (0, -a1, 0)
    junta2.rotation_euler = (0, -(a2 - a1), 0)
    cesto.rotation_euler = (0, a2, 0)


def _patolas(modelo, abertura):
    """abertura 0: stowed along the chassis; 0.5: swung out; 1: legs on the ground."""
    giro = min(1.0, abertura * 2)
    descida = max(0.0, abertura * 2 - 1)
    for base, perna, frente, lado in modelo["patolas"]:
        # stowed beams point along the chassis, deployed ones 45 degrees outwards (the X on the ground)
        recolhida = frente * lado * math.radians(90)
        aberta = -frente * lado * math.radians(45)
        base.rotation_euler = (0, 0, recolhida + (aberta - recolhida) * giro)
        perna.location = (0, lado * 1.65, 0.75 * (1 - descida))


def posar(ctx, modelo, animacao, quadro):
    erguendo = animacao in ("erguida", "atirando-erguida", "apoiado")
    for roda in modelo["rodas"]:
        roda.rotation_euler = (math.radians(90), math.radians(22.5) * quadro if animacao == "rodando" else 0.0, 0)
    modelo["arma"].location = (0.85 - (0.18 if animacao.startswith("atirando") and quadro == 0 else 0.0), -0.25, 0.25)
    if animacao == "erguer":
        t = quadro / (QUADROS_ERGUER - 1)
        _patolas(modelo, min(1.0, t * 1.6))
        subida = max(0.0, (t - 0.35) / 0.65)
        suave = subida * subida * (3 - 2 * subida)
        _lanca(modelo, [b + (e - b) * suave for b, e in zip(BAIXADA, ERGUIDA)])
        return
    _patolas(modelo, 1.0 if erguendo else 0.0)
    _lanca(modelo, ERGUIDA if erguendo else BAIXADA)
