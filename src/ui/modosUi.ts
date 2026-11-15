// Pantalla de modos, después de señalar el holograma del moon buggy y oír a Robi: arriba, «Elige cómo explorar» junto al moon
// buggy, y tres cuadrantes low poly cuyos centros forman un triángulo (dos arriba y uno abajo en el centro): historia del
// moon buggy, taller 3D y exploración libre. De fondo, un moon buggy recorre la Luna a lo lejos.
// Señalar un cuadrante (ratón con el botón izquierdo sostenido, o dedo índice) hasta que el anillo se llena (SEGUNDOS_SENALAR,
// igual que las vitrinas) lo elige: Robi lo describe en ese momento y pide aplaudir (o espacio) para entrar. Con el teclado,
// Tab elige el cuadrante enfocado y Enter entra al momento. Sin números en pantalla. La voz y los subtítulos los pone
// juego.ts a través de `alSeleccionar`.

import { alCambiarIdioma, t, type ClaveTexto } from '../i18n';
import { SEGUNDOS_SENALAR } from '../game/museo';
import type { Senal } from '../input/fuente';
import { crearFondoLunar, type FondoLunar } from './fondoLunar';
import type { AnilloUi } from './anillo';
import { requireEl } from './dom';

export type ModoApp = 'historia' | 'taller' | 'libre';

export interface ModosUi {
  /** Muestra la pantalla y espera a que se elija un modo, o a que se pulse «Volver al museo» (devuelve 'volver'). */
  elegir(): Promise<ModoApp | 'volver'>;
  /** Una opción queda elegida (señalada o enfocada): Robi la describe y pide aplaudir o pulsar espacio para entrar. */
  alSeleccionar(oyente: (modo: ModoApp) => void): void;
  /** Robi terminó de decir qué es la opción (o null al cambiarla): solo entonces se puede entrar con aplauso o espacio. */
  fijarExplicado(modo: ModoApp | null): void;
  /** Aplauso (cámara) o espacio: entra en la opción elegida, si hay una y Robi ya la explicó. */
  aplaudir(): void;
  /** Dedo índice de la cámara, cada fotograma (null si no hay lectura). Solo cuenta con la pantalla abierta. */
  apuntarCamara(senal: Senal | null): void;
}

const FUNDIDO_SALIDA_MS = 600;

/** Iconos low poly: polígonos planos de dos o tres tonos, sin trazos suaves. */
const ICONO_BUGGY =
  '<svg viewBox="0 0 64 64" aria-hidden="true"><polygon points="8,40 52,40 50,34 10,34" class="t1"/><polygon points="10,34 50,34 46,26 14,26" class="t2"/><polygon points="14,26 22,10 26,12 20,26" class="t3"/><polygon points="22,10 36,16 24,18" class="t2"/><polygon points="12,40 16,32 28,32 32,40" class="t3"/><polygon points="36,40 40,32 52,32 56,40" class="t3"/><polygon points="14,50 18,44 26,44 30,50 26,56 18,56" class="t4"/><polygon points="38,50 42,44 50,44 54,50 50,56 42,56" class="t4"/></svg>';
const ICONO_CUBO =
  '<svg viewBox="0 0 64 64" aria-hidden="true"><polygon points="32,6 56,19 32,32 8,19" class="t1"/><polygon points="8,19 32,32 32,58 8,45" class="t3"/><polygon points="56,19 32,32 32,58 56,45" class="t2"/><polygon points="32,32 44,26 44,38 32,44" class="t4"/></svg>';
const ICONO_RUTA =
  '<svg viewBox="0 0 64 64" aria-hidden="true"><polygon points="4,58 24,18 34,18 22,58" class="t3"/><polygon points="24,18 34,18 40,58 22,58" class="t2"/><polygon points="34,18 46,18 60,58 40,58" class="t1"/><polygon points="29,24 31,24 32,30 28,30" class="t4"/><polygon points="28,40 32,40 33,48 27,48" class="t4"/><polygon points="44,6 50,12 44,18 38,12" class="t4"/></svg>';

const MODOS: { modo: ModoApp; titulo: ClaveTexto; descripcion: ClaveTexto; icono: string }[] = [
  { modo: 'historia', titulo: 'modo_historia_titulo', descripcion: 'modo_historia_desc', icono: ICONO_BUGGY },
  { modo: 'taller', titulo: 'modo_taller_titulo', descripcion: 'modo_taller_desc', icono: ICONO_CUBO },
  { modo: 'libre', titulo: 'modo_libre_titulo', descripcion: 'modo_libre_desc', icono: ICONO_RUTA },
];

function crear<K extends keyof HTMLElementTagNameMap>(tag: K, clase: string, hijos: (Node | string)[] = []): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  el.className = clase;
  el.append(...hijos);
  return el;
}

/**
 * «The Apollo Lunar Roving Vehicle», la página de la NSSDC (NASA) sobre el LRV, la misma fuente del taller 3D. Habla de
 * los tres LRV, también del del Apolo 17. (La ficha 1971-063C es la del módulo lunar del Apolo 15, no la del LRV.)
 */
