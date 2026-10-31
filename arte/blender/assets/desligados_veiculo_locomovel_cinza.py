# SPDX-License-Identifier: GPL-3.0-or-later
"""Locomóvel, gray kit (brief arte/briefs/desligados-unidade-locomovel.md): the heavy line, the biggest vehicle of
the faction: a long horizontal boiler on the chassis with a tall chimney at the front, two huge iron rear wheels
with cleats and two small front wheels, the driver's platform under a short awning at the back, the flywheel on
the side, riveted plates and logs tied on as armour, and a thick steam cannon on a turning base on top."""

import math

from comum import cinza
from comum import modelagem as m

PIVO_X = 0.3
DESCRICAO = cinza.descricao_veiculo(
    "desligados-veiculo-locomovel-cinza", "desligados/locomovel", quadro=(320, 320), ancora=(160, 196),
    torre=((192, 192), (96, 120)),
)


def construir(ctx):
    pal = cinza.Paleta(ctx, "desligados")
    raiz = m.vazio("raiz")
    chassi = cinza.chassi(raiz)
    m.caixa("longarina", (0, 0, 0.95), (5.6, 1.4, 0.3), pal["ferro"], chassi, 0.03)
    # huge rear wheels with cleats, small steering wheels in front
    for lado in (-1, 1):
        roda = m.roda(f"roda_grande{lado:+d}", (-1.3, lado * 1.2, 1.15), 1.15, 0.4, pal["ferro"], chassi)
        m.toro(f"aro{lado:+d}", (0, 0, lado * -0.2), 1.0, 0.06, pal["tijolo"], roda)
        for k in range(12):
            angulo = 2 * math.pi * k / 12
            m.caixa(f"garra{lado:+d}{k}", (1.15 * math.cos(angulo), 1.15 * math.sin(angulo), 0), (0.12, 0.12, 0.42), pal["escuro"], roda, 0.0,
                    (0, 0, angulo))
    cinza.rodas("roda_frente", (1.9,), 1.8, 0.5, 0.26, pal, chassi)
    # boiler, firebox and the tall chimney with a painted team band
    m.cilindro("caldeira", (0.4, 0, 1.85), 0.78, 3.4, pal["ferro"], chassi, (0, math.radians(90), 0), 24)
    for k in range(5):
        m.cilindro(f"cinta{k}", (-1.0 + k * 0.7, 0, 1.85), 0.8, 0.06, pal["escuro"], chassi, (0, math.radians(90), 0), 24)
    m.caixa("fornalha", (-1.55, 0, 1.6), (0.7, 1.4, 1.2), pal["ferro"], chassi, 0.04)
    m.cilindro("chamine", (1.75, 0, 3.4), 0.24, 2.6, pal["ferro"], chassi, vertices=16)
    m.cilindro("chamine_boca", (1.75, 0, 4.75), 0.34, 0.2, pal["escuro"], chassi, vertices=16)
    m.cilindro("chamine_faixa", (1.75, 0, 3.6), 0.255, 0.5, pal["time"], chassi, vertices=16)
    m.toro("volante", (0.0, 0.95, 2.0), 0.55, 0.07, pal["escuro"], chassi, (math.radians(90), 0, 0))
    m.barra("biela", (0.0, 0.98, 2.0), (1.0, 0.95, 1.95), 0.05, pal["metal"], chassi, 6)
    # armour: riveted ochre plates and tied logs along the sides
    for lado in (-1, 1):
        m.caixa(f"chapa{lado:+d}", (0.7, lado * 0.8, 1.6), (1.6, 0.06, 0.8), pal["ocre"], chassi, 0.01)
        for k in range(2):
            m.cilindro(f"tora{lado:+d}{k}", (0.6, lado * 0.88, 1.15 + 0.28 * k), 0.13, 2.4, pal["madeira"], chassi, (0, math.radians(90), 0), 10)
    # driver's platform and its short awning with the flag
    m.caixa("plataforma", (-2.35, 0, 1.15), (1.0, 1.8, 0.12), pal["madeira"], chassi, 0.02)
    for y in (-0.8, 0.8):
        for x in (-2.8, -1.95):
            m.barra(f"poste_toldo{x:+.1f}{y:+.1f}", (x, y, 1.2), (x, y, 2.9), 0.04, pal["madeira"], chassi, 6)
    m.caixa("toldo", (-2.37, 0, 2.95), (1.1, 1.9, 0.05), pal["lona"], chassi, 0.0)
    m.barra("bandeira_haste", (-2.8, 0.8, 2.9), (-2.8, 0.8, 3.9), 0.025, pal["madeira"], chassi, 4)
    m.caixa("bandeira", (-3.05, 0.8, 3.7), (0.5, 0.02, 0.35), pal["time"], chassi, 0.0)
    cinza.pessoa(ctx, pal, chassi, "maquinista", (-2.3, 0.2, 1.21), giro=math.radians(180), escala=1.05, roupa="lona", calca="oliva")
    m.ponto("encaixe_torre", (PIVO_X, 0, 0), chassi)
    m.ponto("chamine", (1.75, 0, 4.9), chassi)
    m.ponto("valvula", (-0.6, 0, 2.75), chassi)
    m.ponto("topo", (0.4, 0, 4.4), chassi)
    # turret: the steam cannon on its turning base on top of the boiler
    torre = m.vazio("torre_pivo", (PIVO_X, 0, 0), chassi, camada="torre")
    m.cilindro("base_canhao", (0, 0, 2.72), 0.55, 0.22, pal["escuro"], torre)
    m.caixa("berco", (0, 0, 2.98), (0.8, 0.7, 0.35), pal["ferro"], torre, 0.04)
    cano = m.vazio("cano", (0.2, 0, 3.1), torre)
    m.cilindro("cano_tubo", (0.75, 0, 0), 0.2, 1.5, pal["ferro"], cano, (0, math.radians(90), 0), 16)
    m.cilindro("cano_boca", (1.5, 0, 0), 0.25, 0.18, pal["escuro"], cano, (0, math.radians(90), 0), 16)
    m.cilindro("cilindro_vapor", (-0.25, 0, 0.1), 0.18, 0.6, pal["metal"], cano, (0, math.radians(90), 0), 12)
    m.ponto("boca", (1.62, 0, 0), cano)
    pecas = cinza.destroco(pal, raiz, 6.2, 2.8, 31)
    return {"raiz": raiz, "chassi": chassi, "cano": cano, "destroco": pecas}


def posar(ctx, modelo, animacao, quadro):
    destruido = animacao == "destruido"
    modelo["cano"].location = (0.2 - (0.3 if animacao == "atirando" and quadro == 0 else 0.0), 0, 3.1)
    modelo["cano"].rotation_euler = (0, math.radians(35) if destruido else 0, 0)
    cinza.posar_destroco(modelo, destruido, inclinar=(11, -7), afundar=0.25)
