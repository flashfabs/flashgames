# SPDX-License-Identifier: GPL-3.0-or-later
"""Paiol, gray kit (brief arte/briefs/desligados-construcao-paiol.md): the depot, a low closed build of crates
and bales stacked in a U as walls, under a canvas stretched on poles, with a plank unloading ramp in front and,
beside the ramp, a short wooden derrick with a boom and a rope hoist, its only tall part."""

import math

from comum import cinza
from comum import modelagem as m

PEGADA = (3, 2)
DESCRICAO = cinza.descricao_construcao("desligados-construcao-paiol", "desligados/paiol", "desligados", PEGADA, 7.0)


def construir(ctx):
    pal = cinza.Paleta(ctx, "desligados")
    raiz = m.vazio("raiz")
    estragos = cinza.Estragos(raiz, 79)
    m.caixa("chao", (0, 0, 0.03), (11.4, 7.4, 0.06), pal["terra"], raiz, 0.02)
    paredes = estragos.grupo("paredes", (0.5, 0.8, 0.06), "parede")
    k = 0
    for x0, y0, x1, y1 in ((-4.0, 2.4, 4.0, 2.4), (-4.0, -2.0, -4.0, 2.4), (4.0, -2.0, 4.0, 2.4)):
        n = max(1, int(math.hypot(x1 - x0, y1 - y0) / 1.1))
        for i in range(n + 1):
            t = i / n
            for nivel in range(2):
                material = pal[("madeira", "palha", "lona")[(i + nivel) % 3]]
                m.caixa(f"pilha{k}", (x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, 0.5 + nivel * 0.95), (1.05, 1.0, 0.9), material, paredes, 0.05,
                        (0, 0, 0.08 * ((i * 7 + nivel) % 3 - 1)))
                k += 1
    lona = estragos.grupo("lona", (0.5, 0.8, 2.3), "telhado", queda=250)
    m.caixa("lona_teto", (0, 0, 0.3), (8.8, 5.4, 0.05), pal["lona"], lona, 0.0, (math.radians(6), 0, 0))
    m.caixa("lona_faixa", (0, -2.7, 0.0), (8.8, 0.03, 0.35), pal["time"], lona, 0.0)
    for x in (-4.3, 0.0, 4.3):
        for y in (-2.6, 2.6):
            m.barra(f"vara{x:+.0f}{y:+.0f}", (x, y, -2.24), (x, y, 0.3), 0.05, pal["madeira"], lona, 6)
    m.caixa("celulas", (0.5, 1.0, 0.7), (5.0, 2.5, 1.3), pal["carga"], raiz, 0.05)
    rampa = estragos.grupo("rampa", (-1.0, -2.3, 0.06), "detalhe")
    for i in range(6):
        m.caixa(f"tabua{i}", (-0.75 + i * 0.3, -0.6, 0.25), (0.26, 2.0, 0.06), pal["madeira"], rampa, 0.0, (math.radians(14), 0, 0))
    pau = estragos.grupo("pau_de_carga", (2.6, -2.6, 0.06), "alto", queda=300)
    m.barra("pau_mastro", (0, 0, 0), (0, 0, 6.0), 0.12, pal["madeira"], pau, 6)
    m.barra("pau_lanca", (0, 0, 3.0), (-2.4, 0.4, 5.4), 0.08, pal["madeira"], pau, 6)
    m.barra("pau_corda", (-2.4, 0.4, 5.4), (-2.4, 0.4, 2.4), 0.02, pal["palha"], pau, 4)
    m.caixa("pau_caixa", (-2.4, 0.4, 2.1), (0.6, 0.6, 0.55), pal["madeira"], pau, 0.02)
    m.caixa("bandeirola", (0.3, 0, 5.7), (0.6, 0.02, 0.35), pal["time"], pau, 0.0)
    estragos.detritos(pal, *PEGADA, 14, mats=("madeira", "lona", "palha"))
    m.ponto("doca", (-1.0, -3.6, 0.0), raiz)
    m.ponto("topo", (0.5, 0.8, 5.0), raiz)
    return {"raiz": raiz, "estragos": estragos}


def posar(ctx, modelo, animacao, quadro):
    modelo["estragos"].aplicar(animacao)
