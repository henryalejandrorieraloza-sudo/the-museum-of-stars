// Pruebas de la palanca del LRV con la mano derecha (src/game/mandoLRV.ts).
// Ejecutar: node --test tests/mandoLRV.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MANDO_GRACIA_S,
  MANDO_RECENTRAR_TRAS_S,
  MANDO_RECORRIDO_LATERAL_HOMBROS,
  MANDO_RECORRIDO_PROFUNDIDAD,
  MANDO_SEGUNDOS_NEUTRO,
  MandoLRV,
  desviacionMando,
} from '../src/game/mandoLRV.ts';

const DT = 1 / 30;
const NEUTRO = { tamano: 0.3, lateral: 0.1 };

/** Alimenta `segundos` de la misma postura desde `desdeS`; devuelve el instante final. */
function alimentar(m: MandoLRV, desdeS: number, segundos: number, postura: { tamano: number; lateral: number } | null): number {
  let t = desdeS;
  const fin = desdeS + segundos;
  while (t < fin - 1e-9) {
    t += DT;
    m.actualizar(t, DT, postura);
  }
  return t;
}

test('acercar la mano a la cámara empuja la palanca; recogerla tira de ella; a los lados, la mueve de lado', () => {
  // La mano a 1/(1 − r) de su distancia: r = recorrido completo.
  const adelante = { tamano: NEUTRO.tamano / (1 - MANDO_RECORRIDO_PROFUNDIDAD), lateral: NEUTRO.lateral };
  assert.ok(Math.abs(desviacionMando(NEUTRO, adelante).adelante - 1) < 1e-9);
  const atras = { tamano: NEUTRO.tamano / (1 + MANDO_RECORRIDO_PROFUNDIDAD), lateral: NEUTRO.lateral };
  assert.ok(Math.abs(desviacionMando(NEUTRO, atras).adelante + 1) < 1e-9);
  const derecha = { tamano: NEUTRO.tamano, lateral: NEUTRO.lateral + MANDO_RECORRIDO_LATERAL_HOMBROS / 2 };
  assert.ok(Math.abs(desviacionMando(NEUTRO, derecha).lado - 0.5) < 1e-9);
  assert.equal(desviacionMando(NEUTRO, { tamano: 3, lateral: 9 }).adelante, 1, 'con tope');
  assert.equal(desviacionMando(NEUTRO, { tamano: 3, lateral: 9 }).lado, 1, 'con tope');
});

test('mientras toma el punto neutro la palanca queda centrada; después sigue a la mano', () => {
  const m = new MandoLRV();
  let t = alimentar(m, 0, MANDO_SEGUNDOS_NEUTRO / 2, NEUTRO);
  assert.equal(m.centrando, true);
  t = alimentar(m, t, MANDO_SEGUNDOS_NEUTRO, NEUTRO);
  assert.equal(m.centrando, false);
  assert.ok(Math.abs(m.posicion.adelante) < 1e-9);
  const empujada = { tamano: NEUTRO.tamano * 1.5, lateral: NEUTRO.lateral };
  alimentar(m, t, 1, empujada);
  assert.ok(m.posicion.adelante > 0.95, `adelante ${m.posicion.adelante}`);
});

test('sin mano, la palanca aguanta un momento y luego vuelve sola al centro', () => {
  const m = new MandoLRV();
  let t = alimentar(m, 0, MANDO_SEGUNDOS_NEUTRO + 0.1, NEUTRO);
  t = alimentar(m, t, 1, { tamano: NEUTRO.tamano * 1.5, lateral: NEUTRO.lateral });
  const empujada = m.posicion.adelante;
  t = alimentar(m, t, MANDO_GRACIA_S * 0.5, null);
  assert.equal(m.posicion.adelante, empujada, 'pérdida breve: se queda donde estaba');
  alimentar(m, t, 1.5, null);
  assert.ok(Math.abs(m.posicion.adelante) < 0.05, `vuelve al centro: ${m.posicion.adelante}`);
});

test('al volver a ver la mano tras perderla un rato, toma de nuevo el punto neutro', () => {
  const m = new MandoLRV();
  let t = alimentar(m, 0, MANDO_SEGUNDOS_NEUTRO + 0.1, NEUTRO);
  t = alimentar(m, t, MANDO_RECENTRAR_TRAS_S + 0.2, null);
  // Vuelve más cerca de la cámara: ese es su nuevo centro, no una palanca empujada.
  const nueva = { tamano: NEUTRO.tamano * 1.4, lateral: NEUTRO.lateral };
  alimentar(m, t, MANDO_SEGUNDOS_NEUTRO + 0.5, nueva);
  assert.equal(m.centrando, false);
  assert.ok(Math.abs(m.posicion.adelante) < 0.05, `adelante ${m.posicion.adelante}`);
});

test('recentrar (al sentarse) olvida el punto neutro', () => {
  const m = new MandoLRV();
  alimentar(m, 0, MANDO_SEGUNDOS_NEUTRO + 0.1, NEUTRO);
  m.recentrar();
  assert.equal(m.centrando, true);
});
