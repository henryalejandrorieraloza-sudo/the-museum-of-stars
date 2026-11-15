import { SEGUNDOS_SENALAR } from '../game/museo';
import type { AnilloUi } from './anillo';

// Botones que se pulsan señalándolos con el dedo, como los cuadrantes de la pantalla de modos (ui/modosUi.ts): sostener
// el dedo sobre un elemento con `data-boton-senalable` llena el anillo (SEGUNDOS_SENALAR) y, al completarse, lo pulsa. Para
// volver a empezar hay que mover el dedo fuera. Con ratón, el botón sigue funcionando como clic.

export interface SenalarBotones {
  /**
   * Cada fotograma. `punto` es el dedo en píxeles de pantalla si está señalando, o null. `ahoraS` en segundos.
   * Llena el anillo sobre el botón bajo el dedo y lo pulsa al completarse.
   */
  tick(punto: { x: number; y: number } | null, ahoraS: number): void;
}

/** Elemento `[data-boton-senalable]` visible bajo un punto de pantalla, o null. */
function botonBajo(x: number, y: number): HTMLElement | null {
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-boton-senalable]') ?? null;
  return el !== null && el.closest('[hidden]') === null ? el : null;
}

export function crearSenalarBotones(anillo: AnilloUi): SenalarBotones {
  let actual: HTMLElement | null = null;
  let inicioS = 0;
  /** Ya pulsado mientras el dedo siga sobre el mismo botón: no vuelve a pulsarlo. */
  let pulsado = false;
  /** El anillo de este helper está encendido: hay que apagarlo al soltar, sin tocar el de otras pantallas. */
  let mostrando = false;

  const apagar = (): void => {
    if (mostrando) {
      // El anillo es compartido (despliegue, recogida): se devuelve al centro para quien lo use después.
      anillo.situar(null);
      anillo.mostrar(null);
      mostrando = false;
    }
  };

  return {
    tick(punto, ahoraS) {
      const boton = punto ? botonBajo(punto.x, punto.y) : null;
      if (punto === null || boton === null) {
        actual = null;
        pulsado = false;
        apagar();
        return;
      }
      if (boton !== actual) {
        actual = boton;
        inicioS = ahoraS;
        pulsado = false;
      }
      if (pulsado) return;
      const progreso = Math.min(1, (ahoraS - inicioS) / SEGUNDOS_SENALAR);
      anillo.situar(punto);
      anillo.mostrar(progreso, 'clic');
      mostrando = true;
      if (progreso >= 1) {
        pulsado = true;
        apagar();
        boton.click();
      }
    },
  };
}
