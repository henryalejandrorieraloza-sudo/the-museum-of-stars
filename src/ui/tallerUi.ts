// Interfaz del taller 3D del LRV (visual/tallerLRV.ts): paneles claros alrededor del modelo sobre el fondo blanco, como en
// las referencias. Cabecera, estado, datos de la NSSDC, subsistemas (clic para aislar uno), visualización, el registro con el
// botón "Desarmar / Armar" y, al elegir una pieza, su tarjeta con nombre y función unida a la pieza por una línea guía.
// Teclas: D desarma o arma, F enfoca y M vuelve al menú (la cámara la lleva tallerLRV.ts).

import { alCambiarIdioma, t, type ClaveTexto } from '../i18n';
import { GRUPOS_LRV, claveFuncionPieza, claveGrupo, claveNombrePieza, infoPieza, type GrupoLRV } from '../game/piezasLRV';
import type { EstadoDesarme } from '../game/desarmeLRV';
import type { EstadoTaller, TallerVisual } from '../visual/tallerLRV';
import { requireEl } from './dom';

export interface TallerUi {
  /** Muestra el taller y enlaza la interfaz con su escena. */
  abrir(taller: TallerVisual): void;
  /** Lo oculta (la escena la suelta quien llama). */
  cerrar(): void;
  /** El jugador pide volver al menú (botón o tecla M). */
  alSalir(oyente: () => void): void;
  readonly abierto: boolean;
}

const ESTADOS: Record<EstadoDesarme, ClaveTexto> = {
  armado: 'taller_estado_armado',
  desarmando: 'taller_estado_desarmando',
  desarmado: 'taller_estado_desarmado',
  armando: 'taller_estado_armando',
};

/** Datos de la NSSDC ("The Apollo Lunar Roving Vehicle"), con la clave de su etiqueta. */
const DATOS: [ClaveTexto, string][] = [
  ['taller_masa', '210 kg'],
  ['taller_largo', '3.1 m'],
  ['taller_batalla', '2.3 m'],
  ['taller_altura', '1.14 m'],
  ['taller_carga', '490 kg'],
];
const ENERGIA: [ClaveTexto, string][] = [
  ['taller_baterias', '2 × 36 V · 121 Ah'],
  ['taller_motores', '4 × 0.25 hp'],
  ['taller_reductor', '80 : 1'],
  ['taller_radio_giro', '3.1 m'],
];

function crear<K extends keyof HTMLElementTagNameMap>(tag: K, clase = '', hijos: (Node | string)[] = []): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (clase) el.className = clase;
  el.append(...hijos);
  return el;
}

const NS = 'http://www.w3.org/2000/svg';

