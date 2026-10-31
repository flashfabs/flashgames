# SPDX-License-Identifier: GPL-3.0-or-later
"""Packer of the art factory, run inside Blender with its bundled numpy (nothing to install):
trim, anchor, hd by 2x2 reduction of uhd, MaxRects atlas pages of one size per level, WebP, content hash in the file
name, sprite manifest (contract C9) and provenance record.

Images move as raw 8-bit values from the PNG frames to the WebP pages (no colour conversion): the colour page
keeps straight alpha (the game premultiplies on decode), masks are lossless RGB without alpha. The pages carry
no metadata chunk (EXIF, XMP, ICCP); the packer checks the RIFF chunks of every file it writes. Colour and
shadow pages are lossy (quality 90 and 85), the team mask and the normals lossless.
"""

import hashlib
import json
import os
import re
from fractions import Fraction

import bpy
import numpy as np

from . import maxrects
from .fabrica import caminho_quadro, indices_reusados, ordem_dos_quadros

BORDA = 1
MARGEM = 2
# One page size per level: the renderer stacks pages in a texture array whose layers all take the size
# of the largest page, so a uniform size wastes nothing (agreed with the render front on 30/10/2026).
PAGINA = {"uhd": 2048, "hd": 1024}
# What the renderer allocates per atlas page (site/rts/js/render/backend-webgl2.js): one layer in each of three
# texture arrays, colour RGBA8, team mask R8 and shadow R8, whatever passes the page has, plus a full mip chain.
BYTES_GPU_POR_PIXEL = 4 + 1 + 1
MIPMAPS = Fraction(4, 3)
BLOCOS_PERMITIDOS = {"VP8 ", "VP8L", "VP8X", "ALPH"}
# The soft, noisy shadow compresses badly without loss (about 5 MB per 4096 page) and loses nothing visible with it.
QUALIDADE_SOMBRA = 85
LIMIAR_SOMBRA = 6
PASTA_POR_TIPO = {"terreno": "terreno", "interface": "interface", "video": "video"}


def ler_png(caminho):
    """Frame as uint8 (height, width, 4), top row first, or None when the frame was not rendered."""
    if not os.path.exists(caminho):
        return None
    imagem = bpy.data.images.load(caminho, check_existing=False)
    imagem.colorspace_settings.name = "Non-Color"
    largura, altura = imagem.size
    buffer = np.empty(largura * altura * 4, np.float32)
    imagem.pixels.foreach_get(buffer)
    bpy.data.images.remove(imagem)
    return np.ascontiguousarray((buffer.reshape(altura, largura, 4)[::-1] * 255.0 + 0.5).astype(np.uint8))


def blocos_riff(caminho):
    with open(caminho, "rb") as arquivo:
        dados = arquivo.read()
    if dados[:4] != b"RIFF" or dados[8:12] != b"WEBP":
        raise ValueError(f"{caminho} is not a WebP file")
    blocos, i = [], 12
    while i + 8 <= len(dados):
        tamanho = int.from_bytes(dados[i + 4:i + 8], "little")
        blocos.append(dados[i:i + 4].decode("latin1"))
        i += 8 + tamanho + (tamanho & 1)
    return blocos


def gravar_webp(pixels, caminho, qualidade):
    """Write uint8 (height, width, 3 or 4) as WebP; quality 100 is lossless in Blender's encoder."""
    altura, largura, canais = pixels.shape
    imagem = bpy.data.images.new("pagina", largura, altura, alpha=canais == 4)
    imagem.colorspace_settings.name = "Non-Color"
    flutuante = np.ones((altura, largura, 4), np.float32)
    flutuante[..., :canais] = pixels / 255.0
    imagem.pixels.foreach_set(flutuante[::-1].ravel())
    imagem.filepath_raw = caminho
    imagem.file_format = "WEBP"
    imagem.save(filepath=caminho, quality=qualidade)
    bpy.data.images.remove(imagem)
    blocos = blocos_riff(caminho)
    extras = set(blocos) - BLOCOS_PERMITIDOS
    if extras:
        raise ValueError(f"{caminho} carries metadata chunks {sorted(extras)}")
    return "VP8L" in blocos


