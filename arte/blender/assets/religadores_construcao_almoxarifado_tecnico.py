# SPDX-License-Identifier: GPL-3.0-or-later
"""Almoxarifado Técnico, gray kit (brief arte/briefs/religadores-construcao-almoxarifado-tecnico.md): the tech
building, a flat-roofed shed with one whole side open on tall pallet racks full of boxes, a test bench inside a
wire cage in one corner, a requisition window at the front with a parked forklift, and a short mast on the roof
with a windsock and a lab antenna."""

import math

from comum import cinza
from comum import modelagem as m

anim = cinza.anim
PEGADA = (3, 3)
DESCRICAO = cinza.descricao_construcao("religadores-construcao-almoxarifado-tecnico", "religadores/almoxarifado-tecnico", "religadores",
                                       PEGADA, 8.0, extras=[anim("pesquisando", "corpo", 1, 0, True, igual="pronta")])


def construir(ctx):
    pal = cinza.Paleta(ctx, "religadores")
    raiz = m.vazio("raiz")
    estragos = cinza.Estragos(raiz, 67)
    cinza.laje("patio", *PEGADA, pal["concreto"], raiz)
    paredes = estragos.grupo("paredes", (0.6, 0.8, 0.12), "parede")
    m.caixa("parede_fundo", (0, 3.6, 2.0), (9.8, 0.3, 4.0), pal["branco"], paredes, 0.03)
    m.caixa("parede_oeste", (-4.75, 0, 2.0), (0.3, 7.5, 4.0), pal["branco"], paredes, 0.03)
    m.caixa("parede_frente", (-2.4, -3.6, 2.0), (4.4, 0.3, 4.0), pal["branco"], paredes, 0.03)
    m.caixa("guiche", (-2.4, -3.78, 1.4), (1.4, 0.06, 0.8), pal["vidro"], paredes, 0.0)
    # the open east side: tall pallet racks full of boxes
    for k, y in enumerate((2.4, 0.4, -1.6)):
        for nivel in range(3):
            m.caixa(f"prateleira{k}{nivel}", (3.2, y, 0.25 + nivel * 1.25), (2.6, 1.2, 0.08), pal["laranja"], paredes, 0.0)
            for c in range(3):
                m.caixa(f"caixa{k}{nivel}{c}", (2.4 + c * 0.8, y, 0.62 + nivel * 1.25), (0.65, 1.0, 0.65), pal["madeira" if (c + nivel) % 2 else "lona"],
                        paredes, 0.02)
        for x in (1.95, 4.45):
            m.barra(f"montante{k}{x:+.1f}", (x, y - 0.55, 0), (x, y - 0.55, 3.8), 0.05, pal["cobalto"], paredes, 4)
    # the test bench in its wire cage
    gaiola = estragos.grupo("gaiola", (-3.2, 2.0, 0.12), "detalhe")
    m.caixa("bancada", (0, 0, 0.5), (1.8, 1.0, 1.0), pal["metal"], gaiola, 0.02)
    for x in (-1.0, 1.0):
        for y in (-0.6, 0.6):
            m.barra(f"gaiola_poste{x:+.0f}{y:+.0f}", (x, y, 0), (x, y, 2.4), 0.025, pal["aluminio"], gaiola, 4)
    for z in (0.8, 1.6, 2.4):
        for k, (a, b) in enumerate((((-1, -0.6), (1, -0.6)), ((1, -0.6), (1, 0.6)), ((1, 0.6), (-1, 0.6)), ((-1, 0.6), (-1, -0.6)))):
            m.barra(f"gaiola_fio{z}{k}", (a[0], a[1], z), (b[0], b[1], z), 0.015, pal["aluminio"], gaiola, 4)
    telhado = estragos.grupo("telhado", (0.6, 0.8, 4.12), "telhado", queda=120)
    m.caixa("laje_teto", (0, 0, 0.1), (10.2, 7.8, 0.2), pal["concreto"], telhado, 0.03)
    m.caixa("platibanda", (0, -3.9, 0.35), (10.2, 0.15, 0.5), pal["time"], telhado, 0.0)
    m.barra("mastro", (-3.5, 2.5, 0.2), (-3.5, 2.5, 3.0), 0.04, pal["metal"], telhado, 6)
    m.cone("biruta", (-3.1, 2.5, 2.85), 0.22, 0.08, 0.9, pal["time"], telhado, (0, math.radians(95), 0), 12)
    m.barra("antena", (2.5, 2.0, 0.2), (2.5, 2.0, 2.4), 0.025, pal["metal"], telhado, 4)
    m.caixa("antena_prato", (2.5, 2.0, 2.4), (0.6, 0.6, 0.05), pal["aluminio"], telhado, 0.0, (math.radians(30), 0, 0))
    empilhadeira = estragos.grupo("empilhadeira", (0.6, -4.9, 0.12), "detalhe")
    m.caixa("empilhadeira_corpo", (0, 0, 0.6), (1.6, 1.0, 0.9), pal["laranja"], empilhadeira, 0.05)
    m.caixa("empilhadeira_teto", (-0.1, 0, 1.9), (1.0, 0.9, 0.05), pal["metal"], empilhadeira, 0.0)
    for x in (-0.55, 0.35):
        for y in (-0.42, 0.42):
            m.barra(f"empilhadeira_haste{x:+.1f}{y:+.1f}", (x, y, 1.0), (x, y, 1.9), 0.03, pal["metal"], empilhadeira, 4)
    m.caixa("empilhadeira_garfo", (1.05, 0, 0.3), (0.6, 0.6, 0.05), pal["metal"], empilhadeira, 0.0)
    estragos.detritos(pal, *PEGADA, 16)
    m.ponto("cabo", (-4.75, 4.0, 4.4), raiz)
    m.ponto("topo", (0.6, 0.8, 7.0), raiz)
    return {"raiz": raiz, "estragos": estragos}


def posar(ctx, modelo, animacao, quadro):
    modelo["estragos"].aplicar(animacao if animacao != "pesquisando" else "pronta")
