# SPDX-License-Identifier: GPL-3.0-or-later
"""Canhão de Caldeira, gray kit (brief arte/briefs/desligados-unidade-canhao-de-caldeira.md): the artillery, a
cart with two big wooden wheels carrying an upright riveted boiler with a short chimney and, fixed to it, a very
thick short mortar barrel. Unarmed, the trail is closed and two men push it by the handles; armed, two feet drop
in front, the trail opens in a V and the barrel rises. The fixed version of phase 1 is the armed gun on a base of
bales and crates; the whole cart turns to aim, there is no separate turret."""

import math

from comum import cinza
from comum import modelagem as m

anim = cinza.anim
DESCRICAO = cinza.descricao_veiculo(
    "desligados-veiculo-canhao-de-caldeira-cinza", "desligados/canhao-de-caldeira", quadro=(256, 288), ancora=(128, 172), arma=False,
    extras=[
        anim("armado", "corpo", 1),
        anim("atirando", "corpo", 2, 8, False, quadrosIguais={"1": ["armado", 0]}),
        anim("fixo", "corpo", 1),
        anim("fixo-atirando", "corpo", 2, 8, False, quadrosIguais={"1": ["fixo", 0]}),
    ],
)


def construir(ctx):
    pal = cinza.Paleta(ctx, "desligados")
    raiz = m.vazio("raiz")
    chassi = cinza.chassi(raiz)
    for lado in (-1, 1):
        roda = m.roda(f"roda{lado:+d}", (0, lado * 0.95, 0.8), 0.8, 0.14, pal["madeira"], chassi)
        m.toro(f"aro{lado:+d}", (0, 0, 0), 0.78, 0.05, pal["ferro"], roda)
        for k in range(3):
            m.caixa(f"raio{lado:+d}{k}", (0, 0, 0), (1.5, 0.08, 0.06), pal["madeira"], roda, 0.0, (0, 0, math.pi / 3 * k))
    m.barra("eixo", (0, -0.95, 0.8), (0, 0.95, 0.8), 0.06, pal["ferro"], chassi, 8)
    m.caixa("carreta", (-0.1, 0, 0.95), (1.4, 1.2, 0.14), pal["madeira"], chassi, 0.02)
    m.caixa("carreta_faixa", (0.62, 0, 0.95), (0.06, 1.2, 0.16), pal["tijolo"], chassi, 0.0)
    m.cilindro("caldeira", (-0.25, 0, 1.75), 0.48, 1.5, pal["ferro"], chassi, vertices=20)
    m.cilindro("caldeira_faixa", (-0.25, 0, 1.95), 0.495, 0.32, pal["time"], chassi, vertices=20)
    m.caixa("remendo", (-0.25, -0.49, 1.45), (0.4, 0.04, 0.35), pal["ocre"], chassi, 0.0)
    m.cilindro("chamine", (-0.45, 0, 2.75), 0.11, 0.55, pal["escuro"], chassi, vertices=10)
    m.cilindro("apito", (-0.05, 0.2, 2.6), 0.04, 0.25, pal["metal"], chassi, vertices=8, suave=False)
    cano = m.vazio("cano", (0.3, 0, 1.75), chassi)
    m.cilindro("cano_tubo", (0.45, 0, 0), 0.3, 0.95, pal["ferro"], cano, (0, math.radians(90), 0), 18)
    m.cilindro("cano_boca", (0.92, 0, 0), 0.36, 0.14, pal["escuro"], cano, (0, math.radians(90), 0), 18)
    m.caixa("bandeirola", (0.95, 0.42, 0.25), (0.02, 0.3, 0.22), pal["time"], cano, 0.0)
    boca = m.ponto("boca", (1.02, 0, 0), cano)
    # trail: two bars that close for pushing and open in a V on the ground; two feet that drop in front
    conteiras = []
    for lado in (-1, 1):
        braco = m.vazio(f"conteira{lado:+d}", (-0.75, lado * 0.25, 0.9), chassi)
        m.barra(f"conteira_barra{lado:+d}", (0, 0, 0), (-1.5, 0, -0.55), 0.06, pal["madeira"], braco, 6)
        m.barra(f"alca{lado:+d}", (-1.5, 0, -0.55), (-1.5, lado * 0.25, -0.5), 0.04, pal["ferro"], braco, 6)
        conteiras.append((braco, lado))
    sapatas = []
    for lado in (-1, 1):
        sapata = m.vazio(f"sapata{lado:+d}", (0.65, lado * 0.45, 0.9), chassi)
        m.barra(f"sapata_perna{lado:+d}", (0, 0, 0), (0, 0, -0.85), 0.05, pal["ferro"], sapata, 6)
        m.caixa(f"sapata_pe{lado:+d}", (0, 0, -0.86), (0.3, 0.25, 0.05), pal["escuro"], sapata, 0.0)
        sapatas.append(sapata)
    # crew: pushing at the handles when moving, beside the gun when armed
    guarnicao = [cinza.pessoa(ctx, pal, chassi, f"guarnicao{k}", (-2.0, y, 0), pose="empurrando", escala=1.1, roupa="lona", calca="oliva")
                 for k, y in enumerate((0.45, -0.45))]
    # bales and crates of the fixed position
    base = m.vazio("base_fixa", (0, 0, 0), chassi)
    for k in range(9):
        angulo = 2 * math.pi * k / 9
        material = pal["palha" if k % 2 else "madeira"]
        m.caixa(f"fardo{k}", (1.75 * math.cos(angulo), 1.75 * math.sin(angulo), 0.35), (0.9, 0.6, 0.7), material, base, 0.05, (0, 0, angulo))
    m.ponto("apito", (-0.05, 0.2, 2.8), chassi)
    m.ponto("topo", (-0.25, 0, 3.2), chassi)
    pecas = cinza.destroco(pal, raiz, 3.6, 2.0, 37)
    return {"raiz": raiz, "chassi": chassi, "cano": cano, "conteiras": conteiras, "sapatas": sapatas, "guarnicao": guarnicao,
            "base": base, "destroco": pecas}


