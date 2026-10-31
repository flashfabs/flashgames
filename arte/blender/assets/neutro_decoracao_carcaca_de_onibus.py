# SPDX-License-Identifier: GPL-3.0-or-later
"""Prop "carcaca-de-onibus" (brief arte/briefs/neutro-terreno-vale.md): a rusted bus without wheels lying on its
side, blocks the cell; the body overflows the cell sideways. Three variations: on its side, upright and sunk,
and burnt."""

import math

from comum import decoracao
from comum import modelagem as m

DESCRICAO = decoracao.descricao("neutro-decoracao-carcaca-de-onibus", "neutro/terreno-vale", (1, 1), 3.5, 3, folga_lados=(140, 140, 40, 40))


def _onibus(nome, pai, lataria, vidro, escuro):
    grupo = m.vazio(nome, (0, 0, 0), pai)
    m.caixa(f"{nome}_lataria", (0, 0, 1.4), (9.0, 2.5, 2.6), lataria, grupo, 0.15)
    for k in range(8):
        m.caixa(f"{nome}_janela{k}", (-3.6 + k * 1.0, -1.26, 1.9), (0.8, 0.04, 0.8), vidro, grupo, 0.0)
        m.caixa(f"{nome}_janela_b{k}", (-3.6 + k * 1.0, 1.26, 1.9), (0.8, 0.04, 0.8), vidro, grupo, 0.0)
    m.caixa(f"{nome}_frente", (4.52, 0, 1.6), (0.05, 2.2, 1.2), vidro, grupo, 0.0)
    for x in (-3.0, 3.0):
        for lado in (-1, 1):
            m.cilindro(f"{nome}_caixa_roda{x:+.0f}{lado:+d}", (x, lado * 1.2, 0.5), 0.55, 0.2, escuro, grupo, (math.radians(90), 0, 0), 14)
    return grupo


def construir(ctx):
    raiz = m.vazio("raiz")
    lataria = m.material("lataria", "#7A6450", 0.0, 0.85)
    queimada = m.material("lataria_queimada", "#4A403A", 0.0, 0.9)
    vidro = m.material("janela_vazia", "#2A2826", 0.0, 0.9)
    escuro = m.material("ferrugem_escura", "#3E3430", 0.0, 0.9)
    deitado = _onibus("deitado", raiz, lataria, vidro, escuro)
    deitado.rotation_euler = (math.radians(88), 0, math.radians(20))
    deitado.location = (0, 0, -0.2)
    afundado = _onibus("afundado", raiz, lataria, vidro, escuro)
    afundado.rotation_euler = (math.radians(6), math.radians(-4), math.radians(-30))
    afundado.location = (0, 0, -0.45)
    queimado = _onibus("queimado", raiz, queimada, vidro, escuro)
    queimado.rotation_euler = (0, math.radians(3), math.radians(55))
    queimado.location = (0, 0, -0.35)
    return {"raiz": raiz, "variantes": [deitado, afundado, queimado]}


def posar(ctx, modelo, animacao, quadro):
    for k, grupo in enumerate(modelo["variantes"]):
        grupo.scale = (1, 1, 1) if k == quadro else (0, 0, 0)
