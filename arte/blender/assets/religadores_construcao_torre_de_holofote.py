# SPDX-License-Identifier: GPL-3.0-or-later
"""Torre de Holofote, gray kit (brief arte/briefs/religadores-construcao-torre-de-holofote.md): the light defence,
a tubular tower about two cells tall with a small armoured booth on top; the searchlight on its fork and the
rotating pin gun under the booth turn together as the turret layer (16 directions), the booth stays."""

import math

from comum import cinza
from comum import modelagem as m

PEGADA = (2, 2)
ALTURA = 7.4
DESCRICAO = cinza.descricao_construcao("religadores-construcao-torre-de-holofote", "religadores/torre-de-holofote", "religadores",
                                       PEGADA, 10.0, torre=((256, 288), (128, 228)))


def construir(ctx):
    pal = cinza.Paleta(ctx, "religadores")
    raiz = m.vazio("raiz")
    estragos = cinza.Estragos(raiz, 61)
    cinza.laje("base", *PEGADA, pal["concreto"], raiz)
    fuste = estragos.grupo("fuste", (0, 0, 0.12), "alto", queda=330)
    m.cilindro("tubo", (0, 0, ALTURA / 2), 0.38, ALTURA, pal["concreto"], fuste, vertices=16)
    for k in range(3):
        angulo = 2 * math.pi * k / 3
        m.barra(f"escora{k}", (1.6 * math.cos(angulo), 1.6 * math.sin(angulo), 0), (0.3 * math.cos(angulo), 0.3 * math.sin(angulo), 3.2), 0.07,
                pal["metal"], fuste, 6)
    for k in range(12):
        m.barra(f"degrau{k}", (0.4, -0.25, 0.4 + k * 0.55), (0.4, 0.25, 0.4 + k * 0.55), 0.02, pal["metal"], fuste, 4)
    m.caixa("guarita", (0, 0, ALTURA + 0.85), (2.0, 2.0, 1.5), pal["branco"], fuste, 0.06)
    m.caixa("guarita_teto", (0, 0, ALTURA + 1.65), (2.2, 2.2, 0.12), pal["time"], fuste, 0.02)
    for k in range(4):
        angulo = math.pi / 2 * k
        m.caixa(f"visor{k}", (1.01 * math.cos(angulo), 1.01 * math.sin(angulo), ALTURA + 1.05), (0.04 + 0.8 * abs(math.sin(angulo)), 0.04 + 0.8 * abs(math.cos(angulo)), 0.22),
                pal["vidro"], fuste, 0.0)
    m.barra("antena", (0.8, 0.8, ALTURA + 1.7), (0.8, 0.8, ALTURA + 2.8), 0.02, pal["metal"], fuste, 4)
    m.caixa("bandeirola", (0.55, 0.8, ALTURA + 2.65), (0.5, 0.02, 0.25), pal["time"], fuste, 0.0)
    m.ponto("cabo", (0, 0, 3.0), fuste)
    m.ponto("topo", (0, 0, ALTURA + 3.0), raiz)
    m.ponto("encaixe_torre", (0, 0, 0), raiz)
    # turret: the ring under the booth with the pin gun and, on its own fork, the searchlight
    torre = m.vazio("torre_pivo", (0, 0, 0), raiz, camada="torre")
    m.cilindro("anel", (0, 0, ALTURA - 0.15), 0.62, 0.22, pal["escuro"], torre)
    m.caixa("pregadeira", (0.75, 0, ALTURA - 0.35), (0.8, 0.32, 0.3), pal["cobalto"], torre, 0.03)
    m.cilindro("pregadeira_cano", (1.35, 0, ALTURA - 0.33), 0.07, 0.6, pal["escuro"], torre, (0, math.radians(90), 0), 10)
    m.barra("garfo", (-0.4, 0.9, ALTURA - 0.2), (-0.4, 0.9, ALTURA + 0.6), 0.05, pal["metal"], torre, 6)
    m.cilindro("holofote", (-0.2, 0.9, ALTURA + 0.65), 0.38, 0.45, pal["metal"], torre, (0, math.radians(90), 0), 16)
    m.cilindro("holofote_lente", (0.05, 0.9, ALTURA + 0.65), 0.33, 0.04, pal["luz"], torre, (0, math.radians(90), 0), 16)
    m.ponto("boca", (1.7, 0, ALTURA - 0.33), torre)
    estragos.detritos(pal, *PEGADA, 8)
    return {"raiz": raiz, "estragos": estragos}


def posar(ctx, modelo, animacao, quadro):
    modelo["estragos"].aplicar(animacao if animacao not in ("torre", "atirando") else "pronta")