def conferir_sem_perda(pixels, caminho):
    """Read a lossless page back and demand the exact bytes: proof that no colour conversion happened."""
    lido = ler_png(caminho)  # Blender's loader reads WebP too
    canais = pixels.shape[2]
    if not np.array_equal(lido[..., :canais], pixels):
        diferenca = int(np.abs(lido[..., :canais].astype(int) - pixels.astype(int)).max())
        raise ValueError(f"{caminho} does not read back byte for byte (max difference {diferenca})")


def caixa_do_alfa(alfa, ancora):
    """Bounding box of the visible pixels plus a transparent border, on even coordinates relative to the anchor."""
    linhas = np.flatnonzero(alfa.any(axis=1))
    colunas = np.flatnonzero(alfa.any(axis=0))
    altura, largura = alfa.shape
    if len(linhas) == 0:
        x0, y0 = ancora[0] - 2, ancora[1] - 2
        return max(0, x0), max(0, y0), min(largura, x0 + 4), min(altura, y0 + 4)

    def par_abaixo(v, a):
        return a + ((v - a) // 2) * 2

    def par_acima(v, a):
        return a - ((a - v) // 2) * 2

    x0 = max(0, par_abaixo(colunas[0] - BORDA, ancora[0]))
    y0 = max(0, par_abaixo(linhas[0] - BORDA, ancora[1]))
    x1 = min(largura, par_acima(colunas[-1] + 1 + BORDA, ancora[0]))
    y1 = min(altura, par_acima(linhas[-1] + 1 + BORDA, ancora[1]))
    return x0, y0, x1, y1


def reduzir(pixels, pesos):
    """2x2 reduction weighted by coverage, so edges keep their colour instead of darkening (premultiplied box)."""
    altura, largura = pixels.shape[:2]
    p = pixels[:altura // 2 * 2, :largura // 2 * 2].astype(np.float32)
    w = pesos[:altura // 2 * 2, :largura // 2 * 2].astype(np.float32)[..., None] / 255.0
    soma_w = w.reshape(altura // 2, 2, largura // 2, 2, 1).sum(axis=(1, 3))
    soma = (p * w).reshape(altura // 2, 2, largura // 2, 2, -1).sum(axis=(1, 3))
    media_simples = p.reshape(altura // 2, 2, largura // 2, 2, -1).mean(axis=(1, 3))
    resultado = np.where(soma_w > 0, soma / np.maximum(soma_w, 1e-6), media_simples)
    return np.clip(resultado + 0.5, 0, 255).astype(np.uint8)


def reduzir_cor(cor):
    rgb = reduzir(cor[..., :3], cor[..., 3])
    alfa = cor[..., 3].astype(np.float32)
    altura, largura = alfa.shape
    alfa = alfa[:altura // 2 * 2, :largura // 2 * 2].reshape(altura // 2, 2, largura // 2, 2).mean(axis=(1, 3))
    return np.concatenate([rgb, np.clip(alfa + 0.5, 0, 255).astype(np.uint8)[..., None]], axis=2)


def sangrar(cor, passos=4):
    """Spread edge colours into fully transparent pixels, so filtering never pulls black into the edge."""
    rgb = cor[..., :3].astype(np.float32)
    cheio = cor[..., 3] > 0
    for _ in range(passos):
        soma = np.zeros_like(rgb)
        conta = np.zeros(cheio.shape, np.float32)
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            vizinho = np.roll(cheio, (dy, dx), axis=(0, 1))
            soma += np.roll(rgb, (dy, dx), axis=(0, 1)) * vizinho[..., None]
            conta += vizinho
        novos = (~cheio) & (conta > 0)
        rgb[novos] = soma[novos] / conta[novos][:, None]
        cheio = cheio | novos
    saida = cor.copy()
    saida[..., :3] = np.clip(rgb + 0.5, 0, 255).astype(np.uint8)
    return saida


def canais_do_passe(passe, imagem):
    """What each pass stores: colour keeps RGBA, team mask and normal keep RGB, shadow keeps its alpha as grey."""
    if passe == "cor":
        return imagem
    if passe == "sombra":
        return np.repeat(imagem[..., 3:4], 3, axis=2)
    return imagem[..., :3]


def recortar_quadros(descricao, saida):
    """Trim every frame of every pass once, for uhd and hd, sharing one box per frame across passes."""
    passes = descricao["passes"]
    reusados = indices_reusados(descricao)
    quadros = []
    for indice, (animacao, direcao, quadro) in enumerate(ordem_dos_quadros(descricao)):
        if indice in reusados:
            # the very same object: the packer gives both indices one rectangle
            quadros.append(quadros[reusados[indice]])
            continue
        config = descricao["camadas"][animacao["camada"]]
        largura, altura = config["quadro"]
        ancora = config["ancora"]
        imagens = {p: ler_png(caminho_quadro(saida, animacao, p, direcao, quadro)) for p in passes}
        vazio = np.zeros((altura, largura, 4), np.uint8)
        imagens = {p: (img if img is not None else vazio) for p, img in imagens.items()}
        alfa = imagens["cor"][..., 3] > 0
        if "sombra" in imagens:
            # the shadow catcher leaves a faint, noisy veil over the whole ground: keep only real shadow
            sombra = imagens["sombra"].copy()
            sombra[..., 3][sombra[..., 3] <= LIMIAR_SOMBRA] = 0
            imagens["sombra"] = sombra
            alfa = alfa | (sombra[..., 3] > 0)
        x0, y0, x1, y1 = caixa_do_alfa(alfa, ancora)
        uhd = {p: canais_do_passe(p, img[y0:y1, x0:x1]) for p, img in imagens.items()}
        uhd["cor"] = sangrar(uhd["cor"])
        pesos = imagens["cor"][y0:y1, x0:x1, 3]
        hd = {}
        for p, img in uhd.items():
            if p == "cor":
                hd[p] = sangrar(reduzir_cor(img))
            elif p == "sombra":
                hd[p] = reduzir(img, np.full(img.shape[:2], 255, np.uint8))
            else:
                hd[p] = reduzir(img, pesos)
        quadros.append({
            "uhd": {"pixels": uhd, "deslocamento": (x0 - ancora[0], y0 - ancora[1])},
            "hd": {"pixels": hd, "deslocamento": ((x0 - ancora[0]) // 2, (y0 - ancora[1]) // 2)},
        })
    return quadros


def bytes_gpu(paginas, tipo):
    """Estimated GPU memory of a level's pages: texture-array layers for sprites, plain RGBA bitmaps for the HUD."""
    if tipo == "interface":
        return sum(pg["largura"] * pg["altura"] * 4 for pg in paginas)
    camadas = sum(pg["largura"] * pg["altura"] for pg in paginas)
    return int(camadas * BYTES_GPU_POR_PIXEL * MIPMAPS)


def unicos(quadros):
    """Unique frames and, per manifest index, the position of its frame among them: reused frames (the same
    object) and frames with identical pixels in every pass share one rectangle."""
    por_objeto, por_conteudo, lista, mapa = {}, {}, [], []
    for quadro in quadros:
        chave = id(quadro)
        if chave not in por_objeto:
            resumo = hashlib.sha1(repr(quadro["uhd"]["deslocamento"]).encode())
            for passe in sorted(quadro["uhd"]["pixels"]):
                pixels = quadro["uhd"]["pixels"][passe]
                resumo.update(passe.encode() + repr(pixels.shape).encode() + pixels.tobytes())
            digest = resumo.hexdigest()
            if digest not in por_conteudo:
                por_conteudo[digest] = len(lista)
                lista.append(quadro)
            por_objeto[chave] = por_conteudo[digest]
        mapa.append(por_objeto[chave])
    return lista, mapa


def montar_paginas(quadros, nivel, destino, prefixo, qualidade_cor, lado, fixo=True):
    """Pack unique frames into pages of one level. Every page stores colour, plus each other pass that one of its
    frames has (a frame without that pass leaves zeros). Returns the pages and, per frame, [page, x, y, w, h, dx, dy]."""
    tamanhos = [q[nivel]["pixels"]["cor"].shape[1::-1] for q in quadros]
    arranjo = maxrects.empacotar(tamanhos, lado, MARGEM, fixo=fixo)
    entradas = [None] * len(quadros)
    paginas = []
    for numero, (largura, altura, posicoes) in enumerate(arranjo):
        passes = ["cor"] + sorted({p for indice in posicoes for p in quadros[indice][nivel]["pixels"] if p != "cor"},
                                  key=lambda p: ("time", "normal", "sombra").index(p))
        folhas = {p: np.zeros((altura, largura, 4 if p == "cor" else 3), np.uint8) for p in passes}
        for indice, (x, y) in posicoes.items():
            w, h = tamanhos[indice]
            for p, pixels in quadros[indice][nivel]["pixels"].items():
                folhas[p][y:y + h, x:x + w] = pixels
            dx, dy = quadros[indice][nivel]["deslocamento"]
            entradas[indice] = [numero, int(x), int(y), int(w), int(h), int(dx), int(dy)]
        pagina = {"largura": largura, "altura": altura}
        for p in passes:
            temporario = os.path.join(destino, f"_{nivel}-{numero}-{p}.webp")
            qualidade = {"cor": qualidade_cor, "sombra": QUALIDADE_SOMBRA}.get(p, 100)
            sem_perda = gravar_webp(folhas[p], temporario, qualidade)
            if sem_perda:
                conferir_sem_perda(folhas[p], temporario)
            with open(temporario, "rb") as arquivo:
                resumo = hashlib.sha256(arquivo.read()).hexdigest()[:6]
            nome = f"{prefixo}@{nivel}-p{numero}.{p}.{resumo}.webp"
            os.replace(temporario, os.path.join(destino, nome))
            pagina[p] = nome
        paginas.append(pagina)
    return paginas, entradas


def lado_da_pagina(descricao, nivel):
    return descricao.get("pagina", PAGINA)[nivel]


def montar_nivel(descricao, quadros, nivel, destino, qualidade_cor):
    lista, mapa = unicos(quadros)
    fixo = descricao["tipo"] != "interface"
    paginas, entradas = montar_paginas(lista, nivel, destino, descricao["asset"], qualidade_cor, lado_da_pagina(descricao, nivel), fixo)
    bytes_arquivos = sum(os.path.getsize(os.path.join(destino, pg[p])) for pg in paginas for p in pg if p not in ("largura", "altura"))
    orcamento = {"bytesArquivos": bytes_arquivos, "bytesGpuEstimados": bytes_gpu(paginas, descricao["tipo"]),
                 "quadrosUnicos": len(lista), "pixels": int(sum(q[nivel]["pixels"]["cor"].shape[0] * q[nivel]["pixels"]["cor"].shape[1] for q in lista))}
    return paginas, [entradas[i] for i in mapa], orcamento


def pontos_do_manifesto(tabela_pontos):
    # runs made before points carried their own name keep Blender's duplicate suffix (giroflex.001)
    return {re.sub(r"\.\d{3}$", "", nome): lista for nome, lista in sorted(tabela_pontos.items()) if any(v is not None for v in lista)}


def manifesto(descricao, projecao, paginas, entradas, tabela_pontos, orcamento):
    animacoes = {}
    base = 0
    for a in descricao["animacoes"]:
        direcoes = a.get("direcoes", descricao["direcoes"])
        animacoes[a["nome"]] = {"camada": a["camada"], "direcoes": direcoes, "quadros": a["quadros"],
                                "fps": a.get("fps", 0), "laco": a.get("laco", True), "base": base}
        if a.get("igual"):
            animacoes[a["nome"]]["igual"] = a["igual"]
        base += direcoes * a["quadros"]
    camadas = list(descricao["camadas"])
    por_camada = {}
    for nome, config in descricao["camadas"].items():
        w, h = config["quadro"]
        ax, ay = config["ancora"]
        por_camada[nome] = {"uhd": {"quadro": [w, h], "ancora": [ax, ay]}, "hd": {"quadro": [w // 2, h // 2], "ancora": [ax // 2, ay // 2]}}
    primeira = por_camada[camadas[0]]
    extras = {chave: descricao[chave] for chave in ("pegada", "variantes") if chave in descricao}
    return {
        "versao": 1,
        "asset": descricao["asset"],
        "brief": descricao.get("brief"),
        **extras,
        "tipo": descricao["tipo"],
        "categoria": descricao["categoria"],
        "fases": descricao.get("fases", []),
        "acabamento": descricao.get("acabamento", "portao"),
        "direcoes": descricao["direcoes"],
        "angulo0": "leste",
        "sentido": "horario-na-tela",
        "elevacaoGraus": projecao.elevacao,
        "projecaoVersao": projecao.versao,
        "pxPorCelula": projecao.px_por_celula,
        "ancora": {"uhd": primeira["uhd"]["ancora"], "hd": primeira["hd"]["ancora"]},
        "camadas": camadas,
        "quadroPorCamada": por_camada,
        "animacoes": animacoes,
        "passes": descricao["passes"],
        "paginas": paginas,
        "quadros": entradas,
        "pontos": {"uhd": pontos_do_manifesto(tabela_pontos)},
        "orcamento": orcamento,
        "procedencia": f"arte/procedencia/{descricao['asset']}.json",
    }


def procedencia(descricao, relatorio, argumentos, script, saida=None):
    return {
        "versao": 1,
        "asset": descricao["asset"],
        "brief": descricao.get("brief"),
        "autoria": descricao.get("autoria", "Modelo, materiais e animação procedurais escritos em Python pela sessão rts-arte (Claude Code) a pedido de Victor Cruz"),
        "metodo": "procedural por script, sem modelagem manual e sem IA generativa",
        "script": script,
        "commit": argumentos.commit,
        "execucao": os.path.basename(os.path.normpath(saida)) if saida else None,
        "ferramentas": [{"nome": "Blender", "versao": relatorio["blender"], "licenca": "GPL-3.0-or-later",
                         "uso": "modelagem, render Cycles e empacotamento"}],
        "ia": [],
        "fontesExternas": [],
        "render": {"dispositivo": relatorio["dispositivo"], "gpus": relatorio["gpus"], "projecao": relatorio["projecao"],
                   "segundosPorQuadro": relatorio["segundos_por_quadro"]},
        "edicaoHumana": descricao.get("edicaoHumana", "nenhuma ainda; o asset está no portão de estilo"),
    }


def ladrilho_sem_emenda(pixels):
    """Make a tile wrap: blend it with itself shifted by half, the shifted copy showing near the borders."""
    altura, largura = pixels.shape[:2]
    deslocado = np.roll(pixels, (altura // 2, largura // 2), axis=(0, 1)).astype(np.float32)
    y = np.abs(np.linspace(-1.0, 1.0, altura))[:, None]
    x = np.abs(np.linspace(-1.0, 1.0, largura))[None, :]
    peso = np.clip((1.0 - np.maximum(x, y)) / 0.35, 0.0, 1.0)[..., None]
    peso = peso * peso * (3 - 2 * peso)
    return np.clip(pixels.astype(np.float32) * peso + deslocado * (1 - peso) + 0.5, 0, 255).astype(np.uint8)


def empacotar_terreno(descricao, saida, destino, qualidade):
    """Terrain is one opaque, wrapping tile per level, not an atlas of trimmed frames."""
    animacao = descricao["animacoes"][0]
    quadro = ladrilho_sem_emenda(ler_png(caminho_quadro(saida, animacao, "cor", 0, 0))[..., :3])
    arquivos, orcamento = {}, {}
    for nivel, pixels in (("uhd", quadro), ("hd", reduzir(quadro, np.full(quadro.shape[:2], 255, np.uint8)))):
        temporario = os.path.join(destino, f"_{nivel}.webp")
        gravar_webp(pixels, temporario, qualidade)
        with open(temporario, "rb") as arquivo:
            nome = f"{descricao['asset']}@{nivel}.cor.{hashlib.sha256(arquivo.read()).hexdigest()[:6]}.webp"
        os.replace(temporario, os.path.join(destino, nome))
        arquivos[nivel] = {"cor": nome, "largura": pixels.shape[1], "altura": pixels.shape[0]}
        orcamento[nivel] = {"bytesArquivos": os.path.getsize(os.path.join(destino, nome)), "bytesGpuEstimados": pixels.shape[0] * pixels.shape[1] * 4}
    return arquivos, orcamento


def executar(descricao, projecao, saida, tabela_pontos, relatorio, argumentos, script):
    pasta = PASTA_POR_TIPO.get(descricao["tipo"], os.path.join("sprites", descricao["categoria"]))
    destino = os.path.join(saida, "pacote", "site", "rts", "assets", pasta)
    destino_procedencia = os.path.join(saida, "pacote", "arte", "procedencia")
    os.makedirs(destino, exist_ok=True)
    os.makedirs(destino_procedencia, exist_ok=True)
    if descricao["tipo"] == "terreno":
        arquivos, orcamento = empacotar_terreno(descricao, saida, destino, argumentos.qualidade_cor)
        dados = {"versao": 1, "asset": descricao["asset"], "tipo": "terreno", "categoria": descricao["categoria"],
                 "fases": descricao.get("fases", []), "celulasPorLadrilho": descricao["celulasPorLadrilho"],
                 "paginas": {nivel: [pagina] for nivel, pagina in arquivos.items()}, "passes": ["cor"],
                 "orcamento": orcamento, "procedencia": f"arte/procedencia/{descricao['asset']}.json"}
    else:
        dados, orcamento = None, None
    if dados is not None:
        with open(os.path.join(destino, f"{descricao['asset']}.json"), "w", encoding="utf-8") as arquivo:
            json.dump(dados, arquivo, ensure_ascii=False, separators=(",", ":"))
            arquivo.write("\n")
        with open(os.path.join(destino_procedencia, f"{descricao['asset']}.json"), "w", encoding="utf-8") as arquivo:
            json.dump(procedencia(descricao, relatorio, argumentos, script, saida), arquivo, ensure_ascii=False, indent=2)
            arquivo.write("\n")
        return orcamento
    quadros = recortar_quadros(descricao, saida)
    paginas, entradas, orcamento = {}, {}, {}
    for nivel in ("uhd", "hd"):
        paginas[nivel], entradas[nivel], orcamento[nivel] = montar_nivel(descricao, quadros, nivel, destino, argumentos.qualidade_cor)
    dados = manifesto(descricao, projecao, paginas, entradas, tabela_pontos, orcamento)
    with open(os.path.join(destino, f"{descricao['asset']}.json"), "w", encoding="utf-8") as arquivo:
        json.dump(dados, arquivo, ensure_ascii=False, separators=(",", ":"))
        arquivo.write("\n")
    with open(os.path.join(destino_procedencia, f"{descricao['asset']}.json"), "w", encoding="utf-8") as arquivo:
        json.dump(procedencia(descricao, relatorio, argumentos, script, saida), arquivo, ensure_ascii=False, indent=2)
        arquivo.write("\n")
    return orcamento
