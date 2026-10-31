# SPDX-License-Identifier: GPL-3.0-or-later
"""Gray kit of phase 1 (stage E3): every unit and building of the briefs as procedural clay, to measure pace and
fun before the final art.

- Palette: the brief colours become greys by luminance, with a faint faction tint (cool for the Religadores,
  warm for the Desligados), so value contrast and silhouette carry the reading; the team areas keep the reserved
  "time" material and the battery cargo keeps its glow, because whether a collector is loaded is game information.
- Frame budget: the whole phase must fit a few shared atlas pages (comum/fase.py), so animations are short and
  repeated poses are reused instead of rendered ("igual" and "quadrosIguais" in comum/fabrica.py).
- Buildings: one direction, ready, damaged and destroyed from the same parts (Estragos), the rendered shadow
  layer, and a frame computed from the footprint and height (quadro_construcao); the rise during construction is
  the renderer's shader mask over the scaffold asset neutro-construcao-andaime-cinza.
"""

import math
import random

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

from . import compat, infantaria
from . import modelagem as m
from .passes import RENDERIZAVEIS

FASES = ["fase-1"]

# Colours named after the briefs (sRGB hex); the gray kit only keeps their luminance.
CORES = {
    "laranja": "#E2711D", "branco": "#E6E1D3", "cobalto": "#1F4E8C", "concreto": "#8A8C8E", "aluminio": "#B8BCC0",
    "lona": "#CDBB94", "oliva": "#6F7445", "ocre": "#B5832E", "tijolo": "#9B3B26", "ferro": "#3A3632",
    "madeira": "#7A5A3A", "couro": "#5A3E2A", "pele": "#9C6B4E", "palha": "#C8B070", "pneu": "#1A1A1A",
    "metal": "#5E6266", "vidro": "#22303A", "cobre": "#B0673A", "terra": "#7A5A44", "vermelho": "#B3201C",
    "escuro": "#2A2A2C", "chao": "#8C8478", "fuligem": "#1E1C1A",
}
TINTAS = {"religadores": (0.95, 1.0, 1.06), "desligados": (1.06, 1.0, 0.92), "neutro": (1.0, 1.0, 1.0)}
RUGOSIDADE = {"vidro": 0.35, "metal": 0.5, "aluminio": 0.5, "cobre": 0.5}
CARGA = (120, 196, 186)
LUZ = (240, 232, 214)


def cinza_srgb(cor, faccao):
    """sRGB 0..255 grey (with the faction tint) of a hex colour or an sRGB 0..255 triple."""
    if isinstance(cor, str):
        cor = cor.lstrip("#")
        cor = [int(cor[i:i + 2], 16) for i in (0, 2, 4)]
    luma = 0.299 * cor[0] + 0.587 * cor[1] + 0.114 * cor[2]
    valor = 40 + 0.72 * luma
    return tuple(min(255.0, valor * t) for t in TINTAS[faccao])


