import { requireEl } from './dom';

export type SimboloAnillo = 'tecla' | 'puno' | 'clic';

export interface AnilloUi {
  /**
   * Muestra el anillo lleno en `progreso` (0–1), o lo oculta con null. `simbolo` cambia solo este dibujo (el clic de
   * señalar); sin él vuelve al símbolo fijado con `fijarSimbolo`.
   */
  mostrar(progreso: number | null, simbolo?: SimboloAnillo): void;
  /** Lo que va dentro del anillo por defecto: la tecla E (teclado) o un puño cerrado (cámara). */
  fijarSimbolo(simbolo: 'tecla' | 'puno'): void;
  /** Lo coloca en un punto de la pantalla (px); con null vuelve al centro. */
  situar(punto: { x: number; y: number } | null): void;
}

/**
 * Anillo de "mantener" en el centro de la pantalla (desplegar el LRV con E, o con el puño cerrado en la cámara; con
 * teclado, señalar una vitrina con el clic). Solo dibuja: el llenado y el vaciado suave los calcula game/despliegueLRV.ts.
 */
export function crearAnillo(): AnilloUi {
  const el = requireEl('anillo');
  const arco = el.querySelector<SVGCircleElement>('.anillo-progreso');
  const largo = 2 * Math.PI * (arco?.r.baseVal.value ?? 20);
  if (arco) arco.style.strokeDasharray = `${largo}`;
  let anterior: number | null = null;
  let base: SimboloAnillo = 'tecla';
  let actual: SimboloAnillo | null = null;
  return {
    fijarSimbolo(tipo) {
      base = tipo;
    },
    situar(punto) {
      el.style.left = punto ? `${punto.x}px` : '';
      el.style.top = punto ? `${punto.y}px` : '';
    },
    mostrar(progreso, simbolo = base) {
      const p = progreso === null ? null : Math.min(1, Math.max(0, progreso));
      if (p === anterior && simbolo === actual) return;
      anterior = p;
      if (simbolo !== actual) {
        actual = simbolo;
        el.dataset.simbolo = simbolo;
      }
      el.hidden = p === null;
      // El trazo empieza arriba (rotate(-90)) y avanza en sentido horario.
      if (p !== null && arco) arco.style.strokeDashoffset = `${largo * (1 - p)}`;
    },
  };
}
