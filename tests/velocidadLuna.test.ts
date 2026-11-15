// Pruebas de los topes de velocidad de la misión lunar (src/game/luna.ts): a pie, el LRV y su aceleración y frenado.
// Ejecutar: node --test tests/velocidadLuna.test.ts  (Node 22.6+ quita los tipos de forma nativa; sin dependencias).
// Las estimaciones (MOON_WALK_MAX_SPEED, LRV_MAX_SPEED, LRV_ACCEL, LRV_BRAKE, LRV_RUEDA_LIBRE) están en src/game/luna.ts.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LRV_ACCEL,
  LRV_BRAKE,
  LRV_MAX_REVERSA,
  LRV_MAX_SPEED,
  LRV_RUEDA_LIBRE,
  MOON_WALK_MAX_SPEED,
  MisionLuna,
  acercarVelocidadLRV,
  metrosAPieLuna,
  objetivoMandoLRV,
  type EntradaLuna,
} from '../src/game/luna.ts';
import { Caminata, type OpcionesCaminata } from '../src/game/caminata.ts';
import { LM } from '../src/visual/sitioApollo17.ts';

const DT = 1 / 30;
/** Margen para errores de coma flotante. */
const EPS = 1e-9;

/** Fotograma de la misión con el LRV conduciendo, sin nada más que hacer. */
function fotograma(extra: Partial<EntradaLuna> = {}): EntradaLuna {
  return {
    ahoraS: 0,
    dtS: DT,
    aplauso: false,
    mando: { adelante: 0, lado: 0 },
    jugador: { x: 0, z: 0 },
    ...extra,
  };
}

// --- A pie -----------------------------------------------------------------------------------------------------

test('a pie en la Luna, el avance por fotograma nunca pasa de MOON_WALK_MAX_SPEED', () => {
  for (const metros of [0.01, 0.05, 0.1, 0.5, 2]) {
    assert.ok(metrosAPieLuna(metros, DT) <= MOON_WALK_MAX_SPEED * DT + EPS, `metros ${metros}`);
  }
  // Por debajo del tope, no cambia nada.
  assert.equal(metrosAPieLuna(0.02, DT), 0.02);
  assert.equal(metrosAPieLuna(0, DT), 0);
  assert.equal(metrosAPieLuna(-0.5, DT), -MOON_WALK_MAX_SPEED * DT);
});

test('con cadencia alta y velocidad de Opciones alta, la caminata a pie no pasa de 1.2 m/s', () => {
  // Opciones al máximo (3 m/s) y 10 pasos por segundo de 0.4 m: la caminata del museo iría a 3 m/s.
  const opciones: OpcionesCaminata = { metrosPorPaso: 0.4, velocidadMax: 3, tiempoAceleracion: 0.5 };
  const caminata = new Caminata();
  let t = 0;
  let pasosAcumulados = 0;
  let velocidadMaxVista = 0;
  for (let i = 0; i < 300; i++) {
    t += DT;
    // Pasos enteros: 10 pasos/s repartidos por fotograma.
    const pasosHastaAhora = Math.floor(t * 10);
    const pasos = pasosHastaAhora - pasosAcumulados;
    pasosAcumulados = pasosHastaAhora;
    const metros = caminata.avanzar(t, DT, pasos, opciones);
    const aPie = metrosAPieLuna(metros, DT);
    velocidadMaxVista = Math.max(velocidadMaxVista, aPie / DT);
  }
  assert.ok(velocidadMaxVista <= MOON_WALK_MAX_SPEED + EPS, `velocidad a pie ${velocidadMaxVista} m/s`);
  // Y sí llega al tope, así que el tope se alcanza y no se queda corto.
  assert.ok(velocidadMaxVista > MOON_WALK_MAX_SPEED - 0.05, `no llega al tope: ${velocidadMaxVista} m/s`);
});

// --- Aceleración y frenado -------------------------------------------------------------------------------------

test('la velocidad del LRV se acerca al objetivo como mucho a la tasa dada, y se para en él', () => {
  let v = 0;
  let maxPaso = 0;
  for (let i = 0; i < 30 * 30; i++) {
    const previa = v;
    v = acercarVelocidadLRV(v, LRV_MAX_SPEED, LRV_ACCEL, DT);
    maxPaso = Math.max(maxPaso, v - previa);
  }
  assert.ok(maxPaso <= LRV_ACCEL * DT + EPS, `aceleración ${maxPaso / DT} m/s²`);
  assert.equal(v, LRV_MAX_SPEED);
  for (let i = 0; i < 30 * 30; i++) v = acercarVelocidadLRV(v, 0, LRV_BRAKE, DT);
  assert.equal(v, 0);
});

