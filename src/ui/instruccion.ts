import { requireEl } from './dom';

export interface InstruccionUi {
  /** Caja con lo que el jugador tiene que hacer ahora (texto ya en el idioma y control activos). null la oculta. */
  mostrar(texto: string | null): void;
}

/**
 * Caja de instrucción (“Aprieta espacio…”): el paso que el juego espera del jugador. La decide juego.ts en cada
 * vuelta del bucle; el texto solo se cambia cuando cambia, para que la animación de entrada no se repita.
 */
export function crearInstruccion(): InstruccionUi {
  const caja = requireEl('instruccion');
  const texto = requireEl('instruccionTexto');
  let actual: string | null = null;

  return {
    mostrar(nuevo) {
      if (nuevo === actual) return;
      actual = nuevo;
      caja.hidden = nuevo === null;
      texto.textContent = nuevo ?? '';
    },
  };
}
