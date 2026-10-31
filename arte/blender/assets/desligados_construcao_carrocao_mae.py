# SPDX-License-Identifier: GPL-3.0-or-later
"""Carroção-Mãe, gray kit (brief arte/briefs/desligados-construcao-carrocao-mae.md): the Desligados' HQ, the
biggest and most horizontal volume of the faction: a long wagon with a high arched canvas top on four big wooden
wheels, the tongue resting on a trestle; set up, both sides open into awnings on poles around a market counter,
stacked crates and a hanging pan balance (trade, not ideology), and a tall mast with a canvas kite on top."""

import math

from comum import cinza
from comum import modelagem as m

PEGADA = (4, 3)
DESCRICAO = cinza.descricao_construcao("desligados-construcao-carrocao-mae", "desligados/carrocao-mae", "desligados", PEGADA, 11.0, produz=True)


def construir(ctx):
    pal = cinza.Paleta(ctx, "desligados")
    raiz = m.vazio("raiz")
    estragos = cinza.Estragos(raiz, 73)
    carrocao = estragos.grupo("carrocao", (0, 0.6, 0.06), "parede")
    for x in (-3.0, 3.0):
        for lado in (-1, 1):
            roda = m.roda(f"roda{x:+.0f}{lado:+d}", (x, lado * 1.45, 1.1), 1.1, 0.18, pal["madeira"], carrocao)
            m.toro(f"aro{x:+.0f}{lado:+d}", (0, 0, 0), 1.08, 0.06, pal["ferro"], roda)
    m.caixa("caixa", (0, 0, 1.9), (8.2, 2.6, 1.2), pal["madeira"], carrocao, 0.04)
    m.barra("lanca", (4.1, 0, 1.4), (6.6, 0, 0.9), 0.08, pal["madeira"], carrocao, 6)
    m.caixa("cavalete", (6.5, 0, 0.45), (0.3, 1.0, 0.9), pal["madeira"], carrocao, 0.0)
    toldo = estragos.grupo("toldo_arco", (0, 0.6, 2.5), "telhado", queda=0)
    cinza.arco("lona_arco", (0, 0, 0), 2.8, 2.2, 8.0, pal["lona"], toldo, 14, eixo="x")
    # side awnings on poles over the market, the cut fringe of their edges in the team colour
    for lado in (-1, 1):
        lateral = estragos.grupo(f"toldo_lateral{lado:+d}", (0, 0.6 + lado * 1.4, 2.9), "telhado")
        m.caixa(f"toldo_lateral{lado:+d}_lona", (0, lado * 1.5, -0.25), (8.0, 3.0, 0.05), pal["lona"], lateral, 0.0, (lado * math.radians(14), 0, 0))
        m.caixa(f"franja{lado:+d}", (0, lado * 2.95, -0.7), (8.0, 0.03, 0.3), pal["time"], lateral, 0.0)
        for k in range(4):
            x = -3.6 + k * 2.4
            m.barra(f"vara{lado:+d}{k}", (x, lado * 2.95, -2.84), (x, lado * 2.95, -0.6), 0.04, pal["madeira"], lateral, 6)
        for k in range(3):
            m.caixa(f"remendo{lado:+d}{k}", (-2.5 + k * 2.5, lado * 1.6, -0.22), (0.8, 0.8, 0.01), pal["ocre" if k % 2 else "tijolo"], lateral, 0.0,
                    (lado * math.radians(14), 0, 0))
    mercado = estragos.grupo("mercado", (0, -3.4, 0.06), "detalhe")
    m.caixa("balcao", (0, 0, 0.55), (4.5, 0.8, 1.1), pal["madeira"], mercado, 0.03)
    for k in range(5):
        m.caixa(f"caixote{k}", (-3.4 + k * 0.5 + (k % 2) * 3.8, 0.8 + (k % 3) * 0.3, 0.35 + (k % 2) * 0.6), (0.6, 0.6, 0.6), pal["lona" if k % 2 else "madeira"],
                mercado, 0.02)
    m.barra("balanca_haste", (2.8, 0, 0), (2.8, 0, 2.2), 0.04, pal["ferro"], mercado, 6)
    m.barra("balanca_travessao", (2.3, 0, 2.15), (3.3, 0, 2.15), 0.03, pal["ferro"], mercado, 4)
    for x in (2.35, 3.25):
        m.cilindro(f"prato{x:+.1f}", (x, 0, 1.6), 0.22, 0.04, pal["metal"], mercado, vertices=14)
    mastro = estragos.grupo("mastro", (-4.8, 3.8, 0.06), "alto", queda=150)
    m.barra("mastro_haste", (0, 0, 0), (0, 0, 10.0), 0.08, pal["madeira"], mastro, 6)
    m.malha_de_pontos("pipa", [(0, 0, 10.6), (0.9, 0, 9.8), (0, 0, 8.6), (-0.9, 0, 9.8)], [(0, 1, 2, 3)], [pal["time"]], mastro)
    estragos.detritos(pal, *PEGADA, 18, mats=("madeira", "lona", "escuro"))
    m.ponto("saida", (6.5, -2.0, 0.0), raiz)
    m.ponto("topo", (0, 0.6, 6.5), raiz)
    return {"raiz": raiz, "estragos": estragos}


def posar(ctx, modelo, animacao, quadro):
    modelo["estragos"].aplicar(animacao)
