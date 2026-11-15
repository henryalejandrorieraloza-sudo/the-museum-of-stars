// Pruebas de la máquina de estados de la misión lunar (src/game/luna.ts).
// Ejecutar: node --test tests/luna.test.ts  (Node 22.6+ quita los tipos de forma nativa; sin dependencias).
// Este archivo vive fuera de src/, así que `npm run build` no lo comprueba con tsc.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DIRECCION_MAX_GRADOS,
  GIRO_MAX_GRADOS_S,
  MANDO_ZONA_NEUTRAL,
  MisionLuna,
  POSICION_ROCA,
  direccionMandoGrados,
  ejeMando,
  giroLRVGradosS,
  type EntradaLuna,
} from '../src/game/luna.ts';

/** Fotograma sin nada que hacer; cada prueba cambia solo lo que le importa. */
function entrada(extra: Partial<EntradaLuna> = {}): EntradaLuna {
  return {
    ahoraS: 0,
    dtS: 1 / 30,
    aplauso: false,
    mando: { adelante: 0, lado: 0 },
    jugador: { x: 0, z: 0 },
    ...extra,
  };
}

/** Palanca: adelante y a un lado (−1…1). */
const palanca = (adelante: number, lado = 0) => ({ adelante, lado });

/** Misión ya dentro de la escena, sentada en el LRV, con rumbo 0 (hacia −Z). */
function sentada(posicion?: { x: number; z: number }): MisionLuna {
  return new MisionLuna('sentado_en_LRV', posicion, 0);
}

/** Avanza `n` fotogramas con la misma entrada. */
function repetir(m: MisionLuna, n: number, extra: Partial<EntradaLuna>): void {
  for (let i = 0; i < n; i++) m.update(entrada(extra));
}

/** Posición lejos de la roca y del LM, con sitio para conducir. */
const LEJOS = { x: POSICION_ROCA.x - 40, z: POSICION_ROCA.z };

test('el primer pellizco dentro de la escena, junto al LRV, sienta al jugador', () => {
  const m = new MisionLuna();
  assert.equal(m.estado, 'entrando_museo');
  m.update(entrada({ aplauso: true, jugador: m.posicion }));
  assert.equal(m.estado, 'sentado_en_LRV');
});

test('sentado pasa a conducir al empujar la palanca fuera de la zona neutral', () => {
  const m = sentada(LEJOS);
  m.update(entrada({ mando: palanca(MANDO_ZONA_NEUTRAL * 0.9) }));
  assert.equal(m.estado, 'sentado_en_LRV', 'dentro de la zona neutral no arranca');
  m.update(entrada({ mando: palanca(0.5) }));
  assert.equal(m.estado, 'conduciendo');
});

test('cada eje de la palanca es 0 en la zona neutral y llega a ±1 en el tope', () => {
  assert.equal(ejeMando(0), 0);
  assert.equal(ejeMando(MANDO_ZONA_NEUTRAL), 0);
  assert.equal(ejeMando(1), 1);
  assert.equal(ejeMando(-1), -1);
  assert.ok(ejeMando(0.6) > 0 && ejeMando(0.6) < 1);
});

test('empujando, el LRV avanza siguiendo el rumbo: con rumbo 0 va hacia −Z', () => {
  const m = sentada(LEJOS);
  const antes = m.posicion;
  repetir(m, 60, { mando: palanca(1) });
  assert.ok(m.posicion.z < antes.z);
  assert.ok(Math.abs(m.posicion.x - antes.x) < 1e-9);
  assert.ok(m.velocidad > 0);
});

test('el giro depende de la velocidad: parado no gira, rodando gira hacia el lado de la palanca', () => {
  assert.equal(giroLRVGradosS(0, 1), 0, 'parado, el LRV no gira en el sitio');
  assert.ok(giroLRVGradosS(2, 1) > 0, 'a la derecha, el rumbo crece');
  assert.ok(giroLRVGradosS(2, -1) < 0);
  assert.ok(giroLRVGradosS(-1, 1) < 0, 'marcha atrás, el morro gira al otro lado');
  assert.equal(giroLRVGradosS(2, MANDO_ZONA_NEUTRAL * 0.5), 0, 'dentro de la zona neutral no gira');
  assert.equal(giroLRVGradosS(100, 1), GIRO_MAX_GRADOS_S, 'con tope');
  const m = sentada(LEJOS);
  repetir(m, 30, { mando: palanca(0, 1) });
  assert.equal(m.rumboGrados, 0, 'con la palanca solo a un lado y parado, el rumbo no cambia');
  repetir(m, 60, { mando: palanca(1, 1) });
  assert.ok(m.rumboGrados > 0, 'avanzando con la palanca a la derecha, gira a la derecha');
});

