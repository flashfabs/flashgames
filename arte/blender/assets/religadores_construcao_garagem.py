# SPDX-License-Identifier: GPL-3.0-or-later
"""Garagem, gray kit (brief arte/briefs/religadores-construcao-garagem.md): the vehicle workshop, a long shed with
an arched sheet-metal roof (the shape that reads first) and two wide roll-up doors in front under a painted lintel;
in the concrete yard an inspection pit and a car lift, a pile of tyres and an oil drum, a skylight on the arch."""

import math

from comum import cinza
from comum import modelagem as m

PEGADA = (4, 3)
DESCRICAO = cinza.descricao_construcao("religadores-construcao-garagem", "religadores/garagem", "religadores", PEGADA, 8.0, produz=True)


def construir(ctx):
    pal = cinza.Paleta(ctx, "religadores")
    raiz = m.vazio("raiz")
    estragos = cinza.Estragos(raiz, 53)
    cinza.laje("patio", *PEGADA, pal["concreto"], raiz)
    paredes = estragos.grupo("paredes", (0, 1.2, 0.12), "parede")
    for x in (-7.0, 7.0):
        m.caixa(f"parede_lado{x:+.0f}", (x, 0, 1.3), (0.3, 8.6, 2.6), pal["branco"], paredes, 0.03)
    m.caixa("parede_fundo", (0, 4.15, 1.3), (14.0, 0.3, 2.6), pal["branco"], paredes, 0.03)
    # front gable under the arch with the two roll-up doors and the painted lintel
    m.caixa("fachada", (0, -4.15, 2.0), (14.0, 0.3, 4.0), pal["branco"], paredes, 0.03)
    for x in (-3.4, 3.4):
        m.caixa(f"porta{x:+.0f}", (x, -4.32, 1.75), (5.0, 0.06, 3.5), pal["concreto"], paredes, 0.01)
        for k in range(7):
            m.caixa(f"porta{x:+.0f}_gomo{k}", (x, -4.36, 0.3 + k * 0.48), (5.0, 0.02, 0.05), pal["metal"], paredes, 0.0)
    m.caixa("verga", (0, -4.34, 3.85), (14.0, 0.05, 0.5), pal["time"], paredes, 0.0)
    telhado = estragos.grupo("arco", (0, 1.2, 2.72), "telhado", queda=90)
    cinza.arco("arco_chapa", (0, 0, 0), 14.4, 4.6, 8.9, pal["aluminio"], telhado, 20)
    m.caixa("claraboia", (0, 0, 4.62), (1.6, 6.0, 0.08), pal["vidro"], telhado, 0.0)
    m.barra("bandeira_haste", (0, -4.0, 4.4), (0, -4.0, 6.2), 0.04, pal["metal"], telhado, 6)
    m.caixa("bandeira", (-0.5, -4.0, 5.85), (1.0, 0.03, 0.6), pal["time"], telhado, 0.0)
    # yard in front: inspection pit, lift, tyres and a drum
    m.caixa("fosso", (-3.4, -5.3, 0.13), (2.6, 1.0, 0.02), pal["escuro"], raiz, 0.0)
    elevador = estragos.grupo("elevador", (3.4, -5.3, 0.12), "detalhe")
    for x in (-1.1, 1.1):
        m.caixa(f"elevador_coluna{x:+.0f}", (x, 0, 1.1), (0.25, 0.25, 2.2), pal["laranja"], elevador, 0.02)
    m.caixa("elevador_braco", (0, 0, 1.0), (2.4, 0.5, 0.12), pal["metal"], elevador, 0.01)
    pneus = estragos.grupo("pneus", (6.8, -5.0, 0.12), "detalhe")
    for k in range(4):
        m.toro(f"pneu{k}", (0, 0, 0.15 + 0.24 * k), 0.42, 0.14, pal["pneu"], pneus)
    m.cilindro("tambor", (-6.7, -5.2, 0.6), 0.32, 0.95, pal["cobalto"], raiz, vertices=14)
    estragos.detritos(pal, *PEGADA, 20)
    m.ponto("saida", (-3.4, -6.4, 0.0), raiz)
    m.ponto("cabo", (7.0, 5.0, 3.0), raiz)
    m.ponto("topo", (0, 1.2, 7.5), raiz)
    return {"raiz": raiz, "estragos": estragos}


def posar(ctx, modelo, animacao, quadro):
    modelo["estragos"].aplicar(animacao)
