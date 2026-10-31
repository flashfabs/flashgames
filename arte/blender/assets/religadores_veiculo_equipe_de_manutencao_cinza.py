# SPDX-License-Identifier: GPL-3.0-or-later
"""Equipe de Manutenção, gray kit (brief arte/briefs/religadores-unidade-equipe-de-manutencao.md): the repair
crew, the shortest and squarest vehicle of the faction: a closed high-roof van with a long ladder on the roof
rack and an amber light bar in front of it; to repair, the side door slides open and two technicians work
beside it. The ladder is the line that reads from afar."""

from comum import cinza
from comum import modelagem as m

DESCRICAO = cinza.descricao_veiculo(
    "religadores-veiculo-equipe-de-manutencao-cinza", "religadores/equipe-de-manutencao", arma=False,
    extras=[cinza.anim("reparando", "corpo", 2, 4, True, direcoes=8)],
)


def construir(ctx):
    pal = cinza.Paleta(ctx, "religadores")
    raiz = m.vazio("raiz")
    chassi = cinza.chassi(raiz)
    cinza.rodas("roda", (1.5, -1.4), 2.0, 0.42, 0.3, pal, chassi)
    m.caixa("furgao", (-0.15, 0, 1.55), (3.9, 2.2, 2.1), pal["branco"], chassi, 0.1)
    m.caixa("capo", (2.15, 0, 1.0), (0.8, 2.1, 0.9), pal["branco"], chassi, 0.1)
    m.caixa("para_brisa", (1.75, 0, 1.9), (0.4, 1.9, 0.6), pal["vidro"], chassi, 0.0, (0, 0.6, 0))
    m.caixa("para_choque", (2.6, 0, 0.62), (0.2, 2.3, 0.28), pal["concreto"], chassi, 0.03)
    for lado in (-1, 1):
        m.caixa(f"faixa{lado:+d}", (-0.15, lado * 1.11, 1.25), (3.9, 0.03, 0.22), pal["laranja"], chassi, 0.0)
    m.caixa("portas_tras", (-2.11, 0, 1.55), (0.04, 1.9, 1.7), pal["time"], chassi, 0.0)
    # roof rack: team panel between the rails, the long ladder and the light bar
    m.caixa("painel_teto", (-0.3, 0, 2.63), (3.2, 1.0, 0.04), pal["time"], chassi, 0.0)
    for lado in (-1, 1):
        m.barra(f"trilho{lado:+d}", (-1.9, lado * 0.75, 2.75), (1.5, lado * 0.75, 2.75), 0.03, pal["metal"], chassi, 6)
        m.barra(f"escada_banzo{lado:+d}", (-2.6, lado * 0.28, 2.82), (1.9, lado * 0.28, 2.82), 0.035, pal["aluminio"], chassi, 6)
    for k in range(12):
        x = -2.45 + k * 0.38
        m.barra(f"escada_degrau{k}", (x, -0.28, 2.82), (x, 0.28, 2.82), 0.02, pal["aluminio"], chassi, 4)
    m.caixa("barra_giroflex", (1.55, 0, 2.72), (0.25, 1.6, 0.12), pal["luz"], chassi, 0.03)
    # sliding side door and the two technicians, out only while repairing
    porta = m.caixa("porta_lateral", (0.3, -1.12, 1.45), (1.3, 0.05, 1.7), pal["branco"], chassi, 0.02)
    m.caixa("interior", (0.3, -1.08, 1.45), (1.2, 0.03, 1.5), pal["cobalto"], chassi, 0.0)
    tecnicos = []
    for k, (x, y, giro) in enumerate(((0.6, -2.0, 1.57), (-0.5, -1.9, 0.6))):
        corpo_raiz, armacao = cinza.pessoa(ctx, pal, chassi, f"tecnico{k}", (x, y, 0), giro=giro, pose="atirando", escala=1.2)
        tecnicos.append((corpo_raiz, armacao))
    m.ponto("porta", (0.3, -1.6, 0.0), chassi)
    m.ponto("giroflex", (1.55, 0, 2.85), chassi)
    m.ponto("topo", (0, 0, 3.2), chassi)
    pecas = cinza.destroco(pal, raiz, 4.8, 2.3, 7)
    return {"raiz": raiz, "chassi": chassi, "porta": porta, "tecnicos": tecnicos, "destroco": pecas}


def posar(ctx, modelo, animacao, quadro):
    reparando = animacao == "reparando"
    modelo["porta"].location = (-0.95 if reparando else 0.3, -1.15, 1.45)
    for k, (corpo_raiz, armacao) in enumerate(modelo["tecnicos"]):
        corpo_raiz.scale = (1.2, 1.2, 1.2) if reparando else (0, 0, 0)
        cinza.posar_pessoa(armacao, "andando" if (k + quadro) % 2 else "atirando", quadro, 2)
    cinza.posar_destroco(modelo, animacao == "destruido", inclinar=(14, -4))
