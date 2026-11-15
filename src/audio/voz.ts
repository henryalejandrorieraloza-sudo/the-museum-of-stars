import { parsearGuion } from './guion';
import { claveTexto, reproducirLinea, type CatalogoVoz, type Reproduccion } from './lineaGrabada';
import { Sincronia, type OyenteVoz } from './sincronia';

export type { OyenteVoz } from './sincronia';

// Voz del mentor con Web Speech API (SPEC 1, 7.2 y 11). Desacoplada: el resto del juego solo llama a `hablar`
// y `cancelar`. Para usar archivos grabados, se cambia esta implementación y no el resto.
//
// La explicación se reproduce frase a frase. La frase siguiente se envía a la cola del navegador mientras suena
// la actual, así el navegador las encadena casi sin silencio (no espera a nuestro evento de fin). Si no hay voces
// o la síntesis falla, cada frase dura lo que tardaría leída a CARACTERES_POR_SEGUNDO, de modo que el flujo del
// museo nunca se queda esperando (SPEC 7.2).

/** Ritmo del temporizador de respaldo cuando no hay voz (caracteres por segundo). */
export const CARACTERES_POR_SEGUNDO = 15;
/** Velocidad y tono de la síntesis del navegador (1 = normal). */
export const RITMO_VOZ = 0.95;
export const TONO_VOZ = 0.92;
/** Tiempo máximo (ms) que se espera a que el navegador cargue la lista de voces antes de hablar. */
const ESPERA_VOCES_MS = 1500;
/** Pausa (ms) entre cancelar la voz anterior y lanzar la nueva: Chrome puede perder una frase si no hay pausa. */
const RETRASO_TRAS_CANCELAR_MS = 80;
/** Si una frase no empieza en este tiempo (ms), se cancela y se pide otra vez una sola vez. */
const ESPERA_INICIO_FRASE_MS = 1500;
/** Margen (ms) que se da a una frase con voz antes de darla por perdida si nunca llega su evento de fin. */
const MARGEN_VIGILANCIA_MS = 5000;
/**
 * Si el navegador no avisa de que la voz empezó (onstart ni palabras) en este tiempo (ms), el subtítulo sale igualmente:
 * así nunca se queda una frase sin texto. Es mayor que ESPERA_INICIO_FRASE_MS para dar tiempo al reintento.
 */
const ESPERA_SUBTITULO_SIN_AVISO_MS = 3200;


export interface Voz {
  /**
   * Habla `texto` frase a frase. `alFrase` recibe cada frase cuando empieza (para los subtítulos).
   * `alTerminar` se llama al acabar la última frase; no se llama si la explicación se cancela.
   */
  hablar(texto: string, alTerminar?: () => void, alFrase?: (frase: string) => void): void;
  /** Corta la voz y descarta la explicación en curso. No se llama a `alTerminar`. */
  cancelar(): void;
  /**
   * Oyente de la sincronía (estado, frases, gestos y amplitud). El texto puede llevar marcas de gesto como
   * "Mira {directo} esto"; se quitan antes de mostrar o hablar, así que los subtítulos no cambian.
   */
  escuchar(oyente: OyenteVoz): void;
  /** Pausa o reanuda la voz (tecla 7). Mientras está pausada, no avanzan las frases ni sus temporizadores. */
  pausar(pausado: boolean): void;
}

