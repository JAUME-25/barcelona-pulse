import type { CoverageResponse } from '../../api/client';
import { t } from '../../i18n';
import { numberFormat } from '../../i18n/intl';

const SHARE = { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 } as const;
const POINTS = {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: 'always',
} as const;
const KM2 = { minimumFractionDigits: 2, maximumFractionDigits: 2 } as const;
const M2 = { maximumFractionDigits: 0 } as const;

/** «56,0 %» */
export const formatShare = (value: number) => numberFormat(SHARE).format(value);
/** «101,70 km²» */
export const formatKm2 = (squareMeters: number) =>
  `${numberFormat(KM2).format(squareMeters / 1e6)} km²`;

/**
 * Superficie ganada o perdida: en km² si es grande y en m² si no, para que un cambio pequeño no
 * salga como «0,00 km²». La API ya la redondea al metro cuadrado.
 */
export function formatArea(squareMeters: number): string {
  if (squareMeters === 0) return '0 m²';
  if (squareMeters < 100) return t().scenario.lessThan100;
  if (squareMeters < 100_000) {
    return `${numberFormat(M2).format(Math.round(squareMeters / 100) * 100)} m²`;
  }
  return formatKm2(squareMeters);
}

/** «+0,35 puntos», «menos de 0,01 puntos» */
export function formatPoints(diffShare: number): string {
  const value = diffShare * 100;
  if (Math.abs(value) < 0.005) return t().scenario.lessThanAPoint;
  return t().scenario.points(numberFormat(POINTS).format(value));
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
    delta: direction === 'same' ? t().scenario.noChange : formatPoints(diff),
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
