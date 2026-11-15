// Desarme del LRV en el taller 3D: reloj de la animación y desplazamiento de cada pieza. No importa Three.js.
//
// Cada pieza se separa del centro del modelo en la dirección centro → pieza. La animación dura DURACION_DESARME_S con
// ease-in-out y un retraso escalonado por pieza (las de dentro salen antes que las de fuera, con algo de azar fijo);
// al armar corre al revés, así que las piezas vuelven exactamente a su sitio (factor 0 = desplazamiento 0).

export const DURACION_DESARME_S = 1.2;
/** Retraso máximo de una pieza respecto al inicio (s). Cada pieza se mueve durante DURACION_DESARME_S − este valor. */
export const RETRASO_MAX_S = 0.4;
/** Separación mínima de una pieza al desarmar (m) y lo que se suma por cada metro que ya estaba del centro. */
export const SEPARACION_BASE_M = 0.25;
export const SEPARACION_POR_METRO = 0.62;

export type EstadoDesarme = 'armado' | 'desarmando' | 'desarmado' | 'armando';
export type V3 = readonly [number, number, number];

/** ease-in-out suave (cúbica) de 0 a 1. */
export function suavizar(x: number): number {
  const u = Math.min(1, Math.max(0, x));
  return u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2;
}

/** Azar fijo (0–1) para cada pieza: la misma cada vez que se desarma. */
export function azarPieza(indice: number): number {
  const s = Math.sin(indice * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

/** Cuánto se ha separado una pieza (0 = en su sitio, 1 = del todo) cuando el reloj va por `t` segundos. */
export function factorPieza(t: number, retrasoS: number): number {
  return suavizar((t - retrasoS) / (DURACION_DESARME_S - RETRASO_MAX_S));
}

/** Retraso (s) de una pieza: depende de lo lejos que está del centro (`relativa` = distancia / distancia máxima) y del azar. */
export function retrasoPieza(relativa: number, indice: number): number {
  const mezcla = 0.75 * Math.min(1, Math.max(0, relativa)) + 0.25 * azarPieza(indice);
  return RETRASO_MAX_S * mezcla;
}

export interface PlanPieza {
  /** Dirección unitaria centro → pieza. */
  dir: V3;
  /** Distancia total que se separa (m). */
  distanciaM: number;
  retrasoS: number;
}

/**
 * Plan de separación de cada pieza a partir de la posición de su centro, `centroModelo` y el azar de su índice.
 */
export function planDeDesarme(centros: readonly V3[], centroModelo: V3): PlanPieza[] {
  const rel = centros.map((c) => [c[0] - centroModelo[0], c[1] - centroModelo[1], c[2] - centroModelo[2]] as const);
  const dist = rel.map((r) => Math.hypot(r[0], r[1], r[2]));
  const maxima = Math.max(1e-6, ...dist);
  return rel.map((r, i) => {
    const d = dist[i];
    const dir: V3 = d < 1e-6 ? [0, 1, 0] : [r[0] / d, r[1] / d, r[2] / d];
    const extra = 0.8 + 0.4 * azarPieza(i + 1000);
    return { dir, distanciaM: (SEPARACION_BASE_M + SEPARACION_POR_METRO * d) * extra, retrasoS: retrasoPieza(d / maxima, i) };
  });
}

/** Desplazamiento de una pieza (m, en cada eje) con el reloj en `t` segundos. Exactamente 0 con la pieza en su sitio. */
export function desplazamiento(plan: PlanPieza, t: number): V3 {
  const f = factorPieza(t, plan.retrasoS);
  if (f === 0) return [0, 0, 0];
  const m = plan.distanciaM * f;
  return [plan.dir[0] * m, plan.dir[1] * m, plan.dir[2] * m];
}

/** Reloj del desarme: va de 0 (armado) a DURACION_DESARME_S (desarmado) y vuelve. */
export class RelojDesarme {
  private reloj = 0;
  private haciaDesarmado = false;

  /** Segundos del reloj (0 – DURACION_DESARME_S). */
  get t(): number {
    return this.reloj;
  }

  /** Avance 0–1 del reloj entero, para la barra del registro. */
  get progreso(): number {
    return this.reloj / DURACION_DESARME_S;
  }

  get estado(): EstadoDesarme {
    if (this.reloj <= 0 && !this.haciaDesarmado) return 'armado';
    if (this.reloj >= DURACION_DESARME_S && this.haciaDesarmado) return 'desarmado';
    return this.haciaDesarmado ? 'desarmando' : 'armando';
  }

  /** Alterna entre armado y desarmado; si está a medias, da la vuelta desde donde esté. */
  alternar(): void {
    this.haciaDesarmado = !this.haciaDesarmado;
  }

  /** Pone el reloj en `progreso` (0–1) a mano (la barra) y lo deja quieto. */
  fijar(progreso: number): void {
    this.reloj = Math.min(1, Math.max(0, progreso)) * DURACION_DESARME_S;
    this.haciaDesarmado = this.reloj >= DURACION_DESARME_S / 2;
  }

  avanzar(dtS: number): void {
    const dt = Math.max(0, dtS);
    this.reloj = this.haciaDesarmado ? Math.min(DURACION_DESARME_S, this.reloj + dt) : Math.max(0, this.reloj - dt);
  }
}
