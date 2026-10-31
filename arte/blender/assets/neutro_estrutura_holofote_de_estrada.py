# SPDX-License-Identifier: GPL-3.0-or-later
"""Holofote de Estrada, gray kit (brief arte/briefs/neutro-estrutura-holofote-de-estrada.md): a neutral vision
structure, a very tall thin steel mast, about three cells high, with a ring of six floodlights on top and a control
box with a door at its foot. Dead, the paint peels and one floodlight hangs by its wire; switched on, the lights
glow (the pool of light on the ground is the game's). The team areas (box door and a band under the ring) only
show in the switched-on state."""

import math

from comum import cinza
from comum import modelagem as m

PEGADA = (1, 1)
ALTURA = 11.5
DESCRICAO = cinza.descricao_construcao("neutro-estrutura-holofote-de-estrada", "neutro/holofote-de-estrada", "neutro", PEGADA, 13.0,
                                       estados=("morta", "religada", "danificada", "destruida"), categoria="estrutura")


def construir(ctx):
    pal = cinza.Paleta(ctx, "neutro")
    raiz = m.vazio("raiz")
    estragos = cinza.Estragos(raiz, 109)
    m.cilindro("base", (0, 0, 0.15), 0.6, 0.3, pal["concreto"], raiz, vertices=12)
    mastro = estragos.grupo("mastro", (0, 0, 0.3), "alto", queda=290)
    m.cone("mastro_tubo", (0, 0, ALTURA / 2), 0.22, 0.11, ALTURA, pal["metal"], mastro, vertices=12)
    m.cilindro("anel", (0, 0, ALTURA), 0.9, 0.12, pal["metal"], mastro, vertices=16)
    faixa_morta = m.cilindro("faixa_morta", (0, 0, ALTURA - 0.6), 0.14, 0.4, pal["metal"], mastro, vertices=12)
    faixa = m.cilindro("faixa", (0, 0, ALTURA - 0.6), 0.14, 0.4, pal["time"], mastro, vertices=12)
    refletores, lentes = [], []
    for k in range(6):
        angulo = 2 * math.pi * k / 6
        refletor = m.vazio(f"refletor{k}", (0.85 * math.cos(angulo), 0.85 * math.sin(angulo), ALTURA + 0.1), mastro, rotacao=(0, math.radians(30), angulo))
        m.caixa(f"refletor{k}_caixa", (0, 0, 0), (0.25, 0.45, 0.35), pal["escuro"], refletor, 0.02)
        lentes.append(m.caixa(f"refletor{k}_lente", (0.13, 0, 0), (0.02, 0.38, 0.28), pal["luz"], refletor, 0.0))
        refletores.append(refletor)
    caixa = estragos.grupo("caixa", (0.0, -0.75, 0.0), "detalhe")
    m.caixa("caixa_comando", (0, 0, 0.75), (0.8, 0.45, 1.5), pal["metal"], caixa, 0.02)
    porta_morta = m.caixa("porta_morta", (0, -0.24, 0.75), (0.6, 0.03, 1.2), pal["concreto"], caixa, 0.0)
    porta = m.caixa("porta", (0, -0.24, 0.75), (0.6, 0.03, 1.2), pal["time"], caixa, 0.0)
    m.ponto("topo", (0, 0, ALTURA + 0.8), raiz)
    m.ponto("religar", (0, -1.4, 0.0), raiz)
    estragos.detritos(pal, *PEGADA, 5)
    return {"raiz": raiz, "estragos": estragos, "refletores": refletores, "lentes": lentes, "mascaras": ((faixa_morta, faixa), (porta_morta, porta))}


def posar(ctx, modelo, animacao, quadro):
    viva = animacao in ("religada", "danificada")
    modelo["estragos"].aplicar(animacao if animacao in ("danificada", "destruida") else "pronta")
    for k, lente in enumerate(modelo["lentes"]):
        lente.scale = (1, 1, 1) if viva and not (animacao == "danificada" and k in (1, 4)) else (0, 0, 0)
    # dead, one floodlight hangs by its wire
    modelo["refletores"][2].rotation_euler = (0, math.radians(30 if viva else 100), 2 * math.pi * 2 / 6)
    for morto, vivo in modelo["mascaras"]:
        morto.scale = (0, 0, 0) if viva else (1, 1, 1)
        vivo.scale = (1, 1, 1) if viva else (0, 0, 0)
