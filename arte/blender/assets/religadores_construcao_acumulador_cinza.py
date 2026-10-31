# SPDX-License-Identifier: GPL-3.0-or-later
"""Acumulador, gray kit (brief arte/briefs/religadores-construcao-acumulador.md): the depot, a low fenced yard with
rows of battery racks under a light metal roof, a loading dock with a small gantry where the Guincho pulls in, a
short pole with insulators where the grid cable leaves and a panel with a big needle meter at the front."""

import math

from comum import cinza
from comum import modelagem as m

PEGADA = (3, 2)
DESCRICAO = cinza.descricao_construcao("religadores-construcao-acumulador-cinza", "religadores/acumulador", "religadores", PEGADA, 7.0)


def construir(ctx):
    pal = cinza.Paleta(ctx, "religadores")
    raiz = m.vazio("raiz")
    estragos = cinza.Estragos(raiz, 3)
    cinza.laje("patio", *PEGADA, pal["concreto"], raiz)
    # battery racks in three rows, with a row of small lamps each
    racks = estragos.grupo("racks", (0, 0.4, 0.12), "parede")
    for fila, y in enumerate((2.2, 0.4, -1.4)):
        for k, x in enumerate((-3.6, -1.2, 1.2, 3.6)):
            m.caixa(f"rack{fila}{k}", (x, y, 0.85), (2.1, 0.8, 1.7), pal["cobalto" if (fila + k) % 2 else "concreto"], racks, 0.03)
            m.caixa(f"rack{fila}{k}_luzes", (x, y - 0.41, 1.3), (1.6, 0.02, 0.08), pal["luz"], racks, 0.0)
    # light roof on posts
    postes = estragos.grupo("postes_cobertura", (0, 0, 0.12), "parede")
    for x in (-5.0, 0.0, 5.0):
        for y in (-2.4, 3.2):
            m.barra(f"poste_cobertura{x:+.0f}{y:+.0f}", (x, y, 0), (x, y, 3.1), 0.09, pal["metal"], postes, 8)
    cobertura = estragos.grupo("cobertura", (0, 0.4, 3.2), "telhado")
    m.caixa("telha", (0, 0, 0.06), (10.8, 6.2, 0.12), pal["aluminio"], cobertura, 0.02, (math.radians(4), 0, 0))
    m.caixa("faixa_cobertura", (0, -3.1, -0.04), (10.8, 0.08, 0.3), pal["time"], cobertura, 0.0)
    # chain-link fence on three sides: posts and three wires
    for lado, (a, b) in enumerate((((-5.8, -3.8), (-5.8, 3.8)), ((-5.8, 3.8), (5.8, 3.8)), ((5.8, 3.8), (5.8, -3.8)))):
        cerca = estragos.grupo(f"cerca{lado}", (a[0], a[1], 0.12), "detalhe")
        dx, dy = b[0] - a[0], b[1] - a[1]
        partes = int(math.hypot(dx, dy) / 1.9)
        for k in range(partes + 1):
            t = k / partes
            m.barra(f"cerca{lado}_poste{k}", (dx * t, dy * t, 0), (dx * t, dy * t, 1.9), 0.04, pal["metal"], cerca, 6)
        for z in (0.5, 1.2, 1.85):
            m.barra(f"cerca{lado}_fio{z}", (0, 0, z), (dx, dy, z), 0.02, pal["aluminio"], cerca, 4)
    # loading dock with the gantry and its hoist, on the south side
    m.caixa("doca", (-3.0, -3.3, 0.45), (4.4, 1.2, 0.9), pal["concreto"], raiz, 0.03)
    portico = estragos.grupo("portico", (-3.0, -3.3, 0.9), "alto", queda=270)
    for x in (-2.0, 2.0):
        m.barra(f"portico_coluna{x:+.0f}", (x, 0, 0), (x, 0, 3.6), 0.12, pal["laranja"], portico, 8)
    m.caixa("portico_viga", (0, 0, 3.65), (4.4, 0.3, 0.3), pal["laranja"], portico, 0.02)
    m.caixa("talha", (0.4, 0, 3.2), (0.4, 0.3, 0.5), pal["escuro"], portico, 0.02)
    m.barra("talha_corrente", (0.4, 0, 2.95), (0.4, 0, 1.6), 0.025, pal["metal"], portico, 4)
    placa = estragos.grupo("placa_portao", (1.6, -3.9, 0.12), "detalhe")
    m.barra("placa_haste", (0, 0, 0), (0, 0, 1.6), 0.05, pal["metal"], placa, 6)
    m.caixa("placa", (0, 0, 1.75), (1.4, 0.08, 0.7), pal["time"], placa, 0.01)
    # needle meter on its panel, and the grid pole with insulators in the corner
    painel = estragos.grupo("painel", (4.0, -3.5, 0.12), "detalhe")
    m.caixa("painel_caixa", (0, 0, 1.0), (1.2, 0.3, 2.0), pal["branco"], painel, 0.03)
    m.cilindro("medidor", (0, -0.17, 1.4), 0.38, 0.05, pal["branco"], painel, (math.radians(90), 0, 0), 24)
    m.caixa("ponteiro", (0.12, -0.21, 1.48), (0.3, 0.02, 0.04), pal["escuro"], painel, 0.0, (0, math.radians(-30), 0))
    poste = estragos.grupo("poste", (5.2, 3.2, 0.12), "alto", queda=45)
    m.cilindro("poste_fuste", (0, 0, 3.0), 0.16, 6.0, pal["concreto"], poste, vertices=12)
    m.caixa("poste_cruzeta", (0, 0, 5.7), (0.15, 1.8, 0.15), pal["concreto"], poste, 0.02)
    for y in (-0.75, 0, 0.75):
        m.cilindro(f"isolador{y:+.2f}", (0, y, 5.92), 0.07, 0.3, pal["branco"], poste, vertices=10)
    estragos.detritos(pal, *PEGADA, 18)
    m.ponto("topo", (0, 0, 6.5), raiz)
    m.ponto("doca", (-3.0, -4.4, 0.0), raiz)
    return {"raiz": raiz, "estragos": estragos}


def posar(ctx, modelo, animacao, quadro):
    modelo["estragos"].aplicar(animacao)
