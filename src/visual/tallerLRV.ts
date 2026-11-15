import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RelojDesarme, desplazamiento, planDeDesarme, type EstadoDesarme, type PlanPieza, type V3 } from '../game/desarmeLRV';
import { infoPieza, type GrupoLRV } from '../game/piezasLRV';
import { crearPiezasLRV, type PiezaLRV } from './lrv';

// Taller 3D del LRV: el vehículo flota sobre un fondo blanco y se desarma pieza por pieza (tecla D o botón). Cada
// primitiva del modelo es su propia malla (lrv.ts, crearPiezasLRV); la lógica del desarme está en game/desarmeLRV.ts.
// Aquí viven la escena, la cámara tipo TinkerCAD (OrbitControls de Three.js: arrastrar orbita, rueda acerca, Shift o
// clic derecho desplaza; sin zoom: la distancia es fija), el teclado de cámara y el clic sobre una pieza. Con el teclado la cámara se mueve por un
// «carril»: la distancia al vehículo es el radio y las flechas (o W A S, Q y E) la llevan a la derecha, a la izquierda,
// arriba o abajo sobre esa esfera, mirando siempre al centro; el radio no cambia nunca. D, F (centra la pieza elegida) y M
// los atiende la interfaz (ui/tallerUi.ts), porque D ya es "desarmar".

const FONDO = 0xf4f3ef;
/** Cian del borde de la pieza elegida. */
const CIAN = 0x19e6ff;
/** El suelo (solo recibe la sombra suave) está por debajo del modelo, que flota. */
const SUELO_Y = -2.5;
/**
 * Distancia fija de la cámara al objetivo (m): no hay zoom. Es la que deja entero el vehículo desarmado (que se abre unos
 * 3 m a cada lado del centro) entre los paneles laterales.
 */
const DISTANCIA_CAMARA = 11.8;
/** Límites de la cámara: altura y caja donde puede estar el objetivo. */
const ALTURA_MIN = SUELO_Y + 0.4;
const ALTURA_MAX = 10;
const CAJA_OBJETIVO = new THREE.Box3(new THREE.Vector3(-7, -2.2, -7), new THREE.Vector3(7, 4, 7));
/** Vista inicial: tres cuartos por delante y por encima. */
const DIRECCION_INICIAL = new THREE.Vector3(0.62, 0.34, 0.7).normalize();
/** Velocidad angular de la cámara con el teclado (rad/s): unos 60°/s. */
const VELOCIDAD_ORBITA_RAD_S = 1.05;
/** Ángulo mínimo al polo (rad): la cámara no pasa por encima ni por debajo del vehículo, donde la vista se voltea. */
const MARGEN_POLO = 0.12;
/** Un clic es un pulsar y soltar casi sin moverse (px) y sin tardar (ms). */
const CLIC_MAX_PX = 5;
const CLIC_MAX_MS = 450;
/** Opacidad de las piezas que no son del subsistema resaltado. */
const OPACIDAD_ATENUADA = 0.14;

/** Teclas de la cámara. La D no está: es "desarmar". */
const TECLAS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyQ', 'KeyE', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export interface SeleccionTaller {
  indice: number;
  clave: string;
  /** Posición en pantalla del centro de la pieza, en px dentro del lienzo. */
  x: number;
  y: number;
  /** El centro de la pieza cae dentro de la pantalla y delante de la cámara. */
  visible: boolean;
}

export interface EstadoTaller {
  estado: EstadoDesarme;
  /** 0–1 del reloj del desarme. */
  progreso: number;
  seleccion: SeleccionTaller | null;
}

