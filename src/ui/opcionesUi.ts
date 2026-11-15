import {
  guardarOpciones,
  LARGO_MAX_NOMBRE,
  limpiarNombre,
  normalizarOpciones,
  RANGOS,
  type ModoControl,
  type Opciones,
} from '../game/opciones';
import { alCambiarIdioma, fijarIdioma, idioma, t, type ClaveTexto } from '../i18n';
import { requireEl } from './dom';

/** Opciones que se ajustan con un deslizador. */
type Deslizable = 'volumen' | 'sensibilidadCursor' | 'sensibilidadGiro' | 'metrosPorPaso' | 'sensibilidadRaton' | 'velocidadMax';

interface Deslizador {
  clave: Deslizable;
  etiqueta: ClaveTexto;
  paso: number;
}

/** Sonido: se ajusta con cualquier control. */
const SONIDO: Deslizador[] = [{ clave: 'volumen', etiqueta: 'opc_volumen', paso: 0.05 }];

/** Sensibilidad con cámara: lo que mueve el cuerpo. */
const SENSIBILIDAD_CAMARA: Deslizador[] = [
  { clave: 'sensibilidadCursor', etiqueta: 'opc_sensibilidad_mano', paso: 0.1 },
  { clave: 'sensibilidadGiro', etiqueta: 'opc_sensibilidad_giro', paso: 0.05 },
  { clave: 'metrosPorPaso', etiqueta: 'opc_sensibilidad_caminata', paso: 0.05 },
];

/** Sensibilidad con teclado y ratón: el giro con el ratón y la velocidad con W y S. */
const SENSIBILIDAD_TECLADO: Deslizador[] = [
  { clave: 'sensibilidadRaton', etiqueta: 'opc_sensibilidad_raton', paso: 0.1 },
  { clave: 'velocidadMax', etiqueta: 'opc_velocidad_max', paso: 0.1 },
];

/** Crea un elemento con atributos y hijos (sin innerHTML). */
function crear<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  hijos: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.append(...hijos);
  return el;
}

/** Control actual, nombre del viajero y qué hacer al cambiar cada uno. */
export interface ControlOpciones {
  modo: ModoControl;
  nombre: string;
  /** Pulsar "Cambiar control". */
  onCambiar: () => void;
  /** Recibe el nombre ya limpio y nunca vacío. */
  onNombre: (nombre: string) => void;
}

export interface OpcionesUi {
  abrir(): void;
  cerrar(): void;
  abierto(): boolean;
  /** Avisa cada vez que el panel se abre o se cierra (por ejemplo, para pausar el teclado). */
  onVisibilidad(oyente: (abierto: boolean) => void): void;
}

/**
 * Panel de opciones (SPEC 13): idioma, volumen, control, nombre y la sensibilidad del control elegido. Los cambios
 * se aplican al momento y se guardan. `onCambio` recibe siempre valores ya ajustados a su rango.
 */
