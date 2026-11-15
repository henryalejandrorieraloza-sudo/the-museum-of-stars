// Fuente de entrada por cámara (gestos): webcam + MediaPipe. Encuadre y calibración (SPEC 2.1 y 3),
// y traducción de cada fotograma a la lectura común (fuente.ts): cabeza, rodillas, pellizco de confirmar, señalar,
// pellizco y la palanca del LRV con la mano derecha. La lógica es la misma que antes vivía en juego.ts.

import { checkFraming, type FramingStatus } from '../tracking/framing';
import {
  pellizco,
  pellizcoManoLibre,
  pellizcoConfirmar,
  pellizcoConfirmarEstadoInicial,
  PUNO_GRACIA_S,
  posturaMando,
  separarManos,
  separarManosEstadoInicial,
  type PellizcoConfirmarEstado,
  type SepararManosEstado,
} from '../tracking/gestures';
import {
  HAND_IDX,
  LegAlternationCounter,
  SWING_PCT_DEFAULT,
  headPitchDeg,
  headRollDeg,
  legSample,
  punoCerrado,
  shoulderWidthPx,
} from '../tracking/metrics';
import { Tracker, type TrackingFrame } from '../tracking/tracker';
import { abrirWebcam, cerrarWebcam } from '../tracking/camara';
import { Caminata } from '../game/caminata';
import { Calibrador, cargarCalibracion, guardarCalibracion, type Calibracion } from '../game/calibracion';
import { CursorSuavizado, puntaACursor } from '../game/cursor';
import { cabeceoCabeza, direccionSenalar, giroCabeza } from '../game/gestos';
import { MandoLRV } from '../game/mandoLRV';
import type { Opciones } from '../game/opciones';
import { descargarCaptura } from '../ui/captura';
import { t } from '../i18n';
import { enCampoDeTexto, lecturaVacia, type FuenteEntrada, type LecturaEntrada, type Senal } from './fuente';

/** Si el último fotograma es más viejo que esto (s), el movimiento se congela y las manos se ocultan (SPEC 6). */
const FRESCO_S = 0.5;
/** Tiempo máximo (s) que cuenta un fotograma para el giro y la caminata, para no saltar tras una pausa. */
const DT_MAX_S = 0.1;

export class FuenteCamara implements FuenteEntrada {
  readonly modo = 'camara' as const;

  private calibracion: Calibracion | null = cargarCalibracion();
  private readonly calibrador = new Calibrador();
  private readonly piernas = new LegAlternationCounter(SWING_PCT_DEFAULT);
  private readonly caminata = new Caminata();
  private readonly cursorSuavizado = new CursorSuavizado();
  /** Si el pellizco de la mano que señala estaba cerrado en el fotograma anterior. */
  private pellizcoCerrado = false;
  private pasosVistos = 0;
  /**
   * Pellizco de confirmar (pulgar e índice, como en Perseverance): hace lo que antes el aplauso (entrar, elegir modo,
   * subir al LRV y volver al museo), con cualquiera de las dos manos.
   */
  private confirmarEstado: PellizcoConfirmarEstado = pellizcoConfirmarEstadoInicial;
  /** Pellizco para subir al LRV y bajarse de él: solo de la mano izquierda, que no conduce. */
  private manoLibreEstado: PellizcoConfirmarEstado = pellizcoConfirmarEstadoInicial;
  /** Palanca del mando en T del LRV, que sigue a la mano derecha. */
  private readonly mando = new MandoLRV();
  /** Manos que se separan o se juntan: desarmar o armar el LRV en el taller. */
  private separarEstado: SepararManosEstado = separarManosEstadoInicial;
  private ultimoFrescoS: number | null = null;
  private ultimoDatoS = Number.NEGATIVE_INFINITY;
  /** Barra espaciadora: respaldo del pellizco de confirmar (SPEC 4). Se consume en la siguiente lectura. */
  private espacioPendiente = false;
  /** Tecla E mantenida: respaldo del puño cerrado (desplegar, recoger, volver). */
  private eMantenida = false;
  /** Último instante (s) en que se vio un puño cerrado; el puño se mantiene PUNO_GRACIA_S después. */
  private ultimoPunoS = Number.NEGATIVE_INFINITY;
  private pausada = false;
  private aviso: string | null;
  /** Último fotograma procesado, para la captura de depuración (tecla P, solo en desarrollo). */
  private ultimoFrame: TrackingFrame | null = null;

  private constructor(
    private readonly video: HTMLVideoElement,
    private readonly tracker: Tracker,
    /** Opciones vivas: el panel las modifica en el mismo objeto. */
    private readonly opciones: Opciones,
  ) {
    this.aviso = this.calibracion === null ? t('encuadre_acercarse') : null;
    window.addEventListener('keydown', (ev) => {
      if (ev.code !== 'Space' || this.pausada || enCampoDeTexto(ev.target)) return;
      ev.preventDefault();
      if (!ev.repeat) this.espacioPendiente = true;
    });
    window.addEventListener('keydown', (ev) => {
      if (ev.code === 'KeyE' && !this.pausada && !enCampoDeTexto(ev.target)) this.eMantenida = true;
    });
    window.addEventListener('keyup', (ev) => {
      if (ev.code === 'KeyE') this.eMantenida = false;
    });
    // Al perder el foco no llega el keyup.
    window.addEventListener('blur', () => {
      this.eMantenida = false;
    });
    // Captura de depuración: P descarga el frame actual como JSON. Solo en desarrollo.
    if (import.meta.env.DEV) {
      window.addEventListener('keydown', (ev) => {
        if (ev.code === 'KeyP' && !ev.repeat && this.ultimoFrame) descargarCaptura(this.ultimoFrame);
      });
    }
  }

