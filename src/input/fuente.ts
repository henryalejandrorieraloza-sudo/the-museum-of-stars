// Capa de entrada: interfaz común de las fuentes de control (cámara con gestos, o teclado y ratón).
// juego.ts lee una `LecturaEntrada` por vuelta del bucle y la reparte al museo y a las misiones.
// Ni game/museo.ts ni las misiones saben de qué fuente viene cada acción.

import type { EntradaBalanceo } from '../game/balanceo';
import type { PosicionMando } from '../game/mandoLRV';
import type { ModoControl } from '../game/opciones';
import type { GestoManos } from '../tracking/gestures';
import type { TrackedHand } from '../tracking/tracker';

export type { ModoControl };

/** Hacia dónde señala el jugador. */
export type Senal =
  /** Punto de pantalla (0–1, origen arriba a la izquierda). Con `activo` en false se dibuja atenuado y no señala nada. */
  | { tipo: 'cursor'; x: number; y: number; activo: boolean }
  /** Rayo desde el hombro, en coordenadas de la cámara (x derecha, y arriba, z negativa hacia delante). */
  | { tipo: 'rayo'; direccion: { x: number; y: number; z: number } | null };

/** Manos detectadas en un fotograma de la webcam, para dibujar el avatar. */
export interface ManosFotograma {
  manos: TrackedHand[];
  ancho: number;
  alto: number;
}

export interface LecturaEntrada {
  ahoraS: number;
  /** Tiempo desde la lectura anterior con datos (s), ya limitado para no saltar tras una pausa. */
  dtS: number;
  /** false mientras la fuente se prepara (encuadre y calibración): el juego no recibe acciones. */
  listo: boolean;
  /** true si hay algo nuevo que procesar (fotograma nuevo, tecla o ratón). */
  hayDatos: boolean;
  /** Mensaje para el jugador (encuadre, calibración, sin seguimiento, clic para mirar) o null. */
  aviso: string | null;
  /**
   * Hay datos para moverse en este fotograma. Si es false, el movimiento se congela (SPEC 6):
   * giro, cabeceo, caminata y señalar no cuentan, pero el pellizco de confirmar sí.
   */
  conMovimiento: boolean;
  /** Giro de la vista en grados para este fotograma (+ = derecha). Equivale a inclinar la cabeza. */
  giroGrados: number;
  /** Cabeceo de la vista en grados para este fotograma (+ = arriba). */
  cabeceoGrados: number;
  /** Metros hacia delante (+) o hacia atrás (−) en este fotograma. */
  avanceM: number;
  /** Metros a la derecha (+) o a la izquierda (−) en este fotograma. Solo el teclado se desplaza de lado. */
  lateralM: number;
  /**
   * Confirmar en este fotograma: el pellizco de pulgar e índice (cámara; antes era el aplauso, de ahí el nombre) o la
   * barra espaciadora. Entra a la vitrina, elige modo, sube al LRV y vuelve al museo. Con cámara, sentado en el LRV, el
   * pellizco de la mano izquierda (la que no conduce) llega también como `bajarse`.
   */
  aplauso: boolean;
  /**
   * Confirmar también vuelve al museo desde una misión: la cámara sí; el teclado no (ahí se vuelve manteniendo E y
   * la barra espaciadora solo entra a la vitrina o sube al LRV).
   */
  aplausoVuelve: boolean;
  /** Señal de la mano que señala, o null si no hay nada que mostrar. */
  senal: Senal | null;
  /** El pellizco de la mano que señala se acaba de cerrar. */
  pellizcoNuevo: boolean;
  /** Llenado (0–1) del pellizco de confirmar mientras se sostiene (cámara); null si no hay pellizco que mostrar. */
  progresoPellizco: number | null;
  /**
   * Palanca del mando en T del LRV (misión lunar): con cámara, la sigue la mano derecha (game/mandoLRV.ts); con teclado,
   * W/S y A/D. null si no hay datos en este fotograma.
   */
  mando: PosicionMando | null;
  /** Bajarse del LRV en este fotograma: tecla B, o el pellizco de la mano izquierda con cámara (misión lunar). */
  bajarse: boolean;
  /**
   * Pellizco de la mano que no conduce (la izquierda) confirmado en este fotograma (cámara). En la misión lunar sube al
   * LRV a pie y baja de él sentado. Con teclado, siempre false (ahí suben espacio y baja B).
   */
  okManoLibre: boolean;
  /** Llenado (0–1) de ese pellizco de la mano izquierda mientras se sostiene (cámara); null si no hay nada que enseñar. */
  progresoOkManoLibre: number | null;
  /** Gesto de manos del taller 3D (cámara): separarlas desarma el LRV y juntarlas de nuevo lo arma. */
  gestoManos: GestoManos | null;
  /** Tecla E mantenida: con el LRV plegado, llena el anillo de desplegarlo (misión lunar). */
  desplegarMantenido: boolean;
  /**
   * Puño cerrado mantenido (cámara): hace lo mismo que mantener E, salvo señalar vitrinas. Va aparte de la tecla porque
   * sentado en el LRV la mano derecha sujeta la palanca, cerrada, y entonces no debe contar (lo decide juego.ts).
   */
  punoMantenido: boolean;
  /** Manos para el avatar: dibujarlas, ocultarlas o dejarlas como están (null). */
  manos: ManosFotograma | 'ocultar' | null;
  /** Caminata para el balanceo lateral de la cámara en el museo. Solo visual (game/balanceo.ts). */
  balanceo: EntradaBalanceo;
}

export interface FuenteEntrada {
  readonly modo: ModoControl;
  /** Lee la entrada de esta vuelta del bucle. Se llama una vez por vuelta, haya o no datos nuevos. */
  leer(ahoraS: number): LecturaEntrada;
  /** Pausa la entrada mientras el panel de opciones está abierto (las teclas no cuentan). */
  pausar(pausada: boolean): void;
  /** El jugador se acaba de sentar en el LRV: la palanca toma de nuevo su punto neutro (cámara). */
  recentrarMando(): void;
}

/** Lectura sin acciones: todo a cero. Cada fuente rellena lo que tenga. */
export function lecturaVacia(ahoraS: number): LecturaEntrada {
  return {
    ahoraS,
    dtS: 0,
    listo: true,
    hayDatos: false,
    aviso: null,
    conMovimiento: false,
    giroGrados: 0,
    cabeceoGrados: 0,
    avanceM: 0,
    lateralM: 0,
    aplauso: false,
    aplausoVuelve: true,
    senal: null,
    pellizcoNuevo: false,
    progresoPellizco: null,
    mando: null,
    bajarse: false,
    okManoLibre: false,
    progresoOkManoLibre: null,
    gestoManos: null,
    desplegarMantenido: false,
    punoMantenido: false,
    manos: null,
    balanceo: { caminando: false, pasosNuevos: 0, pasosPorSegundo: 0 },
  };
}

/** True si la tecla se pulsó escribiendo en un campo de formulario: entonces no es una acción del juego. */
export function enCampoDeTexto(destino: EventTarget | null): boolean {
  return destino instanceof HTMLElement && destino.closest('input, select, textarea, [contenteditable]') !== null;
}
