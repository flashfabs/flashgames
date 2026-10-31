# SPDX-License-Identifier: GPL-3.0-or-later
"""Carro-Vela, gray kit (brief arte/briefs/desligados-unidade-carro-vela.md): the style-gate model of
desligados_veiculo_carro_vela_portao.py in gray clay, in 16 directions, with the gunner's swivel seat as the turret;
the sail stays in its parked shape while moving, to keep the gray kit inside its texture budget."""

from assets import desligados_veiculo_carro_vela_portao as carro_vela
from comum import cinza

DESCRICAO = cinza.descricao_veiculo(
    "desligados-veiculo-carro-vela", "desligados/carro-vela", quadro=(256, 320), ancora=(128, 184),
    torre=((128, 128), (64, 80)),
)
DESCRICAO["camadas"]["torre"]["pivo"] = "banco_pivo"


def construir(ctx):
    modelo = carro_vela.construir(ctx)
    cinza.acinzentar(modelo["raiz"], "desligados")
    pal = cinza.Paleta(ctx, "desligados")
    modelo["chassi"] = cinza.inserir_chassi(modelo["raiz"])
    modelo["destroco"] = cinza.destroco(pal, modelo["raiz"], 5.5, 3.0, 19)
    return modelo


def posar(ctx, modelo, animacao, quadro):
    destruido = animacao == "destruido"
    carro_vela.posar(ctx, modelo, "parado" if destruido or animacao == "rodando" else animacao, quadro)
    cinza.posar_destroco(modelo, destruido, inclinar=(24, -8), afundar=0.25)
