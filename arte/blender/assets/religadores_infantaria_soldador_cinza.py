# SPDX-License-Identifier: GPL-3.0-or-later
"""Soldador, gray kit (brief arte/briefs/religadores-unidade-soldador.md): the anti-armour welder. What reads first
is the big square welding mask, raised while walking and lowered to shoot; on the back a frame with the welder box
and a tall gas cylinder above the shoulder; leather apron; the torch in the right hand on its cable."""

import math

from comum import cinza, infantaria
from comum import modelagem as m

DESCRICAO = cinza.descricao_infantaria("religadores-infantaria-soldador-cinza", "religadores/soldador")


def construir(ctx):
    pal = cinza.Paleta(ctx, "religadores")
    raiz, armacao, parte, partes = cinza.corpo(ctx, pal, None)
    parte("tronco", m.caixa("avental", (0.14, 0, 1.08), (0.05, 0.4, 0.62), pal["couro"], raiz, 0.02))
    parte("tronco", m.caixa("armacao_costas", (-0.2, 0, 1.25), (0.05, 0.36, 0.5), pal["metal"], raiz, 0.01))
    parte("tronco", m.caixa("maquina_solda", (-0.3, 0.07, 1.18), (0.2, 0.26, 0.34), pal["cobalto"], raiz, 0.03))
    parte("tronco", m.cilindro("cilindro_gas", (-0.29, -0.14, 1.42), 0.075, 0.9, pal["concreto"], raiz, vertices=12))
    parte("tronco", m.esfera("cilindro_topo", (-0.29, -0.14, 1.87), 0.075, pal["concreto"], raiz, segmentos=12))
    parte("tronco", m.cilindro("valvula", (-0.29, -0.14, 1.96), 0.03, 0.08, pal["metal"], raiz, vertices=8, suave=False))
    parte("braco_e", m.barra("bracadeira", (0.03, 0.255, 1.3), (0.07, 0.265, 1.22), 0.072, pal["time"], raiz, 8))
    # the mask turns about the forehead; its holder follows the head bone and stays upright in the rest frame
    suporte = parte("cabeca", m.vazio("mascara_suporte", (0.06, 0, 1.72), raiz))
    eixo = m.vazio("mascara_eixo", (0, 0, 0), suporte)
    m.caixa("mascara", (0.12, 0, -0.13), (0.07, 0.32, 0.34), pal["time"], eixo, 0.025)
    m.caixa("mascara_visor", (0.16, 0, -0.1), (0.01, 0.17, 0.07), pal["vidro"], eixo, 0.0)
    parte("cabeca", m.esfera("touca", (0.0, 0, 1.66), 0.13, pal["couro"], raiz, (1.0, 1.0, 0.7), segmentos=16))
    # torch in the right hand and its cable back to the machine
    parte("antebraco_d", m.barra("tocha", (0.32, -0.1, 1.03), (0.62, -0.06, 0.98), 0.028, pal["metal"], raiz, 6))
    parte("antebraco_d", m.cone("bico", (0.66, -0.055, 0.975), 0.03, 0.012, 0.08, pal["cobre"], raiz, (0, math.radians(90), 0), 8))
    cabo = [(-0.3, -0.05, 1.02), (-0.15, -0.22, 0.86), (0.1, -0.24, 0.84), (0.3, -0.12, 0.98)]
    for k in range(len(cabo) - 1):
        parte("tronco", m.barra(f"cabo{k}", cabo[k], cabo[k + 1], 0.018, pal["escuro"], raiz, 6))
    boca = parte("antebraco_d", m.ponto("boca", (0.71, -0.05, 0.97), raiz))
    parte("cabeca", m.ponto("topo", (0, 0, 2.05), raiz))
    cinza.prender_partes(armacao, partes)
    acoes = infantaria.acoes(armacao, cinza.ANIMACOES_INFANTARIA)
    return {"raiz": raiz, "esqueleto": armacao, "acoes": acoes, "mascara": eixo, "boca": boca}


def posar(ctx, modelo, animacao, quadro):
    # lowered to shoot, raised over the head otherwise (which warns from afar that the arc is coming)
    modelo["mascara"].rotation_euler = (0, 0.0 if animacao == "atirando" else math.radians(-105), 0)
    cinza.posar_infantaria(modelo, animacao, quadro)
