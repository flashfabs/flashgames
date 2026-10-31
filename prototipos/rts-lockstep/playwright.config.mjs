// Soak of the lockstep spike, outside the regular suite (it takes as long as the match it plays):
//   npx playwright test --config prototipos/rts-lockstep/playwright.config.mjs
// on the RTX 4090 PC through scripts/rtx-testes.sh -- --config prototipos/rts-lockstep/playwright.config.mjs.
// The page loads modules from site/ and prototipos/, so the server serves the repository root. Signaling goes through
// the public PeerJS server, so it needs internet access. Settings by environment variable are in lockstep.spec.mjs.

import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

function portaLivre() {
  return new Promise((resolve, reject) => {
    const servidor = net.createServer();
    servidor.on('error', reject);
    servidor.listen(0, '127.0.0.1', () => {
      const { port } = servidor.address();
      servidor.close(() => resolve(port));
    });
  });
}

process.env.LOCKSTEP_PORTA ??= String(await portaLivre());
const PORTA = Number(process.env.LOCKSTEP_PORTA);
const PYTHON = process.env.SALINHA_PYTHON ?? 'python3';
const raiz = fileURLToPath(new URL('../../', import.meta.url));

export default defineConfig({
  testDir: '.',
  testMatch: 'lockstep.spec.mjs',
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: `http://127.0.0.1:${PORTA}` },
  webServer: {
    command: `${PYTHON} scripts/servidor-testes.py ${PORTA} .`,
    cwd: raiz,
    url: `http://127.0.0.1:${PORTA}/prototipos/rts-lockstep/`,
    reuseExistingServer: false,
    stdout: 'ignore',
    stderr: 'ignore',
  },
});
