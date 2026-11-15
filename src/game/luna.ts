// Misión lunar, Apollo 17 (SPEC 8). Máquina de estados pura: sin Three.js, sin DOM y sin tracking.
// El que la usa (juego.ts) le pasa en cada fotograma lo que el jugador hace (pellizco de confirmar o espacio, posición de la
// palanca del mando en T, bajarse y dónde está a pie) y recibe los eventos.
// Las posiciones del LRV y de la roca salen de src/visual/sitioApollo17.ts (datos sin Three.js), las mismas que
// usa la escena.

import { LM, LRV_ESTACIONADO, RADIO_LRV_M, RADIO_OBSTACULO_LM_M, ROCA_ESTACION1 } from '../visual/sitioApollo17.ts';
import type { PosicionMando } from './mandoLRV.ts';

// ---------------------------------------------------------------------------------------------------------------
// VELOCIDADES DE LA MISIÓN LUNAR. Solo aplican en la Luna: el museo y Perseverance no las usan.
// Son ESTIMACIONES AJUSTABLES, no datos verificados: cámbialas aquí y el resto del código las sigue.
// ---------------------------------------------------------------------------------------------------------------
/**
 * Velocidad máxima a pie en la Luna (m/s). Estimación de partida: con 1/6 de la gravedad terrestre, el astronauta
 * avanza despacio con pasos largos. Se aplica al avance por fotograma (metrosAPieLuna) sin tocar la caminata del museo.
 */
export const MOON_WALK_MAX_SPEED = 1.2;
/**
 * Velocidad máxima del LRV (m/s), con la palanca empujada a tope. Estimación: 18 km/h, la velocidad máxima que se
 * citó para el LRV real (5 m/s).
 */
export const LRV_MAX_SPEED = 5;
/** Velocidad máxima marcha atrás (m/s), con la palanca recogida a tope y el LRV ya parado. Estimación de juego. */
export const LRV_MAX_REVERSA = 1.5;
/** Aceleración máxima del LRV (m/s²). Estimación de partida para un arranque suave. */
export const LRV_ACCEL = 0.5;
/**
 * Frenado máximo del LRV (m/s²), con la palanca recogida a tope en contra de la marcha. Estimación de partida: el LRV
 * se para en ~5 s desde su velocidad máxima. Con la palanca a medias, frena en proporción (nunca menos que
 * LRV_RUEDA_LIBRE).
 */
export const LRV_BRAKE = 1;
/**
 * Deceleración (m/s²) con la palanca centrada o sin mano: el LRV se va parando solo (SPEC 6), en ~7 s desde su
 * velocidad máxima. Estimación de juego.
 */
export const LRV_RUEDA_LIBRE = 0.7;
/** Por debajo de esta velocidad (m/s) el LRV cuenta como parado: tirar de la palanca ya no frena, da marcha atrás. */
export const VELOCIDAD_PARADO_M_S = 0.05;

/** Zona neutral de la palanca (0–1): dentro de ±este valor, el eje no hace nada. */
export const MANDO_ZONA_NEUTRAL = 0.15;
/** Radio de giro mínimo del LRV (m), con las cuatro ruedas direccionables (NSSDC: 3.1 m). */
export const RADIO_GIRO_MIN_M = 3.1;
/** Velocidad máxima de giro del LRV (°/s), para que a toda velocidad el giro no sea brusco. */
export const GIRO_MAX_GRADOS_S = 60;
/**
 * Ángulo máximo de la rueda interior al girar (°), con la palanca a tope hacia un lado; por debajo, es proporcional.
 * // VERIFICAR: 50° interior y 22° exterior según un documento de NASA NTRS (20230013087) que describe dirección
 * Ackermann delante y detrás. Con la batalla y la vía del LRV, 50° interior da 22° exterior y un radio de giro
 * de ~3 m, que cuadra con los 3.1 m de la NSSDC.
 */
export const DIRECCION_MAX_GRADOS = 50;

/** Distancia (m) del jugador a pie al centro del LRV para poder subirse con el pellizco de confirmar. */
export const DISTANCIA_SUBIR_M = 3.2;

