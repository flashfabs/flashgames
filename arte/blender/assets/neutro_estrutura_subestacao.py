# SPDX-License-Identifier: GPL-3.0-or-later
"""Subestação, gray kit (brief arte/briefs/neutro-estrutura-subestacao.md): the final objective, the biggest set of
the map: a fenced yard with two large transformers (finned bodies and porcelain bushings on top), steel lattice
gantries with stretched busbars, disconnector switches in a row and lightning arresters; in a corner the control
house, a low concrete building with a door and a panel; leaving the yard, a transmission tower where the cables
leave for the valley. Dead, everything is rusty with tall weeds and the switches open (arms up); switching on goes in
stages, and switched on the switches are closed and the bushings and lamps glow. The team areas (gantry signal lamps
and the control panel) only show switched on."""

import math
import random

from comum import cinza
from comum import modelagem as m

anim = cinza.anim
PEGADA = (5, 4)
DESCRICAO = cinza.descricao_construcao("neutro-estrutura-subestacao", "neutro/subestacao", "neutro", PEGADA, 17.0, estados=("morta", "religada"),
                                       categoria="estrutura")
# seen once on the map and about 2 Mpx in uhd: shipped at hd resolution, scaled up in 4K (gray kit budget)
DESCRICAO["uhdComoHd"] = True
DESCRICAO["animacoes"].insert(1, anim("religando", "corpo", 2, 2, True))


def _trelica(nome, base, altura, largura, mat, pai):
    x, y = base
    for dx in (-largura / 2, largura / 2):
        m.barra(f"{nome}_perna{dx:+.1f}", (x + dx, y, 0), (x + dx * 0.4, y, altura), 0.07, mat, pai, 4)
    for k in range(1, 5):
        z = altura * k / 5
        f = 1 - 0.6 * k / 5
        m.barra(f"{nome}_trav{k}", (x - largura / 2 * f, y, z), (x + largura / 2 * f, y, z), 0.04, mat, pai, 4)