export function crearOpcionesUi(actuales: Opciones, onCambio: (nuevas: Opciones) => void, control: ControlOpciones): OpcionesUi {
  const boton = requireEl<HTMLButtonElement>('opcionesBoton');
  const panel = requireEl('opciones');
  boton.textContent = t('opciones_boton');

  const oyentes: ((abierto: boolean) => void)[] = [];
  const estaAbierto = (): boolean => !panel.hidden;

  let ultimas = actuales;
  /** Nombre del viajero: no es una opción, pero se cambia en este mismo panel. */
  let nombre = control.nombre;

  const ponerVisible = (visible: boolean): void => {
    if (estaAbierto() === visible) return;
    // Al abrir, el panel se rehace con los valores actuales: algunos cambian fuera de él (la tecla C de los subtítulos).
    if (visible) {
      ultimas = actuales;
      montar();
    }
    panel.hidden = !visible;
    for (const oyente of oyentes) oyente(visible);
  };
  boton.addEventListener('click', () => ponerVisible(!estaAbierto()));

  const montar = (): void => {
    // Idioma: cambia en vivo, sin recargar. Los nombres de idioma no se traducen.
    const selectIdioma = crear('select', { id: 'opcIdioma' }, [
      crear('option', { value: 'es' }, ['Español']),
      crear('option', { value: 'en' }, ['English']),
    ]);
    selectIdioma.value = idioma();
    selectIdioma.addEventListener('change', () => fijarIdioma(selectIdioma.value === 'en' ? 'en' : 'es'));

    // Control (cámara o teclado): se cambia en la pantalla de inicio.
    const nombreControl = t(control.modo === 'teclado' ? 'inicio_control_teclado' : 'inicio_control_camara');
    const cambiarControl = crear('button', { type: 'button', class: 'opciones-control' }, [t('opc_cambiar_control')]);
    cambiarControl.addEventListener('click', control.onCambiar);

    // Nombre: se guarda al confirmar. Un nombre vacío no vale: vuelve el anterior.
    const campoNombre = crear('input', { type: 'text', id: 'opcNombre', maxlength: String(LARGO_MAX_NOMBRE), autocomplete: 'off' });
    campoNombre.value = nombre;
    campoNombre.addEventListener('change', () => {
      const limpio = limpiarNombre(campoNombre.value);
      if (limpio !== '') {
        nombre = limpio;
        control.onNombre(limpio);
      }
      campoNombre.value = nombre;
    });

    // Deslizadores: aplican el cambio mientras se arrastran.
    const inputs = new Map<Deslizable, HTMLInputElement>();
    const valores = new Map<Deslizable, HTMLSpanElement>();
    const deslizador = ({ clave, etiqueta, paso }: Deslizador): HTMLLabelElement => {
      const [min, max] = RANGOS[clave];
      const input = crear('input', { type: 'range', min: String(min), max: String(max), step: String(paso) });
      const valor = crear('span', { class: 'opciones-valor' });
      inputs.set(clave, input);
      valores.set(clave, valor);
      input.addEventListener('input', () => aplicar());
      return crear('label', {}, [t(etiqueta), crear('div', { class: 'opciones-deslizador' }, [input, valor])]);
    };

    const sensibilidad = control.modo === 'teclado' ? SENSIBILIDAD_TECLADO : SENSIBILIDAD_CAMARA;
    const campos: Node[] = [
      crear('label', {}, [t('opc_idioma'), selectIdioma]),
      ...SONIDO.map(deslizador),
      crear('div', { class: 'opciones-fila' }, [crear('span', {}, [t('opc_control', { modo: nombreControl })]), cambiarControl]),
      crear('label', {}, [t('opc_nombre'), campoNombre]),
      crear('h2', { class: 'opciones-grupo' }, [t('opc_sensibilidad_titulo')]),
      ...sensibilidad.map(deslizador),
    ];

    const cerrar = crear('button', { type: 'button' }, [t('opciones_cerrar')]);
    panel.replaceChildren(crear('h1', {}, [t('opciones_titulo')]), crear('div', { class: 'opciones-caja' }, [...campos, cerrar]));

    const mostrar = (o: Opciones): void => {
      for (const [clave, input] of inputs) {
        input.value = String(o[clave]);
        // Se lee de vuelta: el navegador ajusta el valor al paso del deslizador.
        const valor = valores.get(clave);
        if (valor) valor.textContent = formatear(clave, Number(input.value));
      }
    };

    const leer = (): Opciones => {
      // Solo cambian los deslizadores de este control; el resto de opciones conserva su valor guardado.
      const cambios: Partial<Record<Deslizable, number>> = {};
      for (const [clave, input] of inputs) cambios[clave] = Number(input.value);
      return normalizarOpciones({ ...ultimas, ...cambios });
    };

    const aplicar = (): void => {
      const nuevas = leer();
      guardarOpciones(nuevas);
      ultimas = nuevas;
      mostrar(nuevas);
      onCambio(nuevas);
    };

    cerrar.addEventListener('click', () => ponerVisible(false));
    mostrar(ultimas);
  };

  montar();
  alCambiarIdioma(() => {
    boton.textContent = t('opciones_boton');
    montar();
  });

  return {
    abrir: () => ponerVisible(true),
    cerrar: () => ponerVisible(false),
    abierto: estaAbierto,
    onVisibilidad: (oyente) => oyentes.push(oyente),
  };
}

/** Texto del valor de un deslizador: el volumen en porcentaje, el resto con dos decimales. */
function formatear(clave: Deslizable, v: number): string {
  return clave === 'volumen' ? `${Math.round(v * 100)}%` : v.toFixed(2);
}
