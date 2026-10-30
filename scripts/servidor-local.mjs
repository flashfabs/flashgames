import { createServer } from 'node:http';
import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { criarApiSalas } from '../netlify/functions/salas-farm.mjs';

const raiz = resolve('site');
const porta = Number(process.env.PORTA || 8793);
// Local-only in-memory store, mirroring the public-room API used in production.
const registros = new Map();
let revisao = 0;
const armazem = {
  async list({ prefix }) { return { blobs: [...registros.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })) }; },
  async get(key) { return registros.get(key)?.data ?? null; },
  async getWithMetadata(key) { return registros.get(key) ?? null; },
  async setJSON(key, data, opcoes) {
    const atual = registros.get(key);
    if ((opcoes.onlyIfNew && atual) || (opcoes.onlyIfMatch && atual?.etag !== opcoes.onlyIfMatch)) return { modified: false };
    registros.set(key, { data, etag: String(++revisao) }); return { modified: true };
  },
};
const apiSalas = criarApiSalas({ armazem });

const tipos = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon', '.wav': 'audio/wav' };

async function versao(pasta = raiz) {
  const entradas = await readdir(pasta, { withFileTypes: true });
  const partes = await Promise.all(entradas.map(async (entrada) => {
    const caminho = resolve(pasta, entrada.name);
    if (entrada.isDirectory()) return versao(caminho);
    const info = await stat(caminho);
    return `${caminho}:${info.mtimeMs}:${info.size}`;
  }));
  return createHash('sha256').update(partes.sort().join('|')).digest('hex');
}

const atualizacao = `<script>
let versaoLocal;
async function verificarAlteracoes() {
  try {
    const resposta = await fetch('/__versao_local', { cache: 'no-store' });
    const atual = await resposta.text();
    if (versaoLocal && atual !== versaoLocal) location.reload();
    versaoLocal = atual;
  } catch (erro) { /* Retry when the local server returns. */ }
}
verificarAlteracoes();
setInterval(verificarAlteracoes, 1000);
</script>`;

createServer(async (pedido, resposta) => {
  try {
    const caminhoUrl = decodeURIComponent(new URL(pedido.url, 'http://localhost').pathname);
    if (caminhoUrl === '/api/salas-farm') {
      let corpo = '';
      for await (const trecho of pedido) { corpo += trecho; if (corpo.length > 2048) { resposta.writeHead(413); resposta.end(); return; } }
      const requisicao = new Request(`http://localhost:${porta}${caminhoUrl}`, { method: pedido.method, headers: pedido.headers, ...(pedido.method === 'POST' ? { body: corpo } : {}) });
      const resultado = await apiSalas(requisicao);
      resposta.writeHead(resultado.status, Object.fromEntries(resultado.headers.entries()));
      resposta.end(await resultado.text());
      return;
    }
    if (caminhoUrl === '/__versao_local') {
      resposta.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
      resposta.end(await versao());
      return;
    }
    const caminho = resolve(raiz, `.${caminhoUrl === '/' ? '/index.html' : caminhoUrl}`);
    if (!caminho.startsWith(raiz + sep)) throw new Error('Invalid path');
    let conteudo = await readFile(caminho);
    const extensao = extname(caminho);
    if (extensao === '.html') conteudo = conteudo.toString().replace('</body>', `${atualizacao}</body>`);
    resposta.writeHead(200, { 'Content-Type': tipos[extensao] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    resposta.end(conteudo);
  } catch (erro) {
    resposta.writeHead(404);
    resposta.end('Não encontrado');
  }
}).listen(porta, '127.0.0.1', () => console.log(`Site local: http://localhost:${porta}`));
