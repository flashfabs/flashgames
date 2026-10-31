# SPDX-License-Identifier: GPL-3.0-or-later
"""Barracão, gray kit (brief arte/briefs/desligados-construcao-barracao.md): the barracks, an open-sided shed of
corrugated sheets on wooden posts with long benches where people sit waiting, a big chalkboard at the back with
the list of runs crossed out in chalk, a string of cloth bunting along the eaves and, in a corner, a wheelbarrow
and tied bundles."""

import math

from comum import cinza
from comum import modelagem as m

PEGADA = (3, 3)
DESCRICAO = cinza.descricao_construcao("desligados-construcao-barracao", "desligados/barracao", "desligados", PEGADA, 6.5, produz=True)


def construir(ctx):
    pal = cinza.Paleta(ctx, "desligados")
    raiz = m.vazio("raiz")
    estragos = cinza.Estragos(raiz, 83)
    esteios = estragos.grupo("esteios", (0, 0.6, 0.06), "parede")
    for x in (-4.4, -1.5, 1.5, 4.4):
        for y in (-3.6, 3.6):
            m.barra(f"esteio{x:+.1f}{y:+.0f}", (x, y, 0), (x, y, 3.4 if y > 0 else 2.8), 0.1, pal["madeira"], esteios, 6)
    for k, y in enumerate((-1.6, 0.4, 2.2)):
        m.caixa(f"banco{k}", (0, y, 0.45), (7.5, 0.4, 0.08), pal["madeira"], esteios, 0.01)
    m.caixa("quadro_negro", (0, 3.75, 2.0), (5.0, 0.1, 1.8), pal["escuro"], esteios, 0.02)
    for k in range(5):
        m.caixa(f"giz{k}", (-1.6 + (k % 2) * 0.5, 3.69, 2.6 - k * 0.3), (2.4, 0.01, 0.05), pal["branco"], esteios, 0.0)
    pessoas = [cinza.pessoa(ctx, pal, esteios, f"pessoa{k}", (x, y - 0.25, 0.0), giro=math.radians(90), pose="sentado", escala=1.2,
                            roupa="lona" if k % 2 else "oliva", calca="oliva", luvas="pele")
               for k, (x, y) in enumerate(((-2.5, -1.6), (0.8, -1.6), (-0.6, 0.4), (2.4, 2.2)))]
    telhado = estragos.grupo("telhado", (0, 0.6, 3.1), "telhado", queda=200)
    m.caixa("telha", (0, 0, 0.1), (9.6, 8.0, 0.08), pal["metal"], telhado, 0.01, (math.radians(-4.5), 0, 0))
    for k in range(12):
        m.caixa(f"onda{k}", (-4.4 + k * 0.8, 0, 0.16), (0.08, 8.0, 0.05), pal["concreto"], telhado, 0.0, (math.radians(-4.5), 0, 0))
    m.caixa("cumeeira", (0, 0.2, 0.25), (9.6, 0.25, 0.1), pal["time"], telhado, 0.0)
    bandeirinhas = estragos.grupo("bandeirinhas", (0, -3.4, 2.7), "detalhe")
    for k in range(16):
        x = -4.6 + k * 0.62
        m.malha_de_pontos(f"bandeirinha{k}", [(x - 0.22, 0, 0), (x + 0.22, 0, 0), (x, 0, -0.42)], [(0, 1, 2)], [pal["time"]], bandeirinhas)
    m.barra("cordao", (-4.8, -3.4, 2.7), (4.8, -3.4, 2.7), 0.01, pal["escuro"], raiz, 4)
    canto = estragos.grupo("canto", (4.8, 4.6, 0.06), "detalhe")
    m.caixa("carrinho", (0, 0, 0.5), (1.2, 0.6, 0.4), pal["metal"], canto, 0.03)
    for k in range(3):
        m.esfera(f"trouxa{k}", (-1.2 + k * 0.5, -0.8, 0.3), 0.35, pal["lona"], canto, (1.0, 0.8, 0.7), segmentos=12)
    estragos.detritos(pal, *PEGADA, 14, mats=("madeira", "metal", "lona"))
    m.ponto("saida", (0, -5.6, 0.0), raiz)
    m.ponto("topo", (0, 0.6, 5.0), raiz)
    return {"raiz": raiz, "estragos": estragos, "pessoas": pessoas}


def posar(ctx, modelo, animacao, quadro):
    modelo["estragos"].aplicar(animacao)
    for corpo_raiz, _ in modelo["pessoas"]:
        corpo_raiz.scale = (0, 0, 0) if animacao == "destruida" else (1.2, 1.2, 1.2)
