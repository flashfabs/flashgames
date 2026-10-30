# SPDX-License-Identifier: GPL-3.0-or-later
"""Everything that changed in the Blender 5.x Python API and that the art factory touches, in one place.

Checked against Blender 5.2.3 LTS on the RTX 4090 PC on 30/10/2026 (introspection of bpy.types and real
renders, log in arte/blender/MEDICOES.md) and against the 5.x API reference (https://docs.blender.org/api/5.2/).
Scripts written from memory of bpy 3.x and 4.x break on these points; use the helpers here instead.

- Render engines: EEVEE is "BLENDER_EEVEE" again ("BLENDER_EEVEE_NEXT" existed only in 4.2 to 4.4).
- Actions are layered and slotted since 4.4, and 5.0 removed the legacy Action.fcurves: F-curves live in
  action.layers[i].strips[j].channelbag(slot).fcurves, and AnimData needs action_slot as well as action.
- The compositor tree is a node group assigned to scene.compositing_node_group (scene.node_tree is gone),
  and the File Output node needs format.media_type = "IMAGE" before format.file_format can be PNG or WEBP.
- Material.use_nodes is deprecated: new materials already have a node tree in 5.x.
- In background mode the gpu module must be initialised (gpu.init()) before gpu.platform answers.
- RNA properties are not Python attributes of the bpy.types classes: hasattr(bpy.types.X, "prop") lies;
  ask bl_rna.properties or an instance.
- Factory settings denoise on the CPU (OpenImageDenoise with denoising_use_gpu False), which costs about
  0.2 to 0.8 s per 256 px frame; the factory renders without the denoiser (see render_cycles).
"""

import bpy

MOTOR_EEVEE = "BLENDER_EEVEE"
MOTOR_WORKBENCH = "BLENDER_WORKBENCH"
MOTOR_CYCLES = "CYCLES"


def tem_propriedade(estrutura, nome):
    """True when an RNA struct (instance or type) has the property, which hasattr on types cannot tell."""
    return nome in estrutura.bl_rna.properties


def garantir_nos(material):
    """Make sure the material has a node tree (always true for new materials in 5.x)."""
    if material.node_tree is None and tem_propriedade(material, "use_nodes"):
        material.use_nodes = True
    return material.node_tree


def principled(material):
    """The Principled BSDF node of a new material, whatever its localised or default name."""
    arvore = garantir_nos(material)
    for no in arvore.nodes:
        if no.type == "BSDF_PRINCIPLED":
            return no
    raise LookupError(f"material {material.name} has no Principled BSDF")


def formato_imagem(configuracao, formato, modo="RGBA", profundidade="8", qualidade=None):
    """Fill ImageFormatSettings; 5.x needs media_type set to IMAGE before still formats are accepted."""
    if tem_propriedade(configuracao, "media_type"):
        configuracao.media_type = "IMAGE"
    configuracao.file_format = formato
    configuracao.color_mode = modo
    if formato in ("PNG", "TIFF", "OPEN_EXR"):
        configuracao.color_depth = profundidade
    if qualidade is not None:
        configuracao.quality = qualidade


def grupo_compositor(cena, nome="compositor"):
    """Create and assign the compositor node group (5.x replacement of scene.node_tree)."""
    grupo = bpy.data.node_groups.new(nome, "CompositorNodeTree")
    cena.compositing_node_group = grupo
    return grupo


def slot_para(acao, objeto):
    """The slot of the action meant for this ID, created when missing."""
    for slot in acao.slots:
        if slot.target_id_type == objeto.id_type and slot.name_display == objeto.name:
            return slot
    return acao.slots.new(id_type=objeto.id_type, name=objeto.name)


def atribuir_acao(objeto, acao):
    """Assign an action and its slot; assigning only the action leaves the object unanimated in 5.x."""
    dados = objeto.animation_data or objeto.animation_data_create()
    dados.action = acao
    if dados.action_slot is None:
        dados.action_slot = slot_para(acao, objeto)
    return dados.action_slot


def fcurves(acao, slot):
    """F-curves of one slot of a layered action (Action.fcurves no longer exists)."""
    from bpy_extras.anim_utils import action_get_channelbag_for_slot

    canal = action_get_channelbag_for_slot(acao, slot)
    return list(canal.fcurves) if canal else []


def interpolacao(acao, slot, tipo="LINEAR"):
    """Set the interpolation of every key of a slot, e.g. LINEAR for mechanical loops."""
    for curva in fcurves(acao, slot):
        for chave in curva.keyframe_points:
            chave.interpolation = tipo


def iniciar_gpu():
    """Initialise the gpu module in background mode and describe the device that OpenGL/Vulkan really uses."""
    import gpu

    if hasattr(gpu, "init"):
        gpu.init()
    plataforma = {}
    for nome in ("backend_type_get", "vendor_get", "renderer_get", "version_get"):
        try:
            plataforma[nome.removesuffix("_get")] = getattr(gpu.platform, nome)()
        except Exception as erro:  # noqa: BLE001 - a missing GPU is reported, not fatal
            plataforma[nome.removesuffix("_get")] = f"unavailable: {erro}"
    return plataforma
