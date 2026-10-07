// Formas de los datos que reciben los mensajes. Sin depender de los módulos de la aplicación:
// los mensajes no importan nada de ella y así no hay ciclos.

export type AvailabilityKey = 'available' | 'few' | 'empty' | 'full' | 'outOfService' | 'unknown';
/** Orden de la lista de estaciones (`features/stations/availability.ts`). */
export type ListOrderKey = 'name' | 'bikes' | 'docks' | 'ebikes' | 'distance';
export type StatusKey = 'in_service' | 'maintenance' | 'closed' | 'planned' | 'unknown';
export type CoverageKey = 'complete' | 'partial' | 'none';
export type SilenceKey = 'never' | 'days' | 'hours' | 'minutes';
export type ChangeKind = 'added' | 'moved' | 'removed';

/** Nombre y atribución de una fuente en otro idioma; en castellano manda la API. */
export type SourceTexts = Partial<Record<string, { name: string; attribution: string }>>;

export interface Origin {
  what: string;
  who: string;
  terms: string;
}

/** A qué horas de un día informó menos del 95 % de las estaciones. */
export interface GapInput {
  /** Ningún paso del día con dato. */
  allNone: boolean;
  /** «95 %» con el formato del idioma. */
  share: string;
  /** Tramos con la hora de inicio y la de fin (null si es un solo paso). */
  ranges: { from: string; to: string | null }[];
}

/** Sumas de las importaciones de una fuente; las cifras grandes ya con el formato del idioma. */
export interface IngestionTotalsInput {
  periods: number;
  runs: number;
  accepted: string;
  duplicate: string;
  conflicting: string;
  rejected: string;
  failed: number;
  purged: number;
}

/** Lo que hace falta para explicar por qué un escenario no mueve la superficie. */
export interface NoEffectInput {
  added: number;
  moved: number;
  removed: number;
  /** El área de estudio es Barcelona entera (si no, un distrito). */
  municipality: boolean;
  areaName: string;
  radius: number;
  /** Todas las nuevas quedan fuera del área de estudio. */
  addedOutside: boolean;
  /** Todas las quitadas estaban fuera del área de estudio. */
  removedOutside: boolean;
}
