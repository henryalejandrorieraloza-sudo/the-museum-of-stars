// Pruebas del desarme del LRV (src/game/desarmeLRV.ts).
// Ejecutar: node --test tests/desarmeLRV.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DURACION_DESARME_S, RelojDesarme, desplazamiento, planDeDesarme, type V3 } from '../src/game/desarmeLRV.ts';

const centros: V3[] = Array.from({ length: 300 }, (_, i) => [Math.sin(i) * 1.2, 0.5 + (i % 7) * 0.2, Math.cos(i * 1.7) * 1.4]);
const plan = planDeDesarme(centros, [0, 0.9, 0]);

test('armado: cada pieza queda exactamente en su sitio', () => {
  for (const p of plan) assert.deepEqual(desplazamiento(p, 0), [0, 0, 0]);
});

test('desarmado: cada pieza está a su distancia, en la dirección centro → pieza', () => {
  plan.forEach((p, i) => {
    const d = desplazamiento(p, DURACION_DESARME_S);
    const largo = Math.hypot(d[0], d[1], d[2]);
    assert.ok(Math.abs(largo - p.distanciaM) < 1e-9);
    const c = centros[i];
    const sobre = d[0] * (c[0] - 0) + d[1] * (c[1] - 0.9) + d[2] * (c[2] - 0);
    assert.ok(sobre >= -1e-9, 'se aleja del centro');
  });
});

test('armar con la animación inversa devuelve las piezas con error < 0.001', () => {
  const reloj = new RelojDesarme();
  reloj.alternar();
  for (let i = 0; i < 200; i++) reloj.avanzar(1 / 60);
  assert.equal(reloj.estado, 'desarmado');
  reloj.alternar();
  let pasos = 0;
  while (reloj.estado !== 'armado' && pasos++ < 400) reloj.avanzar(1 / 60);
  assert.equal(reloj.estado, 'armado');
  for (const p of plan) {
    const d = desplazamiento(p, reloj.t);
    assert.ok(Math.hypot(d[0], d[1], d[2]) < 0.001);
  }
});

test('desarmar dura unos 1.2 s y el movimiento está escalonado', () => {
  const reloj = new RelojDesarme();
  reloj.alternar();
  let t = 0;
  while (reloj.estado !== 'desarmado') {
    reloj.avanzar(1 / 60);
    t += 1 / 60;
  }
  assert.ok(Math.abs(t - DURACION_DESARME_S) < 0.05);
  const retrasos = new Set(plan.map((p) => p.retrasoS.toFixed(3)));
  assert.ok(retrasos.size > 50);
  assert.ok(Math.max(...plan.map((p) => p.retrasoS)) < DURACION_DESARME_S / 2);
});

test('con la velocidad del gesto desarmar y armar son varias veces más rápidos, y la tecla vuelve a la normal', () => {
  const reloj = new RelojDesarme();
  const tardanza = (): number => {
    let t = 0;
    const antes = reloj.estado;
    while (reloj.estado === antes || reloj.estado === 'desarmando' || reloj.estado === 'armando') {
      reloj.avanzar(1 / 60);
      t += 1 / 60;
      if (t > 10) break;
    }
    return t;
  };
  reloj.dirigir(true, 3);
  assert.ok(Math.abs(tardanza() - DURACION_DESARME_S / 3) < 0.05);
  assert.equal(reloj.estado, 'desarmado');
  reloj.dirigir(false, 3);
  assert.ok(Math.abs(tardanza() - DURACION_DESARME_S / 3) < 0.05);
  assert.equal(reloj.estado, 'armado');
  reloj.dirigir(true, 3);
  reloj.alternar(); // la D o el botón: velocidad normal otra vez
  reloj.alternar();
  reloj.avanzar(1 / 60);
  assert.ok(reloj.t <= 1 / 60 + 1e-9);
});
