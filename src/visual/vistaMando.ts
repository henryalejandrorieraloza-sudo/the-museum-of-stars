// Palanca del mando en T del LRV vista desde el asiento del comandante, con el guante derecho agarrándola (SPEC 8.2).
// La palanca real está entre los asientos, unos 50° por debajo de la vista al frente: queda fuera de la pantalla
// incluso mirando abajo del todo. Por eso, sentado, se dibuja una copia de la misma palanca más cerca de los ojos,
// abajo a la derecha, como en los juegos de conducción, y la real se oculta para que no haya dos.
// La copia sigue la posición de los ojos, el rumbo del LRV y el cabeceo de la cámara, pero no el giro de la cabeza:
// al mirar a un lado, la palanca se queda hacia donde está el mando y sale de la vista.

import * as THREE from 'three';
import { AGARRE_MANDO_LRV, INCLINACION_MAX_MANDO_LRV } from './lrv';
import { esqueletoMano, type Vec3 } from './manosGeometria';

/** Dónde queda el centro del agarre (la barra de la T) respecto a los ojos (m; x derecha, y arriba, −z al frente): abajo a la derecha. */
export const POSICION_VISTA_MANDO: Vec3 = { x: 0.25, y: -0.23, z: -0.5 };
/** Escala de la copia y del guante: la misma que el tamaño por defecto de las manos del avatar (Opciones). */
export const ESCALA_VISTA_MANDO = 1.25;
/** Giro (rad) de la copia alrededor de la vertical, para ver la mano un poco de tres cuartos. */
export const GIRO_VISTA_MANDO = THREE.MathUtils.degToRad(-12);
/** Ángulo del interruptor de marcha atrás: apagado y activado (rad, como en la presentación). */
const INTERRUPTOR_APAGADO = 0.45;
const INTERRUPTOR_ACTIVADO = -0.55;

/**
 * Mano derecha agarrando la barra de la T por encima: dorso arriba, nudillos al frente y dedos que rodean la barra
 * por delante y por debajo; el pulgar la cierra por debajo desde la izquierda. Ejes de la barra: la barra es el eje X
 * (x a la derecha, y arriba, −z al frente). Solo cuentan las direcciones: las longitudes son las de la mano del avatar
 * (esqueletoMano). Desde el asiento se ve el dorso del guante, más claro que un puño de pie visto por las puntas.
 */
const PUNO_CRUDO: readonly Vec3[] = [
  { x: 0.004, y: 0.035, z: 0.09 }, // 0 muñeca
  { x: -0.026, y: 0.022, z: 0.06 }, // 1–4 pulgar
  { x: -0.044, y: 0.006, z: 0.03 },
  { x: -0.046, y: -0.018, z: 0.006 },
  { x: -0.036, y: -0.032, z: -0.01 },
  { x: -0.033, y: 0.026, z: -0.004 }, // 5–8 índice
  { x: -0.033, y: 0.012, z: -0.036 },
  { x: -0.033, y: -0.022, z: -0.032 },
  { x: -0.033, y: -0.03, z: -0.004 },
  { x: -0.011, y: 0.028, z: -0.008 }, // 9–12 medio
  { x: -0.011, y: 0.013, z: -0.04 },
  { x: -0.011, y: -0.024, z: -0.035 },
  { x: -0.011, y: -0.032, z: -0.005 },
  { x: 0.011, y: 0.027, z: -0.006 }, // 13–16 anular
  { x: 0.011, y: 0.012, z: -0.037 },
  { x: 0.011, y: -0.022, z: -0.032 },
  { x: 0.011, y: -0.03, z: -0.005 },
  { x: 0.03, y: 0.024, z: -0.001 }, // 17–20 meñique
  { x: 0.03, y: 0.01, z: -0.03 },
  { x: 0.03, y: -0.018, z: -0.027 },
  { x: 0.03, y: -0.026, z: -0.004 },
];

const NUDILLOS = [5, 9, 13, 17];
const centroNudillos = (p: readonly Vec3[]): Vec3 => ({
  x: NUDILLOS.reduce((s, i) => s + p[i].x, 0) / 4,
  y: NUDILLOS.reduce((s, i) => s + p[i].y, 0) / 4,
  z: NUDILLOS.reduce((s, i) => s + p[i].z, 0) / 4,
});

