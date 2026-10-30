// Loads a pre-rendered vehicle atlas (colour and team mask) described by a small manifest; resolves to null when the
// atlas is missing or broken, so the renderer keeps its procedural shapes.

// The prototype's Blender tank, until the art front's sprite manifest replaces it.
export const ATLAS_PROTOTIPO = new URL('../../assets/prototipo/', import.meta.url);

function carregarImagem(url) {
  return new Promise((ok, erro) => {
    const imagem = new Image();
    imagem.onload = () => ok(imagem);
    imagem.onerror = () => erro(new Error(`falhou ${url}`));
    imagem.src = url;
  });
}

export async function carregarAtlas(base = ATLAS_PROTOTIPO) {
  try {
    const resposta = await fetch(new URL('manifesto.json', base));
    if (!resposta.ok) return null;
    const manifesto = await resposta.json();
    const [cor, time] = await Promise.all([
      carregarImagem(new URL(manifesto.cor, base).href),
      carregarImagem(new URL(manifesto.time, base).href),
    ]);
    return { cor, time, manifesto };
  } catch (erro) {
    console.warn('atlas do Blender indisponível, usando formas procedurais', erro);
    return null;
  }
}
