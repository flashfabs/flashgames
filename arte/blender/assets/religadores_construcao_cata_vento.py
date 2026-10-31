# SPDX-License-Identifier: GPL-3.0-or-later
"""Cata-vento, gray kit (brief arte/briefs/religadores-construcao-cata-vento.md): income from the wind, a thin
lattice tower about two cells tall with a rotor of three wide blades cut from half drums and a tail vane, and a
battery box with a meter at its foot. The only building with parts always turning: the ready loop turns the
rotor slowly, the gust plays the same frames faster, the damaged one has lost a blade."""

import math

from comum import cinza
from comum import modelagem as m

anim = cinza.anim
PEGADA = (2, 2)
ALTURA_ROTOR = 8.4
DESCRICAO = cinza.descricao_construcao("religadores-construcao-cata-vento", "religadores/cata-vento", "religadores", PEGADA, 10.5,
                                       estados=("danificada", "destruida"))
# rotor at 0 and 60 degrees: with three blades two frames make the turn
DESCRICAO["animacoes"][:0] = [anim("pronta", "corpo", 2, 4, True), anim("rajada", "corpo", 2, 12, True, igual="pronta")]


def construir(ctx):
    pal = cinza.Paleta(ctx, "religadores")
    raiz = m.vazio("raiz")
    estragos = cinza.Estragos(raiz, 59)
    cinza.laje("base", *PEGADA, pal["concreto"], raiz)
    torre = estragos.grupo("torre", (0, 0.4, 0.12), "alto", queda=315)
    pernas = [(-1.4, -1.4), (1.4, -1.4), (1.4, 1.4), (-1.4, 1.4)]
    topo = 0.35
    for k, (x, y) in enumerate(pernas):
        m.barra(f"perna{k}", (x, y, 0), (x * topo, y * topo, ALTURA_ROTOR - 0.3), 0.07, pal["metal"], torre, 6)
    for nivel in range(1, 5):
        z = nivel * (ALTURA_ROTOR - 0.3) / 5
        f = 1 - (1 - topo) * z / (ALTURA_ROTOR - 0.3)
        for k in range(4):
            a, b = pernas[k], pernas[(k + 1) % 4]
            m.barra(f"travessa{nivel}{k}", (a[0] * f, a[1] * f, z), (b[0] * f, b[1] * f, z), 0.035, pal["metal"], torre, 4)
    # the rotor faces south, towards the camera, so its turning shows
    nacele = m.vazio("nacele", (0, 0, ALTURA_ROTOR - 0.2), torre, rotacao=(0, 0, math.radians(-90)))
    m.caixa("nacele_caixa", (0, 0, 0.2), (1.2, 0.5, 0.5), pal["branco"], nacele, 0.04)
    m.barra("cauda", (-0.4, 0, 0.25), (-2.2, 0, 0.35), 0.05, pal["metal"], nacele, 6)
    m.caixa("leme", (-2.3, 0, 0.6), (0.9, 0.04, 1.0), pal["time"], nacele, 0.01)
    rotor = m.vazio("rotor", (0.75, 0, 0.25), nacele)
    m.cilindro("cubo", (0, 0, 0), 0.22, 0.3, pal["escuro"], rotor, (0, math.radians(90), 0), 12)
    pas = []
    for k in range(3):
        pa = m.vazio(f"pa{k}", (0, 0, 0), rotor, rotacao=(math.radians(120 * k), 0, 0))
        # half a drum: a curved, wide blade
        m.cilindro(f"pa{k}_tambor", (0.05, 0, 1.15), 0.42, 1.8, pal["aluminio"], pa, (0, 0, 0), 16)
        pas.append(pa)
    caixa = estragos.grupo("caixa_baterias", (2.0, -2.0, 0.12), "detalhe")
    m.caixa("caixa", (0, 0, 0.6), (1.5, 1.0, 1.2), pal["cobalto"], caixa, 0.03)
    m.caixa("caixa_porta", (0, -0.51, 0.6), (0.8, 0.03, 0.9), pal["time"], caixa, 0.0)
    m.cilindro("medidor", (0.45, -0.53, 1.0), 0.16, 0.03, pal["branco"], caixa, (math.radians(90), 0, 0), 16)
    estragos.detritos(pal, *PEGADA, 8)
    m.ponto("cabo", (2.0, -2.0, 1.4), raiz)
    m.ponto("topo", (0, 0.4, ALTURA_ROTOR + 1.0), raiz)
    return {"raiz": raiz, "estragos": estragos, "rotor": rotor, "pas": pas}


def posar(ctx, modelo, animacao, quadro):
    modelo["estragos"].aplicar(animacao)
    giro = 60 * quadro if animacao == "pronta" else 15
    modelo["rotor"].rotation_euler = (math.radians(giro), 0, 0)
    # the damaged rotor has lost a blade
    modelo["pas"][2].scale = (0, 0, 0) if animacao in ("danificada", "destruida") else (1, 1, 1)
