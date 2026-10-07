import type { StationVersionItem } from '../../api/client';
import { distanceMeters } from './distance';

// Los cambios de atributos de una estación en los días importados: la API guarda una versión por
// cada cambio de nombre, dirección, ubicación o capacidad (docs/data-model.md). Aquí se cuentan en
// orden y se dice qué cambió en cada una: es rigor que se ve.

/** Un cambio entre dos versiones consecutivas. */
export type VersionChange =
  | { kind: 'capacity'; from: number | null; to: number | null }
  | { kind: 'name'; from: string; to: string }
  | { kind: 'address'; from: string | null; to: string | null }
  | { kind: 'moved'; meters: number }
  | { kind: 'altitude'; from: number; to: number };

/** Una versión nueva: desde cuándo rige y qué cambió respecto a la anterior. */
export interface VersionStep {
  at: string;
  changes: VersionChange[];
}

/** Por debajo de esto, un cambio de ubicación es ruido de la fuente (la ingesta ya ignora ~1 cm). */
const MOVED_MIN_METERS = 1;

/**
 * Un cambio de altitud cuenta solo entre dos versiones que la publican: una versión guardada sin
 * ella (importada antes de leerla) no «subió» cuando la siguiente la trae.
 */
const ALTITUDE_MIN_METERS = 1;

/** En orden de vigencia: la primera conocida (sin `validFrom`) delante. */
export function sortVersions(versions: readonly StationVersionItem[]): StationVersionItem[] {
  return [...versions].sort((a, b) => {
    if (a.validFrom === null) return b.validFrom === null ? 0 : -1;
    if (b.validFrom === null) return 1;
    return Date.parse(a.validFrom) - Date.parse(b.validFrom);
  });
}

/** Qué cambió en cada versión nueva respecto a la anterior, de la más antigua a la más reciente. */
export function versionSteps(versions: readonly StationVersionItem[]): VersionStep[] {
  const sorted = sortVersions(versions);
  const steps: VersionStep[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const previous = sorted[i - 1];
    const next = sorted[i];
    if (previous === undefined || next === undefined) continue;
    const changes: VersionChange[] = [];
    if (previous.capacity !== next.capacity) {
      changes.push({ kind: 'capacity', from: previous.capacity, to: next.capacity });
    }
    if (previous.name !== next.name)
      changes.push({ kind: 'name', from: previous.name, to: next.name });
    if (previous.address !== next.address) {
      changes.push({ kind: 'address', from: previous.address, to: next.address });
    }
    const meters = distanceMeters(previous, next);
    if (meters >= MOVED_MIN_METERS) changes.push({ kind: 'moved', meters });
    if (
      previous.altitude !== null &&
      next.altitude !== null &&
      Math.abs(previous.altitude - next.altitude) >= ALTITUDE_MIN_METERS
    ) {
      changes.push({
        kind: 'altitude',
        from: Math.round(previous.altitude),
        to: Math.round(next.altitude),
      });
    }
    steps.push({ at: next.validFrom ?? next.firstSeenAt, changes });
  }
  return steps;
}
