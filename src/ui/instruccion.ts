import { requireEl } from './dom';

/** Símbolo que acompaña al texto: el pellizco de pulgar e índice (👌) con cámara, o ninguno. */
export type SimboloInstruccion = 'pellizco' | null;

export interface InstruccionUi {
  /**
   * Caja con lo que el jugador tiene que hacer ahora (texto ya en el idioma y control activos) y, si hace falta, el
   * símbolo del gesto. null la oculta.
   */
  mostrar(texto: string | null, simbolo?: SimboloInstruccion): void;
}

/**
 * Caja de instrucción (“Aprieta espacio…”): el paso que el juego espera del jugador. La decide juego.ts en cada
 * vuelta del bucle; el texto solo se cambia cuando cambia, para que la animación de entrada no se repita.
 */
export function crearInstruccion(): InstruccionUi {
  const caja = requireEl('instruccion');
  const texto = requireEl('instruccionTexto');
  const icono = requireEl('instruccionSimbolo');
  let actual: string | null = null;
  let simboloActual: SimboloInstruccion = null;

  return {
    mostrar(nuevo, simbolo = null) {
      if (nuevo === actual && simbolo === simboloActual) return;
      actual = nuevo;
      simboloActual = simbolo;
      caja.hidden = nuevo === null;
      texto.textContent = nuevo ?? '';
      icono.hidden = simbolo === null;
    },
  };
}