test('tirar de la palanca en marcha frena sin dar marcha atrás; ya parado, da marcha atrás', () => {
  const m = sentada(LEJOS);
  repetir(m, 90, { mando: palanca(1) });
  const enMarcha = m.velocidad;
  assert.ok(enMarcha > 1);
  m.update(entrada({ mando: palanca(-1) }));
  assert.ok(m.velocidad < enMarcha, 'frena');
  assert.equal(m.marchaAtras, false, 'en marcha hacia delante, tirar no activa la marcha atrás');
  let minimo = Infinity;
  for (let i = 0; i < 30 * 10; i++) {
    m.update(entrada({ mando: palanca(-1) }));
    minimo = Math.min(minimo, m.velocidad);
  }
  assert.ok(minimo < 0, 'tras pararse, sigue tirando y retrocede');
  assert.equal(m.marchaAtras, true);
});

test('frenar tirando de la palanca para antes que soltarla', () => {
  const tiempoHastaParar = (mando: { adelante: number; lado: number }): number => {
    const m = sentada(LEJOS);
    repetir(m, 30 * 12, { mando: palanca(1) });
    let n = 0;
    while (m.velocidad > 0.05 && n < 30 * 30) {
      m.update(entrada({ mando }));
      n++;
    }
    return n;
  };
  assert.ok(tiempoHastaParar(palanca(-1)) < tiempoHastaParar(palanca(0)));
});

test('sin datos de la mano, el LRV se va parando y las ruedas se quedan en su último ángulo', () => {
  const m = sentada(LEJOS);
  repetir(m, 60, { mando: palanca(1, 0.8) });
  const angulo = m.direccionGrados;
  assert.ok(angulo > 0);
  const v = m.velocidad;
  m.update(entrada({ mando: null }));
  assert.ok(m.velocidad < v, 'desacelera');
  assert.equal(m.direccionGrados, angulo, 'sin mano, el último ángulo');
});

test('la dirección de las ruedas sigue a la palanca, con su signo, y parado ya gira las ruedas', () => {
  assert.equal(direccionMandoGrados(MANDO_ZONA_NEUTRAL * 0.5), 0);
  assert.equal(direccionMandoGrados(1), DIRECCION_MAX_GRADOS);
  assert.ok(direccionMandoGrados(-0.5) < 0);
  const m = sentada(LEJOS);
  m.update(entrada({ mando: palanca(0, 0.7) }));
  assert.ok(m.direccionGrados > 0);
});

test('con cámara, el pellizco sentado baja del LRV y no vuelve al museo', () => {
  const m = sentada(LEJOS);
  const eventos = m.update(entrada({ aplauso: true, bajarse: true, jugador: m.posicion }));
  assert.equal(m.estado, 'a_pie');
  assert.ok(eventos.some((e) => e.tipo === 'bajado'));
  assert.ok(!eventos.some((e) => e.tipo === 'volver'));
});

test('confirmar sin bajarse (p. ej. con la misión cumplida) vuelve al museo y congela el resto', () => {
  const m = sentada();
  const eventos = m.update(entrada({ aplauso: true }));
  assert.equal(m.estado, 'volviendo');
  assert.ok(eventos.some((e) => e.tipo === 'volver'));
  m.update(entrada({ mando: palanca(1, 1), dtS: 1 }));
  assert.equal(m.estado, 'volviendo', 'no vuelve a cambiar tras volver');
});

test('con la misión cumplida no se baja: confirmar vuelve al museo', () => {
  const m = sentada(LEJOS);
  m.bloquear();
  const eventos = m.update(entrada({ aplauso: true, bajarse: true }));
  assert.equal(m.estado, 'volviendo');
  assert.ok(eventos.some((e) => e.tipo === 'volver'));
});

test('tras recoger la muestra, confirmar vuelve al museo', () => {
  const m = new MisionLuna('muestra_recogida', LEJOS);
  m.update(entrada({ aplauso: true }));
  assert.equal(m.estado, 'volviendo');
});

