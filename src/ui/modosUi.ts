// Pantalla de modos, después de señalar el holograma del moon buggy y oír a Robi: arriba, «Elige cómo explorar» junto al moon
// buggy, y tres cuadrantes low poly cuyos centros forman un triángulo (dos arriba y uno abajo en el centro): historia del
// moon buggy, taller 3D y exploración libre, cada uno con su descripción breve. De fondo, un moon buggy recorre la Luna a lo lejos. Al pasar el cursor por un cuadrante (o enfocarlo con el teclado), Robi explica qué pasa si lo eliges;
// el clic entra. Sin números en pantalla. La voz y los subtítulos los pone juego.ts a través de `alExplorar`.

import { alCambiarIdioma, t, type ClaveTexto } from '../i18n';
import { crearFondoLunar, type FondoLunar } from './fondoLunar';
import { requireEl } from './dom';

export type ModoApp = 'historia' | 'taller' | 'libre';

export interface ModosUi {
  /** Muestra la pantalla y espera a que se elija un modo, o a que se pulse «Volver al museo» (devuelve 'volver'). */
  elegir(): Promise<ModoApp | 'volver'>;
  /** Robi debe explicar este modo (el cursor está encima o el cuadrante tiene el foco). */
  alExplorar(oyente: (modo: ModoApp) => void): void;
}

const FUNDIDO_SALIDA_MS = 600;
/** El cursor debe quedarse tanto sobre un cuadrante para que Robi lo explique (ms): así pasar de largo no lo activa. */
const RETRASO_EXPLICAR_MS = 350;

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

export function crearModosUi(): ModosUi {
  const seccion = requireEl('modos');
  const lienzo = crear('canvas', 'modos-fondo');
  lienzo.setAttribute('aria-hidden', 'true');
  const marco = crear('div', 'modos-marco');
  seccion.replaceChildren(lienzo, marco);
  const fondo: FondoLunar = crearFondoLunar(lienzo);

  let oyenteExplorar: (modo: ModoApp) => void = () => {};
  let alElegir: ((modo: ModoApp | 'volver') => void) | null = null;
  let temporizador: number | undefined;
  let esVisible = false;

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
      b.addEventListener('pointerenter', () => {
        window.clearTimeout(temporizador);
        temporizador = window.setTimeout(() => oyenteExplorar(modo), RETRASO_EXPLICAR_MS);
      });
      b.addEventListener('pointerleave', () => window.clearTimeout(temporizador));
      b.addEventListener('focus', () => oyenteExplorar(modo));
      b.addEventListener('click', () => elegirModo(modo));
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
    marco.replaceChildren(cabecera, crear('div', 'modos-rejilla', [triangulo, ...cuadros]), crear('p', 'modos-pista', [t('modos_pista')]), volver);
  }

  function elegirModo(modo: ModoApp | 'volver'): void {
    if (!alElegir) return;
    window.clearTimeout(temporizador);
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

  alCambiarIdioma(() => {
    if (esVisible) pintar();
  });

  return {
    elegir() {
      pintar();
      seccion.classList.remove('inicio--saliendo');
      seccion.hidden = false;
      esVisible = true;
      fondo.iniciar();
      (marco.querySelector('.modos-celda--historia .modos-cuadro') as HTMLElement | null)?.focus({ preventScroll: true });
      return new Promise((resolver) => {
        alElegir = resolver;
      });
    },
    alExplorar(oyente) {
      oyenteExplorar = oyente;
    },
  };
}
