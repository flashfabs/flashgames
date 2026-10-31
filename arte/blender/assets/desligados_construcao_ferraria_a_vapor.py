# SPDX-License-Identifier: GPL-3.0-or-later
"""Ferraria a Vapor, gray kit (brief arte/briefs/desligados-construcao-ferraria-a-vapor.md): the vehicle
workshop, a shed open at the front with a tall brick chimney in one corner (the highest part of the whole
faction); inside, seen from the front, a boiler, a forge and a big steam hammer; in front, a wooden A-frame with a
hoist for lifting chassis, and piles of scrap, wheels and drums around."""

import math

from comum import cinza
from comum import modelagem as m

PEGADA = (4, 3)
DESCRICAO = cinza.descricao_construcao("desligados-construcao-ferraria-a-vapor", "desligados/ferraria-a-vapor", "desligados", PEGADA, 14.0,
                                       produz=True)


def construir(ctx):
    pal = cinza.Paleta(ctx, "desligados")
    raiz = m.vazio("raiz")
    estragos = cinza.Estragos(raiz, 89)
    m.caixa("chao", (0, 0, 0.03), (15.4, 11.4, 0.06), pal["terra"], raiz, 0.02)
    galpao = estragos.grupo("galpao", (-0.6, 1.4, 0.06), "parede")
    m.caixa("parede_fundo", (0, 3.0, 2.0), (11.0, 0.3, 4.0), pal["madeira"], galpao, 0.03)
    for x in (-5.4, 5.4):
        m.caixa(f"parede_lado{x:+.0f}", (x, 0, 2.0), (0.3, 6.0, 4.0), pal["madeira"], galpao, 0.03)
    m.cilindro("caldeira", (-3.0, 1.2, 1.4), 0.9, 2.8, pal["ferro"], galpao, vertices=18)
    m.caixa("forja", (0.0, 1.6, 0.7), (1.8, 1.4, 1.4), pal["tijolo"], galpao, 0.04)
    m.caixa("forja_brasa", (0.0, 1.6, 1.42), (1.2, 0.9, 0.04), pal["luz"], galpao, 0.0)
    m.caixa("pilao_coluna", (3.0, 1.6, 2.0), (0.7, 0.7, 4.0), pal["ferro"], galpao, 0.03)
    m.caixa("pilao_martelo", (3.0, 0.9, 1.6), (0.6, 0.8, 0.8), pal["escuro"], galpao, 0.03)
    m.caixa("bigorna", (3.0, 0.4, 0.4), (0.8, 0.5, 0.7), pal["escuro"], galpao, 0.02)
    telhado = estragos.grupo("telhado", (-0.6, 1.4, 4.06), "telhado", queda=90)
    m.caixa("telha", (0, 0, 0.1), (11.6, 6.8, 0.1), pal["metal"], telhado, 0.02, (math.radians(-6), 0, 0))
    chamine = estragos.grupo("chamine", (5.6, 4.2, 0.06), "alto", queda=200)
    m.caixa("chamine_tijolo", (0, 0, 6.2), (1.3, 1.3, 12.4), pal["tijolo"], chamine, 0.03)
    m.caixa("chamine_faixa", (0, 0, 9.5), (1.36, 1.36, 0.9), pal["time"], chamine, 0.0)
    m.caixa("chamine_fuligem", (0, 0, 12.0), (1.36, 1.36, 0.8), pal["fuligem"], chamine, 0.0)
    cavalete = estragos.grupo("cavalete", (-2.6, -3.6, 0.06), "alto", queda=270)
    for lado in (-1, 1):
        m.barra(f"cavalete_perna{lado:+d}a", (-1.0, lado * 1.4, 0), (0, lado * 1.4, 4.6), 0.1, pal["madeira"], cavalete, 6)
        m.barra(f"cavalete_perna{lado:+d}b", (1.0, lado * 1.4, 0), (0, lado * 1.4, 4.6), 0.1, pal["madeira"], cavalete, 6)
    m.barra("cavalete_viga", (0, -1.6, 4.6), (0, 1.6, 4.6), 0.12, pal["madeira"], cavalete, 6)
    m.barra("talha", (0, 0, 4.5), (0, 0, 2.6), 0.03, pal["metal"], cavalete, 4)
    m.caixa("bandeira", (0.0, 1.45, 4.2), (0.7, 0.02, 0.45), pal["time"], cavalete, 0.0)
    sucata = estragos.grupo("sucata", (3.0, -3.8, 0.06), "detalhe")
    for k in range(3):
        m.cilindro(f"tambor{k}", (-0.8 + k * 0.8, 0, 0.5), 0.3, 1.0, pal["ferro" if k % 2 else "ocre"], sucata, vertices=12)
    m.roda("roda_velha", (1.8, 0.4, 0.7), 0.7, 0.18, pal["madeira"], sucata, eixo="x")
    estragos.detritos(pal, *PEGADA, 18, mats=("ferro", "tijolo", "madeira"))
    m.ponto("saida", (-2.6, -5.6, 0.0), raiz)
    m.ponto("chamine", (5.6, 4.2, 12.6), raiz)
    m.ponto("topo", (-0.6, 1.4, 6.0), raiz)
    return {"raiz": raiz, "estragos": estragos}


def posar(ctx, modelo, animacao, quadro):
    modelo["estragos"].aplicar(animacao)
