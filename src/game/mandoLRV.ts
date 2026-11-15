// Mando en T del LRV con la mano derecha (SPEC 8.2). Máquina pura: sin Three.js, sin DOM y sin MediaPipe.
// Recibe en cada fotograma la postura de la mano derecha (posturaMando en tracking/gestures.ts) y devuelve dónde está
// la palanca: adelante (+) o atrás (−) y a la derecha (+) o a la izquierda (−), de −1 a 1.
// El punto neutro (palanca centrada) es la postura del jugador al sentarse, o al volver a ver su mano tras perderla un
// rato: así no importa a qué distancia de la cámara esté ni dónde apoye el brazo.

import type { PosturaMando } from '../tracking/gestures';

/** Tiempo (s) que se promedia la postura para fijar el punto neutro. Mientras tanto, la palanca queda centrada. */
export const MANDO_SEGUNDOS_NEUTRO = 0.5;
/** Si la mano derecha no se ve durante más de esto (s), al volver a verla se toma de nuevo el punto neutro. */
export const MANDO_RECENTRAR_TRAS_S = 1.5;
/**
 * Recorrido adelante o atrás que lleva la palanca al tope, como fracción de la distancia de la mano a la cámara
 * (0.15 ≈ 15 cm con la mano a 1 m). Estimación de partida, ajustable.
 */
export const MANDO_RECORRIDO_PROFUNDIDAD = 0.15;
/** Recorrido lateral que lleva la palanca al tope, en anchos de hombros. Estimación de partida, ajustable. */
export const MANDO_RECORRIDO_LATERAL_HOMBROS = 0.45;
/** Suavizado de la palanca (s, constante de tiempo): quita el temblor del seguimiento sin retrasarla mucho. */
export const MANDO_SUAVIZADO_S = 0.08;
/** Sin mano, la palanca se queda donde estaba durante este tiempo (s), por si es una pérdida breve. */
export const MANDO_GRACIA_S = 0.4;
/** Después, vuelve sola al centro con esta constante de tiempo (s): el LRV desacelera poco a poco (SPEC 6). */
export const MANDO_RETORNO_S = 0.25;

/** Posición de la palanca del mando en T: −1…1 en cada eje. */
export interface PosicionMando {
  /** + = empujada hacia delante, − = recogida hacia atrás. */
  adelante: number;
  /** + = a la derecha, − = a la izquierda. */
  lado: number;
}

const limitar = (v: number): number => Math.max(-1, Math.min(1, v));

/** Posición de la palanca para una postura, respecto al punto neutro. Función pura. */
export function desviacionMando(neutro: PosturaMando, postura: PosturaMando): PosicionMando {
  // Distancia a la cámara ∝ 1 / tamaño: 1 − tamaño₀/tamaño es la fracción de esa distancia que la mano se acercó.
  const acercamiento = 1 - neutro.tamano / postura.tamano;
  return {
    adelante: limitar(acercamiento / MANDO_RECORRIDO_PROFUNDIDAD),
    lado: limitar((postura.lateral - neutro.lateral) / MANDO_RECORRIDO_LATERAL_HOMBROS),
  };
}

export class MandoLRV {
  private neutro: PosturaMando | null = null;
  /** Suma de las posturas del promedio del punto neutro, y cuántas van. */
  private sumaTamano = 0;
  private sumaLateral = 0;
  private muestras = 0;
  private inicioNeutroS: number | null = null;
  private ultimaManoS = Number.NEGATIVE_INFINITY;
  private posicionActual: PosicionMando = { adelante: 0, lado: 0 };

  /** Olvida el punto neutro: se toma de nuevo con las próximas posturas (al sentarse en el LRV). */
  recentrar(): void {
    this.neutro = null;
    this.sumaTamano = 0;
    this.sumaLateral = 0;
    this.muestras = 0;
    this.inicioNeutroS = null;
  }

  /** Aún no hay punto neutro: la palanca está centrada hasta tenerlo. */
  get centrando(): boolean {
    return this.neutro === null;
  }

  get posicion(): PosicionMando {
    return { ...this.posicionActual };
  }

  /** Avanza un fotograma con la postura de la mano derecha (null si no se ve). Devuelve la posición de la palanca. */
  actualizar(ahoraS: number, dtS: number, postura: PosturaMando | null): PosicionMando {
    let objetivo: PosicionMando;
    let constanteS: number;
    if (postura) {
      if (ahoraS - this.ultimaManoS > MANDO_RECENTRAR_TRAS_S) this.recentrar();
      this.ultimaManoS = ahoraS;
      objetivo = { adelante: 0, lado: 0 };
      if (this.neutro === null) {
        this.inicioNeutroS ??= ahoraS;
        this.sumaTamano += postura.tamano;
        this.sumaLateral += postura.lateral;
        this.muestras += 1;
        if (ahoraS - this.inicioNeutroS >= MANDO_SEGUNDOS_NEUTRO) {
          this.neutro = { tamano: this.sumaTamano / this.muestras, lateral: this.sumaLateral / this.muestras };
        }
      } else {
        objetivo = desviacionMando(this.neutro, postura);
      }
      constanteS = MANDO_SUAVIZADO_S;
    } else {
      if (ahoraS - this.ultimaManoS <= MANDO_GRACIA_S) return this.posicion;
      objetivo = { adelante: 0, lado: 0 };
      constanteS = MANDO_RETORNO_S;
    }
    const f = 1 - Math.exp(-Math.max(0, dtS) / constanteS);
    this.posicionActual = {
      adelante: this.posicionActual.adelante + (objetivo.adelante - this.posicionActual.adelante) * f,
      lado: this.posicionActual.lado + (objetivo.lado - this.posicionActual.lado) * f,
    };
    return this.posicion;
  }
}
