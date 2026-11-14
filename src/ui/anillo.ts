import { requireEl } from './dom';

export interface AnilloUi {
  /** Muestra el anillo lleno en `progreso` (0–1), o lo oculta con null. */
  mostrar(progreso: number | null): void;
  /** Lo que va dentro del anillo: la tecla E (teclado) o un puño cerrado (cámara). */
  fijarSimbolo(simbolo: 'tecla' | 'puno'): void;
}

/**
 * Anillo de "mantener" en el centro de la pantalla (desplegar el LRV con E, o con el puño cerrado en la cámara). Solo dibuja: el llenado y el
 * vaciado suave los calcula game/despliegueLRV.ts.
 */
export function crearAnillo(): AnilloUi {
  const el = requireEl('anillo');
  const arco = el.querySelector<SVGCircleElement>('.anillo-progreso');
  const largo = 2 * Math.PI * (arco?.r.baseVal.value ?? 20);
  if (arco) arco.style.strokeDasharray = `${largo}`;
  let anterior: number | null = null;
  return {
    fijarSimbolo(tipo) {
      el.dataset.simbolo = tipo;
    },
    mostrar(progreso) {
      const p = progreso === null ? null : Math.min(1, Math.max(0, progreso));
      if (p === anterior) return;
      anterior = p;
      el.hidden = p === null;
      // El trazo empieza arriba (rotate(-90)) y avanza en sentido horario.
      if (p !== null && arco) arco.style.strokeDashoffset = `${largo * (1 - p)}`;
    },
  };
}
