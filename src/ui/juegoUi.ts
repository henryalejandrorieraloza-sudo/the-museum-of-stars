import { alCambiarIdioma, t } from '../i18n';
import { requireEl } from './dom';

/** Los subtítulos del mentor se ocultan como mucho a los 30 s (SPEC 7.2). */
const SUBTITULO_MAX_MS = 30_000;

export interface JuegoUi {
  /** Mensaje de encuadre, calibración o seguimiento. null lo oculta. */
  aviso(texto: string | null): void;
  /** Subtítulo del mentor. null lo oculta. */
  subtitulos(texto: string | null): void;
  /** True si hay un subtítulo en pantalla ahora mismo. */
  subtitulosVisibles(): boolean;
  /** Indicación “Aplaude para entrar”. null la oculta. No depende del temporizador de los subtítulos. */
  mostrarMision(titulo: string): void;
  /** Solo el botón «Volver al menú», sin título (misión lunar y exploración libre). */
  mostrarVolverMenu(): void;
  ocultarMision(): void;
}

/** Overlay DOM sobre la escena: avisos, subtítulos, y la pantalla temporal de misión. */
export function crearUi(onVolver: () => void): JuegoUi {
  const aviso = requireEl('aviso');
  const subtitulos = requireEl('subtitulos');
  const mision = requireEl('mision');
  const misionTitulo = requireEl('misionTitulo');
  const volver = requireEl<HTMLButtonElement>('volver');
  // Con cámara se pulsa señalándolo un tiempo (ui/botonesSenalables.ts), como los cuadrantes del menú.
  volver.dataset.botonSenalable = '';

  // Igual que el del taller 3D: con teclado también vuelve la M.
  const rotular = (): void => {
    volver.textContent = `← ${t('volver_menu')} · M`;
  };
  rotular();
  alCambiarIdioma(rotular);
  volver.addEventListener('click', onVolver);

  let temporizadorSubtitulos: number | undefined;

  return {
    aviso(texto) {
      aviso.textContent = texto ?? '';
      aviso.hidden = texto === null;
    },
    subtitulos(texto) {
      window.clearTimeout(temporizadorSubtitulos);
      subtitulos.textContent = texto ?? '';
      subtitulos.hidden = texto === null;
      if (texto !== null) {
        temporizadorSubtitulos = window.setTimeout(() => {
          subtitulos.hidden = true;
        }, SUBTITULO_MAX_MS);
      }
    },
    subtitulosVisibles() {
      return !subtitulos.hidden && subtitulos.textContent !== '';
    },
    mostrarMision(titulo) {
      misionTitulo.textContent = titulo;
      misionTitulo.hidden = false;
      mision.classList.remove('mision-solo-boton');
      mision.hidden = false;
    },
    mostrarVolverMenu() {
      misionTitulo.textContent = '';
      misionTitulo.hidden = true;
      mision.classList.add('mision-solo-boton');
      mision.hidden = false;
    },
    ocultarMision() {
      mision.hidden = true;
    },
  };
}
