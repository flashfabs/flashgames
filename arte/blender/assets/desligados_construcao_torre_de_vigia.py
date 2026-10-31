# SPDX-License-Identifier: GPL-3.0-or-later
"""Torre de Vigia, gray kit (brief arte/briefs/desligados-construcao-torre-de-vigia.md): the light defence, a tall
wooden mast guyed by ropes to stakes in the ground, with a round plank platform and a low railing on top, a rope
ladder down to a base ring of bales and crates, and a small triangular signal sail on a yard near the top. It has
to read as a mast of rope and thin wood, never as the metal towers of the Religadores. The marksman with his
air carbine and spyglass is the turret layer, in 16 directions."""

import math

from comum import cinza
from comum import modelagem as m

PEGADA = (2, 2)
ALTURA = 8.0
DESCRICAO = cinza.descricao_construcao("desligados-construcao-torre-de-vigia", "desligados/torre-de-vigia", "desligados", PEGADA, 11.0,
                                       torre=((192, 288), (96, 236)))


def construir(ctx):
    pal = cinza.Paleta(ctx, "desligados")
    raiz = m.vazio("raiz")
    estragos = cinza.Estragos(raiz, 97)
    m.caixa("chao", (0, 0, 0.03), (7.4, 7.4, 0.06), pal["terra"], raiz, 0.02)
    for k in range(8):
        angulo = 2 * math.pi * k / 8
        m.caixa(f"fardo{k}", (1.3 * math.cos(angulo), 1.3 * math.sin(angulo), 0.4), (0.9, 0.6, 0.7), pal["palha" if k % 2 else "madeira"], raiz, 0.05,
                (0, 0, angulo))
    mastro = estragos.grupo("mastro", (0, 0, 0.06), "alto", queda=60)
    m.barra("mastro_tronco", (0, 0, 0), (0, 0, ALTURA + 1.6), 0.16, pal["madeira"], mastro, 8)
    m.cilindro("plataforma", (0, 0, ALTURA), 1.25, 0.12, pal["madeira"], mastro, vertices=16)
    for k in range(10):
        angulo = 2 * math.pi * k / 10
        m.barra(f"amurada_poste{k}", (1.2 * math.cos(angulo), 1.2 * math.sin(angulo), ALTURA), (1.2 * math.cos(angulo), 1.2 * math.sin(angulo), ALTURA + 0.8),
                0.03, pal["madeira"], mastro, 4)
    m.toro("amurada", (0, 0, ALTURA + 0.8), 1.2, 0.05, pal["time"], mastro)
    m.barra("verga", (0, -1.2, ALTURA + 1.3), (0, 1.2, ALTURA + 1.3), 0.04, pal["madeira"], mastro, 4)
    m.malha_de_pontos("vela_sinal", [(0, -1.1, ALTURA + 1.3), (0, 1.1, ALTURA + 1.3), (0, 0, ALTURA + 0.2)], [(0, 1, 2)], [pal["time"]], mastro)
    for k in range(8):
        m.barra(f"escada_corda{k}", (0.3, -0.3 + 0.08 * (k % 2), ALTURA - k), (0.3, 0.3, ALTURA - k - 0.95), 0.015, pal["palha"], mastro, 4)
    estais = estragos.grupo("estais", (0, 0, 0.06), "detalhe")
    for k in range(4):
        angulo = math.pi / 4 + math.pi / 2 * k
        ponta = (3.4 * math.cos(angulo), 3.4 * math.sin(angulo), 0)
        m.barra(f"estai{k}", (0, 0, ALTURA - 0.6), ponta, 0.015, pal["palha"], estais, 4)
        m.barra(f"estaca{k}", ponta, (ponta[0], ponta[1], 0.5), 0.05, pal["madeira"], estais, 4)
    m.ponto("topo", (0, 0, ALTURA + 2.4), raiz)
    m.ponto("encaixe_torre", (0, 0, 0), raiz)
    # turret: the marksman on the platform with his carbine
    torre = m.vazio("torre_pivo", (0, 0, 0), raiz, camada="torre")

    def acessorios(parte, corpo_raiz):
        parte("tronco", m.caixa("poncho", (0, 0, 1.26), (0.4, 0.58, 0.36), pal["lona"], corpo_raiz, 0.08))
        parte("cabeca", m.cilindro("chapeu_aba", (0, 0, 1.72), 0.4, 0.03, pal["palha"], corpo_raiz, vertices=20))
        parte("tronco", m.barra("carabina", (0.05, -0.12, 1.12), (1.0, -0.06, 1.12), 0.022, pal["escuro"], corpo_raiz, 6))
        parte("tronco", m.ponto("boca", (1.03, -0.06, 1.12), corpo_raiz))

    cinza.pessoa(ctx, pal, torre, "atirador", (0, 0, ALTURA + 0.06), pose="atirando", escala=1.3, acessorios=acessorios,
                 roupa="lona", calca="oliva", luvas="pele")
    estragos.detritos(pal, *PEGADA, 8, mats=("madeira", "palha", "lona"))
    return {"raiz": raiz, "estragos": estragos}


def posar(ctx, modelo, animacao, quadro):
    modelo["estragos"].aplicar(animacao if animacao not in ("torre", "atirando") else "pronta")
