// Plays the golden replays in this engine and prints one line per replay with the result; exits non-zero on a
// mismatch. Runs in Node and in the macOS JavaScriptCore shell (Safari's engine):
//   node ferramentas/rts/verificar-replays.mjs
//   /System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -m ferramentas/rts/verificar-replays.mjs
import { executarReplay } from '../../site/rts/js/sim/replay.js';

const NOMES = ['prototipo-um-comandante', 'prototipo-dois-comandantes', 'livre-tres-times'];
const escrever = globalThis.print ?? console.log;
const motor = globalThis.process?.versions?.v8 ? `V8 ${globalThis.process.versions.v8}` : 'JavaScriptCore';

async function ler(nome) {
  if (globalThis.process?.versions?.node) {
    const { readFileSync } = await import('node:fs');
    return readFileSync(new URL(`../../testes/rts-replays/${nome}.json`, import.meta.url), 'utf8');
  }
  // the jsc shell reads files relative to the working directory
  return globalThis.read(`testes/rts-replays/${nome}.json`);
}

let falhas = 0;
for (const nome of NOMES) {
  const replay = JSON.parse(await ler(nome));
  const resultado = executarReplay(replay);
  const igual = resultado.final === replay.final && resultado.somas.join() === replay.somas.join();
  if (!igual) falhas++;
  escrever(JSON.stringify({ motor, replay: nome, final: resultado.final, esperado: replay.final, igual }));
}
if (falhas > 0) {
  if (globalThis.process) globalThis.process.exitCode = 1;
  else throw new Error(`${falhas} replay(s) diferentes`);
}