def construir(ctx):
    pal = cinza.Paleta(ctx, "neutro")
    raiz = m.vazio("raiz")
    sorteio = random.Random(601)
    cinza.laje("patio", *PEGADA, pal["concreto"], raiz, altura=0.08)
    mato = [m.cone(f"mato{k}", (sorteio.uniform(-9, 9), sorteio.uniform(-7, 7), 0.4), 0.5, 0.05, 0.8, pal["oliva"], raiz, (0, 0, 0), 6) for k in range(26)]
    for k, (a, b) in enumerate((((-9.8, -7.8), (9.8, -7.8)), ((9.8, -7.8), (9.8, 7.8)), ((9.8, 7.8), (-9.8, 7.8)), ((-9.8, 7.8), (-9.8, -7.8)))):
        n = int(math.hypot(b[0] - a[0], b[1] - a[1]) / 2.2)
        for i in range(n + 1):
            t = i / n
            m.barra(f"cerca{k}_{i}", (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, 0), (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, 2.0), 0.04,
                    pal["metal"], raiz, 4)
        for z in (0.7, 1.4, 2.0):
            m.barra(f"cerca{k}_fio{z}", (a[0], a[1], z), (b[0], b[1], z), 0.015, pal["aluminio"], raiz, 4)
    buchas = []
    for k, x in enumerate((-4.5, 1.5)):
        m.caixa(f"transformador{k}", (x, 1.0, 1.6), (3.6, 2.4, 3.0), pal["ferro"], raiz, 0.05)
        for f in range(7):
            m.caixa(f"aleta{k}_{f}", (x - 1.5 + f * 0.5, -0.35, 1.5), (0.06, 0.5, 2.4), pal["metal"], raiz, 0.0)
        for b in range(3):
            m.cilindro(f"bucha{k}_{b}", (x - 1.0 + b, 1.4, 3.6), 0.14, 1.1, pal["branco"], raiz, vertices=10)
            buchas.append(m.esfera(f"bucha_brilho{k}_{b}", (x - 1.0 + b, 1.4, 4.25), 0.16, pal["luz"], raiz, segmentos=8))
    for k, x in enumerate((-7.5, -1.5, 4.5)):
        _trelica(f"portico{k}", (x, 4.5), 7.0, 2.2, pal["metal"], raiz)
    m.barra("barramento_a", (-7.5, 4.5, 6.8), (4.5, 4.5, 6.8), 0.05, pal["aluminio"], raiz, 4)
    m.barra("barramento_b", (-7.5, 4.5, 5.6), (4.5, 4.5, 5.6), 0.05, pal["aluminio"], raiz, 4)
    lampadas = []
    for k, x in enumerate((-7.5, -1.5, 4.5)):
        lampadas.append((m.esfera(f"sinal_morto{k}", (x, 4.5, 7.2), 0.2, pal["concreto"], raiz, segmentos=8),
                         m.esfera(f"sinal{k}", (x, 4.5, 7.2), 0.2, pal["time"], raiz, segmentos=8)))
    chaves = []
    for k in range(6):
        x = -6.5 + k * 2.2
        m.barra(f"chave_coluna{k}", (x, -3.5, 0), (x, -3.5, 2.6), 0.08, pal["branco"], raiz, 6)
        braco = m.vazio(f"chave_braco{k}", (x, -3.5, 2.7), raiz)
        m.caixa(f"chave_lamina{k}", (0.8, 0, 0), (1.6, 0.08, 0.08), pal["aluminio"], braco, 0.0)
        chaves.append(braco)
        m.cilindro(f"para_raios{k}", (x + 0.9, -5.2, 1.2), 0.08, 2.4, pal["branco"], raiz, vertices=8)
    casa = m.vazio("casa_de_comando", (7.2, -5.2, 0.08), raiz)
    m.caixa("casa", (0, 0, 1.5), (4.0, 3.6, 3.0), pal["concreto"], casa, 0.05)
    m.caixa("casa_porta", (-0.8, -1.81, 1.1), (0.9, 0.04, 2.0), pal["metal"], casa, 0.0)
    paineis = (m.caixa("painel_morto", (0.8, -1.82, 1.6), (1.2, 0.03, 0.9), pal["concreto"], casa, 0.0),
               m.caixa("painel", (0.8, -1.83, 1.6), (1.2, 0.03, 0.9), pal["time"], casa, 0.0))
    janela = m.caixa("casa_janela_acesa", (0.8, -1.84, 2.5), (1.4, 0.02, 0.4), pal["luz"], casa, 0.0)
    _trelica("torre_linha", (-8.5, -6.5), 16.0, 3.0, pal["metal"], raiz)
    m.caixa("torre_cruzeta", (-8.5, -6.5, 15.0), (0.2, 4.5, 0.2), pal["metal"], raiz, 0.0)
    m.ponto("religar", (7.2, -7.6, 0.0), raiz)
    m.ponto("topo", (0, 0, 9.0), raiz)
    return {"raiz": raiz, "mato": mato, "buchas": buchas, "lampadas": lampadas, "chaves": chaves, "paineis": paineis, "janela": janela}


def posar(ctx, modelo, animacao, quadro):
    etapa = {"morta": 0, "religada": 3}.get(animacao, 1 + quadro)
    for k, bucha in enumerate(modelo["buchas"]):
        # the first transformer lights at the first stage, the second at the second
        bucha.scale = (1, 1, 1) if etapa >= (1 if k < 3 else 2) else (0, 0, 0)
    for k, braco in enumerate(modelo["chaves"]):
        fechada = etapa == 3 or (etapa == 2 and k < 3)
        braco.rotation_euler = (0, 0 if fechada else math.radians(-70), 0)
    for k, mato in enumerate(modelo["mato"]):
        mato.scale = (1, 1, 1) if etapa < 3 or k % 3 == 0 else (0, 0, 0)
    viva = etapa == 3
    for morto, vivo in list(modelo["lampadas"]) + [modelo["paineis"]]:
        morto.scale = (0, 0, 0) if viva else (1, 1, 1)
        vivo.scale = (1, 1, 1) if viva else (0, 0, 0)
    modelo["janela"].scale = (1, 1, 1) if etapa >= 1 else (0, 0, 0)
