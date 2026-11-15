// Pellizco para subir al LRV y bajarse: solo el de la mano izquierda, que es la que no conduce (src/tracking/gestures.ts),
// con manos sintéticas. Las manos y la función de correr el gesto son las de pellizcoDoble.test.ts.
// Ejecutar: compilar con rolldown y luego node --test (Node no quita los tipos de gestures.ts; ver SPEC 14).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pellizcoManoLibre,
  pellizcoConfirmarEstadoInicial,
  type PellizcoConfirmarEstado,
} from '../src/tracking/gestures.ts';
import type { TrackedHand } from '../src/tracking/tracker.ts';

type Forma = 'ok' | 'puno' | 'abierta';
const W = 640;
const H = 480;

/**
 * Mano sintética en coordenadas normalizadas. 'ok': pulgar e índice juntos y los otros tres dedos extendidos.
 * 'puno': puño cerrado sujetando el volante (pulgar junto al índice, puntas dobladas hacia la palma).
 * 'abierta': todos los dedos extendidos, pulgar separado.
 */
function mano(label: 'Left' | 'Right', forma: Forma, cx = label === 'Left' ? 0.65 : 0.35): TrackedHand {
  const p = (x: number, y: number) => ({ x: cx + x, y: 0.6 + y, z: 0 });
  const lm = Array.from({ length: 21 }, () => p(0, 0));
  lm[0] = p(0, 0.1);
  lm[9] = p(0, 0);
  lm[5] = p(-0.03, 0.005);
  lm[17] = p(0.05, 0.02);
  lm[10] = p(0, -0.035);
  lm[14] = p(0.025, -0.03);
  lm[18] = p(0.045, -0.015);
  if (forma === 'puno') {
    lm[4] = p(-0.03, 0.0);
    lm[8] = p(-0.025, 0.01);
    lm[12] = p(0, 0.03);
    lm[16] = p(0.02, 0.035);
    lm[20] = p(0.04, 0.04);
  } else {
    lm[12] = p(0, -0.09);
    lm[16] = p(0.03, -0.08);
    lm[20] = p(0.055, -0.06);
    lm[4] = forma === 'ok' ? p(-0.04, -0.04) : p(-0.08, 0.0);
    lm[8] = forma === 'ok' ? p(-0.035, -0.045) : p(-0.035, -0.09);
  }
  return { label, landmarks: lm, worldLandmarks: [], score: 1 };
}

/** Corre el gesto a 30 fps durante `segundos` (desde `desdeS`) y devuelve cuántas veces bajó. */
function correr(manos: TrackedHand[], desdeS: number, segundos: number, estado: { e: PellizcoConfirmarEstado }): number {
  let bajadas = 0;
  for (let t = desdeS; t < desdeS + segundos; t += 1 / 30) {
    const r = pellizcoManoLibre(manos, W, H, estado.e, t);
    estado.e = r.estado;
    if (r.detectado) bajadas++;
  }
  return bajadas;
}

test('el pellizco de la mano izquierda baja del LRV tras sostenerlo 1 s', () => {
  const s = { e: pellizcoConfirmarEstadoInicial };
  assert.equal(correr([mano('Left', 'ok')], 0, 2, s), 1);
});

test('el pellizco de la mano derecha (la que lleva la palanca) no baja', () => {
  const s = { e: pellizcoConfirmarEstadoInicial };
  assert.equal(correr([mano('Right', 'ok')], 0, 3, s), 0);
});

test('con las dos manos pellizcando, baja solo la izquierda', () => {
  const s = { e: pellizcoConfirmarEstadoInicial };
  assert.equal(correr([mano('Left', 'ok'), mano('Right', 'ok')], 0, 2, s), 1);
});

test('la mano izquierda en puño no baja', () => {
  const s = { e: pellizcoConfirmarEstadoInicial };
  assert.equal(correr([mano('Left', 'puno')], 0, 2, s), 0);
});

test('sostener el pellizco baja una sola vez; hay que soltar y volver a juntar', () => {
  const s = { e: pellizcoConfirmarEstadoInicial };
  assert.equal(correr([mano('Left', 'ok')], 0, 2, s), 1);
  assert.equal(correr([mano('Left', 'abierta')], 2, 0.5, s), 0);
  assert.equal(correr([mano('Left', 'ok')], 2.5, 2, s), 1);
});

test('menos de 1 s sostenido no baja', () => {
  const s = { e: pellizcoConfirmarEstadoInicial };
  assert.equal(correr([mano('Left', 'ok')], 0, 0.9, s), 0);
});

test('un parpadeo corto del detector no reinicia el llenado', () => {
  const s = { e: pellizcoConfirmarEstadoInicial };
  assert.equal(correr([mano('Left', 'ok')], 0, 0.6, s), 0);
  assert.equal(correr([mano('Left', 'abierta')], 0.6, 0.1, s), 0);
  assert.equal(correr([mano('Left', 'ok')], 0.7, 0.5, s), 1);
});

test('soltar más de la gracia reinicia el llenado', () => {
  const s = { e: pellizcoConfirmarEstadoInicial };
  assert.equal(correr([mano('Left', 'ok')], 0, 0.6, s), 0);
  assert.equal(correr([mano('Left', 'abierta')], 0.6, 0.3, s), 0);
  assert.equal(correr([mano('Left', 'ok')], 0.9, 0.5, s), 0);
});

test('el anillo se llena mientras se sostiene y se apaga al confirmar', () => {
  let s = pellizcoConfirmarEstadoInicial;
  const en = (t: number) => {
    const r = pellizcoManoLibre([mano('Left', 'ok')], W, H, s, t);
    s = r.estado;
    return r;
  };
  assert.equal(en(0).progreso, 0);
  const medio = en(0.5).progreso;
  assert.ok(medio !== null && Math.abs(medio - 0.5) < 0.05, `a medio sostener: ${medio}`);
  const fin = en(1);
  assert.equal(fin.detectado, true);
  assert.equal(fin.progreso, null);
  assert.equal(en(1.1).progreso, null, 'ya confirmado: sostenerlo no enseña anillo');
});