def posar(ctx, modelo, animacao, quadro):
    destruido = animacao == "destruido"
    armado = animacao in ("armado", "atirando", "fixo", "fixo-atirando")
    tiro = animacao in ("atirando", "fixo-atirando") and quadro == 0
    modelo["cano"].rotation_euler = (0, -math.radians(58 if armado else 12) + (math.radians(40) if destruido else 0), 0)
    modelo["cano"].location = (0.3 - (0.15 if tiro else 0.0), 0, 1.75)
    for braco, lado in modelo["conteiras"]:
        braco.rotation_euler = (0, math.radians(-12) if armado else 0, lado * math.radians(28) if armado else 0)
    for sapata in modelo["sapatas"]:
        sapata.scale = (1, 1, 1) if armado else (1, 1, 0.15)
    for k, (corpo_raiz, armacao) in enumerate(modelo["guarnicao"]):
        if armado:
            corpo_raiz.location = (0.2, (1.0 if k == 0 else -1.0) * 1.35, 0)
            corpo_raiz.rotation_euler = (0, 0, (-1 if k == 0 else 1) * math.radians(90))
            cinza.posar_pessoa(armacao, "atirando" if tiro else "parado")
        else:
            corpo_raiz.location = (-2.0, 0.45 if k == 0 else -0.45, 0)
            corpo_raiz.rotation_euler = (0, 0, 0)
            cinza.posar_pessoa(armacao, "empurrando")
        corpo_raiz.scale = (0, 0, 0) if destruido else (1.1, 1.1, 1.1)
    modelo["base"].scale = (1, 1, 1) if animacao.startswith("fixo") else (0, 0, 0)
    cinza.posar_destroco(modelo, destruido, inclinar=(25, 10), afundar=0.3)
