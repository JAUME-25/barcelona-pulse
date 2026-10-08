import type { StationItem } from '../../api/client';
import { addDays, localParts } from '../history/time';

// Altas y bajas (B5): cuándo la fuente empezó o dejó de publicar una estación, dentro de lo
// importado. La API da la primera y la última publicación de cada estación (`firstSeenAt`,
// `lastSeenAt`); aquí se cruzan con los días importados y solo se afirma lo que un día importado
// anterior o posterior demuestra: en el primer día importado todas las estaciones «aparecen» y
// en el último todas «siguen», y eso no dice nada.

/** La fuente empezó a publicar la estación dentro de lo importado. */
export interface Appearance {
  /** Primera publicación. La hora es la del primer listado que la trae. */
  at: string;
  /** Su día de Barcelona. */
  day: string;
  /** El último día importado anterior: ese día la fuente no la listaba. */
  absentOn: string;
  /** Entre `absentOn` y `day` hay días sin importar: pudo aparecer en cualquiera de ellos. */
  gap: boolean;
}

/** La fuente dejó de publicar la estación dentro de lo importado. */
export interface Withdrawal {
  /** Último día de Barcelona en que la fuente la listó (se conoce el día, no la hora). */
  lastDay: string;
  /** El primer día importado posterior: ese día la fuente ya no la listaba. */
  absentFrom: string;
  /** Entre `lastDay` y `absentFrom` hay días sin importar: pudo salir en cualquiera de ellos. */
  gap: boolean;
}

export interface Lifecycle {
  appeared: Appearance | null;
  withdrawn: Withdrawal | null;
}

type Seen = Pick<StationItem, 'firstSeenAt' | 'lastSeenAt'>;

/** Día de Barcelona («2026-05-12») de un instante. */
export function localDayOf(iso: string): string {
  return localParts(Date.parse(iso)).date;
}

/** Alta y baja de una estación según los días importados (`SourceSummary.days`, en orden). */
export function lifecycleOf(station: Seen, days: readonly string[]): Lifecycle {
  const firstDay = localDayOf(station.firstSeenAt);
  const lastDay = localDayOf(station.lastSeenAt);
  const before = days.filter((d) => d < firstDay).at(-1);
  const after = days.find((d) => d > lastDay);
  return {
    appeared:
      before === undefined
        ? null
        : {
            at: station.firstSeenAt,
            day: firstDay,
            absentOn: before,
            gap: addDays(before, 1) !== firstDay,
          },
    withdrawn:
      after === undefined
        ? null
        : { lastDay, absentFrom: after, gap: addDays(lastDay, 1) !== after },
  };
}

/** Si en el momento mostrado la fuente aún no publicaba la estación, su alta. */
export function notYetListed(lifecycle: Lifecycle, at: string): Appearance | null {
  const appeared = lifecycle.appeared;
  return appeared !== null && Date.parse(at) < Date.parse(appeared.at) ? appeared : null;
}

/** Si en el momento mostrado la fuente ya no publicaba la estación, su baja. */
export function noLongerListed(lifecycle: Lifecycle, at: string): Withdrawal | null {
  const withdrawn = lifecycle.withdrawn;
  return withdrawn !== null && localDayOf(at) > withdrawn.lastDay ? withdrawn : null;
}

export interface StationAppearance {
  station: StationItem;
  appeared: Appearance;
}

export interface StationWithdrawal {
  station: StationItem;
  withdrawn: Withdrawal;
}

/** Las altas y las bajas de unas estaciones, por fecha y después por nombre. */
export function lifecycles(
  stations: readonly StationItem[],
  days: readonly string[],
): { appeared: StationAppearance[]; withdrawn: StationWithdrawal[] } {
  const appeared: StationAppearance[] = [];
  const withdrawn: StationWithdrawal[] = [];
  for (const station of stations) {
    const lifecycle = lifecycleOf(station, days);
    if (lifecycle.appeared !== null) appeared.push({ station, appeared: lifecycle.appeared });
    if (lifecycle.withdrawn !== null) withdrawn.push({ station, withdrawn: lifecycle.withdrawn });
  }
  appeared.sort(
    (a, b) =>
      a.appeared.at.localeCompare(b.appeared.at) || a.station.name.localeCompare(b.station.name),
  );
  withdrawn.sort(
    (a, b) =>
      a.withdrawn.lastDay.localeCompare(b.withdrawn.lastDay) ||
      a.station.name.localeCompare(b.station.name),
  );
  return { appeared, withdrawn };
}
