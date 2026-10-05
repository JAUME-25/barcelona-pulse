import type { TimelinePoint } from '../../api/client';
import { coverageRuns } from './series';
import { localParts } from './time';

// Geometría de los relojes de 24 horas de la semana: las 00:00 arriba y en el sentido de las
// agujas. Dentro, estaciones sin bicis; fuera, llenas; las dos con la misma escala.

const TURN = 2 * Math.PI;

/** Ángulo de un instante en la esfera de 24 h, en hora de Barcelona. */
export function angleOf(at: string): number {
  const { hour, minute } = localParts(Date.parse(at));
  return ((hour * 60 + minute) / 1440) * TURN;
}

export interface DialShape {
  /** Centro (x e y) en unidades del SVG. */
  c: number;
  emptyR: number;
  fullR: number;
  /** Largo máximo de una barra, igual en las dos bandas. */
  band: number;
  /** Lo que ocupa un paso en la esfera. */
  stepAngle: number;
}

function polar(shape: DialShape, r: number, angle: number): [number, number] {
  return [shape.c + r * Math.sin(angle), shape.c - r * Math.cos(angle)];
}

const f = (n: number) => n.toFixed(2);

/**
 * Sector entre dos radios y dos ángulos: cada paso es un bloque y los contiguos se tocan, así la
 * banda se lee como una forma continua (las barras sueltas parecían un trazo discontinuo, que
 * aquí significa «sin datos»).
 */
function sector(shape: DialShape, r0: number, r1: number, a0: number, a1: number): string {
  if (r1 - r0 < 0.05) return '';
  const [x0, y0] = polar(shape, r0, a0);
  const [x1, y1] = polar(shape, r1, a0);
  const [x2, y2] = polar(shape, r1, a1);
  const [x3, y3] = polar(shape, r0, a1);
  const R0 = String(r0);
  const R1 = String(r1);
  return (
    `M${f(x0)} ${f(y0)}L${f(x1)} ${f(y1)}A${R1} ${R1} 0 0 1 ${f(x2)} ${f(y2)}` +
    `L${f(x3)} ${f(y3)}A${R0} ${R0} 0 0 0 ${f(x0)} ${f(y0)}Z`
  );
}

function arc(shape: DialShape, r: number, a0: number, a1: number): string {
  // Una vuelta entera no cabe en un solo arco de SVG: se parte en dos mitades.
  if (a1 - a0 >= TURN - 1e-6) {
    return `${arc(shape, r, 0, Math.PI)}${arc(shape, r, Math.PI, TURN)}`;
  }
  const [x0, y0] = polar(shape, r, a0);
  const [x1, y1] = polar(shape, r, a1);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${f(x0)} ${f(y0)}A${String(r)} ${String(r)} 0 ${String(large)} 1 ${f(x1)} ${f(y1)}`;
}

export interface DialPaths {
  empty: string;
  full: string;
  /** Circunferencias base donde hay dato. */
  rings: string;
  /** Y donde no lo hay: se dibujan discontinuas, porque sin datos no es cero. */
  gaps: string;
}

export function dialPaths(
  points: readonly TimelinePoint[],
  scale: number,
  shape: DialShape,
): DialPaths {
  let empty = '';
  let full = '';
  for (const p of points) {
    if (p.stationsWithData === 0) continue;
    const a0 = angleOf(p.at);
    const a1 = a0 + shape.stepAngle;
    const emptyTip = shape.emptyR + (p.stationsEmpty / scale) * shape.band;
    const fullTip = shape.fullR + (p.stationsFull / scale) * shape.band;
    empty += sector(shape, shape.emptyR, emptyTip, a0, a1);
    full += sector(shape, shape.fullR, fullTip, a0, a1);
  }
  let rings = '';
  let gaps = '';
  for (const run of coverageRuns(points)) {
    const first = points[run.from];
    const last = points[run.to];
    if (first === undefined || last === undefined) continue;
    const a0 = angleOf(first.at);
    const a1 = angleOf(last.at) + shape.stepAngle;
    const d = `${arc(shape, shape.emptyR, a0, a1)}${arc(shape, shape.fullR, a0, a1)}`;
    if (run.coverage === 'none') gaps += d;
    else rings += d;
  }
  return { empty, full, rings, gaps };
}