/** Divide un texto en frases, conservando el signo de puntuación final. */
export function dividirFrases(texto: string): string[] {
  const partes = texto.match(/[^.!?…]+(?:[.!?…]+["”»)]*|$)/g) ?? [];
  return partes.map((p) => p.trim()).filter((p) => p.length > 0);
}

/**
 * Voz del navegador más natural disponible para `idioma`. Prefiere voces "neurales/premium" (Natural, Premium,
 * Enhanced, Google) y, dentro del idioma, las que tengan nombre conocido de voz de calidad. Devuelve undefined si
 * no hay ninguna: entonces el navegador usa la predeterminada.
 */
export function elegirVoz(voces: SpeechSynthesisVoice[], idioma: string): SpeechSynthesisVoice | undefined {
  const base = idioma.slice(0, 2).toLowerCase();
  const candidatas = voces.filter((v) => v.lang.toLowerCase().startsWith(base));
  const puntuar = (v: SpeechSynthesisVoice): number => {
    let p = 0;
    if (v.lang.toLowerCase().replace('_', '-') === idioma.toLowerCase()) p += 4;
    if (/natural|neural/i.test(v.name)) p += 10;
    if (/premium|enhanced|google/i.test(v.name)) p += 6;
    if (!v.localService) p += 1;
    return p;
  };
  return candidatas.sort((a, b) => puntuar(b) - puntuar(a))[0];
}

/** Duración (ms) de una frase leída al ritmo del respaldo. */
export function duracionRespaldoMs(frase: string): number {
  return Math.round((frase.length / CARACTERES_POR_SEGUNDO) * 1000);
}

/** Estado de una frase de la explicación: si ya empezó, terminó o falló, y si el navegador envía eventos de palabra. */
interface EstadoFrase {
  utterance?: SpeechSynthesisUtterance;
  empezada: boolean;
  hecha: boolean;
  comenzada: boolean;
  conEventosDePalabra: boolean;
  fallo: boolean;
}

/** `idioma` puede ser una función: se lee al hablar cada frase, para que el cambio de idioma se note al momento. */
export function crearVoz(idioma: string | (() => string) = 'es-ES', catalogo?: CatalogoVoz): Voz {
  const sintesis: SpeechSynthesis | undefined = 'speechSynthesis' in window ? window.speechSynthesis : undefined;
  /** Identificador de la explicación en curso: cancelar o empezar otra lo invalida, y sus eventos se ignoran. */
  let vigente = 0;
  /** Referencias vivas a las frases de la explicación en curso, para que el navegador no las recoja. */
  let frases: SpeechSynthesisUtterance[] = [];
  /** Temporizador de la frase en curso: respaldo sin voz, error o vigilancia de frases sin evento de fin. */
  let temporizador: number | undefined;
  /** Temporizadores de gestos estimados (cuando la síntesis no envía eventos de palabra). */
  let temporizadoresCue: number[] = [];
  let oyente: OyenteVoz = {};
  let sincActual: Sincronia | undefined;
  let grabada: Reproduccion | undefined;
  /** Pausa total: los temporizadores de la frase esperan a reanudar. */
  let enPausa = false;
  /** Temporizador pendiente de la frase (para volver a programarlo al reanudar). */
  let pendiente: { ms: number; fn: () => void } | undefined;

  const detener = (): void => {
    window.clearTimeout(temporizador);
    temporizador = undefined;
    pendiente = undefined;
  };
  const limpiarCues = (): void => {
    temporizadoresCue.forEach((id) => window.clearTimeout(id));
    temporizadoresCue = [];
  };
  const programar = (ms: number, fn: () => void): void => {
    detener();
    pendiente = { ms, fn };
    if (!enPausa) {
      temporizador = window.setTimeout(() => {
        pendiente = undefined;
        fn();
      }, ms);
    }
  };
  const hayVoces = (): boolean => {
    try {
      return sintesis !== undefined && sintesis.getVoices().length > 0;
    } catch {
      return false;
    }
  };

  return {
    escuchar(nuevo) {
      oyente = nuevo;
    },
    pausar(pausado) {
      enPausa = pausado;
      if (pausado) {
        window.clearTimeout(temporizador);
        temporizador = undefined;
        try {
          sintesis?.pause();
        } catch {
          // Sin síntesis, no hay nada que pausar.
        }
        grabada?.pausar(true);
      } else {
        try {
          sintesis?.resume();
        } catch {
          // Sin síntesis, no hay nada que reanudar.
        }
        grabada?.pausar(false);
        if (pendiente) {
          const p = pendiente;
          programar(p.ms, p.fn);
        }
      }
    },
    hablar(texto, alTerminar, alFrase) {
      const id = ++vigente;
      detener();
      limpiarCues();
      grabada?.cancelar();
      grabada = undefined;
      sincActual?.cancelar();
      frases = [];
      // Las marcas de gesto se quitan aquí: subtítulos y voz reciben siempre el texto limpio.
      const guion = parsearGuion(texto);
      const sync = new Sincronia(guion, () => oyente, alFrase);
      sincActual = sync;
      const trozos = guion.frases;
      /** Siguiente frase a volver vigente. */
      let indice = 0;
      /** Frase vigente (la que suena o está a punto de sonar). */
      let actual = -1;
      /** Estado de cada frase enviada a la síntesis (puede haberse enviado antes de ser vigente). */
      const estados = new Map<number, EstadoFrase>();
      sync.empezar();

      const acabar = (): void => {
        vigente++;
        frases = [];
        limpiarCues();
        sync.terminar();
        if (sincActual === sync) sincActual = undefined;
        alTerminar?.();
      };

      /** Índice de la palabra que empieza en la posición `pos` del texto limpio. */
      const palabraEn = (pos: number): number => {
        let w = 0;
        for (let i = 0; i < guion.palabras.length; i++) if (guion.palabras[i].inicio <= pos) w = i;
        return w;
      };

      /** Sube el subtítulo y el gesto de la frase n (una sola vez). */
      const iniciar = (n: number): void => {
        const e = estados.get(n);
        if (!e || e.empezada || id !== vigente) return;
        e.empezada = true;
        sync.frase(n);
      };

      /** Termina la frase n una sola vez y pasa a la siguiente. */
      const terminarFrase = (n: number): void => {
        const e = estados.get(n);
        if (!e || e.hecha || id !== vigente) return;
        e.hecha = true;
        iniciar(n);
        limpiarCues();
        sync.finFrase(n);
        siguiente();
      };

      /** Gestos a tiempo estimado (CARACTERES_POR_SEGUNDO) para las palabras de la frase n que tienen marca. */
      const programarEstimados = (n: number, yaPasadoMs: number): void => {
        const frase = trozos[n];
        for (let w = frase.primera; w <= frase.ultima; w++) {
          if (guion.palabras[w].cues.length === 0 && guion.palabras[w].planos.length === 0) continue;
          const ms = duracionRespaldoMs(guion.texto.slice(frase.inicio, guion.palabras[w].inicio)) - yaPasadoMs;
          temporizadoresCue.push(
            window.setTimeout(() => {
              if (id === vigente) sync.palabra(w);
            }, Math.max(0, ms)),
          );
        }
      };

      /** Sin voz o con error: la frase n sale ya y se lee por temporizador al ritmo de respaldo. */
      const respaldo = (n: number): void => {
        iniciar(n);
        programarEstimados(n, 0);
        programar(duracionRespaldoMs(trozos[n].texto), () => terminarFrase(n));
      };

      /**
       * Envía la frase n a la cola de la síntesis. Puede llamarse antes de que la frase sea vigente: el navegador
       * la encadena tras la anterior sin esperar a nuestro evento de fin. Devuelve false si no hay voz.
       */
      const enviar = (n: number): boolean => {
        if (!sintesis || !hayVoces()) return false;
        const frase = trozos[n];
        const e: EstadoFrase = {
          empezada: false,
          hecha: false,
          comenzada: false,
          conEventosDePalabra: false,
          fallo: false,
        };
        estados.set(n, e);
        try {
          const utterance = new SpeechSynthesisUtterance(frase.texto);
          const lang = typeof idioma === 'function' ? idioma() : idioma;
          utterance.lang = lang;
          // Ritmo algo más pausado y tono ligeramente bajo: suena menos apresurado y más de personaje.
          utterance.rate = RITMO_VOZ;
          utterance.pitch = TONO_VOZ;
          const elegida = elegirVoz(sintesis.getVoices(), lang);
          if (elegida) utterance.voice = elegida;
          e.utterance = utterance;
          frases.push(utterance);
          utterance.onstart = () => {
            if (estados.get(n) !== e || id !== vigente) return;
            e.comenzada = true;
            iniciar(n);
            // Si en 0.7 s no ha llegado ningún evento de palabra, este navegador no los envía: se estima.
            temporizadoresCue.push(
              window.setTimeout(() => {
                if (id === vigente && estados.get(n) === e && !e.conEventosDePalabra) programarEstimados(n, 700);
              }, 700),
            );
          };
          utterance.onboundary = (ev) => {
            if (estados.get(n) !== e || id !== vigente || (ev.name && ev.name !== 'word')) return;
            e.conEventosDePalabra = true;
            sync.palabra(palabraEn(frase.inicio + ev.charIndex));
          };
          utterance.onend = () => {
            if (estados.get(n) === e) terminarFrase(n);
          };
          // Un error no debe dejar el flujo parado: la frase pasa a leerse por temporizador.
          utterance.onerror = (ev) => {
            if (estados.get(n) !== e || id !== vigente || e.hecha) return;
            console.warn('Voz: error de síntesis, sigue el temporizador:', ev.error, frase.texto);
            e.fallo = true;
            if (n === actual) respaldo(n);
          };
          sintesis.speak(utterance);
          return true;
        } catch {
          // Sin voz disponible o síntesis fallida: la frase se leerá por temporizador.
          e.fallo = true;
          return false;
        }
      };

      const siguiente = (): void => {
        if (id !== vigente) return;
        detener();
        limpiarCues();
        if (indice >= trozos.length) {
          acabar();
          return;
        }
        const n = indice++;
        actual = n;
        if (!estados.has(n)) enviar(n);
        const e = estados.get(n);
        if (!e?.utterance || e.fallo) {
          respaldo(n);
          return;
        }

        // Si la frase no ha empezado a sonar, se cancela la cola y se vuelve a enviar (una sola vez).
        temporizadoresCue.push(
          window.setTimeout(() => {
            if (id !== vigente || estados.get(n) !== e || e.hecha || e.comenzada || enPausa) return;
            console.warn('Voz: la frase no empezó, se vuelve a pedir:', trozos[n].texto);
            try {
              sintesis?.cancel();
            } catch {
              // Sin reintento: queda el temporizador de respaldo.
            }
            // Al cancelar se pierde también la frase encolada: se vuelven a enviar la actual y la siguiente.
            for (let k = n; k <= n + 1 && k < trozos.length; k++) if (estados.has(k)) enviar(k);
          }, ESPERA_INICIO_FRASE_MS),
        );
        // Sin aviso de inicio (algunos navegadores no envían onstart), el subtítulo sale igualmente.
        temporizadoresCue.push(window.setTimeout(() => iniciar(n), ESPERA_SUBTITULO_SIN_AVISO_MS));
        // Vigilancia: si el navegador nunca envía el evento de fin, la frase avanza igualmente.
        programar(duracionRespaldoMs(trozos[n].texto) + MARGEN_VIGILANCIA_MS, () => terminarFrase(n));
        // La siguiente frase entra ya en la cola del navegador: al terminar esta, suena sin silencio.
        if (indice < trozos.length && !estados.has(indice)) enviar(indice);
      };

      const empezarConSintesis = (): void => {
        try {
          sintesis?.cancel();
        } catch {
          // Nada que cancelar si el navegador no tiene voz.
        }
        // Chrome carga la lista de voces tras la primera consulta: sin esperarla, la explicación saldría con
        // subtítulos y sin voz. Si la lista tarda más de ESPERA_VOCES_MS, se sigue igualmente (SPEC 7.2).
        // Chrome puede descartar una frase lanzada justo después de cancel(): se deja un instante.
        window.setTimeout(() => {
          if (id !== vigente) return;
          esperarVoces(() => {
            if (id === vigente) siguiente();
          });
        }, RETRASO_TRAS_CANCELAR_MS);
      };

      /** Llama a `cont` cuando hay voces, o al cabo de ESPERA_VOCES_MS si no llegan. */
      const esperarVoces = (cont: () => void): void => {
        if (!sintesis || hayVoces()) return cont();
        let hecho = false;
        const listo = (): void => {
          if (hecho) return;
          hecho = true;
          window.clearTimeout(corte);
          sintesis.removeEventListener?.('voiceschanged', listo);
          cont();
        };
        const corte = window.setTimeout(listo, ESPERA_VOCES_MS);
        sintesis.addEventListener?.('voiceschanged', listo);
      };

      // Audio grabado, si existe para este texto; si falla (carga, formato, bloqueo), sigue con la síntesis.
      const linea = catalogo?.get(claveTexto(guion.texto));
      if (linea && trozos.length > 0) {
        // El subtítulo de la primera frase sale cuando el audio ya suena y llega a su primera palabra (sync.avanzar).
        grabada = reproducirLinea(
          linea,
          guion,
          sync,
          () => oyente,
          () => {
            if (id !== vigente) return;
            grabada = undefined;
            acabar();
          },
          () => {
            if (id !== vigente) return;
            grabada = undefined;
            empezarConSintesis();
          },
        );
        return;
      }
      empezarConSintesis();
    },
    cancelar() {
      vigente++;
      detener();
      limpiarCues();
      grabada?.cancelar();
      grabada = undefined;
      sincActual?.cancelar();
      sincActual = undefined;
      frases = [];
      try {
        sintesis?.cancel();
      } catch {
        // Nada que cancelar si el navegador no tiene voz.
      }
    },
  };
}
