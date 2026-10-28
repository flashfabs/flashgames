// QR code of a room link, drawn on a canvas so a phone joins by pointing its camera. The encoder is a small MIT
// library (qrcode-generator 1.4.4) loaded only when a QR is shown, pinned by version and integrity hash.

const URL_BIBLIOTECA = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';
const INTEGRIDADE = 'sha384-8FWZA6BGMXhsfO+BLtrJK0We6gg5o1JyO8xQm6peWDEUs17ACA5ziE/NIAkl9z2k';
const CLARO = '#ffffff';
const ESCURO = '#0e141c';

let carregando = null;

function carregarBiblioteca() {
  if (typeof window.qrcode === 'function') return Promise.resolve(window.qrcode);
  carregando ??= new Promise((ok, falhar) => {
    const script = document.createElement('script');
    script.src = URL_BIBLIOTECA;
    script.integrity = INTEGRIDADE;
    script.crossOrigin = 'anonymous';
    script.async = true;
    script.onload = () => (typeof window.qrcode === 'function' ? ok(window.qrcode) : falhar(new Error('QR library loaded without qrcode()')));
    script.onerror = () => {
      carregando = null;
      falhar(new Error('QR library failed to load'));
    };
    document.head.append(script);
  });
  return carregando;
}

// Draws `texto` as a QR code filling about `lado` CSS pixels, with a quiet zone of `margem` modules.
export async function desenharQr(canvas, texto, { lado = 168, margem = 3 } = {}) {
  const qrcode = await carregarBiblioteca();
  const codigo = qrcode(0, 'M');
  codigo.addData(texto);
  codigo.make();
  const modulos = codigo.getModuleCount();
  const total = modulos + margem * 2;
  const escala = Math.max(1, Math.floor((lado * Math.min(3, window.devicePixelRatio || 1)) / total));
  canvas.width = canvas.height = total * escala;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = CLARO;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = ESCURO;
  for (let linha = 0; linha < modulos; linha++) {
    for (let coluna = 0; coluna < modulos; coluna++) {
      if (codigo.isDark(linha, coluna)) ctx.fillRect((coluna + margem) * escala, (linha + margem) * escala, escala, escala);
    }
  }
  return canvas;
}