export interface TallerVisual {
  /** Clase de cada pieza (índice → clave de piezasLRV.ts). */
  readonly claves: readonly string[];
  /** Cuántas piezas hay. */
  readonly cantidad: number;
  /** Se llama en cada fotograma con el estado (la interfaz lo pinta). */
  alFotograma: (estado: EstadoTaller) => void;
  /** Se llama al elegir o soltar una pieza con el clic (la interfaz abre o cierra su panel). */
  alSeleccionar: (indice: number | null) => void;
  activar(): void;
  desactivar(): void;
  /** Un fotograma: avanza el desarme y la cámara y dibuja. */
  render(dtS: number): void;
  ajustar(ancho: number, alto: number): void;
  /** Alterna armado ⇄ desarmado. */
  alternar(): void;
  /** Pone el desarme en `progreso` (0–1) a mano. */
  fijarProgreso(progreso: number): void;
  seleccionar(indice: number | null): void;
  /** Deja visibles solo las piezas de un subsistema (null = todas). */
  resaltarGrupo(grupo: GrupoLRV | null): void;
  /** Gira la cámara despacio alrededor del modelo. */
  girar(activo: boolean): void;
  /** Posición actual de una pieza (m, en el mundo del taller), para pruebas. */
  posicionPieza(indice: number): THREE.Vector3;
  /** Posición de montaje de una pieza (m, en el mundo del taller), para pruebas. */
  posicionBase(indice: number): THREE.Vector3;
  /** Pone el desarme en armado o desarmado de golpe (pruebas y captura). */
  reiniciar(): void;
}

const _v = new THREE.Vector3();
const _hsl = { h: 0, s: 0, l: 0 };
const _c = new THREE.Color();

/**
 * Avivar los colores del modelo para el fondo blanco: el LRV está pintado para el cielo negro de la Luna (naranjas
 * quemados, blancos grises). Sube la luminosidad y la saturación de cada vértice; el matiz no cambia.
 */
function avivarColores(geo: THREE.BufferGeometry): void {
  const col = geo.getAttribute('color');
  for (let i = 0; i < col.count; i++) {
    _c.setRGB(col.getX(i), col.getY(i), col.getZ(i));
    _c.getHSL(_hsl);
    _c.setHSL(_hsl.h, Math.min(1, _hsl.s * 1.25), Math.min(1, _hsl.l * 1.55 + 0.04));
    col.setXYZ(i, _c.r, _c.g, _c.b);
  }
  col.needsUpdate = true;
}

