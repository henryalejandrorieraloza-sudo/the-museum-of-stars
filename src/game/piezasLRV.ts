// Catálogo de las piezas del LRV para el taller 3D: a qué subsistema pertenece cada clase de pieza y si su nombre y su
// función están confirmados con una fuente de la NASA. Los textos (nombre y función) están en src/i18n/*.json con las
// claves `pieza_<clave>_nombre` y `pieza_<clave>_funcion`; los subsistemas, en `grupo_<id>`.
//
// Verificación: "verificada" = el componente aparece en la NSSDC ("The Apollo Lunar Roving Vehicle",
// https://nssdc.gsfc.nasa.gov/planetary/lunar/apollo_lrv.html, consultada el 2026-11-14). El resto es genérico o
// forma propia del modelo y queda "pendiente" (// VERIFICAR). No se inventan números de catálogo.

import type { ClaveTexto } from '../i18n';

export type GrupoLRV = 'chasis' | 'ruedas' | 'traccion' | 'suspension' | 'guardabarros' | 'asientos' | 'mandos' | 'energia' | 'comunicaciones' | 'carga';

export interface InfoPiezaLRV {
  grupo: GrupoLRV;
  /** Nombre y función confirmados con una fuente de la NASA. */
  verificada: boolean;
  /** Fuente de la confirmación (solo si `verificada`). */
  fuente: string | null;
}

/** Subsistemas, en el orden en que se listan en el panel. */
export const GRUPOS_LRV: readonly GrupoLRV[] = ['chasis', 'ruedas', 'traccion', 'suspension', 'guardabarros', 'asientos', 'mandos', 'energia', 'comunicaciones', 'carga'];

