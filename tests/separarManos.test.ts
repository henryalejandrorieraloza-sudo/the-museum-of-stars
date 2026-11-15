// Separar las manos para desarmar o armar el LRV en el taller (src/tracking/gestures.ts), con manos sintéticas.
// Ejecutar: node --test tests/separarManos.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SEPARAR_COOLDOWN_S,
  SEPARAR_VENTANA_S,
  separarManos,
  separarManosEstadoInicial,
  type SepararManosEstado,
} from '../src/tracking/gestures.ts';
import type { TrackedHand } from '../src/tracking/tracker.ts';

const W = 640;
const H = 480;
/** Ancho de hombros en píxeles: la distancia entre palmas se mide en múltiplos de este valor. */
const HOMBROS_PX = 200;

/** Mano sintética con el centro de la palma en x (0–1 del ancho). Solo importan los MCP del índice y del meñique. */
function mano(label: 'Left' | 'Right', x: number): TrackedHand {
  const lm = Array.from({ length: 21 }, () => ({ x, y: 0.6, z: 0 }));
  lm[5] = { x: x - 0.02, y: 0.6, z: 0 };
  lm[17] = { x: x + 0.02, y: 0.6, z: 0 };
  return { label, landmarks: lm, worldLandmarks: [], score: null };
}

/** Dos manos cuyas palmas están a `hombros` anchos de hombros una de otra, centradas en la imagen. */
function par(hombros: number): TrackedHand[] {
  const mitad = (hombros * HOMBROS_PX) / W / 2;
  return [mano('Left', 0.5 + mitad), mano('Right', 0.5 - mitad)];
}

function paso(hands: TrackedHand[], estado: SepararManosEstado, t: number) {
  return separarManos(hands, HOMBROS_PX, W, H, estado, t);
}

test('juntas y luego separadas dentro de la ventana: separar, una sola vez', () => {
  let r = paso(par(0.3), separarManosEstadoInicial, 0);
  assert.equal(r.gesto, null);
  r = paso(par(0.8), r.estado, 0.2); // a medio camino: aún no
  assert.equal(r.gesto, null);
  r = paso(par(1.3), r.estado, 0.4);
  assert.equal(r.gesto, 'separar');
  r = paso(par(1.4), r.estado, 0.5); // sigue separado: no repite
  assert.equal(r.gesto, null);
});

test('separadas y luego juntas: juntar (armar), una sola vez', () => {
  let r = paso(par(0.3), separarManosEstadoInicial, 0);
  r = paso(par(1.3), r.estado, 0.3);
  assert.equal(r.gesto, 'separar');
  r = paso(par(0.8), r.estado, 0.6);
  assert.equal(r.gesto, null);
  r = paso(par(0.3), r.estado, 0.3 + SEPARAR_COOLDOWN_S + 0.1);
  assert.equal(r.gesto, 'juntar');
  r = paso(par(0.2), r.estado, 1.6); // sigue juntas: no repite
  assert.equal(r.gesto, null);
});

test('el ciclo del vídeo alterna separar y juntar', () => {
  let r = paso(par(0.3), separarManosEstadoInicial, 0);
  const vistos: (string | null)[] = [];
  const pasos: [number, number][] = [[1.3, 0.5], [1.3, 1.0], [0.3, 1.5], [0.3, 2.0], [1.3, 2.5], [0.3, 3.2]];
  for (const [h, t] of pasos) {
    r = paso(par(h), r.estado, t);
    if (r.gesto) vistos.push(r.gesto);
  }
  assert.deepEqual(vistos, ['separar', 'juntar', 'separar', 'juntar']);
});

test('con las manos separadas desde hace rato y se juntan: juntar (arma lo que esté desarmado)', () => {
  let r = paso(par(1.3), separarManosEstadoInicial, 0);
  for (let t = 0.5; t <= 5; t += 0.5) r = paso(par(1.3), r.estado, t); // quieto, abiertas
  r = paso(par(0.3), r.estado, 5.2);
  assert.equal(r.gesto, 'juntar');
});

test('un extremo visto hace más que la ventana ya no cuenta', () => {
  let r = paso(par(0.3), separarManosEstadoInicial, 0);
  r = paso(par(0.8), r.estado, 0.5);
  r = paso(par(1.3), r.estado, 0.5 + SEPARAR_VENTANA_S + 0.5);
  assert.equal(r.gesto, null);
});

test('manos juntas desde el principio, sin haber estado separadas, no hacen nada', () => {
  const r = paso(par(0.2), separarManosEstadoInicial, 0);
  assert.equal(r.gesto, null);
});

test('si el detector pierde las manos en pleno movimiento, aún cuenta al verlas en el otro extremo', () => {
  let r = paso(par(0.3), separarManosEstadoInicial, 0);
  r = paso([], r.estado, 0.2); // borrosas
  assert.equal(r.gesto, null);
  r = paso(par(1.3), r.estado, 0.5);
  assert.equal(r.gesto, 'separar');
});

test('una sola mano no cuenta', () => {
  let r = paso(par(0.3), separarManosEstadoInicial, 0);
  r = paso([mano('Left', 0.9)], r.estado, 0.3);
  assert.equal(r.gesto, null);
});

test('sin hombros visibles no cuenta', () => {
  const r = separarManos(par(1.3), null, W, H, { ...separarManosEstadoInicial, juntasS: 0 }, 0.3);
  assert.equal(r.gesto, null);
});
