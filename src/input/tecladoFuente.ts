// Fuente de entrada por teclado y ratón. No abre la cámara ni carga MediaPipe.
// Produce la misma lectura que la cámara (fuente.ts), así el museo y las misiones no cambian:
//
//   W / S           caminar hacia delante / atrás (misma velocidad máxima y aceleración que en Opciones); en el LRV,
//                   palanca del mando en T hacia delante (acelerar) o atrás (frenar y, ya parado, marcha atrás)
//   A / D           paso lateral en el museo; en el LRV, palanca a los lados (girar)
//   Ratón           mirar (pointer lock); equivale a inclinar y cabecear la cabeza
//   Espacio         confirmar: entrar a la vitrina, subir al LRV y volver al museo (igual que el aplauso)
//   Clic izq.       mantener para señalar la vitrina del centro de la pantalla
//   E mantenida     acción de carga: desplegar el LRV, recoger el suelo naranja o, si no hay otra cosa que cargar
//                   en la misión, volver al museo (solo la tecla, no el clic)
//   M               en una misión, el taller o la exploración libre, volver a la pantalla de modos
//   Clic der.       pellizco
//   B               bajarse del LRV (misión lunar)
//   Esc             abrir Opciones

import { TIEMPO_FRENADO_S } from '../game/caminata';
import type { Opciones } from '../game/opciones';
import { t } from '../i18n';
import { enCampoDeTexto, lecturaVacia, type FuenteEntrada, type LecturaEntrada } from './fuente';

/** Grados de giro de la vista por píxel de ratón. */
export const SENSIBILIDAD_RATON_GRADOS_POR_PX = 0.12;
/** Constante de tiempo (s) con la que la palanca del LRV va hacia donde mandan W, S, A y D (y vuelve al soltarlas). */
export const MANDO_TECLADO_S = 0.15;
/** Tiempo máximo (s) que cuenta una vuelta del bucle, para no saltar tras una pausa. */
const DT_MAX_S = 0.1;
/** Si Esc llega justo después de soltar el ratón (ms), es la misma pulsación: no se vuelve a alternar Opciones. */
const ESC_TRAS_SOLTAR_MS = 400;

const TECLAS_MOVIMIENTO = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD']);

/** Panel de opciones, tal como lo ve la fuente de teclado. */
export interface PanelOpciones {
  abrir(): void;
  cerrar(): void;
  abierto(): boolean;
}

export class FuenteTeclado implements FuenteEntrada {
  readonly modo = 'teclado' as const;

  private readonly pulsadas = new Set<string>();
  /** Velocidad actual (m/s): hacia delante y hacia la derecha. */
  private velAvance = 0;
  private velLateral = 0;
  /** Movimiento del ratón acumulado desde la última lectura (px). */
  private ratonX = 0;
  private ratonY = 0;
  private espacioPendiente = false;
  private pellizcoPendiente = false;
  /** Palanca del LRV: sigue a W/S y A/D con suavidad, para que se vea moverse. */
  private mandoAdelante = 0;
  private mandoLado = 0;
  private bajarsePendiente = false;
  /** Señalar: botón izquierdo mantenido. */
  private senalarRaton = false;
  /** E mantenida: la acción de carga (desplegar, recoger, volver al museo). */
  private eMantenida = false;
  private pausada = false;
  private ultimoS: number | null = null;
  private soltadoMs = Number.NEGATIVE_INFINITY;

  constructor(
    /** Elemento de la escena: un clic en él captura el ratón (pointer lock). */
    private readonly escena: HTMLElement,
    /** Opciones vivas: la velocidad máxima y la aceleración salen de aquí. */
    private readonly opciones: Opciones,
    private readonly panel: PanelOpciones,
  ) {
    window.addEventListener('keydown', (ev) => this.alPulsar(ev));
    window.addEventListener('keyup', (ev) => this.alSoltar(ev.code));
    // Al perder el foco no llegan los keyup: se sueltan todas las teclas.
    window.addEventListener('blur', () => this.soltarTodo());
    document.addEventListener('mousemove', (ev) => {
      if (!this.capturado()) return;
      this.ratonX += ev.movementX;
      this.ratonY += ev.movementY;
    });
    document.addEventListener('mousedown', (ev) => this.alPulsarRaton(ev));
    document.addEventListener('mouseup', (ev) => {
      if (ev.button === 0) this.senalarRaton = false;
    });
    // El clic derecho es el pellizco: sin menú contextual sobre la escena.
    document.addEventListener('contextmenu', (ev) => {
      if (this.capturado() || this.escena.contains(ev.target as Node)) ev.preventDefault();
    });
    document.addEventListener('pointerlockchange', () => {
      if (this.capturado()) return;
      // Soltar el ratón (Esc o cambio de ventana) abre Opciones, como una pausa.
      this.soltadoMs = performance.now();
      this.senalarRaton = false;
      if (!this.pausada) this.panel.abrir();
    });
  }

  /** Con teclado la palanca no tiene punto neutro que tomar. */
  recentrarMando(): void {}

  pausar(pausada: boolean): void {
    this.pausada = pausada;
    if (!pausada) return;
    this.soltarTodo();
    if (this.capturado()) document.exitPointerLock();
  }

