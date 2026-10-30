# SPDX-License-Identifier: GPL-3.0-or-later
"""Reads the projection and light contract (site/rts/dados/projecao.json, owned by the render front).

rtx.sh copies the file to D:\\rts\\config\\projecao.json; when it is missing the defaults below, equal to
contract v0 of 30/10/2026, keep the factory running and the report says so.
"""

import json
import math
import os

PADRAO = {
    "versao": 0,
    "camera": {"elevacaoGraus": 55},
    "metrosPorCelula": 4,
    "pxPorCelula": {"hd": 64, "uhd": 128},
    "sol": {"energia": 2.6, "anguloGraus": 6, "blenderRotacaoGraus": [40, 0, -135]},
    "ceu": {"cor": [0.42, 0.44, 0.48], "forca": 0.35},
    "transformacaoDeCor": "Standard",
    "aparencia": "None",
    "exposicao": 0,
    "gama": 1,
    "exageroInfantaria": 1.4,
    "direcoes": {"zero": "leste", "sentido": "horario-na-tela", "giraOModelo": True},
    "time": {"fator": 1.8, "cinzaNoPasseDeCor": 140},
}


class Projecao:
    """Typed view of the contract, with the camera elevation overridable for the style gate."""

    def __init__(self, dados, origem, elevacao=None):
        self.dados = dados
        self.origem = origem
        self.versao = dados.get("versao", 0)
        camera = dados.get("camera", {})
        self.elevacao = float(elevacao if elevacao is not None else camera.get("elevacaoGraus", dados.get("elevacaoGraus", 55)))
        self.metros_por_celula = float(dados["metrosPorCelula"])
        self.px_por_celula = {nivel: int(px) for nivel, px in dados["pxPorCelula"].items()}
        self.sol = dados["sol"]
        self.ceu = dados.get("ceu", PADRAO["ceu"])
        self.transformacao = dados.get("transformacaoDeCor", "Standard")
        self.aparencia = dados.get("aparencia", "None")
        self.exposicao = float(dados.get("exposicao", 0))
        self.gama = float(dados.get("gama", 1))
        self.exagero_infantaria = float(dados.get("exageroInfantaria", 1.4))
        self.cinza_time = int(dados.get("time", {}).get("cinzaNoPasseDeCor", 140))

    def metros_por_px(self, nivel="uhd"):
        return self.metros_por_celula / self.px_por_celula[nivel]

    def cinza_time_linear(self):
        """Linear value of the neutral team grey, so it lands near cinzaNoPasseDeCor once the Standard view encodes it."""
        c = self.cinza_time / 255.0
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    def rotacao_sol(self):
        return tuple(math.radians(g) for g in self.sol["blenderRotacaoGraus"])

    def resumo(self):
        return {"origem": self.origem, "versao": self.versao, "elevacaoGraus": self.elevacao,
                "metrosPorCelula": self.metros_por_celula, "pxPorCelula": self.px_por_celula}


def carregar(caminho=None, elevacao=None):
    if caminho and os.path.exists(caminho):
        with open(caminho, encoding="utf-8") as arquivo:
            return Projecao(json.load(arquivo), caminho, elevacao)
    return Projecao(PADRAO, "padrao-embutido-v0", elevacao)
