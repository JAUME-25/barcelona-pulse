/**
 * La estación se dibuja como una manzana del Eixample: un cuadrado con chaflanes.
 * Misma geometría en el mapa (canvas) y en la interfaz (SVG).
 */
export const CHAMFER_RATIO = 0.28;

/** Altura llena del marcador «pocas bicis», desde abajo. */
export const LOW_FILL_LEVEL = 0.4;

type Point = [number, number];

/** Vértices de un octógono de lado `size` con origen en (x, y). */
export function octagonPoints(x: number, y: number, size: number): Point[] {
  const c = size * CHAMFER_RATIO;
  return [
    [x + c, y],
    [x + size - c, y],
    [x + size, y + c],
    [x + size, y + size - c],
    [x + size - c, y + size],
    [x + c, y + size],
    [x, y + size - c],
    [x, y + c],
  ];
}

/**
 * Parte inferior del octógono hasta `level` (fracción de la altura). Válido mientras el
 * corte caiga en los lados verticales, es decir, level ≤ 1 − 2 · CHAMFER_RATIO.
 */
export function octagonLowerPoints(x: number, y: number, size: number, level: number): Point[] {
  if (level > 1 - 2 * CHAMFER_RATIO) throw new RangeError('Nivel de llenado fuera del tramo recto');
  const c = size * CHAMFER_RATIO;
  const cut = y + size * (1 - level);
  return [
    [x, cut],
    [x + size, cut],
    [x + size, y + size - c],
    [x + size - c, y + size],
    [x + c, y + size],
    [x, y + size - c],
  ];
}

export function svgPath(points: Point[]): string {
  return (
    points
      .map(([px, py], i) => `${i === 0 ? 'M' : 'L'}${px.toFixed(2)} ${py.toFixed(2)}`)
      .join(' ') + ' Z'
  );
}

export function octagonSvgPath(x: number, y: number, size: number): string {
  return svgPath(octagonPoints(x, y, size));
}
