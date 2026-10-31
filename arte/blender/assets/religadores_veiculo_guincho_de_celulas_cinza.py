# SPDX-License-Identifier: GPL-3.0-or-later
"""Guincho de Células, gray kit (brief arte/briefs/religadores-unidade-guincho-de-celulas.md): the collector, a
short-cab two-axle truck with an open bed and a knuckle crane folded behind the cab ending in a pallet fork.
Loaded, four pallets of cells glow on the bed (the cargo keeps the resource glow even in gray)."""

import math

from comum import cinza
from comum import modelagem as m

DESCRICAO = cinza.descricao_veiculo(
    "religadores-veiculo-guincho-de-celulas-cinza", "religadores/guincho-de-celulas", arma=False,
    extras=[
        cinza.anim("carregado", "corpo", 1),
        cinza.anim("rodando-carregado", "corpo", 1, 0, True, igual="carregado"),
        cinza.anim("carregando", "corpo", 2, 3, True, direcoes=8),
        cinza.anim("descarregando", "corpo", 2, 3, True, direcoes=8, igual="carregando"),
    ],
)

EIXOS = (1.75, -1.55)


def construir(ctx):
    pal = cinza.Paleta(ctx, "religadores")
    raiz = m.vazio("raiz")
    chassi = cinza.chassi(raiz)
    m.caixa("longarina", (0, 0, 0.72), (5.5, 1.2, 0.3), pal["metal"], chassi, 0.04)
    rodas = cinza.rodas("roda", EIXOS, 2.1, 0.5, 0.36, pal, chassi)
    for x, comprimento in ((1.75, 1.3), (-1.55, 1.5)):
        for lado in (-1, 1):
            mat = pal["time"] if x < 0 else pal["concreto"]
            m.caixa(f"paralama{x:+.1f}{lado:+d}", (x, lado * 1.1, 1.06), (comprimento, 0.42, 0.08), mat, chassi, 0.02)
    # short cab, team colour on the roof (the most visible area from above)
    m.caixa("cabine", (1.95, 0, 1.55), (1.45, 2.3, 1.4), pal["laranja"], chassi, 0.07)
    m.caixa("teto", (1.92, 0, 2.29), (1.38, 2.2, 0.09), pal["time"], chassi, 0.02)
    m.caixa("para_brisa", (2.68, 0, 1.85), (0.04, 1.9, 0.5), pal["vidro"], chassi, 0.0)
    m.caixa("para_choque", (2.75, 0, 0.75), (0.2, 2.4, 0.3), pal["concreto"], chassi, 0.03)
    m.cilindro("giroflex", (1.95, 0, 2.4), 0.12, 0.14, pal["luz"], chassi, vertices=12)
    m.cilindro("escapamento", (1.12, -1.05, 2.2), 0.07, 1.4, pal["escuro"], chassi, vertices=10)
    # open bed with low sides and straps
    m.caixa("assoalho", (-1.05, 0, 1.02), (3.5, 2.35, 0.14), pal["madeira"], chassi, 0.02)
    for lado in (-1, 1):
        m.caixa(f"guarda{lado:+d}", (-1.05, lado * 1.15, 1.3), (3.5, 0.06, 0.42), pal["concreto"], chassi, 0.01)
    m.caixa("guarda_tras", (-2.78, 0, 1.3), (0.06, 2.35, 0.42), pal["concreto"], chassi, 0.01)
    for k, x in enumerate((-0.2, -1.05, -1.9)):
        m.caixa(f"amarra{k}", (x, 0, 1.11), (0.06, 2.3, 0.02), pal["branco"], chassi, 0.0)
    paletes = []
    for k, (x, y) in enumerate(((-0.5, 0.55), (-0.5, -0.55), (-1.6, 0.55), (-1.6, -0.55))):
        palete = m.vazio(f"palete{k}", (x, y, 1.09), chassi)
        m.caixa(f"palete{k}_base", (0, 0, 0.06), (0.95, 0.95, 0.12), pal["madeira"], palete, 0.01)
        m.caixa(f"palete{k}_celulas", (0, 0, 0.42), (0.85, 0.85, 0.6), pal["carga"], palete, 0.04)
        paletes.append(palete)
    # knuckle crane: turning column, arm and the fork on a short extension
    coluna = m.vazio("guindaste", (0.62, 0, 1.12), chassi)
    m.cilindro("guindaste_base", (0, 0, 0.12), 0.32, 0.24, pal["cobalto"], coluna)
    m.caixa("guindaste_coluna", (0, 0, 0.7), (0.32, 0.32, 1.0), pal["cobalto"], coluna, 0.03)
    braco = m.vazio("guindaste_braco", (0, 0, 1.2), coluna)
    m.caixa("braco", (-0.75, 0, 0), (1.55, 0.26, 0.26), pal["cobalto"], braco, 0.03)
    ponta = m.vazio("guindaste_ponta", (-1.5, 0, 0), braco)
    m.caixa("extensao", (0, 0, -0.42), (0.2, 0.2, 0.84), pal["cobalto"], ponta, 0.02)
    garfo = m.vazio("garfo", (0, 0, -0.9), ponta)
    m.caixa("garfo_costas", (0.05, 0, 0.2), (0.06, 0.55, 0.45), pal["metal"], garfo, 0.01)
    for lado in (-1, 1):
        m.caixa(f"garfo_dente{lado:+d}", (-0.32, lado * 0.18, 0), (0.7, 0.08, 0.05), pal["metal"], garfo, 0.0)
    pendurado = m.vazio("palete_no_garfo", (-0.35, 0, 0.03), garfo)
    m.caixa("palete_garfo_base", (0, 0, 0.06), (0.9, 0.9, 0.12), pal["madeira"], pendurado, 0.01)
    m.caixa("palete_garfo_celulas", (0, 0, 0.4), (0.8, 0.8, 0.55), pal["carga"], pendurado, 0.04)
    m.ponto("garfo", (-0.65, 0, 0), garfo)
    m.ponto("carroceria", (-1.05, 0, 1.2), chassi)
    m.ponto("escape", (1.12, -1.05, 2.95), chassi)
    m.ponto("topo", (1.95, 0, 2.7), chassi)
    pecas = cinza.destroco(pal, raiz, 5.5, 2.4, 11)
    return {"raiz": raiz, "chassi": chassi, "rodas": rodas, "paletes": paletes, "coluna": coluna, "braco": braco,
            "ponta": ponta, "pendurado": pendurado, "destroco": pecas}


def _guindaste(modelo, giro, braco):
    modelo["coluna"].rotation_euler = (0, 0, math.radians(giro))
    modelo["braco"].rotation_euler = (0, math.radians(braco), 0)
    # the extension hangs plumb whatever the arm does
    modelo["ponta"].rotation_euler = (0, math.radians(-braco), 0)


def posar(ctx, modelo, animacao, quadro):
    carregando = animacao == "carregando"
    destruido = animacao == "destruido"
    cheio = animacao in ("carregado", "rodando-carregado")
    for k, palete in enumerate(modelo["paletes"]):
        visivel = cheio or (carregando and k < 2) or (destruido and k in (0, 3))
        palete.scale = (1, 1, 1) if visivel else (0, 0, 0)
        palete.rotation_euler = (0.5, 0.3, 0.8 * k) if destruido else (0, 0, 0)
    modelo["pendurado"].scale = (1, 1, 1) if carregando else (0, 0, 0)
    if carregando:
        # the fork low at the side (picking a pallet), then raised over the bed
        _guindaste(modelo, -90 if quadro == 0 else -40, -32 if quadro == 0 else 12)
    else:
        _guindaste(modelo, 0, -6 if not destruido else 25)
    cinza.posar_destroco(modelo, destruido)
