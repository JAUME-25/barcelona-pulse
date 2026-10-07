// Distancias en metros entre puntos de Barcelona. Las coordenadas llegan en WGS84 (grados) y los
// metros no se miden nunca sobre grados (ADR 0004): se proyectan a ETRS89 / UTM 31N (EPSG:25831),
// el sistema del Ajuntament y el de la cobertura en la API, con la serie de Krüger (la misma
// precisión que PostGIS, comprobada en las pruebas). Es «en línea recta», no a pie.

import { numberFormat } from '../../i18n/intl';

const A = 6378137;
const F = 1 / 298.257222101; // GRS80 (ETRS89); de WGS84 difiere menos de un milímetro.
const K0 = 0.9996;
const LON0 = (3 * Math.PI) / 180; // Huso 31
const FALSE_EASTING = 500_000;

const N = F / (2 - F);
const RADIUS = (A / (1 + N)) * (1 + N ** 2 / 4 + N ** 4 / 64);
const ALPHA = [
  N / 2 - (2 * N ** 2) / 3 + (5 * N ** 3) / 16,
  (13 * N ** 2) / 48 - (3 * N ** 3) / 5,
  (61 * N ** 3) / 240,
];

export interface Utm {
  /** Metros al este (x). */
  x: number;
  /** Metros al norte (y). */
  y: number;
}

/** Un punto WGS84 a EPSG:25831. */
export function toUtm31(longitude: number, latitude: number): Utm {
  const phi = (latitude * Math.PI) / 180;
  const dLambda = (longitude * Math.PI) / 180 - LON0;
  const sinPhi = Math.sin(phi);
  const k = (2 * Math.sqrt(N)) / (1 + N);
  const t = Math.sinh(Math.atanh(sinPhi) - k * Math.atanh(k * sinPhi));
  const xi = Math.atan2(t, Math.cos(dLambda));
  const eta = Math.atanh(Math.sin(dLambda) / Math.sqrt(1 + t * t));
  let east = eta;
  let north = xi;
  ALPHA.forEach((alpha, i) => {
    const j = 2 * (i + 1);
    east += alpha * Math.cos(j * xi) * Math.sinh(j * eta);
    north += alpha * Math.sin(j * xi) * Math.cosh(j * eta);
  });
  return { x: FALSE_EASTING + K0 * RADIUS * east, y: K0 * RADIUS * north };
}

/** Metros en línea recta entre dos puntos WGS84, medidos en EPSG:25831. */
export function distanceMeters(
  a: { longitude: number; latitude: number },
  b: { longitude: number; latitude: number },
): number {
  const p = toUtm31(a.longitude, a.latitude);
  const q = toUtm31(b.longitude, b.latitude);
  return Math.hypot(p.x - q.x, p.y - q.y);
}

/** «240 m» o «1,5 km», con el formato del idioma. */
export function formatDistance(
  meters: number,
  format: (n: number, digits: number) => string,
): string {
  const rounded = Math.round(meters);
  return rounded < 1000 ? `${format(rounded, 0)} m` : `${format(meters / 1000, 1)} km`;
}

/** «240 m» o «1,5 km» con las cifras del idioma de la interfaz. */
export function distanceLabel(meters: number): string {
  return formatDistance(meters, (n, digits) =>
    numberFormat({ minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n),
  );
}
