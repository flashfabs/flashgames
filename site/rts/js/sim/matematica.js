// Integer math for the simulation: seeded random numbers, integer square root and table-based trigonometry.
// Every function returns the same integer in every JavaScript engine.
import { SENO, ARCO_TANGENTE, PASSOS_TANGENTE } from './tabelas.js';

/** xorshift32 stream as plain data, so it can be saved: { estado }. */
export function criarSorteio(semente) {
  return { estado: (semente | 0) || 0x2545f491 };
}

/** Next number of the stream, an integer in 0..limite-1. */
export function sortear(sorteio, limite) {
  let s = sorteio.estado;
  s ^= s << 13;
  s ^= s >>> 17;
  s ^= s << 5;
  sorteio.estado = s;
  return (s >>> 0) % limite;
}

/** floor(sqrt(n)) for 0 <= n < 2^53, by Newton's method on integers from a power-of-two first guess. */
export function raizInteira(n) {
  if (n <= 0) return 0;
  if (n < 0x80000000) {
    // 32-bit fast path: the guess 2^ceil(bits/2) is above the root, so Newton descends in a few steps
    let x = 1 << ((33 - Math.clz32(n)) >> 1);
    let y = (x + ((n / x) | 0)) >> 1;
    while (y < x) {
      x = y;
      y = (x + ((n / x) | 0)) >> 1;
    }
    return x;
  }
  let x = n;
  let y = Math.trunc((x + 1) / 2);
  while (y < x) {
    x = y;
    y = Math.trunc((x + Math.trunc(n / x)) / 2);
  }
  return x;
}

/** sin of an angle in 0..255 (a full turn is 256), scaled by ESCALA_SENO (1024). */
export const seno = angulo => SENO[angulo & 255];
export const cosseno = angulo => SENO[(angulo + 64) & 255];

/** Angle 0..255 of the vector (dx, dy); 0 is +x, 64 is +y. Returns 0 for the null vector. */
export function anguloDe(dx, dy) {
  if (dx === 0 && dy === 0) return 0;
  const ax = dx < 0 ? -dx : dx;
  const ay = dy < 0 ? -dy : dy;
  // first-quadrant angle 0..64 from the octant table
  let a = ax >= ay ? ARCO_TANGENTE[Math.trunc((ay * PASSOS_TANGENTE) / ax)] : 64 - ARCO_TANGENTE[Math.trunc((ax * PASSOS_TANGENTE) / ay)];
  if (dx < 0) a = 128 - a;
  if (dy < 0) a = 256 - a;
  return a & 255;
}

/** Signed shortest difference from angle a to angle b, in -128..127. */
export function diferencaAngulo(a, b) {
  return (((b - a) & 255) ^ 128) - 128;
}

/** Turns angle a towards b by at most passo units. */
export function girarAngulo(a, b, passo) {
  const d = diferencaAngulo(a, b);
  if (d > passo) return (a + passo) & 255;
  if (d < -passo) return (a - passo) & 255;
  return b & 255;
}
