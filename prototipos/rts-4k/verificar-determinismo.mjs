// Runs the same scripted match and prints checksums, so different JS engines can be compared:
//   node prototipos/rts-4k/verificar-determinismo.mjs
//   jsc -m prototipos/rts-4k/verificar-determinismo.mjs   (JavaScriptCore, Safari's engine)
import { executarRoteiro } from './roteiro-determinismo.js';

const escrever = globalThis.print ?? console.log;
const agora = () => globalThis.performance?.now?.() ?? (globalThis.preciseTime ? globalThis.preciseTime() * 1000 : Date.now());
const motor = globalThis.process?.versions?.v8 ? `V8 ${globalThis.process.versions.v8} (Node ${globalThis.process.version})` : 'JavaScriptCore (jsc)';

escrever(JSON.stringify({ motor, ...executarRoteiro(agora) }));
