// Fondo animado de la pantalla de modos: un moon buggy recorre, a lo lejos, el horizonte curvo de la Luna. Todo low poly:
// cielo en franjas planas, estrellas de rombo, la Tierra facetada, dos cordilleras de triángulos y un suelo de facetas
// que se aclara hacia el horizonte. Se pinta en un lienzo 2D (sin Three.js, para no tocar las escenas del museo): la parte
// quieta se dibuja una sola vez en un lienzo aparte y en cada vuelta solo se mueven las estrellas, el buggy y su polvo.
//
// Mismo contrato que el remolino de la pantalla de inicio: `iniciar` y `detener` (con `acelerar`, que aquí hace que el
// buggy corra más un momento, para la salida de la pantalla).

export interface FondoLunar {
  iniciar(): void;
  detener(): void;
  acelerar(segundos?: number): void;
}

/** Segundos que tarda el buggy en cruzar la pantalla. */
const PERIODO_CRUCE_S = 36;
const PPP_MAX = 2;

type P = readonly [number, number];

/** Azar con semilla: el mismo paisaje cada vez. */
function azar(semilla: number): () => number {
  let s = semilla >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function poligono(c: CanvasRenderingContext2D, puntos: readonly P[], color: string): void {
  c.beginPath();
  puntos.forEach(([x, y], i) => (i === 0 ? c.moveTo(x, y) : c.lineTo(x, y)));
  c.closePath();
  c.fillStyle = color;
  c.fill();
}

function octogono(cx: number, cy: number, r: number, giro = 0): P[] {
  return Array.from({ length: 8 }, (_, i) => {
    const a = giro + (i / 8) * Math.PI * 2;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r] as P;
  });
}

/** Mezcla `a` hacia `b` (0–1) y devuelve un color CSS. Los colores son [r, g, b]. */
function mezclar(a: readonly number[], b: readonly number[], t: number): string {
  const m = (i: number): number => Math.round(a[i] + (b[i] - a[i]) * t);
  return `rgb(${m(0)},${m(1)},${m(2)})`;
}

