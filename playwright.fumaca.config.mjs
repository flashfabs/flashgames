// Smoke test against production (npm run fumaca): same browser setup as the end-to-end suite, no local server.
// SALINHA_URL points it elsewhere (a deploy preview, for example); COMMIT sets the expected version (default: main).

import { defineConfig } from '@playwright/test';
import base from './playwright.config.mjs';

const { webServer, ...semServidor } = base;

export default defineConfig({
  ...semServidor,
  testMatch: '*.fumaca.mjs',
  timeout: 180_000,
  use: { ...base.use, baseURL: process.env.SALINHA_URL ?? 'https://salinha-jogos.netlify.app' },
});