/** Posición inicial del LRV (m, plano del suelo): estacionado junto al LM. */
export const POSICION_LRV_INICIAL = { x: LRV_ESTACIONADO.x, z: LRV_ESTACIONADO.z };
/** Rumbo inicial del LRV (°): hacia la estación 1. */
export const RUMBO_LRV_INICIAL = LRV_ESTACIONADO.rumbo;
/** Posición de la roca de la estación 1 (m), a distancia acortada (ver sitioApollo17.ts). */
export const POSICION_ROCA = { x: ROCA_ESTACION1.x, z: ROCA_ESTACION1.z };
/** El LRV no se acerca al centro del LM a menos de esto (m): el radio del LM más medio LRV. */
const DISTANCIA_MINIMA_LM_M = RADIO_OBSTACULO_LM_M + 1.6;
/** Ni a la roca a menos de esto (m): se detiene delante sin pasarle por encima. */
const DISTANCIA_MINIMA_ROCA_M = 2.0;

/**
 * `entrando_museo`: el jugador acaba de llegar y está a pie; puede caminar y mirar hasta subirse al LRV.
 * `a_pie`: se bajó del LRV. El LRV se queda donde estaba y la muestra, si ya la recogió, sigue recogida.
 * `muestra_recogida`: sentado en el LRV con la muestra ya recogida.
 */
export type EstadoLuna = 'entrando_museo' | 'a_pie' | 'sentado_en_LRV' | 'conduciendo' | 'muestra_recogida' | 'volviendo';

export interface EntradaLuna {
  /** Instante actual (s). */
  ahoraS: number;
  /** Duración de este fotograma (s). */
  dtS: number;
  /** Confirmar en este fotograma: pellizco de pulgar e índice o barra espaciadora (ya filtrado por cooldown). */
  aplauso: boolean;
  /**
   * Palanca del mando en T (mandoLRV.ts): adelante acelera, atrás frena y, ya parado, da marcha atrás; a los lados
   * gira. null si no hay datos de la mano: el LRV se va parando y las ruedas se quedan en su último ángulo (SPEC 6).
   */
  mando: PosicionMando | null;
  /**
   * Confirmar (pellizco o espacio) vuelve al museo cuando no puede sentar ni bajar al jugador, si es true. Opcional: true.
   * juego.ts lo pasa en false: en la misión, volver es el botón «Volver al menú» o la E mantenida (`volver`); el pellizco no vuelve.
   */
  aplausoVuelve?: boolean;
  /** El jugador pidió volver al museo (E o puño mantenidos con el anillo lleno). Opcional: false. */
  volver?: boolean;
  /**
   * Bajarse del LRV en este fotograma (tecla B o pellizco de la mano izquierda). Opcional: false. Sentado, se mira
   * antes que `aplauso`: con cámara los dos llegan con ese pellizco, y sentado baja del LRV.
   */
  bajarse?: boolean;
  /**
   * El LRV ya está desplegado (game/despliegueLRV.ts). Mientras no lo está, sigue plegado o se está desplegando y
   * no se puede subir a él ni conducirlo. Opcional: true.
   */
  lrvDesplegado?: boolean;
  /** Posición del jugador a pie (m). Solo cuenta antes de subirse al LRV. */
  jugador: { x: number; z: number };
}

export type EventoLuna =
  | { tipo: 'estado'; estado: EstadoLuna }
  /** Confirmar a pie lejos del LRV: no se sube. */
  | { tipo: 'lejosDelLRV' }
  /** Confirmar a pie con el LRV aún sin desplegar: no se sube. */
  | { tipo: 'lrvPlegado' }
  /** El jugador se bajó del LRV. `conMuestra`: ya había recogido la muestra. */
  | { tipo: 'bajado'; conMuestra: boolean }
  /** El jugador pidió volver al museo. */
  | { tipo: 'volver' };

/**
 * Metros que avanza el jugador a pie en este fotograma, con el tope de MOON_WALK_MAX_SPEED. La caminata del museo
 * (game/caminata.ts) sigue igual; solo la misión lunar recorta el avance.
 */
export function metrosAPieLuna(metros: number, dtS: number): number {
  const tope = MOON_WALK_MAX_SPEED * Math.max(0, dtS);
  return Math.max(-tope, Math.min(tope, metros));
}

/** Parte de un eje de la palanca fuera de la zona neutral, reescalada a −1…1 (0 dentro de la zona). */
export function ejeMando(valor: number): number {
  const exceso = Math.abs(valor) - MANDO_ZONA_NEUTRAL;
  if (exceso <= 0) return 0;
  return Math.sign(valor) * Math.min(1, exceso / (1 - MANDO_ZONA_NEUTRAL));
}

