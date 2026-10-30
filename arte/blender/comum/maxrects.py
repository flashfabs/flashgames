# SPDX-License-Identifier: GPL-3.0-or-later
"""MaxRects bin packing (best short side fit), pure Python so it runs inside Blender and in plain python3.

Rectangles never rotate (the shader samples them upright). A gap between rectangles keeps linear filtering
from bleeding one frame into its neighbour; the packer adds a transparent border inside each frame as well.
"""


class Pagina:
    def __init__(self, largura, altura):
        self.largura = largura
        self.altura = altura
        self.livres = [(0, 0, largura, altura)]

    def inserir(self, largura, altura):
        melhor = None
        for x, y, w, h in self.livres:
            if largura <= w and altura <= h:
                curto, longo = sorted((w - largura, h - altura))
                chave = (curto, longo, y, x)
                if melhor is None or chave < melhor[0]:
                    melhor = (chave, x, y)
        if melhor is None:
            return None
        _, x, y = melhor
        self._dividir(x, y, largura, altura)
        return x, y

    def _dividir(self, x, y, w, h):
        novos = []
        for lx, ly, lw, lh in self.livres:
            if x >= lx + lw or x + w <= lx or y >= ly + lh or y + h <= ly:
                novos.append((lx, ly, lw, lh))
                continue
            if x > lx:
                novos.append((lx, ly, x - lx, lh))
            if x + w < lx + lw:
                novos.append((x + w, ly, lx + lw - x - w, lh))
            if y > ly:
                novos.append((lx, ly, lw, y - ly))
            if y + h < ly + lh:
                novos.append((lx, y + h, lw, ly + lh - y - h))
        # drop free rectangles contained in another one
        self.livres = [a for i, a in enumerate(novos)
                       if not any(i != j and _contem(b, a) and (b != a or j < i) for j, b in enumerate(novos))]


def _contem(a, b):
    return a[0] <= b[0] and a[1] <= b[1] and a[0] + a[2] >= b[0] + b[2] and a[1] + a[3] >= b[1] + b[3]


def _tentar(tamanhos, largura, altura, margem):
    pagina = Pagina(largura, altura)
    posicoes = {}
    for indice, (w, h) in tamanhos:
        lugar = pagina.inserir(w + margem, h + margem)
        if lugar is None:
            return None
        posicoes[indice] = lugar
    return posicoes


def empacotar(tamanhos, maximo=4096, margem=2, fixo=False):
    """Pack (width, height) rectangles into as few power-of-two pages as possible, each up to maximo.

    Returns [(page_width, page_height, {index: (x, y)})]. Pages are the smallest power-of-two size that
    holds what is left; when nothing fits in one maximo page, a full page is filled and packing goes on.
    With fixo every page is maximo by maximo.
    """
    pendentes = sorted(enumerate(tamanhos), key=lambda item: (-item[1][1], -item[1][0], item[0]))
    for _, (w, h) in pendentes:
        if w + margem > maximo or h + margem > maximo:
            raise ValueError(f"rectangle {w}x{h} does not fit a {maximo} px page")
    paginas = []
    while pendentes:
        area = sum((w + margem) * (h + margem) for _, (w, h) in pendentes)
        candidatos = [] if fixo else sorted(((a, b) for a in _potencias(maximo) for b in _potencias(maximo) if a * b >= area and b <= a),
                                            key=lambda t: (t[0] * t[1], t[0]))
        if fixo and area <= maximo * maximo:
            candidatos = [(maximo, maximo)]
        escolhido = None
        for largura, altura in candidatos:
            posicoes = _tentar(pendentes, largura, altura, margem)
            if posicoes is not None:
                escolhido = (largura, altura, posicoes)
                break
        if escolhido is None:
            pagina = Pagina(maximo, maximo)
            posicoes = {}
            restantes = []
            for indice, (w, h) in pendentes:
                lugar = pagina.inserir(w + margem, h + margem)
                if lugar is None:
                    restantes.append((indice, (w, h)))
                else:
                    posicoes[indice] = lugar
            escolhido = (maximo, maximo, posicoes)
            pendentes = restantes
        else:
            pendentes = []
        paginas.append(escolhido)
    return paginas


def _potencias(maximo):
    lado = 64
    while lado <= maximo:
        yield lado
        lado *= 2


if __name__ == "__main__":
    # Self-check: random rectangles never overlap, stay inside their page and all get a place.
    import random

    sorteio = random.Random(7)
    caixas = [(sorteio.randint(8, 300), sorteio.randint(8, 300)) for _ in range(900)]
    resultado = empacotar(caixas, 2048, 2)
    vistos = 0
    for largura, altura, posicoes in resultado:
        ocupados = []
        for indice, (x, y) in posicoes.items():
            w, h = caixas[indice]
            assert x + w <= largura and y + h <= altura, "outside the page"
            for ox, oy, ow, oh in ocupados:
                assert x + w + 2 <= ox or ox + ow + 2 <= x or y + h + 2 <= oy or oy + oh + 2 <= y, "overlap"
            ocupados.append((x, y, w, h))
            vistos += 1
    assert vistos == len(caixas)
    ocupacao = sum(w * h for w, h in caixas) / sum(a * b for a, b, _ in resultado)
    print(f"ok: {len(caixas)} rectangles in {len(resultado)} pages, occupancy {ocupacao:.2f}")
