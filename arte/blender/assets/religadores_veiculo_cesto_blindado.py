# SPDX-License-Identifier: GPL-3.0-or-later
"""Cesto Blindado, gray kit (brief arte/briefs/religadores-unidade-cesto-blindado.md): the style-gate model of
religadores_veiculo_cesto_blindado_portao.py in gray clay, in 16 directions, with the boom lowered and raised as two
turret layers and the outriggers down when raised; the raising transition of the gate is left for the final art."""

from assets import religadores_veiculo_cesto_blindado_portao as cesto
from comum import cinza

anim = cinza.anim
DESCRICAO = {
    "asset": "religadores-veiculo-cesto-blindado", "brief": "religadores/cesto-blindado", "tipo": "unidade",
    "categoria": "veiculo", "fases": cinza.FASES, "acabamento": "cinza", "direcoes": 16, "passes": ["cor", "time"],
    "camadas": {
        "corpo": {"quadro": [256, 256], "ancora": [128, 150]},
        "torre": {"quadro": [416, 384], "ancora": [208, 208], "pivo": "torre_pivo"},
        "torre-erguida": {"quadro": [256, 384], "ancora": [128, 280], "pivo": "torre_pivo", "usa": ["torre"]},
        "destroco": {"quadro": [448, 384], "ancora": [224, 210], "usa": ["corpo", "torre"]},
    },
    "animacoes": [
        anim("parado", "corpo", 1),
        anim("rodando", "corpo", 1, 0, True, igual="parado"),
        # the outriggers down would cost 16 large frames; in gray the raised turret alone shows the mode
        anim("apoiado", "corpo", 1, 0, True, igual="parado"),
        anim("torre", "torre", 1),
        anim("atirando", "torre", 2, 8, False, quadrosIguais={"1": ["torre", 0]}),
        anim("erguida", "torre-erguida", 1),
        anim("atirando-erguida", "torre-erguida", 2, 8, False, quadrosIguais={"1": ["erguida", 0]}),
        anim("destruido", "destroco", 1, 0, True, direcoes=4),
    ],
}


def construir(ctx):
    modelo = cesto.construir(ctx)
    cinza.acinzentar(modelo["raiz"], "religadores")
    pal = cinza.Paleta(ctx, "religadores")
    modelo["chassi"] = cinza.inserir_chassi(modelo["raiz"])
    modelo["destroco"] = cinza.destroco(pal, modelo["raiz"], 6.2, 2.6, 17)
    return modelo


def posar(ctx, modelo, animacao, quadro):
    destruido = animacao == "destruido"
    cesto.posar(ctx, modelo, "parado" if destruido else animacao, quadro)
    cinza.posar_destroco(modelo, destruido)