  /**
   * Abre la webcam y carga MediaPipe. Lanza un error si la cámara o el seguimiento fallan;
   * en ese caso la webcam queda cerrada, para poder ofrecer el modo teclado.
   */
  static async crear(video: HTMLVideoElement, opciones: Opciones, onEstado: (mensaje: string) => void): Promise<FuenteCamara> {
    await abrirWebcam(video);
    try {
      const tracker = await Tracker.create(onEstado);
      return new FuenteCamara(video, tracker, opciones);
    } catch (err) {
      cerrarWebcam(video);
      throw err;
    }
  }

  recentrarMando(): void {
    this.mando.recentrar();
  }

  pausar(pausada: boolean): void {
    this.pausada = pausada;
    if (pausada) {
      this.espacioPendiente = false;
      this.eMantenida = false;
      this.ultimoPunoS = Number.NEGATIVE_INFINITY;
    }
  }

  leer(ahoraS: number): LecturaEntrada {
    const espacio = this.espacioPendiente;
    this.espacioPendiente = false;
    const frame = this.tracker.detect(this.video, ahoraS * 1000);
    if (frame) {
      const conFotograma = this.procesarFotograma(frame, ahoraS, espacio);
      conFotograma.desplegarMantenido = this.eMantenida;
      conFotograma.punoMantenido = this.punoMantenido(ahoraS);
      return conFotograma;
    }

    // Sin fotograma nuevo el movimiento está congelado, pero la barra espaciadora debe funcionar.
    const viejo = ahoraS - this.ultimoDatoS > FRESCO_S;
    if (this.calibracion !== null && viejo) this.aviso = t('sin_seguimiento');
    const lectura = lecturaVacia(ahoraS);
    lectura.listo = this.calibracion !== null;
    lectura.aviso = this.aviso;
    lectura.hayDatos = espacio && lectura.listo;
    lectura.aplauso = lectura.hayDatos;
    lectura.manos = viejo ? 'ocultar' : null;
    lectura.desplegarMantenido = this.eMantenida;
    lectura.punoMantenido = this.punoMantenido(ahoraS);
    return lectura;
  }

  /** ¿Sigue el puño cerrado? Cuenta hasta PUNO_GRACIA_S después del último fotograma con puño; pausado, nunca. */
  private punoMantenido(ahoraS: number): boolean {
    return !this.pausada && ahoraS - this.ultimoPunoS <= PUNO_GRACIA_S;
  }

