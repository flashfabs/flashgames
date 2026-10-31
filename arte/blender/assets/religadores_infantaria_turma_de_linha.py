# SPDX-License-Identifier: GPL-3.0-or-later
"""Turma de Linha, gray kit (brief arte/briefs/religadores-unidade-turma-de-linha.md): the style-gate model of
religadores_infantaria_turma_de_linha_portao.py in gray clay, with the gray kit's shorter actions on the same skeleton."""

from assets import religadores_infantaria_turma_de_linha_portao as turma
from comum import cinza, infantaria

DESCRICAO = cinza.descricao_infantaria("religadores-infantaria-turma-de-linha", "religadores/turma-de-linha")


def construir(ctx):
    modelo = turma.construir(ctx)
    cinza.acinzentar(modelo["raiz"], "religadores")
    modelo["acoes"] = infantaria.acoes(modelo["esqueleto"], cinza.ANIMACOES_INFANTARIA)
    return modelo


def posar(ctx, modelo, animacao, quadro):
    # the helmet stays on: the rolling helmet of the style gate is a final-art detail
    cinza.posar_infantaria(modelo, animacao, quadro)