test('bajarse del LRV deja el LRV donde estaba y pasa a pie', () => {
  const m = sentada(LEJOS);
  repetir(m, 30, { mando: palanca(1) });
  const donde = m.posicion;
  const eventos = m.update(entrada({ mando: palanca(1), bajarse: true }));
  assert.equal(m.estado, 'a_pie');
  assert.equal(m.aPie, true);
  assert.deepEqual(m.posicion, donde, 'el LRV se detiene: no avanza en el fotograma de bajarse');
  assert.ok(eventos.some((e) => e.tipo === 'bajado' && !e.conMuestra));
  repetir(m, 30, { mando: palanca(1, 1) });
  assert.deepEqual(m.posicion, donde, 'a pie, la palanca ya no mueve el LRV');
});

test('bajarse conserva la muestra; confirmar a pie vuelve al museo y el halo sigue apagado', () => {
  const m = new MisionLuna('muestra_recogida', LEJOS);
  const eventos = m.update(entrada({ bajarse: true }));
  assert.equal(m.estado, 'a_pie');
  assert.ok(eventos.some((e) => e.tipo === 'bajado' && e.conMuestra));
  assert.equal(m.muestraRecogida, true);
  assert.equal(m.haloVisible, false);
  const lejos = { x: m.posicion.x + 50, z: m.posicion.z };
  m.update(entrada({ aplauso: true, jugador: lejos }));
  assert.equal(m.estado, 'volviendo');
});

test('bajado sin muestra, el pellizco junto al LRV vuelve a sentarlo y lejos no', () => {
  const m = sentada(LEJOS);
  m.update(entrada({ bajarse: true }));
  const ev = m.update(entrada({ aplauso: true, jugador: { x: LEJOS.x + 20, z: LEJOS.z } }));
  assert.equal(m.estado, 'a_pie');
  assert.ok(ev.some((e) => e.tipo === 'lejosDelLRV'));
  m.update(entrada({ aplauso: true, jugador: { x: LEJOS.x + 2, z: LEJOS.z } }));
  assert.equal(m.estado, 'sentado_en_LRV');
});

test('no se baja a pie', () => {
  const llegada = new MisionLuna();
  llegada.update(entrada({ bajarse: true }));
  assert.equal(llegada.estado, 'entrando_museo');
});

test('con teclado se puede retroceder desde parado', () => {
  const m = sentada(LEJOS);
  const antes = m.posicion;
  repetir(m, 30, { mando: palanca(-1) });
  assert.equal(m.estado, 'conduciendo');
  assert.ok(m.posicion.z > antes.z, 'con rumbo 0, retroceder va hacia +Z');
});

test('con teclado, espacio sentado no vuelve al museo; la E mantenida (volver) sí', () => {
  const m = sentada();
  const sinVolver = m.update(entrada({ aplauso: true, aplausoVuelve: false, jugador: m.posicion }));
  assert.equal(sinVolver.some((e) => e.tipo === 'volver'), false);
  assert.notEqual(m.estado, 'volviendo');
  const eventos = m.update(entrada({ volver: true, jugador: m.posicion }));
  assert.equal(eventos.some((e) => e.tipo === 'volver'), true);
  assert.equal(m.estado, 'volviendo');
});

test('el LRV se para al chocar con la roca en vez de seguir empujando', () => {
  const m = new MisionLuna('conduciendo', { x: POSICION_ROCA.x, z: POSICION_ROCA.z + 6 }, 0);
  repetir(m, 30 * 10, { mando: palanca(1) });
  assert.ok(Math.hypot(m.posicion.x - POSICION_ROCA.x, m.posicion.z - POSICION_ROCA.z) >= 2 - 1e-9);
  assert.equal(m.velocidad, 0);
});

test('exploración libre: sin roca ni halo, y el LRV pasa por el sitio del LM sin que nada lo frene', () => {
  const m = new MisionLuna('sentado_en_LRV', undefined, undefined, true);
  assert.equal(m.haloVisible, false);
  assert.equal(m.aPie, false);
  for (let i = 0; i < 20; i++) m.update(entrada({ ahoraS: i * 0.1, dtS: 0.1, mando: palanca(1) }));
  assert.equal(m.estado, 'conduciendo');
  assert.ok(m.velocidad > 0);
});
