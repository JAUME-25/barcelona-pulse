import type { CoverageResponse } from '../../api/client';

const share = new Intl.NumberFormat('es-ES', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const points = new Intl.NumberFormat('es-ES', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: 'always',
});
const km2 = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const m2 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 });

/** «56,0 %» */
export const formatShare = (value: number) => share.format(value);
/** «101,70 km²» */
export const formatKm2 = (squareMeters: number) => `${km2.format(squareMeters / 1e6)} km²`;

/**
 * Superficie ganada o perdida: en km² si es grande y en m² si no, para que un cambio pequeño no
 * salga como «0,00 km²». La API ya la redondea al metro cuadrado.
 */
export function formatArea(squareMeters: number): string {
  if (squareMeters === 0) return '0 m²';
  if (squareMeters < 100) return 'menos de 100 m²';
  if (squareMeters < 100_000) return `${m2.format(Math.round(squareMeters / 100) * 100)} m²`;
  return formatKm2(squareMeters);
}

/** «+0,35 puntos», «menos de 0,01 puntos» */
export function formatPoints(diffShare: number): string {
  const value = diffShare * 100;
  if (Math.abs(value) < 0.005) return 'menos de 0,01 puntos';
  return `${points.format(value)} puntos`;
}

export interface Figures {
  baseShare: string;
  scenarioShare: string;
  /** Diferencia en puntos porcentuales, con signo; «sin cambio» si no gana ni pierde nada. */
  delta: string;
  direction: 'up' | 'down' | 'same';
  gained: string;
  lost: string;
  baseStations: number;
  scenarioStations: number;
  areaName: string;
  areaSize: string;
  radius: number;
}

export function figuresOf(r: CoverageResponse): Figures {
  const { gainedSquareMeters: gained, lostSquareMeters: lost } = r.difference;
  const diff = r.scenario.coveredShare - r.base.coveredShare;
  // «Sin cambio» solo si no gana ni pierde nada; un cambio pequeño tiene su signo.
  const direction =
    gained === 0 && lost === 0 ? 'same' : gained > lost ? 'up' : gained < lost ? 'down' : 'same';
  return {
    baseShare: formatShare(r.base.coveredShare),
    scenarioShare: formatShare(r.scenario.coveredShare),
    delta: direction === 'same' ? 'sin cambio' : formatPoints(diff),
    direction,
    gained: formatArea(gained),
    lost: formatArea(lost),
    baseStations: r.base.stations,
    scenarioStations: r.scenario.stations,
    areaName: r.studyArea.name,
    areaSize: formatKm2(r.studyArea.areaSquareMeters),
    radius: r.radiusMeters,
  };
}