export const PIEZAS_LRV: Readonly<Record<string, InfoPiezaLRV>> = {
  larguero: { grupo: 'chasis', verificada: true, fuente: 'NSSDC' },
  aligeramiento: { grupo: 'chasis', verificada: false, fuente: null },
  celosia: { grupo: 'chasis', verificada: false, fuente: null },
  bisagra: { grupo: 'chasis', verificada: true, fuente: 'NSSDC' },
  travesano: { grupo: 'chasis', verificada: false, fuente: null },
  piso: { grupo: 'chasis', verificada: false, fuente: null },
  malla: { grupo: 'ruedas', verificada: true, fuente: 'NSSDC' },
  chevrones: { grupo: 'ruedas', verificada: true, fuente: 'NSSDC' },
  ruedaCubo: { grupo: 'ruedas', verificada: true, fuente: 'NSSDC' },
  ruedaAroAluminio: { grupo: 'ruedas', verificada: true, fuente: 'NSSDC' },
  ruedaInterior: { grupo: 'ruedas', verificada: false, fuente: null },
  ruedaDisco: { grupo: 'ruedas', verificada: false, fuente: null },
  ruedaNervio: { grupo: 'ruedas', verificada: false, fuente: null },
  ruedaAro: { grupo: 'ruedas', verificada: false, fuente: null },
  ruedaPerno: { grupo: 'ruedas', verificada: false, fuente: null },
  motorTraccion: { grupo: 'traccion', verificada: true, fuente: 'NSSDC' },
  cajaArmonica: { grupo: 'traccion', verificada: true, fuente: 'NSSDC' },
  brazoDireccion: { grupo: 'traccion', verificada: false, fuente: null },
  horquilla: { grupo: 'suspension', verificada: true, fuente: 'NSSDC' },
  barraTorsion: { grupo: 'suspension', verificada: true, fuente: 'NSSDC' },
  amortiguador: { grupo: 'suspension', verificada: true, fuente: 'NSSDC' },
  guardabarros: { grupo: 'guardabarros', verificada: true, fuente: 'NSSDC' },
  extensionGuardabarros: { grupo: 'guardabarros', verificada: false, fuente: null },
  bordeGuardabarros: { grupo: 'guardabarros', verificada: false, fuente: null },
  rielGuardabarros: { grupo: 'guardabarros', verificada: false, fuente: null },
  remache: { grupo: 'guardabarros', verificada: false, fuente: null },
  soporteGuardabarros: { grupo: 'guardabarros', verificada: false, fuente: null },
  bandera: { grupo: 'guardabarros', verificada: false, fuente: null },
  asientoLona: { grupo: 'asientos', verificada: true, fuente: 'NSSDC' },
  asientoMarco: { grupo: 'asientos', verificada: true, fuente: 'NSSDC' },
  asientoRespaldo: { grupo: 'asientos', verificada: true, fuente: 'NSSDC' },
  asidero: { grupo: 'asientos', verificada: false, fuente: null },
  cinturon: { grupo: 'asientos', verificada: true, fuente: 'NSSDC' },
  reposapies: { grupo: 'asientos', verificada: true, fuente: 'NSSDC' },
  reposabrazos: { grupo: 'asientos', verificada: true, fuente: 'NSSDC' },
  mandoBase: { grupo: 'mandos', verificada: false, fuente: null },
  mando: { grupo: 'mandos', verificada: true, fuente: 'NSSDC' },
  interruptor: { grupo: 'mandos', verificada: true, fuente: 'NSSDC' },
  placaInterruptor: { grupo: 'mandos', verificada: false, fuente: null },
  consolaSoporte: { grupo: 'mandos', verificada: false, fuente: null },
  consola: { grupo: 'mandos', verificada: false, fuente: null },
  consolaPanel: { grupo: 'mandos', verificada: false, fuente: null },
  consolaInstrumento: { grupo: 'mandos', verificada: false, fuente: null },
  consolaInterruptor: { grupo: 'mandos', verificada: false, fuente: null },
  panelPotencia: { grupo: 'mandos', verificada: false, fuente: null },
  panelDireccion: { grupo: 'mandos', verificada: false, fuente: null },
  panelHabilitar: { grupo: 'mandos', verificada: false, fuente: null },
  consolaEmpunadura: { grupo: 'mandos', verificada: false, fuente: null },
  sombraSolar: { grupo: 'mandos', verificada: true, fuente: 'NSSDC' },
  baterias: { grupo: 'energia', verificada: true, fuente: 'NSSDC' },
  electronica: { grupo: 'energia', verificada: false, fuente: null },
  cable: { grupo: 'energia', verificada: false, fuente: null },
  lcru: { grupo: 'comunicaciones', verificada: true, fuente: 'NSSDC' },
  asaLCRU: { grupo: 'comunicaciones', verificada: false, fuente: null },
  panelLCRU: { grupo: 'comunicaciones', verificada: false, fuente: null },
  camaraCuerpo: { grupo: 'comunicaciones', verificada: true, fuente: 'NSSDC' },
  camaraPedestal: { grupo: 'comunicaciones', verificada: false, fuente: null },
  camaraControl: { grupo: 'comunicaciones', verificada: false, fuente: null },
  camaraLente: { grupo: 'comunicaciones', verificada: false, fuente: null },
  antenaMalla: { grupo: 'comunicaciones', verificada: true, fuente: 'NSSDC' },
  antenaMastil: { grupo: 'comunicaciones', verificada: true, fuente: 'NSSDC' },
  antenaNervadura: { grupo: 'comunicaciones', verificada: false, fuente: null },
  antenaCubo: { grupo: 'comunicaciones', verificada: false, fuente: null },
  antenaAlimentador: { grupo: 'comunicaciones', verificada: false, fuente: null },
  antenaBaja: { grupo: 'comunicaciones', verificada: false, fuente: null },
  portaCaja: { grupo: 'carga', verificada: false, fuente: null },
  portaPerforacion: { grupo: 'carga', verificada: false, fuente: null },
  cajaMuestras: { grupo: 'carga', verificada: false, fuente: null },
  portaMarco: { grupo: 'carga', verificada: false, fuente: null },
  pinzas: { grupo: 'carga', verificada: false, fuente: null },
  sinNombre: { grupo: 'carga', verificada: false, fuente: null },
};

/** Datos de una clase de pieza; las claves desconocidas caen en la pieza sin nombre (pendiente). */
export function infoPieza(clave: string): InfoPiezaLRV & { clave: string } {
  const c = Object.hasOwn(PIEZAS_LRV, clave) ? clave : 'sinNombre';
  return { clave: c, ...PIEZAS_LRV[c] };
}

export const claveNombrePieza = (clave: string): ClaveTexto => `pieza_${clave}_nombre` as ClaveTexto;
export const claveFuncionPieza = (clave: string): ClaveTexto => `pieza_${clave}_funcion` as ClaveTexto;
export const claveGrupo = (grupo: GrupoLRV): ClaveTexto => `grupo_${grupo}` as ClaveTexto;
