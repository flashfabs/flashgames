# SPDX-License-Identifier: GPL-3.0-or-later
"""Ponte Basculante, gray kit (brief arte/briefs/neutro-estrutura-ponte-basculante.md): a neutral passage to switch
back on, two concrete abutments, one on each bank, and a riveted steel truss deck that turns on a hinge at the south
abutment, with a huge concrete counterweight behind the hinge; on the south bank a small machine house with windows,
barriers and bridge signals. Raised, the deck points at the sky at about 70 degrees, the tallest and strangest shape
of the valley; lowered, it is an ordinary bridge over the river (north-south, over a river running west to east).
The team areas (barriers and a band on the machine house) only show when it is switched on."""

import math

from comum import cinza
from comum import modelagem as m

anim = cinza.anim
PEGADA = (2, 7)
VAO = 20.0
DESCRICAO = cinza.descricao_construcao("neutro-estrutura-ponte-basculante", "neutro/ponte-basculante", "neutro", PEGADA, 21.0,
                                       estados=("morta", "religada"), categoria="estrutura", folga_lados=(16, 200, 0, 0))
DESCRICAO["animacoes"] += [anim("religando", "corpo", 1, 0, True, igual="morta"), anim("baixando", "corpo", 2, 4, False)]
ERGUIDA, BAIXANDO = 70, (45, 18)


def construir(ctx):
    pal = cinza.Paleta(ctx, "neutro")
    raiz = m.vazio("raiz")
    for nome, y in (("cabeceira_sul", -12.0), ("cabeceira_norte", 12.0)):
        m.caixa(nome, (0, y, 0.8), (8.0, 4.0, 1.6), pal["concreto"], raiz, 0.05)
    eixo = m.vazio("articulacao", (0, -10.0, 1.6), raiz)
    for lado in (-1, 1):
        m.barra(f"banzo_baixo{lado:+d}", (lado * 3.3, 0, 0), (lado * 3.3, VAO, 0), 0.18, pal["ferro"], eixo, 6)
        m.barra(f"banzo_alto{lado:+d}", (lado * 3.3, 1.5, 2.2), (lado * 3.3, VAO - 1.5, 2.2), 0.15, pal["ferro"], eixo, 6)
        for k in range(9):
            y0, y1 = k * VAO / 9, (k + 1) * VAO / 9
            m.barra(f"diagonal{lado:+d}{k}", (lado * 3.3, y0, 0), (lado * 3.3, (y0 + y1) / 2, 2.2), 0.08, pal["metal"], eixo, 4)
            m.barra(f"diagonal_b{lado:+d}{k}", (lado * 3.3, (y0 + y1) / 2, 2.2), (lado * 3.3, y1, 0), 0.08, pal["metal"], eixo, 4)
    m.caixa("tabuleiro", (0, VAO / 2, 0.05), (6.4, VAO, 0.25), pal["metal"], eixo, 0.02)
    m.caixa("contrapeso", (0, -2.2, -0.4), (6.0, 3.0, 3.4), pal["concreto"], eixo, 0.06)
    casa = m.vazio("casa_de_maquinas", (6.2, -11.5, 0), raiz)
    m.caixa("casa", (0, 0, 1.6), (3.6, 3.6, 3.2), pal["branco"], casa, 0.05)
    m.caixa("casa_teto", (0, 0, 3.3), (3.9, 3.9, 0.2), pal["metal"], casa, 0.02)
    for k in range(3):
        m.caixa(f"casa_janela{k}", (-1.0 + k * 1.0, -1.81, 2.2), (0.6, 0.04, 0.6), pal["vidro"], casa, 0.0)
    faixa_morta = m.caixa("faixa_morta", (0, -1.82, 1.2), (3.6, 0.03, 0.3), pal["concreto"], casa, 0.0)
    faixa = m.caixa("faixa", (0, -1.83, 1.2), (3.6, 0.03, 0.3), pal["time"], casa, 0.0)
    luzes = [m.esfera(f"semaforo{k}", (2.0 * k - 1.0, -13.9, 3.2), 0.18, pal["luz"], raiz, segmentos=10) for k in range(2)]
    for k in range(2):
        m.barra(f"semaforo_poste{k}", (2.0 * k - 1.0, -13.9, 0), (2.0 * k - 1.0, -13.9, 3.0), 0.05, pal["metal"], raiz, 6)
    cancelas = []
    for k, x in enumerate((-3.6, 3.6)):
        cancela = m.vazio(f"cancela{k}", (x, -13.4, 1.0), raiz)
        mortas = m.caixa(f"cancela{k}_morta", (-math.copysign(1.4, x), 0, 0), (2.8, 0.1, 0.12), pal["concreto"], cancela, 0.0)
        vivas = m.caixa(f"cancela{k}_viva", (-math.copysign(1.4, x), 0, 0), (2.8, 0.1, 0.12), pal["time"], cancela, 0.0)
        cancelas.append((cancela, mortas, vivas))
    m.ponto("religar", (6.2, -13.8, 0.0), raiz)
    m.ponto("topo", (0, 0, 4.0), raiz)
    return {"raiz": raiz, "eixo": eixo, "mascaras": [(faixa_morta, faixa)] + [(c[1], c[2]) for c in cancelas], "cancelas": cancelas, "luzes": luzes}


def posar(ctx, modelo, animacao, quadro):
    viva = animacao in ("religada", "baixando")
    angulo = {"morta": ERGUIDA, "religada": 0}.get(animacao, BAIXANDO[quadro] if animacao == "baixando" else ERGUIDA)
    modelo["eixo"].rotation_euler = (math.radians(angulo), 0, 0)
    for morta, vivo in modelo["mascaras"]:
        morta.scale = (0, 0, 0) if viva else (1, 1, 1)
        vivo.scale = (1, 1, 1) if viva else (0, 0, 0)
    for cancela, _, _ in modelo["cancelas"]:
        # closed across the road when dead, raised open when switched on and down
        cancela.rotation_euler = (0, 0 if animacao != "religada" else math.radians(-80), 0)
    for luz in modelo["luzes"]:
        luz.scale = (1, 1, 1) if viva else (0, 0, 0)
