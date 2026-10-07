import { api, toApiError, type IngestionItem, type SourceSummary } from '../../api/client';
import { t } from '../../i18n';
import { useRemote } from '../stations/useStationData';

// «Qué muestra y qué no», «Los datos»: lo que entró de verdad en cada importación, día a día,
// según el registro de la ingesta (ingestion_runs e ingestion_rejections), no una estimación.

/** Las importaciones de un mismo periodo (normalmente un día), sumadas. */
export interface DayIngestion {
  key: string;
  /** Días de Barcelona que cubre («2026-05-04»…); casi siempre uno. */
  days: string[];
  runs: number;
  accepted: number;
  duplicate: number;
  conflicting: number;
  rejected: number;
  /** Alguna importación del periodo acabó fallida. */
  failed: boolean;
  /** Sus días se quitaron con `purge` y no se han vuelto a importar. */
  purged: boolean;
}

export interface IngestionTotals {
  periods: number;
  runs: number;
  accepted: number;
  duplicate: number;
  conflicting: number;
  rejected: number;
  failed: number;
  purged: number;
}

export interface RejectionReason {
  recordKind: string;
  reason: string;
  count: number;
}

/** Las importaciones agrupadas por el periodo que cubren, en orden de periodo. */
export function byDay(items: readonly IngestionItem[]): DayIngestion[] {
  const rows = new Map<string, DayIngestion & { live: boolean }>();
  for (const i of items) {
    const key = i.days.join(',');
    let row = rows.get(key);
    if (row === undefined) {
      row = {
        key,
        days: i.days,
        runs: 0,
        accepted: 0,
        duplicate: 0,
        conflicting: 0,
        rejected: 0,
        failed: false,
        purged: false,
        live: false,
      };
      rows.set(key, row);
    }
    row.runs += 1;
    row.accepted += i.observationsAccepted;
    row.duplicate += i.observationsDuplicate;
    row.conflicting += i.observationsConflicting;
    row.rejected += i.observationsRejected + i.stationsRejected;
    if (i.status === 'failed') row.failed = true;
    // Un periodo sigue si alguna importación suya no se ha purgado.
    if (i.purgedAt === null && i.status !== 'failed') row.live = true;
  }
  return [...rows.values()]
    .map(({ live, ...row }) => ({ ...row, purged: !live && row.runs > 0 && !row.failed }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

export function ingestionTotals(rows: readonly DayIngestion[]): IngestionTotals {
  const totals: IngestionTotals = {
    periods: rows.length,
    runs: 0,
    accepted: 0,
    duplicate: 0,
    conflicting: 0,
    rejected: 0,
    failed: 0,
    purged: 0,
  };
  for (const r of rows) {
    totals.runs += r.runs;
    totals.accepted += r.accepted;
    totals.duplicate += r.duplicate;
    totals.conflicting += r.conflicting;
    totals.rejected += r.rejected;
    if (r.failed) totals.failed += 1;
    if (r.purged) totals.purged += 1;
  }
  return totals;
}

/** Los rechazos de todas las importaciones, por tipo de registro y motivo, de más a menos. */
export function rejectionsByReason(items: readonly IngestionItem[]): RejectionReason[] {
  const groups = new Map<string, RejectionReason>();
  for (const i of items) {
    for (const r of i.rejections) {
      const key = `${r.recordKind}\u0000${r.reason}`;
      const group = groups.get(key);
      if (group === undefined) {
        groups.set(key, { recordKind: r.recordKind, reason: r.reason, count: r.count });
      } else {
        group.count += r.count;
      }
    }
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
}

/** «recuento negativo» o, si el motivo no se conoce, tal como lo da la API. */
export function reasonLabel(reason: string): string {
  return t().limits.rejectionReason[reason] ?? reason;
}

export function useIngestions(source: SourceSummary | undefined) {
  const id = source?.id ?? null;
  return useRemote<IngestionItem[]>(id === null ? null : `ingestions:${id}`, async (signal) => {
    const { data, error, response } = await api.GET('/api/sources/{id}/ingestions', {
      params: { path: { id: id ?? '' } },
      signal,
    });
    if (data === undefined) throw toApiError(error, response);
    return data.ingestions;
  });
}