export function crearFondoLunar(lienzo: HTMLCanvasElement): FondoLunar {
  const ctx = lienzo.getContext('2d');
  const estatico = document.createElement('canvas');
  let ancho = 0;
  let alto = 0;
  let ppp = 1;
  let marco = 0;
  let tPrevioS = 0;
  let relojS = 0;
  let aceleradoHastaS = 0;
  let corriendo = false;
  let estrellas: { x: number; y: number; r: number; fase: number }[] = [];
  /** Polvo del buggy: triángulos que suben despacio y se apagan. */
  const polvo: { x: number; y: number; vx: number; vy: number; vida: number; r: number }[] = [];
  let proximoPolvoS = 0;

  /** Altura del horizonte (px) en la columna x: un arco, más alto en el centro. */
  const horizonte = (x: number): number => {
    const u = (x - ancho / 2) / (ancho / 2);
    return alto * 0.62 - alto * 0.07 * (1 - u * u);
  };

  function pintarEstatico(): void {
    estatico.width = Math.max(1, Math.round(ancho * ppp));
    estatico.height = Math.max(1, Math.round(alto * ppp));
    const c = estatico.getContext('2d');
    if (!c) return;
    c.setTransform(ppp, 0, 0, ppp, 0, 0);
    const rnd = azar(20261114);

    // Cielo en franjas planas, del negro del espacio al violeta del horizonte.
    const franjas = [
      [3, 2, 12],
      [8, 4, 24],
      [16, 8, 40],
      [28, 14, 62],
      [44, 22, 92],
      [64, 32, 120],
    ] as const;
    const altoCielo = alto * 0.7;
    franjas.forEach((f, i) => {
      c.fillStyle = `rgb(${f[0]},${f[1]},${f[2]})`;
      c.fillRect(0, (altoCielo * i) / franjas.length, ancho, altoCielo / franjas.length + 1);
    });

    // La Tierra, facetada: un hexágono de triángulos azules y verdes.
    const ex = ancho * 0.8;
    const ey = alto * 0.2;
    const er = Math.min(ancho, alto) * 0.07;
    const colores = ['#2f6fd6', '#245bb5', '#3f9a62', '#1f4a96', '#7fb3ff', '#2b7a54'];
    for (let i = 0; i < 6; i++) {
      const a0 = (i / 6) * Math.PI * 2 + 0.3;
      const a1 = ((i + 1) / 6) * Math.PI * 2 + 0.3;
      poligono(c, [[ex, ey], [ex + Math.cos(a0) * er, ey + Math.sin(a0) * er], [ex + Math.cos(a1) * er, ey + Math.sin(a1) * er]], colores[i]);
    }
    c.strokeStyle = 'rgba(160,200,255,0.35)';
    c.lineWidth = 1;
    c.stroke();

    // Dos cordilleras de facetas: la de atrás, más pálida y baja; la de delante, más oscura. Cada cima tiene un lado
    // iluminado y otro en sombra.
    const cordillera = (altura: number, claro: readonly number[], oscuro: readonly number[], paso: number): void => {
      const pts: P[] = [];
      for (let x = -paso; x <= ancho + paso; x += paso / 2) {
        const cima = pts.length % 2 === 0;
        pts.push([x, horizonte(x) - (cima ? altura * (0.4 + rnd() * 0.6) : altura * rnd() * 0.18)]);
      }
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        const sombra = i % 2 === 0;
        poligono(c, [a, b, [b[0], horizonte(b[0]) + 4], [a[0], horizonte(a[0]) + 4]], sombra ? mezclar(oscuro, [8, 4, 20], 0.3) : mezclar(claro, oscuro, 0.1));
      }
    };
    cordillera(alto * 0.13, [74, 52, 128], [52, 34, 100], ancho / 12);
    cordillera(alto * 0.075, [58, 40, 108], [38, 24, 80], ancho / 8);

    // Base oscura del suelo, para que el jitter de las facetas no deje huecos en el borde de abajo.
    c.beginPath();
    c.moveTo(0, alto + 2);
    for (let x = 0; x <= ancho; x += 8) c.lineTo(x, horizonte(x));
    c.lineTo(ancho, horizonte(ancho));
    c.lineTo(ancho, alto + 2);
    c.closePath();
    c.fillStyle = 'rgb(22,16,34)';
    c.fill();

    // Suelo: rejilla de facetas que sigue la curva del horizonte y se oscurece hacia abajo.
    const filas = 9;
    const cols = Math.ceil(ancho / 70) + 1;
    const claro = [118, 108, 128];
    const oscuro = [22, 16, 34];
    const punto = (i: number, j: number, jit: P): P => {
      const u = j / cols;
      const x = u * ancho + jit[0];
      const t = (i / filas) ** 1.7;
      const yh = horizonte(x);
      return [x, yh + t * (alto - yh) + jit[1]];
    };
    const rejilla: P[][] = [];
    for (let i = 0; i <= filas; i++) {
      const fila: P[] = [];
      for (let j = 0; j <= cols; j++) {
        const t = (i / filas) ** 1.7;
        const jit: P = i === 0 || j === 0 || j === cols ? [0, 0] : [(rnd() - 0.5) * 36 * (0.4 + t), (rnd() - 0.5) * 12 * (0.4 + t)];
        fila.push(punto(i, j, jit));
      }
      rejilla.push(fila);
    }
    for (let i = 0; i < filas; i++) {
      for (let j = 0; j < cols; j++) {
        const t = (i + 0.5) / filas;
        const a = rejilla[i][j];
        const b = rejilla[i][j + 1];
        const d = rejilla[i + 1][j + 1];
        const e = rejilla[i + 1][j];
        const luz = (rnd() - 0.5) * 0.22;
        poligono(c, [a, b, e], mezclar(claro, oscuro, Math.min(1, Math.max(0, t ** 0.8 + luz))));
        poligono(c, [b, d, e], mezclar(claro, oscuro, Math.min(1, Math.max(0, t ** 0.8 - luz))));
      }
    }
    // Línea del horizonte, apenas más clara.
    c.beginPath();
    for (let x = 0; x <= ancho; x += 8) (x === 0 ? c.moveTo : c.lineTo).call(c, x, horizonte(x));
    c.strokeStyle = 'rgba(200,180,255,0.28)';
    c.lineWidth = 1.5;
    c.stroke();
  }

  function recalcular(): void {
    ppp = Math.min(window.devicePixelRatio || 1, PPP_MAX);
    ancho = lienzo.clientWidth || window.innerWidth;
    alto = lienzo.clientHeight || window.innerHeight;
    lienzo.width = Math.max(1, Math.round(ancho * ppp));
    lienzo.height = Math.max(1, Math.round(alto * ppp));
    const rnd = azar(7);
    estrellas = Array.from({ length: 150 }, () => ({ x: rnd() * ancho, y: rnd() * alto * 0.55, r: 0.6 + rnd() * 1.6, fase: rnd() * Math.PI * 2 }));
    pintarEstatico();
  }

  /** El moon buggy de perfil, mirando a la derecha, en unidades de la batalla (1 = 2.3 m). Origen en el suelo, bajo el centro. */
  function buggy(c: CanvasRenderingContext2D, rodadura: number): void {
    const gris = '#bdb8aa';
    const grisOscuro = '#8d897d';
    const ambar = '#ffa63d';
    const cobre = '#c46f3c';
    const negro = '#16131f';
    // Chasis y piso
    poligono(c, [[-1.5, -0.62], [1.45, -0.62], [1.35, -0.4], [-1.4, -0.4]], gris);
    poligono(c, [[-1.4, -0.4], [1.35, -0.4], [1.3, -0.33], [-1.35, -0.33]], grisOscuro);
    // Asientos y mando
    poligono(c, [[-0.2, -0.62], [0.35, -0.62], [0.3, -1.02], [-0.1, -1.02]], ambar);
    poligono(c, [[0.35, -0.62], [0.7, -0.62], [0.6, -0.9], [0.4, -0.9]], cobre);
    poligono(c, [[0.78, -0.62], [0.84, -0.62], [0.9, -1.05], [0.84, -1.05]], gris);
    // Consola
    poligono(c, [[0.95, -0.62], [1.2, -0.62], [1.12, -1.12], [0.95, -1.1]], '#e5e3da');
    // Caja de electrónica y antena de alta ganancia en su mástil
    poligono(c, [[-1.45, -0.62], [-0.85, -0.62], [-0.88, -0.95], [-1.45, -0.95]], '#e5e3da');
    poligono(c, [[-1.45, -0.95], [-0.88, -0.95], [-1.0, -1.05], [-1.4, -1.05]], '#ffffff');
    c.beginPath();
    c.moveTo(-1.2, -1.0);
    c.lineTo(-1.18, -1.75);
    c.strokeStyle = grisOscuro;
    c.lineWidth = 0.05;
    c.stroke();
    poligono(c, [[-1.55, -1.95], [-0.8, -1.7], [-1.2, -1.6]], '#8d897d');
    poligono(c, [[-1.55, -1.95], [-1.2, -1.6], [-1.3, -1.78]], '#6d6a62');
    // Ruedas: guardabarros naranja y rueda de malla con sus radios
    for (const x of [-0.95, 0.95]) {
      poligono(c, [[x - 0.55, -0.55], [x - 0.42, -0.98], [x, -1.12], [x + 0.42, -0.98], [x + 0.55, -0.55], [x + 0.4, -0.55], [x, -0.9], [x - 0.4, -0.55]], ambar);
      poligono(c, [[x, -1.12], [x + 0.42, -0.98], [x + 0.55, -0.55], [x + 0.4, -0.55], [x + 0.3, -0.8]], cobre);
      poligono(c, octogono(x, -0.42, 0.42), negro);
      poligono(c, octogono(x, -0.42, 0.3, rodadura), '#3a3748');
      c.strokeStyle = '#9a96a8';
      c.lineWidth = 0.035;
      for (let k = 0; k < 4; k++) {
        const a = rodadura + (k / 4) * Math.PI;
        c.beginPath();
        c.moveTo(x - Math.cos(a) * 0.3, -0.42 - Math.sin(a) * 0.3);
        c.lineTo(x + Math.cos(a) * 0.3, -0.42 + Math.sin(a) * 0.3);
        c.stroke();
      }
      poligono(c, octogono(x, -0.42, 0.09), '#e5e3da');
    }
  }

  function vuelta(ahoraMs: number): void {
    if (!corriendo || !ctx) return;
    const ahoraS = ahoraMs / 1000;
    const dtS = Math.min(0.1, Math.max(0, ahoraS - tPrevioS));
    tPrevioS = ahoraS;
    const velocidad = ahoraS < aceleradoHastaS ? 5 : 1;
    relojS += dtS * velocidad;
    marco = requestAnimationFrame(vuelta);

    ctx.setTransform(ppp, 0, 0, ppp, 0, 0);
    ctx.drawImage(estatico, 0, 0, ancho, alto);

    // Estrellas de rombo que titilan.
    for (const e of estrellas) {
      const brillo = 0.45 + 0.55 * Math.sin(relojS * 1.6 + e.fase);
      ctx.fillStyle = `rgba(255,244,222,${(0.25 + 0.6 * brillo).toFixed(3)})`;
      poligono(ctx, [[e.x, e.y - e.r], [e.x + e.r, e.y], [e.x, e.y + e.r], [e.x - e.r, e.y]], ctx.fillStyle);
    }

    // El buggy cruza el horizonte, algo por delante de él, siguiendo la curva del suelo.
    const u = ((relojS / PERIODO_CRUCE_S) % 1.3) - 0.15;
    const x = u * ancho;
    const yBase = horizonte(x) + alto * 0.05;
    const dx = 6;
    const pendiente = (horizonte(x + dx) - horizonte(x - dx)) / (2 * dx);
    const escala = Math.min(ancho, alto) * 0.058;
    const rodadura = (relojS * 60 * 0.6) / (escala * 0.42);
    ctx.save();
    ctx.translate(x, yBase);
    ctx.rotate(Math.atan(pendiente));
    ctx.scale(escala, escala);
    // Con poca gravedad, el buggy rebota suave sobre el terreno.
    ctx.translate(0, -0.05 * Math.abs(Math.sin(relojS * 3.1)));
    buggy(ctx, rodadura);
    ctx.restore();

    // Polvo: triángulos que salen de las ruedas de atrás, suben y se apagan.
    if (relojS >= proximoPolvoS && u > -0.1 && u < 1.1) {
      proximoPolvoS = relojS + 0.07;
      polvo.push({ x: x - escala * 1.3, y: yBase - escala * 0.2, vx: -18 - Math.random() * 14, vy: -(6 + Math.random() * 10), vida: 1, r: escala * (0.1 + Math.random() * 0.12) });
      if (polvo.length > 40) polvo.shift();
    }
    for (let i = polvo.length - 1; i >= 0; i--) {
      const p = polvo[i];
      p.vida -= dtS * 0.9 * velocidad;
      if (p.vida <= 0) {
        polvo.splice(i, 1);
        continue;
      }
      p.x += p.vx * dtS;
      p.y += p.vy * dtS;
      p.vy += 12 * dtS;
      ctx.fillStyle = `rgba(190,176,214,${(p.vida * 0.5).toFixed(3)})`;
      poligono(ctx, [[p.x, p.y - p.r], [p.x + p.r, p.y + p.r], [p.x - p.r, p.y + p.r]], ctx.fillStyle);
    }
  }

  new ResizeObserver(() => {
    if (corriendo) recalcular();
  }).observe(lienzo);

  return {
    iniciar() {
      if (corriendo) return;
      corriendo = true;
      recalcular();
      tPrevioS = performance.now() / 1000;
      marco = requestAnimationFrame(vuelta);
    },
    detener() {
      corriendo = false;
      cancelAnimationFrame(marco);
    },
    acelerar(segundos = 1.2) {
      aceleradoHastaS = performance.now() / 1000 + segundos;
    },
  };
}
