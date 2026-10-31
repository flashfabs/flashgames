# SPDX-License-Identifier: GPL-3.0-or-later
"""Religador, gray kit (brief arte/briefs/religadores-unidade-religador.md): the special unit that switches dead
structures back on. What reads first is the insulated hot stick, longer than he is tall, carried diagonally on
the shoulder and raised forward to reach the switch; full-brim helmet without lamp, short jacket over the
overall, long insulating gloves, a side bag and a big badge on the chest. No weapon."""

import math

from comum import cinza, infantaria
from comum import modelagem as m

Y = infantaria.Y


def religando(q, n):
    sobe = math.sin(2 * math.pi * q / n)
    return [("braco_e", Y, -72), ("braco_d", Y, -66), ("antebraco_e", Y, -18), ("antebraco_d", Y, -22),
            ("tronco", Y, -5 + 2 * sobe), ("cabeca", Y, -14)], 0.01 * sobe, 0.0


DESCRICAO = cinza.descricao_infantaria(
    "religadores-infantaria-religador", "religadores/religador", quadro=(128, 160), ancora=(64, 116), arma=False,
    extras=[cinza.anim("religando", "corpo", 4, 6, True, direcoes=8)],
)
ANIMACOES = [a for a in cinza.ANIMACOES_INFANTARIA if a[0] != "atirando"] + [("religando", 4, religando)]


def construir(ctx):
    pal = cinza.Paleta(ctx, "religadores")
    raiz, armacao, parte, partes = cinza.corpo(ctx, pal, None, luvas="vermelho")
    parte("tronco", m.caixa("jaleco", (0, 0, 1.27), (0.34, 0.48, 0.36), pal["cobalto"], raiz, 0.06))
    parte("tronco", m.caixa("jaleco_faixa", (0, 0, 1.2), (0.36, 0.5, 0.05), pal["branco"], raiz, 0.0))
    parte("tronco", m.caixa("cracha", (0.18, 0.08, 1.34), (0.02, 0.14, 0.18), pal["time"], raiz, 0.0))
    parte("quadril", m.caixa("bolsa", (0.0, 0.24, 0.92), (0.24, 0.1, 0.22), pal["couro"], raiz, 0.03))
    for sufixo, lado in (("e", 1), ("d", -1)):
        antebraco = infantaria.OSSO[f"antebraco_{sufixo}"]
        parte(f"antebraco_{sufixo}", m.barra(f"luva_longa_{sufixo}", antebraco[0], antebraco[1], 0.065, pal["vermelho"], raiz, 8))
    parte("cabeca", m.esfera("capacete", (0, 0, 1.66), 0.16, pal["time"], raiz, (1.05, 1.0, 0.75), segmentos=16))
    parte("cabeca", m.cilindro("capacete_aba", (0, 0, 1.63), 0.22, 0.025, pal["time"], raiz, vertices=20))
    # the stick turns about the right shoulder: on the shoulder while walking, raised forward to switch
    suporte = parte("tronco", m.vazio("vara_suporte", (0.05, -0.26, 1.42), raiz))
    eixo = m.vazio("vara_eixo", (0, 0, 0), suporte)
    m.barra("vara", (0.38, 0, -0.38), (-1.2, 0, 1.3), 0.03, pal["palha"], eixo, 8)
    m.caixa("vara_gancho", (-1.24, 0, 1.38), (0.06, 0.04, 0.16), pal["metal"], eixo, 0.0)
    m.cilindro("vara_detector", (-1.15, 0, 1.22), 0.04, 0.08, pal["luz"], eixo, vertices=8, suave=False)
    m.ponto("ponta", (-1.25, 0, 1.45), eixo)
    parte("cabeca", m.ponto("topo", (0, 0, 2.0), raiz))
    cinza.prender_partes(armacao, partes)
    acoes = infantaria.acoes(armacao, ANIMACOES)
    return {"raiz": raiz, "esqueleto": armacao, "acoes": acoes, "vara": eixo}


def posar(ctx, modelo, animacao, quadro):
    modelo["vara"].rotation_euler = (0, math.radians(75) if animacao == "religando" else 0.0, 0)
    cinza.posar_infantaria(modelo, animacao, quadro)
