# SPDX-License-Identifier: GPL-3.0-or-later
"""Entry point of the art factory, run by Blender 5.2 in background on the RTX 4090 PC (rtx.sh renderizar):

    blender -b --factory-startup --python-exit-code 1 -P renderizar.py -- --asset <asset> --saida <run folder>

Builds the asset from arte/blender/assets/<asset>.py, renders every pass, layer, animation, direction and frame
into <run folder>/quadros, packs the atlases, manifest and provenance into <run folder>/pacote (laid out like
the repository) and writes <run folder>/relatorio.json.

With --fase <phase> --execucoes <asset>/<run>+... it packs those runs of D:\\rts\\saida into the shared atlas
pages of the phase instead (comum/fase.py), without rendering anything.
"""

import argparse
import importlib.util
import json
import os
import shutil
import sys
import time

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)

from comum import empacotar, fabrica, fase, projecao  # noqa: E402


def ler_argumentos():
    depois = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    leitor = argparse.ArgumentParser(prog="renderizar.py")
    leitor.add_argument("--asset", required=True)
    leitor.add_argument("--saida", required=True)
    leitor.add_argument("--projecao", default=None)
    leitor.add_argument("--elevacao", type=float, default=None, help="camera elevation in degrees (style gate variants)")
    leitor.add_argument("--direcoes", type=int, default=None, help="override the asset's number of directions")
    leitor.add_argument("--passes", default=None, help="override the passes, joined by +, e.g. cor+time+normal")
    leitor.add_argument("--qualidade-cor", type=int, default=90, help="WebP quality of the colour pages (100 = lossless)")
    leitor.add_argument("--commit", default=None, help="commit of the scripts, recorded in the provenance")
    leitor.add_argument("--so-empacotar", action="store_true", help="pack the frames already in --saida")
    leitor.add_argument("--fase", default=None, help="pack the runs of --execucoes into the shared pages of this phase")
    leitor.add_argument("--execucoes", default=None, help="asset/run pairs joined by +, runs under the parent of the asset folder")
    return leitor.parse_args(depois)


def carregar_asset(asset):
    caminho = os.path.join(AQUI, "assets", asset.replace("-", "_") + ".py")
    especificacao = importlib.util.spec_from_file_location(f"asset_{asset.replace('-', '_')}", caminho)
    modulo = importlib.util.module_from_spec(especificacao)
    especificacao.loader.exec_module(modulo)
    return modulo, caminho


def ajustar_descricao(descricao, argumentos, proj):
    """Apply command-line variants; an elevation other than the contract's renders as a separate asset id."""
    if argumentos.direcoes:
        # animations that set their own directions (a short transition in 8) keep them
        descricao["direcoes"] = argumentos.direcoes
    if argumentos.passes:
        descricao["passes"] = argumentos.passes.split("+")
    if argumentos.elevacao is not None:
        descricao["asset"] = f"{descricao['asset']}-e{int(round(argumentos.elevacao))}"
    for nome, config in descricao["camadas"].items():
        if any(v % 2 for v in (*config["quadro"], *config["ancora"])):
            raise ValueError(f"layer {nome}: frame size and anchor must be even, so hd is an exact half of uhd")
    return descricao


def empacotar_fase(argumentos, inicio):
    saidas = os.path.dirname(os.path.dirname(os.path.normpath(argumentos.saida)))
    execucoes = []
    for par in argumentos.execucoes.split("+"):
        asset, execucao = par.split("/")
        execucoes.append((asset, os.path.join(saidas, asset, execucao)))
    pacote = os.path.join(argumentos.saida, "pacote")
    if os.path.isdir(pacote):
        shutil.rmtree(pacote)
    relatorio = fase.executar(argumentos.fase, execucoes, argumentos.saida, argumentos.qualidade_cor, lambda m: print(m, flush=True))
    relatorio["commit"] = argumentos.commit
    relatorio["segundos_total"] = round(time.perf_counter() - inicio, 2)
    with open(os.path.join(argumentos.saida, "relatorio.json"), "w", encoding="utf-8") as arquivo:
        json.dump(relatorio, arquivo, ensure_ascii=False, indent=2)
    print("RESUMO " + json.dumps(relatorio, ensure_ascii=False), flush=True)


def principal():
    argumentos = ler_argumentos()
    inicio = time.perf_counter()
    os.makedirs(argumentos.saida, exist_ok=True)
    if argumentos.fase:
        empacotar_fase(argumentos, inicio)
        return
    proj = projecao.carregar(argumentos.projecao, argumentos.elevacao)
    modulo, caminho = carregar_asset(argumentos.asset)
    descricao = ajustar_descricao(modulo.DESCRICAO, argumentos, proj)
    print(f"PROGRESSO asset {descricao['asset']}, projection {proj.origem} v{proj.versao}, elevation {proj.elevacao}")
    caminho_relatorio = os.path.join(argumentos.saida, "relatorio.json")
    if argumentos.so_empacotar:
        with open(caminho_relatorio, encoding="utf-8") as arquivo:
            relatorio = json.load(arquivo)
        with open(os.path.join(argumentos.saida, "quadros", "pontos.json"), encoding="utf-8") as arquivo:
            tabela_pontos = json.load(arquivo)
    else:
        relatorio, tabela_pontos = fabrica.executar(modulo, proj, argumentos, argumentos.saida, lambda m: print(m, flush=True))
    # the phase packer reads back exactly what this run rendered
    with open(os.path.join(argumentos.saida, "quadros", "descricao.json"), "w", encoding="utf-8") as arquivo:
        json.dump(descricao, arquivo, ensure_ascii=False, indent=1)
    pacote = os.path.join(argumentos.saida, "pacote")
    if os.path.isdir(pacote):
        shutil.rmtree(pacote)
    t = time.perf_counter()
    script = "arte/blender/assets/" + os.path.basename(caminho)
    relatorio["orcamento"] = empacotar.executar(descricao, proj, argumentos.saida, tabela_pontos, relatorio, argumentos, script)
    relatorio["segundos_empacotar"] = round(time.perf_counter() - t, 2)
    relatorio["segundos_total"] = round(time.perf_counter() - inicio, 2)
    relatorio["asset"] = descricao["asset"]
    relatorio["bytes_saida"] = sum(os.path.getsize(os.path.join(p, f)) for p, _, fs in os.walk(argumentos.saida) for f in fs)
    with open(caminho_relatorio, "w", encoding="utf-8") as arquivo:
        json.dump(relatorio, arquivo, ensure_ascii=False, indent=2)
    print("RESUMO " + json.dumps(relatorio, ensure_ascii=False), flush=True)


principal()
