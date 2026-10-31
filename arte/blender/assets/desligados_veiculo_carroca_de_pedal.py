# SPDX-License-Identifier: GPL-3.0-or-later
"""Carroça de Pedal, gray kit (brief arte/briefs/desligados-unidade-carroca-de-pedal.md): the Desligados'
collector, a low, wide, rectangular shape: a four-wheeled quadricycle with two benches side by side and four
pedallers under a canvas awning on poles, pulling a two-wheeled trailer of crates under a tarp. Loaded, the cells
glow through the gaps of the tarp; one pedaller carries a long scoop net for the spilled sparks."""

import math

from comum import cinza
from comum import modelagem as m

DESCRICAO = cinza.descricao_veiculo(
    "desligados-veiculo-carroca-de-pedal", "desligados/carroca-de-pedal", arma=False,
    extras=[
        cinza.anim("carregada", "corpo", 1),
        cinza.anim("rodando-carregada", "corpo", 1, 0, True, igual="carregada"),
        cinza.anim("carregando", "corpo", 1, 0, True, direcoes=8),
    ],
)


def _chapeu(pal):
    def acessorios(parte, corpo_raiz):
        parte("cabeca", m.cilindro("chapeu", (0.0, 0, 1.72), 0.3, 0.03, pal["palha"], corpo_raiz, vertices=16))
    return acessorios


def construir(ctx):
    pal = cinza.Paleta(ctx, "desligados")
    raiz = m.vazio("raiz")
    chassi = cinza.chassi(raiz)
    cinza.rodas("roda", (1.0, -0.6), 2.0, 0.36, 0.14, pal, chassi)
    m.caixa("quadro", (0.2, 0, 0.5), (2.4, 1.8, 0.1), pal["oliva"], chassi, 0.02)
    for x in (0.65, -0.25):
        m.caixa(f"banco{x:+.1f}", (x, 0, 0.75), (0.45, 1.7, 0.1), pal["madeira"], chassi, 0.02)
    pedaleiros = []
    for k, (x, y) in enumerate(((0.65, 0.42), (0.65, -0.42), (-0.25, 0.42), (-0.25, -0.42))):
        pedaleiros.append(cinza.pessoa(ctx, pal, chassi, f"pedaleiro{k}", (x - 0.1, y, 0.3), pose="sentado", escala=1.05,
                                       acessorios=_chapeu(pal), roupa="lona", calca="oliva", botas="escuro", luvas="pele")[1])
    # awning on four poles, the cut fringe of its edge in the team colour
    for x in (1.2, -0.75):
        for lado in (-1, 1):
            m.barra(f"vara{x:+.1f}{lado:+d}", (x, lado * 0.92, 0.5), (x, lado * 0.92, 2.25), 0.03, pal["madeira"], chassi, 6)
    m.caixa("toldo", (0.22, 0, 2.3), (2.3, 2.1, 0.05), pal["lona"], chassi, 0.0, (0, math.radians(4), 0))
    for k, (x, y, w, d) in enumerate(((0.22, 1.07, 2.3, 0.04), (0.22, -1.07, 2.3, 0.04), (1.38, 0, 0.04, 2.1), (-0.94, 0, 0.04, 2.1))):
        m.caixa(f"franja{k}", (x, y, 2.18), (w, d, 0.22), pal["time"], chassi, 0.0)
    for k, (x, y) in enumerate(((0.7, 0.5), (-0.3, -0.5))):
        m.caixa(f"remendo{k}", (x, y, 2.335), (0.5, 0.5, 0.01), pal["ocre" if k else "tijolo"], chassi, 0.0)
    m.barra("puca_cabo", (0.5, -0.9, 1.3), (1.9, -1.4, 0.4), 0.025, pal["madeira"], chassi, 6)
    m.toro("puca_aro", (2.0, -1.45, 0.33), 0.2, 0.025, pal["metal"], chassi, (math.radians(70), 0, 0))
    # trailer with crates under a tarp, the cells showing through the gaps when loaded
    m.barra("engate", (-0.95, 0, 0.5), (-1.4, 0, 0.55), 0.04, pal["metal"], chassi, 6)
    cinza.rodas("roda_reboque", (-2.15,), 1.6, 0.34, 0.12, pal, chassi)
    m.caixa("reboque", (-2.15, 0, 0.75), (1.5, 1.4, 0.3), pal["madeira"], chassi, 0.02)
    caixas = []
    for k, (x, y) in enumerate(((-1.8, 0.33), (-1.8, -0.33), (-2.5, 0.33), (-2.5, -0.33))):
        caixas.append(m.caixa(f"caixa{k}", (x, y, 1.15), (0.6, 0.6, 0.5), pal["madeira"], chassi, 0.02))
    celulas = [m.caixa(f"celulas{k}", (x, y, 1.3), (0.5, 0.5, 0.32), pal["carga"], chassi, 0.02)
               for k, (x, y) in enumerate(((-1.8, 0.0), (-2.5, 0.0)))]
    lona = m.caixa("lona_reboque", (-2.15, 0, 1.45), (1.5, 1.4, 0.06), pal["lona"], chassi, 0.03)
    m.barra("bandeirola_haste", (-2.9, 0.6, 0.9), (-2.9, 0.6, 2.2), 0.02, pal["madeira"], chassi, 4)
    m.caixa("bandeirola", (-3.05, 0.6, 2.05), (0.3, 0.015, 0.22), pal["time"], chassi, 0.0)
    m.ponto("reboque", (-2.15, 0, 1.1), chassi)
    m.ponto("puca", (2.0, -1.45, 0.3), chassi)
    m.ponto("topo", (0.2, 0, 2.6), chassi)
    pecas = cinza.destroco(pal, raiz, 5.2, 2.2, 23)
    return {"raiz": raiz, "chassi": chassi, "celulas": celulas, "lona": lona, "caixas": caixas, "pedaleiros": pedaleiros,
            "destroco": pecas}


def posar(ctx, modelo, animacao, quadro):
    destruido = animacao == "destruido"
    cheia = animacao in ("carregada", "rodando-carregada", "carregando")
    for celula in modelo["celulas"]:
        celula.scale = (1, 1, 1) if cheia else (0, 0, 0)
    # the tarp sags when the trailer is empty and is thrown back while loading
    lona = modelo["lona"]
    lona.location = (-2.15 - (0.9 if animacao == "carregando" else 0), 0, 1.45 if cheia else 1.36)
    lona.rotation_euler = (0, math.radians(-50) if animacao == "carregando" else 0, 0)
    for k, caixa in enumerate(modelo["caixas"]):
        caixa.rotation_euler = (0.6 * k, 0.4, 0.9 * k) if destruido else (0, 0, 0)
    cinza.posar_destroco(modelo, destruido, inclinar=(18, 6))
