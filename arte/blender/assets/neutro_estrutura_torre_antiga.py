# SPDX-License-Identifier: GPL-3.0-or-later
"""Torre Antiga, gray kit (brief arte/briefs/neutro-estrutura-torre-antiga.md): a neutral defence to switch back
on, a tall cylindrical concrete shaft with a wider cabin on top (slit windows) and a motorised turret on the cabin
roof, a caged ladder up the shaft, an antenna and a signal lamp. Dead, vines climb halfway, the windows are dark
and the turret hangs down; switched on, the turret (its own layer, 16 directions) stands up and the lamp lights.
The team areas (lamp and the panel of the power box) only show in the switched-on state; dead, they are grey."""

import math

from comum import cinza
from comum import modelagem as m

anim = cinza.anim
PEGADA = (2, 2)
ALTURA = 9.5
DESCRICAO = cinza.descricao_construcao("neutro-estrutura-torre-antiga", "neutro/torre-antiga", "neutro", PEGADA, 13.5,
                                       torre=((224, 320), (112, 280)), estados=("morta", "religada", "danificada", "destruida"),
                                       categoria="estrutura")


def construir(ctx):
    pal = cinza.Paleta(ctx, "neutro")
    raiz = m.vazio("raiz")
    estragos = cinza.Estragos(raiz, 107)
    cinza.laje("base", *PEGADA, pal["concreto"], raiz)
    fuste = estragos.grupo("fuste", (0, 0, 0.12), "alto", queda=240)
    m.cilindro("fuste_concreto", (0, 0, ALTURA / 2), 0.95, ALTURA, pal["concreto"], fuste, vertices=20)
    m.cilindro("cabine", (0, 0, ALTURA + 0.9), 1.6, 1.8, pal["concreto"], fuste, vertices=20)
    m.cilindro("cabine_teto", (0, 0, ALTURA + 1.85), 1.7, 0.12, pal["metal"], fuste, vertices=20)
    janelas = []
    for k in range(6):
        angulo = 2 * math.pi * k / 6
        janelas.append(m.caixa(f"janela{k}", (1.58 * math.cos(angulo), 1.58 * math.sin(angulo), ALTURA + 1.0), (0.1, 0.5, 0.18), pal["vidro"], fuste, 0.0,
                               (0, 0, angulo)))
    acesas = [m.caixa(f"janela_acesa{k}", (1.6 * math.cos(2 * math.pi * k / 6), 1.6 * math.sin(2 * math.pi * k / 6), ALTURA + 1.0), (0.1, 0.48, 0.16),
                      pal["luz"], fuste, 0.0, (0, 0, 2 * math.pi * k / 6)) for k in range(6)]
    for k in range(14):
        m.barra(f"gaiola{k}", (0.95, -0.35, 0.6 + k * 0.62), (0.95, 0.35, 0.6 + k * 0.62), 0.02, pal["metal"], fuste, 4)
    for y in (-0.35, 0.35):
        m.barra(f"gaiola_banzo{y:+.2f}", (1.05, y, 0.4), (1.05, y, ALTURA), 0.025, pal["metal"], fuste, 4)
    m.barra("antena", (-0.9, 0.6, ALTURA + 1.9), (-0.9, 0.6, ALTURA + 3.6), 0.03, pal["metal"], fuste, 4)
    lampada_morta = m.esfera("lampada_morta", (-0.9, 0.6, ALTURA + 3.7), 0.15, pal["concreto"], fuste, segmentos=10)
    lampada = m.esfera("lampada", (-0.9, 0.6, ALTURA + 3.7), 0.15, pal["time"], fuste, segmentos=10)
    trepadeiras = [m.esfera(f"trepadeira{k}", (0.95 * math.cos(a), 0.95 * math.sin(a), z), 0.45, pal["oliva"], fuste, (0.5, 1.0, 1.6), segmentos=10)
                   for k, (a, z) in enumerate(((3.6, 1.5), (4.3, 3.0), (2.9, 4.2), (5.1, 2.2), (3.9, 5.0)))]
    torreta_caida = m.vazio("torreta_caida", (0.6, 0, ALTURA + 1.95), fuste, rotacao=(0, math.radians(35), 0))
    m.cilindro("torreta_caida_base", (0, 0, 0.2), 0.6, 0.4, pal["metal"], torreta_caida)
    m.cilindro("torreta_caida_cano", (0.7, 0, 0.25), 0.09, 1.2, pal["escuro"], torreta_caida, (0, math.radians(90), 0), 10)
    caixa = estragos.grupo("caixa_forca", (1.6, -1.8, 0.12), "detalhe")
    m.caixa("caixa", (0, 0, 0.7), (1.0, 0.6, 1.4), pal["metal"], caixa, 0.03)
    painel_morto = m.caixa("painel_morto", (0, -0.31, 0.8), (0.6, 0.03, 0.7), pal["concreto"], caixa, 0.0)
    painel = m.caixa("painel", (0, -0.31, 0.8), (0.6, 0.03, 0.7), pal["time"], caixa, 0.0)
    m.ponto("topo", (0, 0, ALTURA + 4.0), raiz)
    m.ponto("encaixe_torre", (0, 0, 0), raiz)
    m.ponto("religar", (1.6, -2.3, 0.0), raiz)
    torre = m.vazio("torre_pivo", (0, 0, 0), raiz, camada="torre")
    m.cilindro("torreta_base", (0, 0, ALTURA + 2.15), 0.6, 0.4, pal["metal"], torre)
    m.caixa("torreta_corpo", (0.1, 0, ALTURA + 2.55), (1.0, 0.8, 0.5), pal["metal"], torre, 0.05)
    cano = m.vazio("torreta_cano", (0.6, 0, ALTURA + 2.55), torre)
    m.cilindro("torreta_cano_tubo", (0.6, 0, 0), 0.09, 1.2, pal["escuro"], cano, (0, math.radians(90), 0), 10)
    m.ponto("boca", (1.25, 0, 0), cano)
    estragos.detritos(pal, *PEGADA, 10)
    return {"raiz": raiz, "estragos": estragos, "acesas": acesas, "trepadeiras": trepadeiras, "torreta_caida": torreta_caida,
            "lampadas": (lampada_morta, lampada), "paineis": (painel_morto, painel), "cano": cano}


def posar(ctx, modelo, animacao, quadro):
    viva = animacao in ("religada", "torre", "atirando", "danificada")
    modelo["estragos"].aplicar(animacao if animacao in ("danificada", "destruida") else "pronta")
    for obj in modelo["acesas"]:
        obj.scale = (1, 1, 1) if viva else (0, 0, 0)
    for k, obj in enumerate(modelo["trepadeiras"]):
        obj.scale = (1, 1, 1) if not viva or k < 2 else (0, 0, 0)
    modelo["torreta_caida"].scale = (0, 0, 0) if viva else (1, 1, 1)
    for morto, vivo in (modelo["lampadas"], modelo["paineis"]):
        morto.scale = (0, 0, 0) if viva else (1, 1, 1)
        vivo.scale = (1, 1, 1) if viva else (0, 0, 0)
    modelo["cano"].location = (0.6 - (0.2 if animacao == "atirando" and quadro == 0 else 0), 0, ALTURA + 2.55)
