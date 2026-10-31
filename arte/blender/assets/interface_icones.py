# SPDX-License-Identifier: GPL-3.0-or-later
"""Gray icons of the build and production grids: every unit and building of phase 1 from its own gray kit script,
in its resting pose, in the game's 3/4 view, each fitted on its own to 128 px (64 px in hd). One small atlas page
for the HUD, not for the sprite arrays; the animation name of each icon is the asset id of the piece."""

import importlib

from comum import cinza
from comum import modelagem as m

PECAS = [
    "religadores-veiculo-guincho-de-celulas", "religadores-infantaria-turma-de-linha", "religadores-infantaria-soldador",
    "religadores-veiculo-leiturista", "religadores-veiculo-cesto-blindado", "religadores-veiculo-lanca-bobinas",
    "religadores-veiculo-equipe-de-manutencao", "religadores-infantaria-religador",
    "religadores-construcao-escritorio-regional", "religadores-construcao-acumulador", "religadores-construcao-poste",
    "religadores-construcao-poste-avancado", "religadores-construcao-alojamento-da-turma", "religadores-construcao-garagem",
    "religadores-construcao-cata-vento", "religadores-construcao-torre-de-holofote", "religadores-construcao-almoxarifado-tecnico",
    "desligados-veiculo-carroca-de-pedal", "desligados-infantaria-chapa", "desligados-infantaria-arpoador", "desligados-veiculo-rolima",
    "desligados-veiculo-carro-vela", "desligados-veiculo-locomovel", "desligados-veiculo-canhao-de-caldeira",
    "desligados-construcao-carrocao-mae", "desligados-construcao-paiol", "desligados-construcao-barracao",
    "desligados-construcao-ferraria-a-vapor", "desligados-construcao-torre-de-vigia", "desligados-construcao-palicada",
    "neutro-estrutura-torre-antiga", "neutro-estrutura-holofote-de-estrada", "neutro-estrutura-ponte-basculante", "neutro-estrutura-subestacao",
]
MODULOS = {peca: importlib.import_module("assets." + peca.replace("-", "_")) for peca in PECAS}

DESCRICAO = {
    "asset": "interface-icones", "brief": None, "tipo": "interface", "categoria": "icone", "fases": cinza.FASES, "acabamento": "cinza",
    "direcoes": 1, "passes": ["cor"], "pagina": {"uhd": 1024, "hd": 512},
    "camadas": {peca: {"quadro": [128, 128], "ancora": [64, 64]} for peca in PECAS},
    "animacoes": [cinza.anim(peca, peca, 1) for peca in PECAS],
}


def _repouso(peca):
    return MODULOS[peca].DESCRICAO["animacoes"][0]["nome"]


def construir(ctx):
    raiz = m.vazio("raiz")
    modelos = {}
    for peca, modulo in MODULOS.items():
        modelo = modulo.construir(ctx)
        modelo["raiz"].parent = raiz
        # every object of the piece goes to the icon's own layer, turrets and lights included
        for obj in [modelo["raiz"]] + list(modelo["raiz"].children_recursive):
            obj["camada"] = peca
        modelos[peca] = modelo
    # ajustar_camera only gets the context, so the models ride on it
    ctx.icones = {"raiz": raiz, "modelos": modelos}
    return ctx.icones


def posar(ctx, modelo, animacao, quadro):
    peca = animacao
    posar_peca = getattr(MODULOS[peca], "posar", None)
    if posar_peca:
        posar_peca(ctx, modelo["modelos"][peca], _repouso(peca), 0)


def ajustar_camera(ctx, camera, camada):
    modelo = ctx.icones
    posar(ctx, modelo, camada, 0)
    raiz = modelo["modelos"][camada]["raiz"]
    cinza.enquadrar_objetos(camera, [raiz] + list(raiz.children_recursive), 0.05)
