# SPDX-License-Identifier: GPL-3.0-or-later
"""Poste, gray kit (brief arte/briefs/religadores-construcao-poste.md): the grid extension, the simplest and most
repeated piece of the base: a thin, tall concrete pole with a cross-arm and three insulators on top, a number
plate and a painted band halfway up; medium contrast and no small detail, so it never competes with the units."""

from comum import cinza
from comum import modelagem as m

PEGADA = (1, 1)
DESCRICAO = cinza.descricao_construcao("religadores-construcao-poste", "religadores/poste", "religadores", PEGADA, 7.0)


def construir(ctx):
    pal = cinza.Paleta(ctx, "religadores")
    raiz = m.vazio("raiz")
    estragos = cinza.Estragos(raiz, 41)
    m.cilindro("base", (0, 0, 0.08), 0.5, 0.16, pal["concreto"], raiz, vertices=12)
    poste = estragos.grupo("poste", (0, 0, 0.16), "alto", queda=300)
    m.cone("fuste", (0, 0, 3.3), 0.2, 0.13, 6.6, pal["concreto"], poste, vertices=12)
    m.caixa("faixa", (0, 0, 2.8), (0.38, 0.38, 0.45), pal["time"], poste, 0.0)
    m.caixa("plaqueta", (0, -0.19, 2.1), (0.26, 0.03, 0.34), pal["time"], poste, 0.0)
    m.caixa("cruzeta", (0, 0, 6.2), (0.14, 1.9, 0.14), pal["concreto"], poste, 0.02)
    for y in (-0.8, 0.0, 0.8):
        m.cilindro(f"isolador{y:+.1f}", (0, y, 6.42), 0.07, 0.3, pal["branco"], poste, vertices=10)
    m.ponto("cabo", (0, 0, 6.45), poste)
    m.ponto("topo", (0, 0, 6.8), poste)
    estragos.detritos(pal, *PEGADA, 5)
    return {"raiz": raiz, "estragos": estragos}


def posar(ctx, modelo, animacao, quadro):
    modelo["estragos"].aplicar(animacao)
