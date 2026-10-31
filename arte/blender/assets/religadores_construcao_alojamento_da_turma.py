# SPDX-License-Identifier: GPL-3.0-or-later
"""Alojamento da Turma, gray kit (brief arte/briefs/religadores-construcao-alojamento-da-turma.md): the barracks,
three site containers stacked in an L, two below and one on top, with an outside steel stair and a railed
walkway, a water tank on the top container, a time clock on a post by the lower door and a clothesline of
overalls between the containers."""

import math

from comum import cinza
from comum import modelagem as m

PEGADA = (3, 3)
DESCRICAO = cinza.descricao_construcao("religadores-construcao-alojamento-da-turma", "religadores/alojamento-da-turma",
                                       "religadores", PEGADA, 7.5, produz=True)


def conteiner(nome, local, giro, pal, pai, faixa=False):
    grupo = m.vazio(nome, local, pai, rotacao=(0, 0, giro))
    m.caixa(f"{nome}_caixa", (0, 0, 1.3), (6.0, 2.4, 2.6), pal["branco"], grupo, 0.04)
    for k in range(7):
        m.caixa(f"{nome}_nervura{k}", (-2.7 + k * 0.9, -1.22, 1.3), (0.08, 0.04, 2.5), pal["concreto"], grupo, 0.0)
    m.caixa(f"{nome}_porta", (1.8, -1.23, 1.05), (0.9, 0.04, 2.0), pal["cobalto"], grupo, 0.0)
    m.caixa(f"{nome}_janela", (-1.2, -1.23, 1.6), (1.2, 0.04, 0.7), pal["vidro"], grupo, 0.0)
    if faixa:
        m.caixa(f"{nome}_faixa", (0, -1.24, 2.2), (6.0, 0.03, 0.3), pal["time"], grupo, 0.0)
    return grupo


def construir(ctx):
    pal = cinza.Paleta(ctx, "religadores")
    raiz = m.vazio("raiz")
    estragos = cinza.Estragos(raiz, 47)
    cinza.laje("patio", *PEGADA, pal["concreto"], raiz)
    baixo = estragos.grupo("baixo", (0, 0, 0.12), "parede")
    conteiner("conteiner_a", (0.8, -3.6, 0), 0, pal, baixo)
    conteiner("conteiner_b", (-3.6, 0.8, 0), math.radians(90), pal, baixo)
    cima = estragos.grupo("cima", (0.8, -3.6, 2.72), "telhado", queda=60)
    conteiner("conteiner_c", (0, 0, 0), 0, pal, cima, faixa=True)
    m.cilindro("caixa_dagua", (1.8, 0.2, 3.3), 0.75, 1.3, pal["cobalto"], cima, vertices=16)
    escada = estragos.grupo("escada", (4.6, -2.4, 0.12), "detalhe")
    for lado in (-0.45, 0.45):
        m.barra(f"escada_banzo{lado:+.1f}", (0, lado, 0), (-1.8, lado, 2.6), 0.05, pal["metal"], escada, 6)
    for k in range(8):
        t = (k + 0.5) / 8
        m.barra(f"degrau{k}", (-1.8 * t, -0.45, 2.6 * t), (-1.8 * t, 0.45, 2.6 * t), 0.03, pal["metal"], escada, 4)
    m.barra("guarda_corpo", (-3.6, -1.15, 3.7), (2.3, -1.15, 3.7), 0.03, pal["laranja"], cima, 6)
    for k in range(5):
        x = -3.6 + k * 1.45
        m.barra(f"guarda_poste{k}", (x, -1.15, 2.62), (x, -1.15, 3.7), 0.025, pal["laranja"], cima, 4)
    m.caixa("bandeirola", (2.6, -1.18, 3.55), (0.5, 0.02, 0.35), pal["time"], cima, 0.0)
    relogio = estragos.grupo("relogio", (3.0, -5.3, 0.12), "detalhe")
    m.barra("relogio_coluna", (0, 0, 0), (0, 0, 1.4), 0.06, pal["metal"], relogio, 6)
    m.caixa("relogio_caixa", (0, 0, 1.5), (0.35, 0.25, 0.45), pal["cobalto"], relogio, 0.02)
    varal = estragos.grupo("varal", (-1.5, -0.2, 0.12), "detalhe")
    m.barra("varal_poste_a", (-1.2, 1.4, 0), (-1.2, 1.4, 2.2), 0.04, pal["metal"], varal, 6)
    m.barra("varal_poste_b", (2.6, 1.4, 0), (2.6, 1.4, 2.2), 0.04, pal["metal"], varal, 6)
    m.barra("varal_fio", (-1.2, 1.4, 2.15), (2.6, 1.4, 2.15), 0.01, pal["escuro"], varal, 4)
    for k in range(4):
        m.caixa(f"macacao{k}", (-0.6 + k * 0.9, 1.4, 1.6), (0.55, 0.04, 1.0), pal["laranja"], varal, 0.02)
    estragos.detritos(pal, *PEGADA, 16)
    m.ponto("saida", (2.6, -5.6, 0.0), raiz)
    m.ponto("cabo", (-3.6, 3.0, 5.4), raiz)
    m.ponto("topo", (0, 0, 7.0), raiz)
    return {"raiz": raiz, "estragos": estragos}


def posar(ctx, modelo, animacao, quadro):
    modelo["estragos"].aplicar(animacao)
