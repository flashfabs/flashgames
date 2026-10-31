# SPDX-License-Identifier: GPL-3.0-or-later
"""Chapa, gray kit (brief arte/briefs/desligados-unidade-chapa.md): the Desligados' basic infantry. What reads
first is the very wide straw hat, then the rolled canvas tied on the back and the long air carbine with a thick
air bottle under the barrel; short canvas poncho, rolled-up trousers. In ambush he crouches under the painted
canvas: a low mound with the hat brim and the barrel showing, one frame for every direction."""

from comum import cinza, infantaria
from comum import modelagem as m

DESCRICAO = cinza.descricao_infantaria(
    "desligados-infantaria-chapa-cinza", "desligados/chapa",
    extras=[cinza.anim("escondido", "corpo", 1, 0, True, direcoes=1)],
)


def construir(ctx):
    pal = cinza.Paleta(ctx, "desligados")
    raiz, armacao, parte, partes = cinza.corpo(ctx, pal, None, roupa="lona", calca="oliva", botas="escuro", luvas="pele")
    parte("tronco", m.caixa("poncho", (0, 0, 1.26), (0.4, 0.58, 0.36), pal["lona"], raiz, 0.08))
    parte("tronco", m.caixa("remendo", (0.21, 0.12, 1.22), (0.02, 0.16, 0.16), pal["tijolo"], raiz, 0.0))
    parte("tronco", m.caixa("lenco", (0.06, 0, 1.47), (0.24, 0.3, 0.07), pal["time"], raiz, 0.02))
    parte("tronco", m.cilindro("rolo_lona", (-0.25, 0, 1.47), 0.12, 0.6, pal["oliva"], raiz, (1.5708, 0, 0), 12))
    parte("cabeca", m.cilindro("chapeu_aba", (0, 0, 1.72), 0.44, 0.03, pal["palha"], raiz, vertices=24))
    parte("cabeca", m.esfera("chapeu_copa", (0, 0, 1.76), 0.15, pal["palha"], raiz, (1.0, 1.0, 0.75), segmentos=16))
    parte("cabeca", m.cilindro("chapeu_fita", (0, 0, 1.76), 0.155, 0.06, pal["time"], raiz, vertices=16))
    # long air carbine held in both hands, the bottle under the barrel and the pump lever
    parte("tronco", m.barra("carabina_cano", (0.05, -0.12, 1.12), (1.0, -0.06, 1.12), 0.022, pal["escuro"], raiz, 6))
    parte("tronco", m.barra("carabina_coronha", (-0.1, -0.14, 1.06), (0.2, -0.12, 1.1), 0.05, pal["madeira"], raiz, 6))
    parte("tronco", m.barra("carabina_garrafa", (0.3, -0.08, 1.04), (0.75, -0.07, 1.04), 0.05, pal["ocre"], raiz, 10))
    parte("tronco", m.barra("carabina_alavanca", (0.42, -0.09, 1.0), (0.58, -0.09, 0.94), 0.015, pal["metal"], raiz, 4))
    parte("tronco", m.ponto("boca", (1.03, -0.06, 1.12), raiz))
    parte("cabeca", m.ponto("topo", (0, 0, 1.95), raiz))
    # the hide: a mound of painted canvas over the crouching man, brim and barrel sticking out
    tocaia = m.vazio("tocaia", (0, 0, 0), raiz)
    m.esfera("tocaia_lona", (0, 0, 0.12), 0.5, pal["terra"], tocaia, (1.25, 1.0, 0.75), segmentos=16)
    m.cilindro("tocaia_aba", (0.18, 0.0, 0.5), 0.36, 0.03, pal["palha"], tocaia, (0.2, 0.1, 0), 20)
    m.barra("tocaia_cano", (0.3, -0.1, 0.32), (1.05, -0.1, 0.3), 0.022, pal["escuro"], tocaia, 6)
    cinza.prender_partes(armacao, partes)
    acoes = infantaria.acoes(armacao, cinza.ANIMACOES_INFANTARIA + (("escondido", 1, "parado"),))
    return {"raiz": raiz, "esqueleto": armacao, "acoes": acoes, "tocaia": tocaia}


def posar(ctx, modelo, animacao, quadro):
    escondido = animacao == "escondido"
    modelo["esqueleto"].scale = (0, 0, 0) if escondido else (1, 1, 1)
    modelo["tocaia"].scale = (1, 1, 1) if escondido else (0, 0, 0)
    cinza.posar_infantaria(modelo, animacao, quadro)