/**
 * Acerca la velocidad del LRV (m/s) a la objetivo en un fotograma, como mucho a `tasa` m/s². El objetivo ya viene
 * limitado a LRV_MAX_SPEED hacia delante y LRV_MAX_REVERSA hacia atrás.
 */
export function acercarVelocidadLRV(actual: number, objetivo: number, tasa: number, dtS: number): number {
  const paso = tasa * Math.max(0, dtS);
  const delta = objetivo - actual;
  return Math.abs(delta) <= paso ? objetivo : actual + Math.sign(delta) * paso;
}

/**
 * Velocidad objetivo del LRV (m/s) y con qué tasa llegar a ella (m/s²), según la palanca y la velocidad actual:
 * - Hacia donde ya va (o parado): acelera hasta su tope en proporción a la palanca.
 * - En contra de la marcha: frena hasta pararse, más fuerte cuanto más se tira. Ya parado, seguir tirando hacia atrás
 *   da marcha atrás (el LRV real pedía antes un interruptor del mando; el juego lo activa solo).
 * - Centrada, o pidiendo menos velocidad de la que lleva: se va parando a LRV_RUEDA_LIBRE.
 */
export function objetivoMandoLRV(adelante: number, actual: number): { objetivo: number; tasa: number } {
  const eje = ejeMando(adelante);
  const parado = Math.abs(actual) <= VELOCIDAD_PARADO_M_S;
  if (!parado && eje !== 0 && Math.sign(eje) !== Math.sign(actual)) {
    return { objetivo: 0, tasa: Math.max(LRV_RUEDA_LIBRE, Math.abs(eje) * LRV_BRAKE) };
  }
  const objetivo = eje > 0 ? eje * LRV_MAX_SPEED : eje * LRV_MAX_REVERSA;
  const acelera = Math.abs(objetivo) > Math.abs(actual);
  return { objetivo, tasa: acelera ? LRV_ACCEL : LRV_RUEDA_LIBRE };
}

/**
 * Ángulo de dirección (°, + = derecha) de la rueda interior delantera para la palanca a un lado: proporcional fuera
 * de la zona neutral, con DIRECCION_MAX_GRADOS a tope. Palanca centrada = ruedas rectas.
 */
export function direccionMandoGrados(lado: number): number {
  return ejeMando(lado) * DIRECCION_MAX_GRADOS;
}

/**
 * Giro del LRV (°/s, + = derecha) a una velocidad y con la palanca a un lado: como un coche, gira al rodar, no en el
 * sitio. Con la palanca a tope el radio es RADIO_GIRO_MIN_M; marcha atrás, el morro gira al otro lado. Con tope
 * GIRO_MAX_GRADOS_S.
 */
export function giroLRVGradosS(velocidad: number, lado: number): number {
  const grados = ((velocidad * ejeMando(lado)) / RADIO_GIRO_MIN_M) * (180 / Math.PI);
  return Math.max(-GIRO_MAX_GRADOS_S, Math.min(GIRO_MAX_GRADOS_S, grados));
}

/** Estados en que el jugador va sentado en el LRV y puede bajarse. */
const PUEDE_BAJARSE: readonly EstadoLuna[] = ['sentado_en_LRV', 'conduciendo', 'muestra_recogida'];

export class MisionLuna {
  private estadoActual: EstadoLuna;
  private x: number;
  private z: number;
  /** Rumbo del LRV (°). 0 = hacia −Z (norte); positivo = hacia la derecha (igual que el azimut). */
  private rumbo: number;
  /** Ángulo de dirección de las ruedas (°, + = derecha). Se queda en el último valor si no hay datos de la mano. */
  private direccion = 0;
  /** Último lado de la palanca con datos: sin mano, el LRV sigue girando igual mientras se para. */
  private ladoMando = 0;
  /** La muestra ya se recogió. Se conserva aunque el jugador se baje del LRV. */
  private conMuestra: boolean;
  /** Velocidad actual del LRV (m/s, negativa al retroceder). */
  private velocidadLRV = 0;
  /** Va marcha atrás, o parado con la palanca recogida para ir marcha atrás: el interruptor del mando está activado. */
  private reversa = false;
  /**
   * Misión cumplida: el jugador ya recogió la muestra y se queda donde está. No puede andar, conducir, subirse ni
   * bajarse; sí puede mirar alrededor y volver al museo.
   */
  private bloqueadaMision = false;
  /** Exploración libre (ver el constructor). */
  private readonly libre: boolean;

