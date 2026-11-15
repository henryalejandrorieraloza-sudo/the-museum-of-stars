// Elegir piezas del LRV con el dedo (src/game/senalarTaller.ts): piezas y subsistemas por clave. No importa Three.js.
// Ejecutar: node --test tests/senalarTaller.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEGUNDOS_ELEGIR, senalarTaller, senalarTallerEstadoInicial, type SenalarTallerEstado } from '../src/game/senalarTaller.ts';

/** Señala `objetivo` de `desdeS` a `hastaS` y devuelve las elecciones. `elegida` se actualiza como lo haría el taller. */
function correr(estado: SenalarTallerEstado, objetivo: string | null, elegidaInicial: string | null, desdeS: number, hastaS: number, paso = 0.1) {
  let elegida = elegidaInicial;
  let r = senalarTaller(estado, objetivo, elegida, desdeS);
  const elecciones: string[] = [];
  for (let t = desdeS + paso; t <= hastaS + 1e-9; t += paso) {
    r = senalarTaller(r.estado, objetivo, elegida, t);
    if (r.elegir !== null) {
      elecciones.push(r.elegir);
      elegida = r.elegir;
    }
  }
  return { r, elecciones, elegida };
}

test('señalar una pieza el tiempo necesario la elige, una sola vez', () => {
  const { elecciones } = correr(senalarTallerEstadoInicial, 'pieza:4', null, 0, SEGUNDOS_ELEGIR + 2);
  assert.deepEqual(elecciones, ['pieza:4']);
});

test('antes de tiempo no elige y el anillo se va llenando', () => {
  const { r, elecciones } = correr(senalarTallerEstadoInicial, 'pieza:4', null, 0, SEGUNDOS_ELEGIR / 2);
  assert.equal(elecciones.length, 0);
  assert.ok(r.progreso !== null && r.progreso > 0.4 && r.progreso < 0.6);
});

test('cambiar de pieza reinicia la espera', () => {
  let r = correr(senalarTallerEstadoInicial, 'pieza:1', null, 0, SEGUNDOS_ELEGIR - 0.1).r;
  r = correr(r.estado, 'pieza:2', null, SEGUNDOS_ELEGIR - 0.05, SEGUNDOS_ELEGIR + 0.3).r;
  assert.equal(r.elegir, null);
});

test('la pieza que ya está elegida no vuelve a elegirse ni dibuja anillo', () => {
  const { r, elecciones } = correr(senalarTallerEstadoInicial, 'pieza:4', 'pieza:4', 0, 3);
  assert.equal(elecciones.length, 0);
  assert.equal(r.progreso, null);
});

test('señalar otra pieza con una elegida cambia la elección', () => {
  const { elecciones, elegida } = correr(senalarTallerEstadoInicial, 'pieza:7', 'pieza:4', 0, 2);
  assert.deepEqual(elecciones, ['pieza:7']);
  assert.equal(elegida, 'pieza:7');
});

test('señalar el fondo, bajar la mano o tapar con un panel (pieza null) nunca suelta la elegida', () => {
  const { elecciones, r } = correr(senalarTallerEstadoInicial, null, 'pieza:4', 0, 30);
  assert.equal(elecciones.length, 0);
  assert.equal(r.elegir, null);
  assert.equal(r.progreso, null);
});

test('pasar por el fondo en mitad de la espera reinicia la cuenta de la pieza', () => {
  let r = correr(senalarTallerEstadoInicial, 'pieza:3', null, 0, SEGUNDOS_ELEGIR - 0.1).r;
  r = senalarTaller(r.estado, null, null, SEGUNDOS_ELEGIR);
  r = senalarTaller(r.estado, 'pieza:3', null, SEGUNDOS_ELEGIR + 0.1);
  assert.equal(r.elegir, null);
  assert.ok(r.progreso !== null && r.progreso < 0.2);
});

test('un subsistema de la lista se elige igual, y el ya activo no dibuja anillo', () => {
  const { elecciones } = correr(senalarTallerEstadoInicial, 'grupo:ruedas', 'grupo:todos', 0, SEGUNDOS_ELEGIR + 1);
  assert.deepEqual(elecciones, ['grupo:ruedas']);
  const activo = correr(senalarTallerEstadoInicial, 'grupo:ruedas', 'grupo:ruedas', 0, 3);
  assert.equal(activo.elecciones.length, 0);
  assert.equal(activo.r.progreso, null);
});