const URL_NSSDC_LRV = 'https://nssdc.gsfc.nasa.gov/planetary/lunar/apollo_lrv.html';

export function crearModosUi(anillo: AnilloUi): ModosUi {
  const seccion = requireEl('modos');
  const lienzo = crear('canvas', 'modos-fondo');
  lienzo.setAttribute('aria-hidden', 'true');
  const marco = crear('div', 'modos-marco');
  seccion.replaceChildren(lienzo, marco);
  const fondo: FondoLunar = crearFondoLunar(lienzo);

  let oyenteSeleccionar: (modo: ModoApp) => void = () => {};
  let alElegir: ((modo: ModoApp | 'volver') => void) | null = null;
  let esVisible = false;
  /** Opción elegida (señalada hasta el final del anillo) y pendiente de confirmar con aplauso o espacio. */
  let elegido: ModoApp | null = null;
  let rafId: number | null = null;
  /** Ratón sobre la pantalla: posición y si el botón izquierdo está pulsado. */
  let raton: { x: number; y: number; pulsado: boolean } | null = null;
  /** Dedo índice de la cámara, en px de pantalla. */
  let camara: { x: number; y: number; activo: boolean } | null = null;
  /** Opción que Robi ya terminó de explicar: solo esa se puede entrar. null mientras no ha terminado. */
  let explicado: ModoApp | null = null;
  /** Cuadrante (o el botón de volver al museo) que se está llenando y desde cuándo. */
  let candidato: ModoApp | 'volver' | null = null;
  let inicioLlenadoMs = 0;

  function pintar(): void {
    const cuadros = MODOS.map(({ modo, titulo, descripcion, icono }) => {
      const icon = crear('span', 'modos-icono');
      icon.innerHTML = icono;
      const b = crear('button', 'modos-cuadro', [
        icon,
        crear('strong', 'modos-nombre', [t(titulo)]),
        crear('small', 'modos-desc', [t(descripcion)]),
      ]);
      b.type = 'button';
      b.dataset.modo = modo;
      // Con el teclado, enfocar un cuadrante lo elige (Robi lo describe). El ratón no lo enfoca: elige señalando.
      b.addEventListener('focus', () => {
        if (esVisible) seleccionar(modo);
      });
      b.addEventListener('mousedown', (ev) => ev.preventDefault());
      // Con el teclado, Enter entra al momento. Espacio confirma la opción elegida (ver aplaudir).
      b.addEventListener('keydown', (ev) => {
        if (ev.code !== 'Enter' && ev.code !== 'NumpadEnter') return;
        ev.preventDefault();
        elegirModo(modo);
      });
      // El clic de ratón no entra: elegir es señalar hasta que se llene el anillo.
      b.addEventListener('click', (ev) => ev.preventDefault());
      return crear('div', `modos-celda modos-celda--${modo}`, [b]);
    });
    // Triángulo que une los centros de los tres cuadrantes: (25 %, 25 %), (75 %, 25 %) y (50 %, 75 %).
    const triangulo = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    triangulo.setAttribute('class', 'modos-triangulo');
    triangulo.setAttribute('viewBox', '0 0 100 100');
    triangulo.setAttribute('preserveAspectRatio', 'none');
    triangulo.setAttribute('aria-hidden', 'true');
    triangulo.innerHTML =
      '<polygon points="25,25 75,25 50,75" /><circle cx="25" cy="25" r="0.9" /><circle cx="75" cy="25" r="0.9" /><circle cx="50" cy="75" r="0.9" />';
    const insignia = crear('div', 'modos-insignia', [crear('span', 'modos-insignia-icono'), crear('b', '', [t('modos_marco_titulo')]), crear('i', '', [t('modos_marco_sub')])]);
    (insignia.firstChild as HTMLElement).innerHTML = ICONO_BUGGY;
    const cabecera = crear('header', 'modos-cabecera', [insignia, crear('h2', 'modos-titulo', [t('modos_titulo')])]);
    const volver = crear('button', 'modos-volver', ['← ', t('volver_museo')]);
    volver.type = 'button';
    volver.addEventListener('click', () => elegirModo('volver'));
    // Para saber más del LRV: la ficha de la NSSDC (NASA), en otra pestaña. Se abre con clic (señalar no abre pestañas:
    // el navegador las bloquea si no hay un clic de verdad).
    const enlace = crear('a', 'modos-mas-info-enlace', [t('modos_mas_info_enlace'), ' ↗']);
    enlace.href = URL_NSSDC_LRV;
    enlace.target = '_blank';
    enlace.rel = 'noopener noreferrer';
    const masInfo = crear('p', 'modos-mas-info', [t('modos_mas_info'), ' ', enlace]);
    marco.replaceChildren(
      cabecera,
      crear('div', 'modos-rejilla', [triangulo, ...cuadros]),
      crear('p', 'modos-pista', [t('modos_pista')]),
      masInfo,
      volver,
    );
  }

  /** Cuadrante (modo) o botón de volver al museo que hay bajo un punto de pantalla, o null. */
  function modoBajo(x: number, y: number): ModoApp | 'volver' | null {
    const el = document.elementFromPoint(x, y);
    const cuadro = el?.closest<HTMLElement>('.modos-cuadro[data-modo]');
    if (cuadro) return cuadro.dataset.modo as ModoApp;
    return el?.closest('.modos-volver') ? 'volver' : null;
  }

  /** Punto que cuenta ahora: el dedo si la cámara lo ve señalando; si no, el ratón. */
  function puntoActual(): { x: number; y: number; senalando: boolean } | null {
    if (camara?.activo) return { x: camara.x, y: camara.y, senalando: true };
    if (raton) return { x: raton.x, y: raton.y, senalando: raton.pulsado };
    return null;
  }

  /**
   * Cada fotograma: si se mantiene señalado un cuadrante o el botón de volver al museo, el anillo se llena y, al
   * completarse, lo elige (el cuadrante queda elegido y Robi lo describe; el botón vuelve al museo).
   */
  function tick(): void {
    rafId = null;
    if (!esVisible) return;
    const punto = puntoActual();
    const ahora = performance.now();
    const bajo = punto ? modoBajo(punto.x, punto.y) : null;
    if (punto && punto.senalando && bajo !== null && (bajo === 'volver' || bajo !== elegido)) {
      if (candidato !== bajo) {
        candidato = bajo;
        inicioLlenadoMs = ahora;
      }
      const progreso = Math.min(1, (ahora - inicioLlenadoMs) / (SEGUNDOS_SENALAR * 1000));
      anillo.situar(punto);
      anillo.mostrar(progreso, 'clic');
      if (progreso >= 1) {
        if (bajo === 'volver') elegirModo('volver');
        else seleccionar(bajo);
      }
    } else {
      candidato = null;
      anillo.mostrar(null);
    }
    rafId = requestAnimationFrame(tick);
  }

  /** Marca en pantalla la opción elegida (las demás, no). */
  function marcarElegido(): void {
    for (const { modo } of MODOS) {
      const on = modo === elegido;
      marco.querySelector(`.modos-celda--${modo}`)?.classList.toggle('modos-celda--elegida', on);
      marco.querySelector(`.modos-celda--${modo} .modos-cuadro`)?.classList.toggle('modos-cuadro--elegido', on);
    }
  }

  /** Elige una opción (otra la cambia): se queda marcada y Robi la describe. Entra con aplauso o espacio. */
  function seleccionar(modo: ModoApp): void {
    elegido = modo;
    candidato = null;
    anillo.mostrar(null);
    anillo.situar(null);
    marcarElegido();
    oyenteSeleccionar(modo);
  }

  function aplaudir(): void {
    if (esVisible && elegido !== null) elegirModo(elegido);
  }

  function elegirModo(modo: ModoApp | 'volver'): void {
    if (!alElegir) return;
    // Una opción solo se entra cuando Robi ya dijo qué es (fijarExplicado); el botón de volver al museo, siempre.
    if (modo !== 'volver' && modo !== explicado) return;
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
    candidato = null;
    anillo.mostrar(null);
    anillo.situar(null);
    const fin = alElegir;
    alElegir = null;
    seccion.classList.add('inicio--saliendo');
    fondo.acelerar(1.6);
    window.setTimeout(() => {
      seccion.hidden = true;
      esVisible = false;
      fondo.detener();
      fin(modo);
    }, FUNDIDO_SALIDA_MS);
  }

  // El ratón señala con el botón izquierdo sostenido.
  seccion.addEventListener('pointermove', (ev) => {
    raton = { x: ev.clientX, y: ev.clientY, pulsado: raton?.pulsado ?? false };
  });
  seccion.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return;
    raton = { x: ev.clientX, y: ev.clientY, pulsado: true };
  });
  const soltar = (): void => {
    if (raton) raton = { ...raton, pulsado: false };
  };
  seccion.addEventListener('pointerup', soltar);
  seccion.addEventListener('pointercancel', soltar);
  seccion.addEventListener('pointerleave', () => {
    raton = null;
  });

  alCambiarIdioma(() => {
    if (esVisible) {
      pintar();
      marcarElegido();
    }
  });

  // Espacio confirma la opción elegida.
  window.addEventListener('keydown', (ev) => {
    if (!esVisible || ev.code !== 'Space' || ev.repeat) return;
    ev.preventDefault();
    aplaudir();
  });

  return {
    elegir() {
      pintar();
      elegido = null;
      explicado = null;
      marcarElegido();
      candidato = null;
      seccion.classList.remove('inicio--saliendo');
      seccion.hidden = false;
      esVisible = true;
      raton = null;
      camara = null;
      fondo.iniciar();
      rafId = requestAnimationFrame(tick);
      return new Promise((resolver) => {
        alElegir = resolver;
      });
    },
    alSeleccionar(oyente) {
      oyenteSeleccionar = oyente;
    },
    fijarExplicado(modo) {
      explicado = modo;
    },
    aplaudir,
    apuntarCamara(senal) {
      camara = senal?.tipo === 'cursor' && esVisible ? { x: senal.x * window.innerWidth, y: senal.y * window.innerHeight, activo: senal.activo } : null;
    },
  };
}