  /**
   * `estadoInicial` por defecto es `entrando_museo`: la escena se abre con el gesto de la vitrina (lo gestiona Museo)
   * y el jugador llega a pie. El pellizco de confirmar junto al LRV lo sienta.
   */
  constructor(
    estadoInicial: EstadoLuna = 'entrando_museo',
    posicion = POSICION_LRV_INICIAL,
    rumbo = RUMBO_LRV_INICIAL,
    /**
     * Exploración libre: solo el LRV en la Luna. No hay roca, ni halo, ni misión que cumplir, y el LM no existe (no
     * estorba ni limita el paso). Opcional: false.
     */
    libre = false,
  ) {
    this.libre = libre;
    this.estadoActual = estadoInicial;
    this.x = posicion.x;
    this.z = posicion.z;
    this.rumbo = rumbo;
    this.conMuestra = estadoInicial === 'muestra_recogida';
  }

  get estado(): EstadoLuna {
    return this.estadoActual;
  }

  get posicion(): { x: number; z: number } {
    return { x: this.x, z: this.z };
  }

  get rumboGrados(): number {
    return this.rumbo;
  }

  /** Ángulo de dirección de las ruedas (°, + = derecha), para dibujarlas. Ver direccionMandoGrados. */
  get direccionGrados(): number {
    return this.direccion;
  }

  /** Velocidad del LRV (m/s, negativa marcha atrás). */
  get velocidad(): number {
    return this.velocidadLRV;
  }

  /** Interruptor de marcha atrás del mando activado (para dibujarlo). */
  get marchaAtras(): boolean {
    return this.reversa;
  }

  /** La muestra ya está recogida (aunque el jugador se haya bajado). */
  get muestraRecogida(): boolean {
    return this.conMuestra;
  }

  /** El jugador está a pie: al llegar, o después de bajarse del LRV. */
  get aPie(): boolean {
    return this.estadoActual === 'entrando_museo' || this.estadoActual === 'a_pie';
  }

  /** Misión cumplida: el jugador ya no puede moverse ni subirse ni bajarse del LRV (ver `bloquear`). */
  get bloqueada(): boolean {
    return this.bloqueadaMision;
  }

  /** Bloquea la misión tras recoger la muestra: el jugador se queda quieto hasta volver al museo. */
  bloquear(): void {
    this.bloqueadaMision = true;
    this.velocidadLRV = 0;
  }

  /**
   * Mueve el LRV a otra pose sin conducirlo: para la cinemática del despegue, que lo aparca donde filmó (en
   * sitioApollo17.ts, LRV_DESPEGUE). Las ruedas quedan rectas y el LRV parado.
   */
  estacionarLRV(posicion: { x: number; z: number }, rumboGrados: number): void {
    this.x = posicion.x;
    this.z = posicion.z;
    this.rumbo = rumboGrados;
    this.direccion = 0;
    this.ladoMando = 0;
    this.velocidadLRV = 0;
  }

  /**
   * Modo libre tras la cinemática del despegue: el jugador queda a pie y puede caminar y mirar por el valle. Conserva la
   * muestra, así que confirmar lo devuelve al museo (no vuelve a subir al LRV, que se quedó solo).
   */
  liberar(): void {
    this.bloqueadaMision = false;
    this.velocidadLRV = 0;
    this.conMuestra = true;
    this.estadoActual = 'a_pie';
  }

  distanciaRoca(): number {
    return Math.hypot(this.x - POSICION_ROCA.x, this.z - POSICION_ROCA.z);
  }

  /** El halo de la roca se ve desde que se llega hasta recoger la muestra (SPEC 10: visible hasta completar la acción). */
  get haloVisible(): boolean {
    return !this.libre && !this.conMuestra && this.estadoActual !== 'volviendo';
  }