  leer(ahoraS: number): LecturaEntrada {
    const dtS = this.ultimoS === null ? 0 : Math.min(DT_MAX_S, Math.max(0, ahoraS - this.ultimoS));
    this.ultimoS = ahoraS;
    const lectura = lecturaVacia(ahoraS);
    lectura.dtS = dtS;
    lectura.hayDatos = true;
    lectura.conMovimiento = true;
    lectura.aviso = this.pausada || this.capturado() ? null : t('teclado_clic_mirar');

    // Caminata: misma velocidad máxima y aceleración que la caminata con rodillas (Opciones).
    const tecla = (codigo: string): number => (this.pulsadas.has(codigo) ? 1 : 0);
    const adelante = tecla('KeyW') - tecla('KeyS');
    const lado = tecla('KeyD') - tecla('KeyA');
    this.acelerar(adelante, lado, dtS);
    lectura.avanceM = this.velAvance * dtS;
    lectura.lateralM = this.velLateral * dtS;
    // Balanceo de la cámara (solo visual): camina con W o S, a la cadencia de la velocidad actual.
    lectura.balanceo = {
      caminando: adelante !== 0,
      pasosNuevos: 0,
      pasosPorSegundo: Math.abs(this.velAvance) / this.opciones.metrosPorPaso,
    };
    // En el LRV, W/S y A/D mueven la palanca del mando en T. Sin teclas, vuelve al centro.
    const f = 1 - Math.exp(-dtS / MANDO_TECLADO_S);
    this.mandoAdelante += (adelante - this.mandoAdelante) * f;
    this.mandoLado += (lado - this.mandoLado) * f;
    lectura.mando = { adelante: this.mandoAdelante, lado: this.mandoLado };

    // Ratón: a la derecha gira a la derecha; hacia arriba mira arriba.
    const grados = SENSIBILIDAD_RATON_GRADOS_POR_PX * this.opciones.sensibilidadRaton;
    lectura.giroGrados = this.ratonX * grados;
    lectura.cabeceoGrados = -this.ratonY * grados;
    this.ratonX = 0;
    this.ratonY = 0;

    // Mira fija en el centro de la pantalla. Solo señala mientras el botón izquierdo está pulsado.
    lectura.senal = { tipo: 'cursor', x: 0.5, y: 0.5, activo: this.senalarRaton };
    lectura.aplauso = this.espacioPendiente;
    // Espacio hace lo mismo que el aplauso con cámara, también volver al museo desde una misión.
    lectura.aplausoVuelve = true;
    lectura.pellizcoNuevo = this.pellizcoPendiente;
    lectura.bajarse = this.bajarsePendiente;
    lectura.desplegarMantenido = this.eMantenida;
    this.espacioPendiente = false;
    this.bajarsePendiente = false;
    this.pellizcoPendiente = false;
    return lectura;
  }

  /**
   * Acerca la velocidad a la de las teclas: velocidad máxima de Opciones (también en diagonal),
   * acelera en `tiempoAceleracion` y frena en TIEMPO_FRENADO_S, igual que game/caminata.ts.
   */
  private acelerar(adelante: number, lado: number, dtS: number): void {
    const { velocidadMax, tiempoAceleracion } = this.opciones;
    const largo = Math.hypot(adelante, lado);
    const objA = largo > 0 ? (adelante / largo) * velocidadMax : 0;
    const objL = largo > 0 ? (lado / largo) * velocidadMax : 0;
    const dA = objA - this.velAvance;
    const dL = objL - this.velLateral;
    const delta = Math.hypot(dA, dL);
    if (delta < 1e-9) return;
    const acelera = Math.hypot(objA, objL) > Math.hypot(this.velAvance, this.velLateral);
    const tasa = acelera ? velocidadMax / tiempoAceleracion : velocidadMax / TIEMPO_FRENADO_S;
    const f = Math.min(1, (tasa * dtS) / delta);
    this.velAvance += dA * f;
    this.velLateral += dL * f;
  }

  private capturado(): boolean {
    return document.pointerLockElement === this.escena;
  }

  private capturarRaton(): void {
    // Algunos navegadores devuelven una promesa que falla si se pide justo después de soltar con Esc.
    try {
      const promesa = this.escena.requestPointerLock() as unknown as Promise<void> | undefined;
      promesa?.catch?.(() => {});
    } catch {
      // Sin pointer lock: el teclado sigue funcionando; el ratón no gira la vista.
    }
  }

  private alPulsar(ev: KeyboardEvent): void {
    if (ev.code === 'Escape') {
      // Si Esc acaba de soltar el ratón, pointerlockchange ya abrió Opciones.
      if (performance.now() - this.soltadoMs < ESC_TRAS_SOLTAR_MS) return;
      if (this.panel.abierto()) this.panel.cerrar();
      else this.panel.abrir();
      return;
    }
    if (this.pausada || enCampoDeTexto(ev.target)) return;
    if (ev.code === 'Space') {
      ev.preventDefault();
      if (!ev.repeat) this.espacioPendiente = true;
    } else if (ev.code === 'KeyE') {
      this.eMantenida = true;
    } else if (ev.code === 'KeyB') {
      if (!ev.repeat) this.bajarsePendiente = true;
    } else if (TECLAS_MOVIMIENTO.has(ev.code)) {
      this.pulsadas.add(ev.code);
    }
  }

  private alSoltar(codigo: string): void {
    this.pulsadas.delete(codigo);
    if (codigo === 'KeyE') this.eMantenida = false;
  }

  private alPulsarRaton(ev: MouseEvent): void {
    if (this.pausada) return;
    const capturado = this.capturado();
    // Sin captura, solo cuentan los clics sobre la escena (no sobre botones u otros paneles).
    if (!capturado && !this.escena.contains(ev.target as Node)) return;
    if (!capturado) this.capturarRaton();
    if (ev.button === 0) {
      this.senalarRaton = true;
    } else if (ev.button === 2) {
      this.pellizcoPendiente = true;
    }
  }

  private soltarTodo(): void {
    this.pulsadas.clear();
    this.eMantenida = false;
    this.senalarRaton = false;
  }
}
