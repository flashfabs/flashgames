# SPDX-License-Identifier: GPL-3.0-or-later
"""Poste Avançado, gray kit (brief arte/briefs/religadores-construcao-poste-avancado.md): the forward post, a
thicker pole with a transformer and fuse switch next to a short container open on one side with a battery rack
and a small tarp, a simple loading dock and a tall mast with a flag (the highest part), all on a concrete base
ringed with cones and striped tape, like a work site that never ends."""

import math

from comum import cinza
from comum import modelagem as m

PEGADA = (2, 2)
DESCRICAO = cinza.descricao_construcao("religadores-construcao-poste-avancado", "religadores/poste-avancado", "religadores", PEGADA, 10.0)


def construir(ctx):
    pal = cinza.Paleta(ctx, "religadores")
    raiz = m.vazio("raiz")
    estragos = cinza.Estragos(raiz, 43)
    cinza.laje("base", *PEGADA, pal["concreto"], raiz)
    conteiner = estragos.grupo("conteiner", (0.6, 0.9, 0.12), "parede")
    m.caixa("conteiner_fundo", (0, 1.05, 1.3), (4.2, 0.1, 2.6), pal["branco"], conteiner, 0.02)
    for x in (-2.05, 2.05):
        m.caixa(f"conteiner_lado{x:+.0f}", (x, 0, 1.3), (0.1, 2.2, 2.6), pal["time"], conteiner, 0.02)
    m.caixa("conteiner_teto", (0, 0, 2.62), (4.2, 2.2, 0.1), pal["branco"], conteiner, 0.02)
    for k, x in enumerate((-1.2, 0.0, 1.2)):
        m.caixa(f"rack{k}", (x, 0.4, 0.8), (1.0, 0.6, 1.5), pal["cobalto"], conteiner, 0.03)
    lona = estragos.grupo("lona", (0.6, -0.9, 2.3), "telhado")
    m.caixa("lona_azul", (0, 0, 0), (3.6, 1.6, 0.05), pal["cobalto"], lona, 0.0, (math.radians(-12), 0, 0))
    m.caixa("doca", (0.6, -2.6, 0.35), (2.6, 1.2, 0.5), pal["concreto"], raiz, 0.03)
    poste = estragos.grupo("poste", (-2.6, -2.2, 0.12), "alto", queda=200)
    m.cilindro("poste_fuste", (0, 0, 3.6), 0.25, 7.2, pal["concreto"], poste, vertices=12)
    m.cilindro("transformador", (0.3, 0, 5.2), 0.42, 1.0, pal["metal"], poste, vertices=14)
    m.caixa("chave_fusivel", (-0.3, 0, 6.2), (0.12, 0.12, 0.6), pal["escuro"], poste, 0.0)
    m.caixa("cruzeta", (0, 0, 6.9), (0.16, 2.0, 0.16), pal["concreto"], poste, 0.02)
    m.ponto("cabo", (0, 0, 7.0), poste)
    mastro = estragos.grupo("mastro", (2.9, -2.9, 0.12), "alto", queda=20)
    m.barra("mastro_haste", (0, 0, 0), (0, 0, 9.4), 0.06, pal["aluminio"], mastro, 8)
    m.caixa("bandeira", (-0.6, 0, 8.9), (1.2, 0.03, 0.75), pal["time"], mastro, 0.0)
    for k in range(6):
        angulo = 2 * math.pi * k / 6 + 0.3
        cone = estragos.grupo(f"cone{k}", (3.4 * math.cos(angulo), 3.4 * math.sin(angulo), 0.12), "detalhe")
        m.cone(f"cone{k}_corpo", (0, 0, 0.35), 0.22, 0.04, 0.7, pal["laranja"], cone, vertices=10)
        m.cilindro(f"cone{k}_faixa", (0, 0, 0.4), 0.15, 0.12, pal["branco"], cone, vertices=10)
    estragos.detritos(pal, *PEGADA, 10)
    m.ponto("topo", (0, 0, 7.5), raiz)
    return {"raiz": raiz, "estragos": estragos}


def posar(ctx, modelo, animacao, quadro):
    modelo["estragos"].aplicar(animacao)
