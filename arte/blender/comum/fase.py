# SPDX-License-Identifier: GPL-3.0-or-later
"""Phase packer: the frames of every sprite asset of a phase in shared atlas pages.

The renderer gives each atlas page one layer of its texture arrays (about 32 MiB at 2048 px in uhd), so one page
per asset would cost more than a gigabyte for the 34 pieces of phase 1. Here the trimmed frames of the runs that
are in the repository are packed together; each asset manifest keeps listing the pages it uses, now shared files
under site/rts/assets/sprites/<phase>/, and the phase manifest next to them holds the pages and the budget.
Runs on the RTX 4090 PC inside Blender (numpy and the WebP encoder), with no GPU work.
"""

import json
import os

from . import empacotar

PASTA_FASE = "sprites"


class ProjecaoGravada:
    """The projection a run used, read back from its report (the manifest records elevation, version and px)."""

    def __init__(self, resumo):
        self.elevacao = resumo["elevacaoGraus"]
        self.versao = resumo["versao"]
        self.px_por_celula = resumo["pxPorCelula"]


def _ler(caminho):
    with open(caminho, encoding="utf-8") as arquivo:
        return json.load(arquivo)


def _pasta_do_asset(descricao):
    return os.path.join(PASTA_FASE, descricao["categoria"])


def executar(fase, execucoes, saida, qualidade_cor, progresso=print):
    """execucoes: [(asset, run folder)]; writes <saida>/pacote laid out like the repository and returns the report."""
    itens = []
    quadros = []
    for asset, pasta in execucoes:
        descricao = _ler(os.path.join(pasta, "quadros", "descricao.json"))
        if descricao["asset"] != asset:
            raise ValueError(f"run {pasta} rendered {descricao['asset']}, not {asset}")
        if fase not in descricao.get("fases", []):
            raise ValueError(f"{asset} is not in phase {fase}")
        if descricao["tipo"] in ("terreno", "interface"):
            raise ValueError(f"{asset} is a {descricao['tipo']} asset, which never goes in the sprite arrays")
        relatorio = _ler(os.path.join(pasta, "relatorio.json"))
        recortados = empacotar.uhd_como_hd(descricao, empacotar.recortar_quadros(descricao, pasta))
        itens.append({"asset": asset, "pasta": pasta, "descricao": descricao, "relatorio": relatorio,
                      "pontos": _ler(os.path.join(pasta, "quadros", "pontos.json")), "inicio": len(quadros), "total": len(recortados)})
        quadros += recortados
        progresso(f"PROGRESSO {asset}: {len(recortados)} frames")
    lista, mapa = empacotar.unicos(quadros)
    progresso(f"PROGRESSO {len(quadros)} frames, {len(lista)} unique, packing")

    destino_fase = os.path.join(saida, "pacote", "site", "rts", "assets", PASTA_FASE, fase)
    os.makedirs(destino_fase, exist_ok=True)
    paginas, entradas, orcamento = {}, {}, {}
    for nivel in ("uhd", "hd"):
        paginas[nivel], entradas[nivel] = empacotar.montar_paginas(lista, nivel, destino_fase, fase, qualidade_cor, empacotar.PAGINA[nivel])
        arquivos = sum(os.path.getsize(os.path.join(destino_fase, pg[p])) for pg in paginas[nivel] for p in pg if p not in ("largura", "altura"))
        pixels = sum(q[nivel]["pixels"]["cor"].shape[0] * q[nivel]["pixels"]["cor"].shape[1] for q in lista)
        area = sum(pg["largura"] * pg["altura"] for pg in paginas[nivel])
        orcamento[nivel] = {"bytesArquivos": arquivos, "bytesGpuEstimados": empacotar.bytes_gpu(paginas[nivel], "unidade"),
                            "camadas": len(paginas[nivel]), "pixels": int(pixels), "ocupacao": round(pixels / area, 3)}
        progresso(f"PROGRESSO {nivel}: {len(paginas[nivel])} pages, occupancy {orcamento[nivel]['ocupacao']}")

    resumo_assets = {}
    for item in itens:
        descricao = item["descricao"]
        locais, dados_nivel = {}, {}
        for nivel in ("uhd", "hd"):
            proprias = [entradas[nivel][mapa[i]] for i in range(item["inicio"], item["inicio"] + item["total"])]
            usadas = sorted({e[0] for e in proprias})
            local = {pagina: k for k, pagina in enumerate(usadas)}
            locais[nivel] = [dict(paginas[nivel][p], **{chave: f"../{fase}/{valor}" for chave, valor in paginas[nivel][p].items()
                                                         if chave not in ("largura", "altura")}) for p in usadas]
            dados_nivel[nivel] = [[local[e[0]], *e[1:]] for e in proprias]
            unicos_do_asset = {mapa[i] for i in range(item["inicio"], item["inicio"] + item["total"])}
            locais.setdefault("_orcamento", {})[nivel] = {
                "pixels": int(sum(lista[u][nivel]["pixels"]["cor"].shape[0] * lista[u][nivel]["pixels"]["cor"].shape[1] for u in unicos_do_asset)),
                "quadrosUnicos": len(unicos_do_asset), "paginasUsadas": len(usadas)}
        projecao = ProjecaoGravada(item["relatorio"]["projecao"])
        dados = empacotar.manifesto(descricao, projecao, {n: locais[n] for n in ("uhd", "hd")}, dados_nivel, item["pontos"], locais["_orcamento"])
        dados["pacote"] = f"{PASTA_FASE}/{fase}/{fase}.json"
        destino = os.path.join(saida, "pacote", "site", "rts", "assets", _pasta_do_asset(descricao))
        os.makedirs(destino, exist_ok=True)
        with open(os.path.join(destino, f"{descricao['asset']}.json"), "w", encoding="utf-8") as arquivo:
            json.dump(dados, arquivo, ensure_ascii=False, separators=(",", ":"))
            arquivo.write("\n")
        resumo_assets[item["asset"]] = {"execucao": os.path.basename(os.path.normpath(item["pasta"])), "orcamento": locais["_orcamento"]}

    pacote = {"versao": 1, "fase": fase, "paginas": paginas, "orcamento": orcamento, "assets": dict(sorted(resumo_assets.items())),
              "conta": "bytesGpuEstimados = camadas x largura x altura x 6 (cor RGBA8, time R8, sombra R8) x 4/3 de mipmaps, como no backend WebGL2"}
    with open(os.path.join(destino_fase, f"{fase}.json"), "w", encoding="utf-8") as arquivo:
        json.dump(pacote, arquivo, ensure_ascii=False, indent=1)
        arquivo.write("\n")
    return {"fase": fase, "assets": len(itens), "quadros": len(quadros), "quadrosUnicos": len(lista), "orcamento": orcamento}