test('el objetivo de la palanca nunca pasa de los topes, y frena en contra de la marcha', () => {
  assert.equal(objetivoMandoLRV(1, 0).objetivo, LRV_MAX_SPEED);
  assert.equal(objetivoMandoLRV(1, 0).tasa, LRV_ACCEL);
  assert.equal(objetivoMandoLRV(-1, 0).objetivo, -LRV_MAX_REVERSA, 'parado, atrás es marcha atrás');
  assert.deepEqual(objetivoMandoLRV(-1, 3), { objetivo: 0, tasa: LRV_BRAKE }, 'en marcha, atrás frena a tope');
  assert.deepEqual(objetivoMandoLRV(1, -1), { objetivo: 0, tasa: LRV_BRAKE }, 'marcha atrás, adelante frena');
  assert.deepEqual(objetivoMandoLRV(0, 3), { objetivo: 0, tasa: LRV_RUEDA_LIBRE }, 'centrada, se va parando');
  assert.ok(objetivoMandoLRV(-0.4, 3).tasa >= LRV_RUEDA_LIBRE, 'tirar un poco nunca frena menos que soltar');
});

// --- LRV en la misión --------------------------------------------------------------------------------------------

/** LRV en un tramo libre (lejos del LM y de la roca), conduciendo hacia el norte (rumbo 0). */
function lrvLibre(): MisionLuna {
  return new MisionLuna('conduciendo', { x: LM.x - 150, z: LM.z }, 0);
}

/** Velocidad (m/s) entre dos posiciones de un fotograma. */
function velocidad(a: { z: number }, b: { z: number }): number {
  return Math.abs(b.z - a.z) / DT;
}

test('con la palanca a tope el LRV nunca pasa de 5 m/s y acelera con suavidad', () => {
  const m = lrvLibre();
  let previa = m.posicion;
  let velPrevia = 0;
  let maxVel = 0;
  let maxSubida = 0;
  for (let i = 0; i < 30 * 15; i++) {
    m.update(fotograma({ mando: { adelante: 1, lado: 0 } }));
    const ahora = m.posicion;
    const v = velocidad(previa, ahora);
    maxVel = Math.max(maxVel, v);
    maxSubida = Math.max(maxSubida, v - velPrevia);
    previa = ahora;
    velPrevia = v;
  }
  assert.ok(maxVel <= LRV_MAX_SPEED + 1e-6, `velocidad del LRV ${maxVel} m/s`);
  assert.ok(maxVel > LRV_MAX_SPEED - 0.1, `no llega a su tope: ${maxVel} m/s`);
  assert.ok(maxSubida <= LRV_ACCEL * DT + 1e-6, `aceleración ${maxSubida / DT} m/s²`);
});

/** Lleva el LRV a su tope y cuenta los segundos hasta pararse con la palanca en `adelante`. */
function segundosHastaParar(adelante: number): number {
  const m = lrvLibre();
  for (let i = 0; i < 30 * 15; i++) m.update(fotograma({ mando: { adelante: 1, lado: 0 } }));
  assert.ok(m.velocidad > LRV_MAX_SPEED - 0.1, `antes de frenar debe ir cerca del tope: ${m.velocidad} m/s`);
  let frames = 0;
  while (frames < 30 * 20 && m.velocidad > 0) {
    m.update(fotograma({ mando: { adelante, lado: 0 } }));
    frames++;
  }
  return frames * DT;
}

test('tirando de la palanca a tope, el LRV se para en ~5 s desde 5 m/s', () => {
  const s = segundosHastaParar(-1);
  assert.ok(s >= LRV_MAX_SPEED / LRV_BRAKE - 0.2 && s <= LRV_MAX_SPEED / LRV_BRAKE + 0.2, `se detuvo en ${s.toFixed(2)} s`);
});

test('soltando la palanca, el LRV se va parando solo en un tiempo razonable', () => {
  const s = segundosHastaParar(0);
  assert.ok(Math.abs(s - LRV_MAX_SPEED / LRV_RUEDA_LIBRE) < 0.2, `se detuvo en ${s.toFixed(2)} s`);
  assert.ok(s <= 8, 'no debe tardar demasiado');
});