def _linear(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _srgb(c):
    c = max(0.0, min(1.0, c))
    return 255.0 * (c * 12.92 if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055)


def _hex(srgb):
    return "#" + "".join(f"{int(round(v)):02X}" for v in srgb)


class Paleta:
    """Gray materials by brief colour name, created on first use; paleta["time"] is the reserved team material."""

    def __init__(self, ctx, faccao):
        self.ctx = ctx
        self.faccao = faccao
        self.materiais = {}

    def __getitem__(self, nome):
        if nome not in self.materiais:
            if nome == "time":
                self.materiais[nome] = m.material_time(self.ctx.projecao, 0.6)
            elif nome == "carga":
                self.materiais[nome] = m.material("cinza_carga", _hex(CARGA), 0.0, 0.4, emissao=(_hex(CARGA), 1.2))
            elif nome == "luz":
                self.materiais[nome] = m.material("cinza_luz", _hex(LUZ), 0.0, 0.3, emissao=(_hex(LUZ), 2.0))
            else:
                cor = _hex(cinza_srgb(CORES[nome], self.faccao))
                self.materiais[nome] = m.material(f"cinza_{nome}", cor, 0.0, RUGOSIDADE.get(nome, 0.72))
        return self.materiais[nome]


def acinzentar(raiz, faccao):
    """Turn the materials of an existing model (the style-gate pieces) into the gray kit: grey by luminance, no
    noise, no metal; the team material stays as it is and lamps keep a pale glow."""
    vistos = set()
    for obj in [raiz] + list(raiz.children_recursive):
        if obj.type not in RENDERIZAVEIS:
            continue
        for slot in obj.material_slots:
            mat = slot.material
            if mat is None or mat.name in vistos or mat.name.split(".")[0] == m.NOME_TIME:
                continue
            vistos.add(mat.name)
            bsdf = compat.principled(mat)
            entrada = bsdf.inputs["Base Color"]
            cor = tuple(entrada.default_value)[:3]
            for ligacao in list(entrada.links):
                if ligacao.from_node.type == "VALTORGB":
                    cor = tuple(ligacao.from_node.color_ramp.elements[0].color)[:3]
                mat.node_tree.links.remove(ligacao)
            cinza = cinza_srgb([_srgb(c) for c in cor], faccao)
            entrada.default_value = (*(_linear(c) for c in cinza), 1.0)
            bsdf.inputs["Metallic"].default_value = 0.0
            bsdf.inputs["Roughness"].default_value = max(0.45, bsdf.inputs["Roughness"].default_value)
            if bsdf.inputs["Emission Strength"].default_value > 0:
                bsdf.inputs["Emission Color"].default_value = (*(_linear(c) for c in LUZ), 1.0)
                bsdf.inputs["Emission Strength"].default_value = min(2.0, bsdf.inputs["Emission Strength"].default_value)


# Descriptions ----------------------------------------------------------------------------------------------

def anim(nome, camada, quadros, fps=0, laco=True, **extras):
    return {"nome": nome, "camada": camada, "quadros": quadros, "fps": fps, "laco": laco, **extras}


def descricao_infantaria(asset, brief, quadro=(128, 128), ancora=(64, 84), extras=()):
    """16 directions: idle, walking (6), shot (2, the second is the idle pose) and dying (6 frames in 8 directions)."""
    return {
        "asset": asset, "brief": brief, "tipo": "unidade", "categoria": "infantaria", "fases": FASES, "acabamento": "cinza",
        "direcoes": 16, "passes": ["cor", "time"],
        "camadas": {"corpo": {"quadro": list(quadro), "ancora": list(ancora)}},
        "animacoes": [
            anim("parado", "corpo", 1),
            anim("andando", "corpo", 6, 10),
            anim("atirando", "corpo", 2, 8, False, quadrosIguais={"1": ["parado", 0]}),
            anim("morrendo", "corpo", 6, 8, False, direcoes=8),
            *extras,
        ],
    }


def descricao_veiculo(asset, brief, quadro=(256, 256), ancora=(128, 150), torre=None, extras=(), destruido=None, arma=True):
    """16 directions: idle, moving (the idle frames: gray wheels do not read turning), shot (2, the second is the
    idle pose) unless a turret shoots, and the wreck in 8 directions; torre is (frame, anchor) of a turret layer."""
    camadas = {"corpo": {"quadro": list(quadro), "ancora": list(ancora)}}
    animacoes = [anim("parado", "corpo", 1), anim("rodando", "corpo", 1, 0, True, igual="parado")]
    if torre:
        camadas["torre"] = {"quadro": list(torre[0]), "ancora": list(torre[1]), "pivo": "torre_pivo"}
        animacoes += [anim("torre", "torre", 1), anim("atirando", "torre", 2, 8, False, quadrosIguais={"1": ["torre", 0]})]
    elif arma:
        animacoes.append(anim("atirando", "corpo", 2, 8, False, quadrosIguais={"1": ["parado", 0]}))
    animacoes += list(extras)
    destruido = destruido or (quadro, ancora)
    # the wreck shows hull and turret together
    camadas["destroco"] = {"quadro": list(destruido[0]), "ancora": list(destruido[1]), "usa": list(camadas)}
    animacoes.append(anim("destruido", "destroco", 1, 0, True, direcoes=8))
    return {
        "asset": asset, "brief": brief, "tipo": "unidade", "categoria": "veiculo", "fases": FASES, "acabamento": "cinza",
        "direcoes": 16, "passes": ["cor", "time"], "camadas": camadas, "animacoes": animacoes,
    }


def quadro_construcao(colunas, linhas, altura, folga=24, folga_lados=None):
    """Frame and anchor (uhd px, even) holding a footprint of colunas x linhas cells, parts up to altura metres
    and the shadow the sun throws towards the lower right; the anchor is the footprint centre on the ground."""
    px = 128
    seno, cosseno = math.sin(math.radians(55)), math.cos(math.radians(55))
    sombra = altura / math.tan(math.radians(50)) * math.sqrt(0.5) * px / 4
    esquerda = colunas * px / 2 + folga
    direita = colunas * px / 2 + sombra + folga
    cima = linhas * px / 2 * seno + altura * px / 4 * cosseno + folga
    baixo = linhas * px / 2 * seno + sombra * seno + folga
    if folga_lados:
        esquerda, direita, cima, baixo = (v + f for v, f in zip((esquerda, direita, cima, baixo), folga_lados))

    def par(v):
        return int(math.ceil(v / 8.0)) * 8

    return [par(esquerda) + par(direita), par(cima) + par(baixo)], [par(esquerda), par(cima)]


def descricao_construcao(asset, brief, faccao, pegada, altura, torre=None, extras=(), estados=("pronta", "danificada", "destruida"),
                         categoria="construcao", folga_lados=None):
    """One direction: ready, damaged and destroyed with the rendered shadow; torre is (frame, anchor) of a turret
    layer in 16 directions (idle and a 2-frame shot)."""
    quadro, ancora = quadro_construcao(*pegada, altura, folga_lados=folga_lados)
    camadas = {"corpo": {"quadro": quadro, "ancora": ancora}}
    animacoes = [anim(estado, "corpo", 1) for estado in estados]
    if torre:
        camadas["torre"] = {"quadro": list(torre[0]), "ancora": list(torre[1]), "pivo": "torre_pivo"}
        animacoes += [anim("torre", "torre", 1, 0, True, direcoes=16),
                      anim("atirando", "torre", 2, 8, False, direcoes=16, quadrosIguais={"1": ["torre", 0]})]
    return {
        "asset": asset, "brief": brief, "tipo": "unidade", "categoria": categoria, "fases": FASES, "acabamento": "cinza",
        "faccao": faccao, "pegada": list(pegada), "direcoes": 1, "passes": ["cor", "time", "sombra"], "camadasSombra": ["corpo"],
        "camadas": camadas, "animacoes": animacoes + list(extras),
    }


# Infantry -----------------------------------------------------------------------------------------------------

ANIMACOES_INFANTARIA = (("parado", 1, "parado"), ("andando", 6, "andando"), ("atirando", 2, "atirando"), ("morrendo", 6, "morrendo"))


def corpo(ctx, pal, pai, nome="raiz", escala=None, roupa="laranja", calca=None, botas="couro", luvas="couro", local=(0, 0, 0), giro=0.0):
    """The shared infantry body in gray clay on its own armature; returns (root, armature, parte), where
    parte(bone, object) binds an accessory to a bone (call prender_partes once everything is placed)."""
    raiz = m.vazio(nome, local, pai, rotacao=(0, 0, giro))
    escala = ctx.projecao.exagero_infantaria if escala is None else escala
    raiz.scale = (escala, escala, escala)
    armacao = infantaria.esqueleto(raiz, f"{nome}_esqueleto")
    partes = []

    def parte(osso, obj):
        partes.append((obj, osso))
        return obj

    roupa_m, calca_m = pal[roupa], pal[calca or roupa]
    parte("quadril", m.caixa(f"{nome}_pelve", (0, 0, 0.95), (0.26, 0.36, 0.22), calca_m, raiz, 0.05))
    parte("tronco", m.caixa(f"{nome}_torso", (0, 0, 1.25), (0.3, 0.44, 0.42), roupa_m, raiz, 0.07))
    parte("cabeca", m.esfera(f"{nome}_cabeca", (0.02, 0, 1.58), 0.12, pal["pele"], raiz, (1.0, 0.95, 1.1), segmentos=16))
    for lado, sufixo in ((1, "e"), (-1, "d")):
        braco, antebraco = infantaria.OSSO[f"braco_{sufixo}"], infantaria.OSSO[f"antebraco_{sufixo}"]
        parte(f"braco_{sufixo}", m.barra(f"{nome}_braco_{sufixo}", (0, lado * 0.25, 1.38), braco[1], 0.065, roupa_m, raiz, 8))
        parte(f"antebraco_{sufixo}", m.barra(f"{nome}_antebraco_{sufixo}", antebraco[0], antebraco[1], 0.055, roupa_m, raiz, 8))
        parte(f"antebraco_{sufixo}", m.esfera(f"{nome}_luva_{sufixo}", antebraco[1], 0.06, pal[luvas], raiz, segmentos=12))
        parte(f"coxa_{sufixo}", m.barra(f"{nome}_coxa_{sufixo}", (0, lado * 0.11, 0.9), (0, lado * 0.12, 0.5), 0.085, calca_m, raiz, 8))
        parte(f"canela_{sufixo}", m.barra(f"{nome}_canela_{sufixo}", (0, lado * 0.12, 0.5), (0, lado * 0.12, 0.12), 0.07, calca_m, raiz, 8))
        parte(f"canela_{sufixo}", m.caixa(f"{nome}_bota_{sufixo}", (0.05, lado * 0.12, 0.06), (0.26, 0.14, 0.12), pal[botas], raiz, 0.03))
    return raiz, armacao, parte, partes


def prender_partes(armacao, partes):
    for obj, osso in partes:
        infantaria.prender(obj, armacao, osso)


def pessoa(ctx, pal, pai, nome, local, giro=0.0, pose="parado", escala=1.1, **roupa):
    """A static figure (a crew member, a rider, people on a bench): the shared body held in one pose."""
    raiz, armacao, parte, partes = corpo(ctx, pal, pai, nome, escala, local=local, giro=giro, **roupa)
    prender_partes(armacao, partes)
    angulos, z, x = infantaria.POSES[pose](0, 1) if isinstance(pose, str) else pose
    infantaria.pose(armacao, angulos, z, x)
    return raiz


def posar_infantaria(modelo, animacao, quadro):
    infantaria.usar_acao(modelo["esqueleto"], modelo["acoes"][animacao], quadro)


# Vehicles -----------------------------------------------------------------------------------------------------

def rodas(prefixo, eixos, bitola, raio, largura, pal, pai, cubo=True):
    """Wheels on axles at x positions, half the track to each side, standing on the ground."""
    lista = []
    for x in eixos:
        for lado in (-1, 1):
            roda = m.roda(f"{prefixo}{x:+.2f}{lado:+d}", (x, lado * bitola / 2, raio), raio, largura, pal["pneu"], pai)
            if cubo:
                m.cilindro(f"{prefixo}{x:+.2f}{lado:+d}_cubo", (0, 0, lado * -(largura / 2 + 0.005)), raio * 0.55, 0.03, pal["metal"], roda)
            lista.append(roda)
    return lista


def chassi(raiz):
    """Vehicles hang their parts on this empty, so the wreck can tilt them while the factory turns the root."""
    return m.vazio("chassi", (0, 0, 0), raiz)


def destroco(pal, pai, comprimento, largura, semente):
    """Scorched ground and a few loose pieces, shown only in the wreck."""
    sorteio = random.Random(semente)
    pecas = [m.cilindro("queimado", (0, 0, 0.01), max(comprimento, largura) * 0.62, 0.02, pal["fuligem"], pai, vertices=24, suave=False)]
    for k in range(5):
        angulo = sorteio.uniform(0, 2 * math.pi)
        raio = sorteio.uniform(0.5, 1.0) * max(comprimento, largura) * 0.55
        tamanho = sorteio.uniform(0.25, 0.5)
        pecas.append(m.caixa(f"pedaco{k}", (raio * math.cos(angulo), raio * math.sin(angulo), tamanho * 0.3),
                             (tamanho, tamanho * 0.7, tamanho * 0.5), pal["escuro" if k % 2 else "metal"], pai, 0.02,
                             (sorteio.uniform(-0.4, 0.4), sorteio.uniform(-0.4, 0.4), angulo)))
    for peca in pecas:
        peca.scale = (0, 0, 0)
    return pecas


def posar_destroco(modelo, destruido, inclinar=(9, -6), afundar=0.18):
    """Tilt and sink the chassis and show the loose pieces when destroyed; put everything back otherwise."""
    chassi_obj = modelo["chassi"]
    if destruido:
        chassi_obj.rotation_euler = (math.radians(inclinar[0]), math.radians(inclinar[1]), 0)
        chassi_obj.location = (0, 0, -afundar)
    else:
        chassi_obj.rotation_euler = (0, 0, 0)
        chassi_obj.location = (0, 0, 0)
    for peca in modelo.get("destroco", []):
        peca.scale = (1, 1, 1) if destruido else (0, 0, 0)


# Buildings ----------------------------------------------------------------------------------------------------

class Estragos:
    """Damage states from the parts themselves: each group of parts hangs on an empty at its base with a role.

    - "parede": stands when damaged, cut to a third of its height when destroyed;
    - "telhado": tilts and sags when damaged, falls onto the wall stubs when destroyed;
    - "alto" (masts, chimneys, towers, poles): leans when damaged, falls over when destroyed;
    - "detalhe": knocked askew when damaged, gone when destroyed;
    - "fixo": the slab and the ground, never moves.
    Rubble and soot are generated over the footprint and shown only in the damaged (a third) and destroyed states.
    """

    def __init__(self, raiz, semente):
        self.raiz = raiz
        self.sorteio = random.Random(semente)
        self.grupos = []
        self.entulho = []

    def grupo(self, nome, local, papel, pai=None, queda=None):
        """Empty at the base of a group of parts; queda is the direction (degrees on the map) it falls to."""
        vazio = m.vazio(nome, local, pai or self.raiz)
        queda = self.sorteio.uniform(0, 360) if queda is None else queda
        self.grupos.append({"vazio": vazio, "papel": papel, "local": tuple(local), "queda": math.radians(queda),
                            "giro": self.sorteio.uniform(-1, 1)})
        return vazio

    def detritos(self, pal, colunas, linhas, n=16, mats=("escuro", "concreto", "metal")):
        meia_x, meia_y = colunas * 2.0 - 0.5, linhas * 2.0 - 0.5
        for k in range(n):
            tamanho = self.sorteio.uniform(0.35, 1.1)
            x, y = self.sorteio.uniform(-meia_x, meia_x), self.sorteio.uniform(-meia_y, meia_y)
            peca = m.caixa(f"entulho{k}", (x, y, tamanho * 0.25), (tamanho, tamanho * 0.8, tamanho * 0.5), pal[mats[k % len(mats)]],
                           self.raiz, 0.03, (self.sorteio.uniform(-0.5, 0.5), self.sorteio.uniform(-0.5, 0.5), self.sorteio.uniform(0, math.pi)))
            peca.scale = (0, 0, 0)
            self.entulho.append(peca)
        fuligem = m.cilindro("fuligem", (0, 0, 0.012), min(colunas, linhas) * 1.7, 0.02, pal["fuligem"], self.raiz, vertices=32, suave=False)
        fuligem.scale = (0, 0, 0)
        self.fuligem = fuligem

    def aplicar(self, estado):
        danificada, destruida = estado == "danificada", estado == "destruida"
        for g in self.grupos:
            vazio, papel = g["vazio"], g["papel"]
            x, y, z = g["local"]
            vazio.location = (x, y, z)
            vazio.rotation_euler = (0, 0, 0)
            vazio.scale = (1, 1, 1)
            # tilt towards the fall direction: about the horizontal axis perpendicular to it
            eixo = (-math.sin(g["queda"]), math.cos(g["queda"]))
            if papel == "parede" and destruida:
                vazio.scale = (1, 1, 0.33)
            elif papel == "telhado" and (danificada or destruida):
                inclinacao = math.radians(9 if danificada else 16)
                vazio.rotation_euler = (eixo[0] * inclinacao, eixo[1] * inclinacao, g["giro"] * 0.1)
                vazio.location = (x, y, z - 0.35 if danificada else z * 0.33 + 0.1)
                if destruida:
                    vazio.scale = (1, 1, 0.5)
            elif papel == "alto" and (danificada or destruida):
                inclinacao = math.radians(11 if danificada else 82)
                vazio.rotation_euler = (eixo[0] * inclinacao, eixo[1] * inclinacao, 0)
            elif papel == "detalhe" and danificada:
                vazio.rotation_euler = (eixo[0] * 0.35, eixo[1] * 0.35, g["giro"] * 0.5)
            elif papel == "detalhe" and destruida:
                vazio.scale = (0, 0, 0)
        visiveis = len(self.entulho) // 3 if danificada else (len(self.entulho) if destruida else 0)
        for k, peca in enumerate(self.entulho):
            peca.scale = (1, 1, 1) if k < visiveis else (0, 0, 0)
        if hasattr(self, "fuligem"):
            self.fuligem.scale = (1, 1, 1) if destruida else (0, 0, 0)


def laje(nome, colunas, linhas, mat, pai, altura=0.12, recuo=0.15):
    """Ground slab of the footprint: it shows the cells the building takes."""
    return m.caixa(nome, (0, 0, altura / 2), (colunas * 4 - 2 * recuo, linhas * 4 - 2 * recuo, altura), mat, pai, 0.03)


def andaime(prefixo, colunas, linhas, altura, pal, pai, camada=None):
    """Scaffold around a footprint: poles every 2 m, rails every 1.5 m, braces and a striped tape at the base."""
    meia_x, meia_y = colunas * 2.0 - 0.2, linhas * 2.0 - 0.2
    pecas = []

    def poste(x, y):
        pecas.append(m.barra(f"{prefixo}_poste{len(pecas)}", (x, y, 0), (x, y, altura), 0.05, pal["metal"], pai, 6, camada))

    for lado_x in (-meia_x, meia_x):
        n = max(1, int(round(2 * meia_y / 2.0)))
        for k in range(n + 1):
            poste(lado_x, -meia_y + 2 * meia_y * k / n)
    for lado_y in (-meia_y, meia_y):
        n = max(1, int(round(2 * meia_x / 2.0)))
        for k in range(1, n):
            poste(-meia_x + 2 * meia_x * k / n, lado_y)
    niveis = max(2, int(altura / 1.5))
    cantos = [(-meia_x, -meia_y), (meia_x, -meia_y), (meia_x, meia_y), (-meia_x, meia_y)]
    for nivel in range(1, niveis + 1):
        z = altura * nivel / niveis
        for k in range(4):
            a, b = cantos[k], cantos[(k + 1) % 4]
            pecas.append(m.barra(f"{prefixo}_trilho{nivel}_{k}", (a[0], a[1], z), (b[0], b[1], z), 0.04, pal["aluminio"], pai, 6, camada))
            if nivel == niveis:
                continue
            pecas.append(m.barra(f"{prefixo}_tabua{nivel}_{k}", (a[0], a[1], z), (b[0], b[1], z), 0.12, pal["madeira"], pai, 4, camada))
    for k in range(4):
        a, b = cantos[k], cantos[(k + 1) % 4]
        pecas.append(m.barra(f"{prefixo}_diagonal{k}", (a[0], a[1], 0.1), (b[0], b[1], altura * 0.6), 0.035, pal["metal"], pai, 6, camada))
    # striped tape around the site, alternating light and dark
    for k in range(4):
        a, b = cantos[k], cantos[(k + 1) % 4]
        partes = max(2, int(math.hypot(b[0] - a[0], b[1] - a[1]) / 0.8))
        for i in range(partes):
            t0, t1 = i / partes, (i + 1) / partes
            p0 = (a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0, 0.9)
            p1 = (a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1, 0.9)
            pecas.append(m.barra(f"{prefixo}_fita{k}_{i}", p0, p1, 0.03, pal["branco" if i % 2 else "escuro"], pai, 4, camada))
    return pecas


# Icons ----------------------------------------------------------------------------------------------------------

def enquadrar_objetos(camera, objetos, margem=0.06):
    """Fit the orthographic camera (square frame) around the bounding boxes of the objects, centred."""
    bpy.context.view_layer.update()
    camera.data.ortho_scale = 1.0
    camera.data.shift_x = camera.data.shift_y = 0.0
    bpy.context.view_layer.update()
    cena = bpy.context.scene
    xs, ys = [], []
    for obj in objetos:
        if obj.type not in RENDERIZAVEIS or obj.hide_render or min(obj.matrix_world.to_scale()) <= 1e-6:
            continue
        for canto in obj.bound_box:
            ponto = world_to_camera_view(cena, camera, obj.matrix_world @ Vector(canto))
            xs.append(ponto.x - 0.5)
            ys.append(ponto.y - 0.5)
    if not xs:
        return
    escala = max(max(xs) - min(xs), max(ys) - min(ys)) * (1 + 2 * margem)
    camera.data.ortho_scale = escala
    camera.data.shift_x = (max(xs) + min(xs)) / 2 / escala
    camera.data.shift_y = (max(ys) + min(ys)) / 2 / escala
