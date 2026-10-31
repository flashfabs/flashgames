# SPDX-License-Identifier: GPL-3.0-or-later
"""Escritório Regional, gray kit (brief arte/briefs/religadores-construcao-escritorio-regional.md): the style-gate
model of religadores_construcao_escritorio_regional_portao.py in gray clay, without the lights layer; producing shows the
roll-up door open, and the destroyed state (new here) is the building slumped to a third with rubble around."""

from assets import religadores_construcao_escritorio_regional_portao as escritorio
from comum import cinza
from comum import modelagem as m

PEGADA = (4, 3)
DESCRICAO = cinza.descricao_construcao("religadores-construcao-escritorio-regional", "religadores/escritorio-regional", "religadores",
                                       PEGADA, 11.5)
DESCRICAO["camadas"]["corpo"] = {"quadro": [768, 640], "ancora": [384, 392]}
DESCRICAO["animacoes"].insert(1, cinza.anim("produzindo", "corpo", 1))


def construir(ctx):
    modelo = escritorio.construir(ctx)
    raiz = modelo["raiz"]
    cinza.acinzentar(raiz, "religadores")
    # an empty under everything, so the destroyed state can slump the whole building
    modelo["predio"] = cinza.inserir_chassi(raiz)
    pal = cinza.Paleta(ctx, "religadores")
    modelo["estragos"] = cinza.Estragos(raiz, 71)
    modelo["estragos"].detritos(pal, *PEGADA, 22)
    m.ponto("cabo", (8.6, -6.6, 9.6), raiz)
    return modelo


def posar(ctx, modelo, animacao, quadro):
    destruida = animacao == "destruida"
    if animacao == "produzindo":
        escritorio.posar(ctx, modelo, "produzindo", 2)
    else:
        escritorio.posar(ctx, modelo, "danificada" if animacao != "pronta" else "pronta", 0)
    modelo["predio"].scale = (1, 1, 0.3) if destruida else (1, 1, 1)
    modelo["estragos"].aplicar(animacao)