  /** Avanza un fotograma. Devuelve los eventos ocurridos en él. */
  update(entrada: EntradaLuna): EventoLuna[] {
    const eventos: EventoLuna[] = [];
    const ir = (estado: EstadoLuna): void => {
      if (estado === this.estadoActual) return;
      this.estadoActual = estado;
      eventos.push({ tipo: 'estado', estado });
    };

    if (this.estadoActual === 'volviendo') return eventos;
    this.reversa = false;

    if (entrada.volver) {
      ir('volviendo');
      eventos.push({ tipo: 'volver' });
      return eventos;
    }

    // Bajarse: el LRV se detiene donde está (no avanza en este fotograma) y conserva la muestra. Va antes que
    // `aplauso`, que con cámara llega a la vez (el mismo pellizco de la izquierda): sentado, baja del LRV y no vuelve al museo.
    if (entrada.bajarse && !this.bloqueadaMision && PUEDE_BAJARSE.includes(this.estadoActual)) {
      this.velocidadLRV = 0;
      ir('a_pie');
      eventos.push({ tipo: 'bajado', conMuestra: this.conMuestra });
      return eventos;
    }

    // Confirmar (pellizco o espacio) sienta al jugador si está junto al LRV, o vuelve al museo en cualquier otro estado (SPEC 8.4).
    // Bajado del LRV con la muestra ya recogida, vuelve al museo esté donde esté.
    if (entrada.aplauso) {
      if (this.aPie && !this.bloqueadaMision && !(this.estadoActual === 'a_pie' && this.conMuestra)) {
        if (entrada.lrvDesplegado === false) {
          // Plegado o desplegándose, el LRV no está donde lo espera la misión ni se puede conducir.
          eventos.push({ tipo: 'lrvPlegado' });
        } else if (this.distanciaJugador(entrada.jugador) <= DISTANCIA_SUBIR_M) {
          this.velocidadLRV = 0;
          ir(this.conMuestra ? 'muestra_recogida' : 'sentado_en_LRV');
        } else {
          eventos.push({ tipo: 'lejosDelLRV' });
        }
      } else if (entrada.aplausoVuelve !== false) {
        ir('volviendo');
        eventos.push({ tipo: 'volver' });
      }
      return eventos;
    }

    // Misión cumplida: no hay conducción. El LRV y el jugador se quedan quietos; solo cuenta volver al museo.
    if (this.bloqueadaMision || this.aPie) return eventos;

    // Sentado (también parado), la palanca a un lado mueve las ruedas. Sin mano, se quedan en el último ángulo (SPEC 6).
    if (entrada.mando !== null) {
      this.ladoMando = entrada.mando.lado;
      this.direccion = direccionMandoGrados(entrada.mando.lado);
    }
    const adelante = entrada.mando?.adelante ?? 0;
    if (this.estadoActual === 'sentado_en_LRV' && ejeMando(adelante) !== 0) ir('conduciendo');
    if (this.estadoActual === 'conduciendo' || this.estadoActual === 'muestra_recogida') {
      const { objetivo, tasa } = objetivoMandoLRV(adelante, this.velocidadLRV);
      this.velocidadLRV = acercarVelocidadLRV(this.velocidadLRV, objetivo, tasa, entrada.dtS);
      this.avanzar(entrada.dtS);
      const parado = Math.abs(this.velocidadLRV) <= VELOCIDAD_PARADO_M_S;
      this.reversa = this.velocidadLRV < -VELOCIDAD_PARADO_M_S || (parado && ejeMando(adelante) < 0);
    }
    return eventos;
  }

  /** Distancia (m) del jugador a pie al centro del LRV. */
  distanciaJugador(jugador: { x: number; z: number }): number {
    return Math.hypot(jugador.x - this.x, jugador.z - this.z);
  }

  /**
   * Giro según la velocidad y la palanca, y avance a la velocidad del LRV. El LRV no atraviesa el LM ni la roca, ni
   * sale de RADIO_LRV_M alrededor del LM.
   */
  private avanzar(dtS: number): void {
    this.rumbo += giroLRVGradosS(this.velocidadLRV, this.ladoMando) * dtS;
    const rad = (this.rumbo * Math.PI) / 180;
    const metros = this.velocidadLRV * dtS;
    const x = this.x + Math.sin(rad) * metros;
    const z = this.z - Math.cos(rad) * metros;
    // Solo se bloquea el paso que entra en el LM o sale del radio: alejarse o volver siempre se puede. Al chocar, el
    // LRV se para (si no, seguiría "acelerando" contra el obstáculo).
    const desdeLM = Math.hypot(x - LM.x, z - LM.z);
    const antes = Math.hypot(this.x - LM.x, this.z - LM.z);
    const aRoca = Math.hypot(x - POSICION_ROCA.x, z - POSICION_ROCA.z);
    const choca =
      (desdeLM < DISTANCIA_MINIMA_LM_M && desdeLM < antes && !this.libre) ||
      (desdeLM > RADIO_LRV_M && desdeLM > antes) ||
      (aRoca < DISTANCIA_MINIMA_ROCA_M && aRoca < this.distanciaRoca() && !this.libre);
    if (choca) {
      this.velocidadLRV = 0;
      return;
    }
    this.x = x;
    this.z = z;
  }
}