export function crearTallerVisual(renderer: THREE.WebGLRenderer): TallerVisual {
  const piezas: PiezaLRV[] = crearPiezasLRV();
  for (const p of piezas) avivarColores(p.geo);
  const escena = new THREE.Scene();
  escena.background = new THREE.Color(FONDO);

  // Luces: cielo claro, sol con sombra suave y un relleno frío del otro lado.
  escena.add(new THREE.HemisphereLight(0xffffff, 0xd8d4cb, 1.8));
  const sol = new THREE.DirectionalLight(0xffffff, 2.1);
  sol.position.set(4.5, 9, 5.5);
  sol.castShadow = true;
  sol.shadow.mapSize.set(2048, 2048);
  sol.shadow.camera.left = -7;
  sol.shadow.camera.right = 7;
  sol.shadow.camera.top = 7;
  sol.shadow.camera.bottom = -7;
  sol.shadow.camera.near = 1;
  sol.shadow.camera.far = 30;
  sol.shadow.bias = -0.0006;
  sol.shadow.normalBias = 0.02;
  escena.add(sol);
  const relleno = new THREE.DirectionalLight(0xdfe9ff, 0.7);
  relleno.position.set(-6, 3, -4);
  escena.add(relleno);

  const suelo = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ color: 0x6b6256, opacity: 0.2 }));
  suelo.rotation.x = -Math.PI / 2;
  suelo.position.y = SUELO_Y;
  suelo.receiveShadow = true;
  escena.add(suelo);

  // Materiales: uno por acabado, y su versión atenuada para cuando se resalta un subsistema.
  const comun = { vertexColors: true, flatShading: true } as const;
  const materiales: Record<PiezaLRV['acabado'], THREE.MeshStandardMaterial> = {
    opaco: new THREE.MeshStandardMaterial({ ...comun, roughness: 0.78, metalness: 0.1 }),
    metal: new THREE.MeshStandardMaterial({ ...comun, roughness: 0.5, metalness: 0.5 }),
    satinado: new THREE.MeshStandardMaterial({ ...comun, roughness: 0.55, metalness: 0.1 }),
    rejilla: new THREE.MeshStandardMaterial({ ...comun, roughness: 0.7, metalness: 0.2, transparent: true, opacity: 0.6, side: THREE.DoubleSide }),
  };
  const atenuados = Object.fromEntries(
    (Object.keys(materiales) as PiezaLRV['acabado'][]).map((k) => [
      k,
      new THREE.MeshStandardMaterial({ ...comun, roughness: 0.8, metalness: 0, transparent: true, opacity: OPACIDAD_ATENUADA, depthWrite: false }),
    ]),
  ) as Record<PiezaLRV['acabado'], THREE.MeshStandardMaterial>;

  // Centro del modelo: el de la caja que envuelve todas las piezas. El modelo se centra en el origen y flota.
  const caja = new THREE.Box3();
  for (const p of piezas) {
    caja.expandByPoint(_v.copy(p.centro).addScalar(p.radio));
    caja.expandByPoint(_v.copy(p.centro).addScalar(-p.radio));
  }
  const centroModelo = caja.getCenter(new THREE.Vector3());
  const planes: PlanPieza[] = planDeDesarme(
    piezas.map((p) => [p.centro.x, p.centro.y, p.centro.z] as V3),
    [centroModelo.x, centroModelo.y, centroModelo.z],
  );

  const modelo = new THREE.Group();
  escena.add(modelo);
  const mallas: THREE.Mesh[] = piezas.map((p) => {
    const m = new THREE.Mesh(p.geo, materiales[p.acabado]);
    m.position.copy(p.centro).sub(centroModelo);
    m.castShadow = p.acabado !== 'rejilla';
    m.receiveShadow = true;
    m.userData.indice = p.indice;
    modelo.add(m);
    return m;
  });
  const base = mallas.map((m) => m.position.clone());
  const claves = piezas.map((p) => infoPieza(p.clave).clave);
  const grupos = claves.map((c) => infoPieza(c).grupo);

  const camara = new THREE.PerspectiveCamera(38, 1, 0.05, 90);
  const lienzo = renderer.domElement;
  let controles: OrbitControls | null = null;
  const reloj = new RelojDesarme();

  // --- Selección ---------------------------------------------------------------------------------------------
  let elegida: number | null = null;
  let contorno: THREE.Group | null = null;
  let grupoResaltado: GrupoLRV | null = null;
  const rayo = new THREE.Raycaster();

  function quitarContorno(): void {
    if (!contorno) return;
    contorno.parent?.remove(contorno);
    contorno.traverse((o) => {
      if (o instanceof THREE.LineSegments) {
        o.geometry.dispose();
      }
    });
    contorno = null;
  }

  function seleccionar(indice: number | null): void {
    if (indice === elegida) return;
    if (elegida !== null) {
      const previa = mallas[elegida];
      previa.material = grupoResaltado !== null && grupos[elegida] !== grupoResaltado ? atenuados[piezas[elegida].acabado] : materiales[piezas[elegida].acabado];
    }
    quitarContorno();
    elegida = indice;
    if (indice === null) return;
    const malla = mallas[indice];
    const mat = (materiales[piezas[indice].acabado] as THREE.MeshStandardMaterial).clone();
    mat.emissive = new THREE.Color(CIAN);
    mat.emissiveIntensity = 0.28;
    malla.material = mat;
    // Borde cian: un casco algo más grande visto por dentro (se ve como contorno grueso) y las aristas marcadas.
    const g = new THREE.Group();
    const geo = piezas[indice].geo;
    geo.computeBoundingBox();
    const tam = geo.boundingBox!.getSize(new THREE.Vector3());
    const escala = (e: number): number => 1 + THREE.MathUtils.clamp(0.022 / Math.max(e, 1e-4), 0.03, 0.8);
    const casco = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: CIAN, side: THREE.BackSide, toneMapped: false }));
    casco.scale.set(escala(tam.x), escala(tam.y), escala(tam.z));
    g.add(casco);
    const bordes = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), new THREE.LineBasicMaterial({ color: CIAN, toneMapped: false }));
    g.add(bordes);
    malla.add(g);
    contorno = g;
  }

  function elegirDeTecho(indice: number | null): void {
    seleccionar(indice);
    api.alSeleccionar(indice);
  }

  function resaltarGrupo(grupo: GrupoLRV | null): void {
    grupoResaltado = grupo;
    mallas.forEach((m, i) => {
      if (i === elegida) return;
      m.visible = true;
      m.material = grupo !== null && grupos[i] !== grupo ? atenuados[piezas[i].acabado] : materiales[piezas[i].acabado];
      m.castShadow = piezas[i].acabado !== 'rejilla' && (grupo === null || grupos[i] === grupo);
    });
  }

  /** Pieza bajo un punto del lienzo (px), o null. Las atenuadas no se pueden elegir. */
  function piezaEn(px: number, py: number): number | null {
    const r = lienzo.getBoundingClientRect();
    rayo.setFromCamera(new THREE.Vector2(((px - r.left) / r.width) * 2 - 1, -(((py - r.top) / r.height) * 2 - 1)), camara);
    const candidatas = grupoResaltado === null ? mallas : mallas.filter((_, i) => grupos[i] === grupoResaltado);
    const golpes = rayo.intersectObjects(candidatas, false);
    for (const g of golpes) {
      const m = g.object as THREE.Mesh;
      if ((m.material as THREE.Material).transparent && (m.material as THREE.Material).opacity < 0.5 && piezas[m.userData.indice as number].acabado !== 'rejilla') continue;
      return m.userData.indice as number;
    }
    return null;
  }

  // --- Cámara y teclado --------------------------------------------------------------------------------------
  const pulsadas = new Set<string>();
  let punteroSucio = false;
  let ultimoPuntero = { x: 0, y: 0 };
  let pulso: { x: number; y: number; ms: number } | null = null;

  const alPulsar = (ev: KeyboardEvent): void => {
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (ev.target instanceof HTMLElement && ev.target.closest('input, select, textarea')) return;
    if (TECLAS.has(ev.code)) {
      pulsadas.add(ev.code);
      ev.preventDefault();
    }
  };
  const alSoltar = (ev: KeyboardEvent): void => {
    pulsadas.delete(ev.code);
  };
  const alPerderFoco = (): void => pulsadas.clear();
  const alBajar = (ev: PointerEvent): void => {
    if (ev.button !== 0) return;
    pulso = { x: ev.clientX, y: ev.clientY, ms: performance.now() };
  };
  const alSubir = (ev: PointerEvent): void => {
    if (ev.button !== 0 || !pulso) return;
    const p = pulso;
    pulso = null;
    if (Math.hypot(ev.clientX - p.x, ev.clientY - p.y) > CLIC_MAX_PX || performance.now() - p.ms > CLIC_MAX_MS) return;
    elegirDeTecho(piezaEn(ev.clientX, ev.clientY));
  };
  const alMover = (ev: PointerEvent): void => {
    ultimoPuntero = { x: ev.clientX, y: ev.clientY };
    punteroSucio = true;
  };

  const _desfase = new THREE.Vector3();
  const _derecha = new THREE.Vector3();
  const _arriba = new THREE.Vector3();
  const _esfera = new THREE.Spherical();

  /**
   * Mueve la cámara por la esfera cuyo radio es su distancia al objetivo: a la derecha con la flecha derecha, a la
   * izquierda con A o la flecha izquierda, arriba con W, E o la flecha de arriba y abajo con S, Q o la de abajo. La
   * distancia no cambia (solo la rueda la cambia).
   */
  function moverConTeclas(dtS: number): void {
    if (!controles || pulsadas.size === 0) return;
    const tecla = (a: string, b: string, c = ''): number => (pulsadas.has(a) || pulsadas.has(b) || (c !== '' && pulsadas.has(c)) ? 1 : 0);
    const lado = (pulsadas.has('ArrowRight') ? 1 : 0) - tecla('KeyA', 'ArrowLeft');
    const vertical = tecla('KeyW', 'ArrowUp', 'KeyE') - tecla('KeyS', 'ArrowDown', 'KeyQ');
    if (lado === 0 && vertical === 0) return;
    camara.updateMatrixWorld();
    _derecha.setFromMatrixColumn(camara.matrixWorld, 0);
    _arriba.setFromMatrixColumn(camara.matrixWorld, 1);
    _desfase.subVectors(camara.position, controles.target);
    const radio = _desfase.length();
    if (radio < 1e-6) return;
    const paso = VELOCIDAD_ORBITA_RAD_S * dtS * radio;
    // Un paso por la derecha y por arriba de la cámara, y de vuelta a la esfera: es un giro alrededor del objetivo.
    _desfase.addScaledVector(_derecha, lado * paso).addScaledVector(_arriba, vertical * paso).setLength(radio);
    _esfera.setFromVector3(_desfase);
    _esfera.phi = THREE.MathUtils.clamp(_esfera.phi, MARGEN_POLO, Math.PI - MARGEN_POLO);
    _desfase.setFromSpherical(_esfera);
    camara.position.copy(controles.target).add(_desfase);
  }

  function limitarCamara(): void {
    if (!controles) return;
    controles.target.clamp(CAJA_OBJETIVO.min, CAJA_OBJETIVO.max);
    camara.position.y = THREE.MathUtils.clamp(camara.position.y, ALTURA_MIN, ALTURA_MAX);
  }

  function reiniciarCamara(): void {
    camara.position.copy(DIRECCION_INICIAL).multiplyScalar(DISTANCIA_CAMARA);
    if (controles) {
      controles.target.set(0, 0, 0);
      controles.update();
    }
    camara.lookAt(0, 0, 0);
  }

  function proyectar(punto: THREE.Vector3): { x: number; y: number; visible: boolean } {
    _v.copy(punto).project(camara);
    const w = lienzo.clientWidth;
    const h = lienzo.clientHeight;
    return {
      x: ((_v.x + 1) / 2) * w,
      y: ((1 - _v.y) / 2) * h,
      visible: _v.z < 1 && Math.abs(_v.x) < 1.05 && Math.abs(_v.y) < 1.05,
    };
  }

  const api: TallerVisual = {
    claves,
    cantidad: piezas.length,
    alFotograma: () => {},
    alSeleccionar: () => {},
    activar() {
      if (controles) return;
      controles = new OrbitControls(camara, lienzo);
      controles.enableDamping = true;
      controles.dampingFactor = 0.09;
      // Sin zoom: la rueda no hace nada y la distancia queda fija (mínima = máxima).
      controles.enableZoom = false;
      controles.minDistance = DISTANCIA_CAMARA;
      controles.maxDistance = DISTANCIA_CAMARA;
      controles.maxPolarAngle = Math.PI * 0.93;
      controles.screenSpacePanning = true;
      controles.autoRotateSpeed = 1.4;
      window.addEventListener('keydown', alPulsar);
      window.addEventListener('keyup', alSoltar);
      window.addEventListener('blur', alPerderFoco);
      lienzo.addEventListener('pointerdown', alBajar);
      lienzo.addEventListener('pointerup', alSubir);
      lienzo.addEventListener('pointermove', alMover);
      reiniciarCamara();
    },
    desactivar() {
      controles?.dispose();
      controles = null;
      window.removeEventListener('keydown', alPulsar);
      window.removeEventListener('keyup', alSoltar);
      window.removeEventListener('blur', alPerderFoco);
      lienzo.removeEventListener('pointerdown', alBajar);
      lienzo.removeEventListener('pointerup', alSubir);
      lienzo.removeEventListener('pointermove', alMover);
      pulsadas.clear();
      lienzo.style.cursor = '';
    },
    render(dtS) {
      reloj.avanzar(dtS);
      for (let i = 0; i < mallas.length; i++) {
        const d = desplazamiento(planes[i], reloj.t);
        mallas[i].position.set(base[i].x + d[0], base[i].y + d[1], base[i].z + d[2]);
      }
      moverConTeclas(dtS);
      controles?.update(dtS);
      limitarCamara();
      camara.updateMatrixWorld();
      if (punteroSucio && pulso === null) {
        punteroSucio = false;
        lienzo.style.cursor = piezaEn(ultimoPuntero.x, ultimoPuntero.y) !== null ? 'pointer' : '';
      }
      renderer.render(escena, camara);
      let seleccion: SeleccionTaller | null = null;
      if (elegida !== null) {
        const p = proyectar(mallas[elegida].getWorldPosition(new THREE.Vector3()));
        seleccion = { indice: elegida, clave: claves[elegida], ...p };
      }
      api.alFotograma({ estado: reloj.estado, progreso: reloj.progreso, seleccion });
    },
    ajustar(ancho, alto) {
      camara.aspect = ancho / Math.max(1, alto);
      camara.updateProjectionMatrix();
    },
    alternar() {
      reloj.alternar();
    },
    fijarProgreso(p) {
      reloj.fijar(p);
    },
    seleccionar(indice) {
      seleccionar(indice);
    },
    resaltarGrupo,
    girar(activo) {
      if (controles) controles.autoRotate = activo;
    },
    posicionPieza(indice) {
      return mallas[indice].position.clone();
    },
    posicionBase(indice) {
      return base[indice].clone();
    },
    reiniciar() {
      reloj.fijar(0);
      seleccionar(null);
      resaltarGrupo(null);
      reiniciarCamara();
    },
  };
  return api;
}