export function crearTallerUi(): TallerUi {
  const raiz = requireEl('taller');
  let taller: TallerVisual | null = null;
  let salir: () => void = () => {};
  let abierto = false;
  let elegida: number | null = null;
  let grupoActivo: GrupoLRV | null = null;
  let giro = false;
  let arrastrando = false;
  let ultimo: EstadoTaller | null = null;

  // Referencias que se actualizan en cada fotograma.
  let valorEstado: HTMLElement;
  let boton: HTMLButtonElement;
  let barra: HTMLInputElement;
  let relleno: HTMLElement;
  let tarjeta: HTMLElement;
  let linea: SVGLineElement;
  let punto: SVGCircleElement;
  let svg: SVGSVGElement;
  let ultimaEtiqueta = '';

  function etiquetaBoton(estado: EstadoDesarme): string {
    const desarmar = estado === 'armado' || estado === 'armando';
    return `${t(desarmar ? 'taller_desarmar' : 'taller_armar')} · D`;
  }

  function panel(titulo: ClaveTexto, cuerpo: HTMLElement, num: string): HTMLElement {
    return crear('section', 'taller-panel', [crear('header', '', [crear('span', '', [t(titulo)]), crear('i', '', [num])]), cuerpo]);
  }

  function filas(datos: [ClaveTexto, string][]): HTMLElement {
    const ul = crear('dl', 'taller-datos');
    for (const [k, v] of datos) ul.append(crear('dt', '', [t(k)]), crear('dd', '', [v]));
    return ul;
  }

  function construir(): void {
    if (!taller) return;
    const tv = taller;
    // --- Cabecera
    const marca = crear('div', 'taller-marca');
    marca.innerHTML =
      '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M7 30h34M13 30v-9l6-5h10l5 6v8"/><circle cx="15" cy="34" r="4"/><circle cx="33" cy="34" r="4"/></svg><span>LRV-17</span>';
    const titulo = crear('div', 'taller-titulo', [crear('h1', '', [t('taller_titulo'), crear('em', '', [' /'])]), crear('p', '', [t('taller_subtitulo')])]);
    valorEstado = crear('b', '', [t(ESTADOS[ultimo?.estado ?? 'armado'])]);
    const estado = crear('div', 'taller-estado', [
      crear('span', '', [t('taller_estado'), valorEstado]),
      crear('span', '', [t('taller_piezas'), crear('b', '', [String(tv.cantidad)])]),
    ]);
    const volver = crear('button', 'taller-menu', ['← ', t('taller_menu'), ' · M']);
    volver.type = 'button';
    volver.addEventListener('click', () => salir());
    const cabecera = crear('header', 'taller-cabecera', [marca, titulo, estado, volver]);

    // --- Columna izquierda: datos de la NASA
    const fuente = crear('p', 'taller-fuente', [t('taller_fuente_nssdc')]);
    const izquierda = crear('aside', 'taller-columna taller-columna--izq', [
      panel('taller_datos', crear('div', '', [filas(DATOS), fuente]), '01'),
      panel('taller_energia', filas(ENERGIA), '02'),
    ]);

    // --- Columna derecha: tarjeta de pieza, subsistemas y visualización
    tarjeta = crear('section', 'taller-pieza');
    tarjeta.hidden = true;
    const conteo = new Map<GrupoLRV, number>();
    for (const c of tv.claves) conteo.set(infoPieza(c).grupo, (conteo.get(infoPieza(c).grupo) ?? 0) + 1);
    const lista = crear('ul', 'taller-lista');
    const todos = crear('li', grupoActivo === null ? 'activa' : '', [crear('span', '', [t('taller_todos')]), crear('b', '', [String(tv.cantidad)])]);
    todos.addEventListener('click', () => elegirGrupo(null));
    lista.append(todos);
    GRUPOS_LRV.forEach((g, i) => {
      const li = crear('li', grupoActivo === g ? 'activa' : '', [crear('i', '', [String(i + 1).padStart(2, '0')]), crear('span', '', [t(claveGrupo(g))]), crear('b', '', [String(conteo.get(g) ?? 0)])]);
      li.addEventListener('click', () => elegirGrupo(grupoActivo === g ? null : g));
      lista.append(li);
    });
    const chipDesarmar = crear('button', 'taller-chip', [t('taller_desarmar')]);
    chipDesarmar.type = 'button';
    chipDesarmar.addEventListener('click', () => tv.alternar());
    const chipGiro = crear('button', `taller-chip${giro ? ' activo' : ''}`, [t('taller_giro')]);
    chipGiro.type = 'button';
    chipGiro.addEventListener('click', () => {
      giro = !giro;
      tv.girar(giro);
      chipGiro.classList.toggle('activo', giro);
    });
    const derecha = crear('aside', 'taller-columna taller-columna--der', [
      tarjeta,
      panel('taller_subsistemas', lista, '03'),
      panel('taller_visualizacion', crear('div', 'taller-chips', [chipDesarmar, chipGiro]), '04'),
    ]);

    // --- Registro: botón y barra de avance del desarme
    boton = crear('button', 'taller-boton', [etiquetaBoton(ultimo?.estado ?? 'armado')]);
    boton.type = 'button';
    boton.addEventListener('click', () => tv.alternar());
    barra = crear('input', 'taller-barra');
    barra.type = 'range';
    barra.min = '0';
    barra.max = '1000';
    barra.value = String(Math.round((ultimo?.progreso ?? 0) * 1000));
    barra.setAttribute('aria-label', t('taller_registro'));
    barra.addEventListener('input', () => tv.fijarProgreso(Number(barra.value) / 1000));
    barra.addEventListener('pointerdown', () => (arrastrando = true));
    window.addEventListener('pointerup', () => (arrastrando = false));
    relleno = crear('span', 'taller-barra-relleno');
    const registro = crear('section', 'taller-registro', [
      crear('header', '', [crear('span', '', [t('taller_registro')]), crear('i', '', ['05'])]),
      crear('div', 'taller-registro-fila', [boton, crear('div', 'taller-barra-caja', [relleno, barra])]),
    ]);

    const ayuda = crear('p', 'taller-ayuda', [t('taller_ayuda')]);

    // --- Línea guía de la pieza a su tarjeta
    svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'taller-guia');
    linea = document.createElementNS(NS, 'line');
    punto = document.createElementNS(NS, 'circle');
    punto.setAttribute('r', '5');
    svg.append(linea, punto);
    svg.style.display = 'none';

    raiz.replaceChildren(svg, cabecera, izquierda, derecha, registro, ayuda);
    if (elegida !== null) mostrarTarjeta(elegida);
  }

  function elegirGrupo(g: GrupoLRV | null): void {
    grupoActivo = g;
    taller?.resaltarGrupo(g);
    raiz.querySelectorAll<HTMLElement>('.taller-lista li').forEach((li, i) => li.classList.toggle('activa', g === null ? i === 0 : i > 0 && GRUPOS_LRV[i - 1] === g));
  }

  function mostrarTarjeta(indice: number | null): void {
    elegida = indice;
    if (!taller || indice === null) {
      tarjeta.hidden = true;
      svg.style.display = 'none';
      return;
    }
    const clave = taller.claves[indice];
    const info = infoPieza(clave);
    const iguales = taller.claves.filter((c) => c === clave).length;
    const cerrar = crear('button', 'taller-pieza-cerrar', ['×']);
    cerrar.type = 'button';
    cerrar.setAttribute('aria-label', t('taller_cerrar'));
    cerrar.addEventListener('click', () => {
      taller?.seleccionar(null);
      mostrarTarjeta(null);
    });
    const sello = info.verificada
      ? crear('span', 'taller-sello taller-sello--ok', [t('taller_verificada', { fuente: info.fuente ?? 'NASA' })])
      : crear('span', 'taller-sello', [t('taller_pendiente')]);
    tarjeta.replaceChildren(
      crear('header', '', [crear('span', '', [t('taller_pieza'), ' · ', t(claveGrupo(info.grupo))]), cerrar]),
      crear('h2', '', [t(claveNombrePieza(clave))]),
      crear('h3', '', [t('taller_funcion')]),
      crear('p', '', [t(claveFuncionPieza(clave))]),
      crear('footer', '', [sello, crear('small', '', [t('taller_iguales', { n: String(iguales) })])]),
    );
    tarjeta.hidden = false;
  }

  function fotograma(e: EstadoTaller): void {
    ultimo = e;
    const etiqueta = `${e.estado}|${grupoActivo}`;
    if (etiqueta !== ultimaEtiqueta) {
      ultimaEtiqueta = etiqueta;
      valorEstado.textContent = t(ESTADOS[e.estado]);
      boton.textContent = etiquetaBoton(e.estado);
      raiz.dataset.estado = e.estado;
    }
    if (!arrastrando) barra.value = String(Math.round(e.progreso * 1000));
    relleno.style.width = `${e.progreso * 100}%`;
    // Línea guía: del centro de la pieza al borde izquierdo de la tarjeta.
    const s = e.seleccion;
    if (!s || !s.visible || tarjeta.hidden) {
      svg.style.display = 'none';
      return;
    }
    const r = tarjeta.getBoundingClientRect();
    svg.style.display = '';
    linea.setAttribute('x1', String(s.x));
    linea.setAttribute('y1', String(s.y));
    linea.setAttribute('x2', String(r.left));
    linea.setAttribute('y2', String(r.top + Math.min(40, r.height / 2)));
    punto.setAttribute('cx', String(s.x));
    punto.setAttribute('cy', String(s.y));
  }

  const alTecla = (ev: KeyboardEvent): void => {
    if (!abierto || !taller || ev.repeat || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (ev.target instanceof HTMLElement && ev.target.closest('input[type="text"], select, textarea')) return;
    if (ev.code === 'KeyD') taller.alternar();
  };
  window.addEventListener('keydown', alTecla);
  alCambiarIdioma(() => {
    if (!abierto) return;
    ultimaEtiqueta = '';
    construir();
  });

  return {
    abrir(tv) {
      taller = tv;
      abierto = true;
      elegida = null;
      grupoActivo = null;
      giro = false;
      ultimo = null;
      ultimaEtiqueta = '';
      raiz.hidden = false;
      construir();
      tv.alFotograma = fotograma;
      tv.alSeleccionar = (i) => mostrarTarjeta(i);
    },
    cerrar() {
      abierto = false;
      raiz.hidden = true;
      if (taller) {
        taller.alFotograma = () => {};
        taller.alSeleccionar = () => {};
      }
      taller = null;
    },
    alSalir(oyente) {
      salir = oyente;
    },
    get abierto() {
      return abierto;
    },
  };
}
