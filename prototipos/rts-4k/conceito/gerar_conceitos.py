"""Local concept-art test with SDXL base 1.0 (CreativeML Open RAIL++-M) on the RTX 4090.

Reads prompts from a JSON file ([{"nome": ..., "prompt": ..., "semente": ...}]) and writes one PNG per prompt
plus a timing report. Prompts describe original designs only: never a game, studio or artist name.

    python gerar_conceitos.py prompts.json saida/
"""

import json
import sys
import time
from pathlib import Path

import torch
from diffusers import StableDiffusionXLPipeline

NEGATIVO = "text, watermark, logo, signature, blurry, lowres, jpeg artifacts, deformed, extra limbs, cropped, frame, border"


def principal():
    prompts = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    saida = Path(sys.argv[2])
    saida.mkdir(parents=True, exist_ok=True)
    inicio = time.perf_counter()
    pipeline = StableDiffusionXLPipeline.from_pretrained(
        "stabilityai/stable-diffusion-xl-base-1.0", torch_dtype=torch.float16, variant="fp16", use_safetensors=True
    ).to("cuda")
    carga = time.perf_counter() - inicio
    relatorio = {"modelo": "stabilityai/stable-diffusion-xl-base-1.0 (fp16)", "carga_s": round(carga, 1), "imagens": []}
    for item in prompts:
        gerador = torch.Generator("cuda").manual_seed(item.get("semente", 1))
        t0 = time.perf_counter()
        imagem = pipeline(
            prompt=item["prompt"],
            negative_prompt=NEGATIVO,
            width=item.get("largura", 1344),
            height=item.get("altura", 768),
            num_inference_steps=item.get("passos", 32),
            guidance_scale=item.get("guia", 6.5),
            generator=gerador,
        ).images[0]
        segundos = time.perf_counter() - t0
        arquivo = saida / f"{item['nome']}.png"
        imagem.save(arquivo)
        relatorio["imagens"].append({"nome": item["nome"], "segundos": round(segundos, 2), "arquivo": arquivo.name})
        print(f"{item['nome']}: {segundos:.1f} s", flush=True)
    relatorio["vram_pico_gb"] = round(torch.cuda.max_memory_allocated() / 1e9, 2)
    (saida / "relatorio.json").write_text(json.dumps(relatorio, ensure_ascii=False, indent=2), encoding="utf-8")
    print("RELATORIO " + json.dumps(relatorio, ensure_ascii=False))


principal()
