# SPDX-License-Identifier: GPL-3.0-or-later
"""Lança-Bobinas, gray kit (brief arte/briefs/religadores-unidade-lanca-bobinas.md): the artillery, a three-axle
truck with a long rail of copper coil rings on a turning base at the back (what reads first), raised to the
middle elevation, and a rack of standing cable reels behind the cab, which are the ammunition."""

import math

from comum import cinza
from comum import modelagem as m

PIVO_X = -1.7
DESCRICAO = cinza.descricao_veiculo(
    "religadores-veiculo-lanca-bobinas", "religadores/lanca-bobinas", quadro=(288, 256), ancora=(144, 150),
    torre=((320, 288), (160, 170)), destruido=((320, 288), (160, 170)),
)
ELEVACAO = 20


def construir(ctx):
    pal = cinza.Paleta(ctx, "religadores")
    raiz = m.vazio("raiz")
    chassi = cinza.chassi(raiz)
    cinza.rodas("roda", (2.3, -0.9, -2.1), 2.2, 0.5, 0.36, pal, chassi)
    m.caixa("longarina", (0, 0, 0.75), (6.6, 1.3, 0.35), pal["concreto"], chassi, 0.04)
    m.caixa("plataforma", (-1.2, 0, 1.08), (3.8, 2.4, 0.22), pal["concreto"], chassi, 0.04)
    m.caixa("cabine", (2.55, 0, 1.65), (1.5, 2.4, 1.5), pal["branco"], chassi, 0.08)
    m.caixa("teto", (2.52, 0, 2.43), (1.42, 2.3, 0.08), pal["time"], chassi, 0.02)
    m.caixa("para_brisa", (3.31, 0, 1.95), (0.04, 2.0, 0.5), pal["vidro"], chassi, 0.0)
    m.caixa("para_choque", (3.4, 0, 0.8), (0.2, 2.5, 0.32), pal["laranja"], chassi, 0.03)
    m.cilindro("escapamento", (1.7, -1.05, 2.2), 0.07, 1.6, pal["escuro"], chassi, vertices=10)
    # rack of cable reels standing behind the cab, its sides in the team colour
    for lado in (-1, 1):
        m.caixa(f"rack_lado{lado:+d}", (0.85, lado * 1.15, 1.75), (1.2, 0.06, 1.1), pal["time"], chassi, 0.01)
    for k, y in enumerate((-0.75, 0.0, 0.75)):
        m.cilindro(f"carretel{k}", (0.85, y, 1.75), 0.48, 0.42, pal["madeira"], chassi, (math.radians(90), 0, 0), 20)
        m.cilindro(f"carretel{k}_cabo", (0.85, y, 1.75), 0.38, 0.44, pal["escuro"], chassi, (math.radians(90), 0, 0), 16)
    m.ponto("encaixe_torre", (PIVO_X, 0, 0), chassi)
    m.ponto("escape", (1.7, -1.05, 3.05), chassi)
    m.ponto("topo", (2.5, 0, 2.9), chassi)
    # turret: turning base and the rail of copper rings on its supports
    torre = m.vazio("torre_pivo", (PIVO_X, 0, 0), chassi, camada="torre")
    m.cilindro("base_giratoria", (0, 0, 1.3), 0.85, 0.22, pal["escuro"], torre)
    m.caixa("base_faixa", (0, 0, 1.48), (1.2, 1.2, 0.12), pal["laranja"], torre, 0.02)
    elevacao = m.vazio("trilho_eixo", (0, 0, 1.7), torre, rotacao=(0, -math.radians(ELEVACAO), 0))
    for lado in (-1, 1):
        m.caixa(f"suporte{lado:+d}", (0.4, lado * 0.42, 0), (2.6, 0.1, 0.3), pal["cobalto"], elevacao, 0.02)
    for k in range(11):
        m.toro(f"anel{k}", (-0.9 + k * 0.42, 0, 0.18), 0.3, 0.08, pal["cobre"], elevacao, (0, math.radians(90), 0))
    m.barra("trilho_guia", (-1.0, 0, 0.18), (3.4, 0, 0.18), 0.05, pal["metal"], elevacao, 6)
    recuo = m.vazio("recuo", (0, 0, 0), elevacao)
    m.ponto("boca", (3.5, 0, 0.18), recuo)
    pecas = cinza.destroco(pal, raiz, 6.8, 2.5, 13)
    return {"raiz": raiz, "chassi": chassi, "elevacao": elevacao, "destroco": pecas}


def posar(ctx, modelo, animacao, quadro):
    destruido = animacao == "destruido"
    tiro = animacao == "atirando" and quadro == 0
    # short recoil of the whole rail on the shot; the rail drops to the deck on the wreck
    modelo["elevacao"].location = (-0.25 if tiro else 0.0, 0, 1.7)
    modelo["elevacao"].rotation_euler = (math.radians(25) if destruido else 0, -math.radians(-8 if destruido else ELEVACAO), 0)
    cinza.posar_destroco(modelo, destruido)
