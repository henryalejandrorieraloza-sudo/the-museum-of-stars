// Elegir con el dedo índice en el taller 3D (cámara): el equivalente del clic del ratón. No importa Three.js.
//
// Señalar algo SEGUNDOS_ELEGIR seguidos lo elige: una pieza del LRV (se abre su tarjeta) o un subsistema de la lista. Cada
// objetivo se identifica con una clave de texto ("pieza:12", "grupo:ruedas"). Lo elegido se queda elegido hasta que se
// elige otra cosa: señalar el fondo, bajar la mano o taparla con un panel no lo suelta. Cambiar de objetivo (o perder la
// mano) reinicia la espera.

/** Segundos señalando un mismo objetivo para elegirlo. */
export const SEGUNDOS_ELEGIR = 0.7;

export interface SenalarTallerEstado {
  /** Objetivo que se señalaba en el fotograma anterior (null: fondo, nada elegible o mano fuera). */
  objetivo: string | null;
  /** Desde cuándo (s) se señala el mismo objetivo. */
  desdeS: number;
}

export const senalarTallerEstadoInicial: SenalarTallerEstado = { objetivo: null, desdeS: 0 };

export interface SenalarTallerResultado {
  estado: SenalarTallerEstado;
  /** Clave del objetivo que se acaba de elegir. */
  elegir: string | null;
  /** Llenado 0–1 del anillo bajo el dedo mientras se espera; null si no hay anillo. */
  progreso: number | null;
}

/**
 * Un fotograma del dedo. `objetivo` es lo elegible que hay bajo el dedo (null si nada) y `elegido` lo que ya está
 * elegido de esa misma clase: señalarlo de nuevo no hace nada ni dibuja anillo. Función pura: recibe y devuelve su estado.
 */
export function senalarTaller(previo: SenalarTallerEstado, objetivo: string | null, elegido: string | null, ahoraS: number): SenalarTallerResultado {
  if (objetivo === null || objetivo === elegido) return { estado: { objetivo, desdeS: ahoraS }, elegir: null, progreso: null };
  const estado: SenalarTallerEstado = previo.objetivo === objetivo ? previo : { objetivo, desdeS: ahoraS };
  const espera = (ahoraS - estado.desdeS) / SEGUNDOS_ELEGIR;
  // Al llegar a la espera se elige; el llamador lo pone como elegido y ya no vuelve a entrar aquí con ese objetivo.
  if (espera >= 1) return { estado, elegir: objetivo, progreso: null };
  return { estado, elegir: null, progreso: Math.max(0, espera) };
}