  /** Procesa un fotograma nuevo: encuadre y calibración, o bien las señales del juego. */
  private procesarFotograma(frame: TrackingFrame, ahoraS: number, espacio: boolean): LecturaEntrada {
    this.ultimoFrame = frame;
    const dtS = this.ultimoFrescoS === null ? 0 : Math.min(DT_MAX_S, ahoraS - this.ultimoFrescoS);
    this.ultimoFrescoS = ahoraS;
    this.ultimoDatoS = ahoraS;
    if (frame.hands.some((m) => punoCerrado(m, frame.width, frame.height))) this.ultimoPunoS = ahoraS;

    const lectura = lecturaVacia(ahoraS);
    lectura.dtS = dtS;
    // Las manos del avatar copian las detectadas; si no hay mano, su avatar se oculta (SPEC 5.5).
    lectura.manos = { manos: frame.hands, ancho: frame.width, alto: frame.height };

    const framing = checkFraming(frame.pose);
    const roll = frame.face ? headRollDeg(frame.face, frame.width, frame.height) : null;
    const pitch = frame.facePose ? headPitchDeg(frame.facePose) : null;

    // Los pasos se cuentan siempre para no acumularlos de golpe al terminar la calibración.
    this.piernas.feed(ahoraS, legSample(frame.pose));
    const estadoPiernas = this.piernas.state(ahoraS);
    const pasosTotales = estadoPiernas.steps;
    const pasos = pasosTotales - this.pasosVistos;
    this.pasosVistos = pasosTotales;

    const shoulderPx = frame.pose ? shoulderWidthPx(frame.pose, frame.width, frame.height) : null;
    const confirmar = pellizcoConfirmar(frame.hands, frame.width, frame.height, this.confirmarEstado, ahoraS);
    this.confirmarEstado = confirmar.estado;
    const manoLibre = pellizcoManoLibre(frame.hands, frame.width, frame.height, this.manoLibreEstado, ahoraS);
    this.manoLibreEstado = manoLibre.estado;
    // La palanca se mide en cada fotograma (también calibrando), para que su punto neutro y su suavizado sigan al día.
    lectura.mando = this.mando.actualizar(ahoraS, dtS, posturaMando(frame.hands, frame.pose, frame.width, frame.height));

    const separar = separarManos(frame.hands, shoulderPx, frame.width, frame.height, this.separarEstado, ahoraS);
    this.separarEstado = separar.estado;

    if (this.calibracion === null) {
      const nueva = this.calibrador.alimentar(ahoraS, roll, pitch, framing === 'ok');
      if (nueva) {
        this.calibracion = nueva;
        guardarCalibracion(nueva);
      }
      this.aviso = avisoCalibracion(framing, this.calibrador.progreso, this.calibracion !== null);
      lectura.listo = false;
      lectura.aviso = this.aviso;
      return lectura;
    }

    this.aviso = null;
    lectura.aviso = null;
    lectura.hayDatos = true;
    // Balanceo de la cámara (solo visual): cada paso detectado es un extremo. No usa el roll ni cambia la detección.
    lectura.balanceo = { caminando: estadoPiernas.walking && roll !== null, pasosNuevos: pasos, pasosPorSegundo: null };
    // El pellizco (o la barra espaciadora) confirma: entrar y volver a la escena, elegir modo y subir al LRV (SPEC 5.2
    // y 7.2). Sentado en el LRV, el pellizco de la derecha (la que conduce) no hace nada: juego.ts lo ignora.
    // Como antes el aplauso, el pellizco cuenta aunque la entrada esté en pausa: la pantalla de modos pausa el juego
    // ('menu') y se confirma justo con este gesto. Bajarse del LRV, en cambio, solo sin pausa.
    lectura.aplauso = confirmar.detectado || (espacio && !this.pausada);
    lectura.progresoPellizco = confirmar.progreso;
    // Subir al LRV y bajarse: solo el pellizco de la mano izquierda (la que no conduce), con su propio anillo.
    lectura.okManoLibre = manoLibre.detectado && !this.pausada;
    lectura.progresoOkManoLibre = this.pausada ? null : manoLibre.progreso;
    lectura.bajarse = lectura.okManoLibre;
    // Separar y juntar las manos solo lo usa el taller 3D, que pausa la entrada; juego.ts decide si cuenta.
    lectura.gestoManos = separar.gesto;
    // Señalar y pellizco dependen solo de la mano que señala.
    this.senalar(frame, lectura);

    // Sin cara no hay giro ni pasos: el movimiento se congela (SPEC 6). El aplauso y el pellizco sí cuentan.
    lectura.conMovimiento = roll !== null;
    if (roll === null) return lectura;

    const { calibracion, opciones } = this;
    lectura.giroGrados = giroCabeza(roll, calibracion.rollNeutralGrados, dtS, opciones.sensibilidadGiro);
    lectura.cabeceoGrados =
      pitch === null ? 0 : cabeceoCabeza(pitch, calibracion.pitchNeutralGrados, dtS, opciones.sensibilidadGiro);
    lectura.avanceM = this.caminata.avanzar(ahoraS, dtS, pasos, opciones);
    return lectura;
  }

  /**
   * Cursor (o rayo, según opciones) y pellizco de la mano que señala. Con mano, el cursor sigue la punta del índice;
   * sin mano, queda en su última posición, atenuado y sin señalar.
   */
  private senalar(frame: TrackingFrame, lectura: LecturaEntrada): void {
    const { opciones } = this;
    const mano = frame.hands.find((m) => m.label === opciones.manoSenaladora);

    const cerrado = pellizco(mano, frame.width, frame.height)?.cerrado ?? false;
    lectura.pellizcoNuevo = cerrado && !this.pellizcoCerrado;
    this.pellizcoCerrado = cerrado;

    let senal: Senal | null;
    if (opciones.metodoSenalar === 'rayo') {
      senal = { tipo: 'rayo', direccion: direccionSenalar(frame, opciones.manoSenaladora) };
    } else if (mano) {
      const pos = this.cursorSuavizado.actualizar(
        puntaACursor(mano.landmarks[HAND_IDX.indexTip], opciones.sensibilidadCursor),
        opciones.suavizadoCursor,
      );
      senal = { tipo: 'cursor', x: pos.x, y: pos.y, activo: true };
    } else {
      const ultima = this.cursorSuavizado.ultima();
      senal = ultima ? { tipo: 'cursor', x: ultima.x, y: ultima.y, activo: false } : null;
    }
    lectura.senal = senal;
  }
}

/** Aviso durante la calibración: encuadre primero, luego instrucción y progreso (SPEC 2.1 y 3). */
function avisoCalibracion(framing: FramingStatus, progreso: number, terminada: boolean): string | null {
  if (terminada) return null;
  if (framing === 'retroceder') return t('encuadre_retroceder');
  if (framing === 'acercarse') return t('encuadre_acercarse');
  const porcentaje = String(Math.round(progreso * 100));
  return `${t('calibracion_instruccion')} ${t('calibracion_progreso', { porcentaje })}`;
}