/** Los 21 puntos del guante agarrado a la palanca, en ejes del pivote `mando_T` (m, sin escalar). */
export function puntosPunoMando(): Vec3[] {
  const esqueleto = esqueletoMano(PUNO_CRUDO);
  const deseado = centroNudillos(PUNO_CRUDO);
  const actual = centroNudillos(esqueleto);
  const [ax, ay, az] = AGARRE_MANDO_LRV;
  return esqueleto.map((p) => ({
    x: p.x - actual.x + deseado.x + ax,
    y: p.y - actual.y + deseado.y + ay,
    z: p.z - actual.z + deseado.z + az,
  }));
}

export interface VistaMando {
  /** Grupo que va en la escena. Empieza oculto. */
  objeto: THREE.Group;
  /** Pivote de la copia de la palanca: el guante se fija aquí para inclinarse con ella. */
  palanca: THREE.Object3D;
  /**
   * Coloca la copia en los ojos del jugador (mundo) con una orientación: la de la caja del LRV (rumbo, cabeceo y balanceo
   * del terreno) con el cabeceo de la cámara, sin el giro de la cabeza.
   */
  colocar(ojos: THREE.Vector3, orientacion: THREE.Quaternion): void;
  /** Inclina la palanca (−1…1 adelante y a los lados) y pone el interruptor de marcha atrás. */
  inclinar(adelante: number, lado: number, marchaAtras: boolean): void;
}

/** Inclina un pivote `mando_T` como la presentación: adelante hacia −z, a la derecha hacia +x. */
export function inclinarPalanca(pivote: THREE.Object3D, adelante: number, lado: number): void {
  pivote.rotation.set(-adelante * INCLINACION_MAX_MANDO_LRV, 0, -lado * INCLINACION_MAX_MANDO_LRV);
}

/** Pone el interruptor de marcha atrás (`mando_interruptor`) de un pivote `mando_T`. */
export function ponerInterruptor(pivote: THREE.Object3D, marchaAtras: boolean): void {
  const interruptor = pivote.getObjectByName('mando_interruptor');
  if (interruptor) interruptor.rotation.x = marchaAtras ? INTERRUPTOR_ACTIVADO : INTERRUPTOR_APAGADO;
}

/** Crea la copia a partir del pivote `mando_T` del LRV de la escena (comparte geometrías y materiales). */
export function crearVistaMando(palancaLRV: THREE.Object3D): VistaMando {
  const objeto = new THREE.Group();
  objeto.name = 'vista_mando';
  objeto.visible = false;
  const giro = new THREE.Group();
  giro.position.set(POSICION_VISTA_MANDO.x, POSICION_VISTA_MANDO.y, POSICION_VISTA_MANDO.z);
  giro.rotation.y = GIRO_VISTA_MANDO;
  const escalado = new THREE.Group();
  escalado.scale.setScalar(ESCALA_VISTA_MANDO);
  // El centro del agarre (AGARRE_MANDO_LRV) cae en POSICION_VISTA_MANDO.
  const [ax, ay, az] = AGARRE_MANDO_LRV;
  escalado.position.set(-ax * ESCALA_VISTA_MANDO, -ay * ESCALA_VISTA_MANDO, -az * ESCALA_VISTA_MANDO);
  const palanca = palancaLRV.clone(true);
  palanca.name = 'vista_mando_T';
  palanca.position.set(0, 0, 0);
  palanca.rotation.set(0, 0, 0);
  // Tan cerca de los ojos, su sombra sobre el LRV no tendría sentido.
  palanca.traverse((o) => {
    o.castShadow = false;
  });
  escalado.add(palanca);
  giro.add(escalado);
  objeto.add(giro);
  ponerInterruptor(palanca, false);

  return {
    objeto,
    palanca,
    colocar(ojos, orientacion) {
      objeto.position.copy(ojos);
      objeto.quaternion.copy(orientacion);
    },
    inclinar(adelante, lado, marchaAtras) {
      inclinarPalanca(palanca, adelante, lado);
      ponerInterruptor(palanca, marchaAtras);
    },
  };
}
