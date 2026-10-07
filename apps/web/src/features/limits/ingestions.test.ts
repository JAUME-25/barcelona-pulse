import { afterEach, describe, expect, it } from 'vitest';
import type { IngestionItem } from '../../api/client';
import { setLang, t } from '../../i18n';
import { byDay, ingestionTotals, reasonLabel, rejectionsByReason } from './ingestions';

function run(
  id: number,
  days: string[],
  counts: Partial<
    Pick<
      IngestionItem,
      | 'observationsAccepted'
      | 'observationsDuplicate'
      | 'observationsConflicting'
      | 'observationsRejected'
      | 'stationsRejected'
    >
  > = {},
  extra: Partial<Pick<IngestionItem, 'status' | 'purgedAt' | 'rejections'>> = {},
): IngestionItem {
  const from = `${days[0] ?? ''}T22:00:00+00:00`;
  return {
    id,
    startedAt: '2026-10-06T22:51:15+00:00',
    finishedAt: '2026-10-06T22:51:18+00:00',
    status: 'succeeded_with_issues',
    coveredFrom: from,
    coveredTo: from,
    days,
    purgedAt: null,
    stationsReceived: 548,
    stationsRejected: 0,
    stationVersionsCreated: 0,
    observationsReceived: 0,
    observationsAccepted: 0,
    observationsDuplicate: 0,
    observationsConflicting: 0,
    observationsRejected: 0,
    rejections: [],
    ...counts,
    ...extra,
  };
}

const items: IngestionItem[] = [
  run(2, ['2026-05-05'], { observationsAccepted: 155_109, observationsDuplicate: 731 }),
  run(
    1,
    ['2026-05-04'],
    {
      observationsAccepted: 155_309,
      observationsDuplicate: 1194,
      observationsConflicting: 169,
      observationsRejected: 2,
      stationsRejected: 1,
    },
    {
      rejections: [
        { recordKind: 'observation', reason: 'negative_count', count: 2 },
        { recordKind: 'station', reason: 'outside_service_area', count: 1 },
      ],
    },
  ),
  // El 4 de mayo otra vez: todo repetido.
  run(
    3,
    ['2026-05-04'],
    { observationsDuplicate: 156_503 },
    {
      status: 'succeeded',
      rejections: [{ recordKind: 'observation', reason: 'negative_count', count: 1 }],
    },
  ),
  // Un día purgado y otro que falló.
  run(4, ['2026-05-06'], { observationsAccepted: 100 }, { purgedAt: '2026-10-07T10:00:00+00:00' }),
  run(5, ['2026-05-07'], {}, { status: 'failed' }),
];

afterEach(() => {
  setLang('es');
});

describe('lo que entró cada día', () => {
  it('suma las importaciones de un mismo día y señala los días borrados y los fallidos', () => {
    const rows = byDay(items);
    expect(rows.map((r) => r.key)).toEqual([
      '2026-05-04',
      '2026-05-05',
      '2026-05-06',
      '2026-05-07',
    ]);
    expect(rows[0]).toMatchObject({
      runs: 2,
      accepted: 155_309,
      duplicate: 157_697,
      conflicting: 169,
      rejected: 3,
      failed: false,
      purged: false,
    });
    expect(rows[2]).toMatchObject({ runs: 1, accepted: 100, purged: true, failed: false });
    expect(rows[3]).toMatchObject({ runs: 1, failed: true, purged: false });
  });

  it('un día purgado y vuelto a importar no está borrado', () => {
    const rows = byDay([
      run(
        1,
        ['2026-05-06'],
        { observationsAccepted: 100 },
        { purgedAt: '2026-10-07T10:00:00+00:00' },
      ),
      run(2, ['2026-05-06'], { observationsAccepted: 100 }),
    ]);
    expect(rows[0]).toMatchObject({ runs: 2, accepted: 200, purged: false });
  });

  it('las sumas y la frase que las dice, en cada idioma', () => {
    const totals = ingestionTotals(byDay(items));
    expect(totals).toEqual({
      periods: 4,
      runs: 5,
      accepted: 310_518,
      duplicate: 158_428,
      conflicting: 169,
      rejected: 3,
      failed: 1,
      purged: 1,
    });
    const input = {
      periods: 4,
      runs: 5,
      accepted: '310.518',
      duplicate: '158.428',
      conflicting: '169',
      rejected: '3',
      failed: 1,
      purged: 1,
    };
    expect(t().limits.ingestionsLead(input)).toBe(
      '5 importaciones en 4 días: 310.518 observaciones nuevas, 158.428 repetidas, 169 en conflicto y 3 rechazadas. 1 día falló. 1 día borrado después.',
    );
    setLang('en');
    expect(t().limits.ingestionsLead({ ...input, failed: 0, purged: 0 })).toBe(
      '5 imports over 4 days: 310.518 new observations, 158.428 repeated, 169 conflicting and 3 rejected.',
    );
  });

  it('agrupa los rechazos de todas las importaciones por motivo, de más a menos', () => {
    expect(rejectionsByReason(items)).toEqual([
      { recordKind: 'observation', reason: 'negative_count', count: 3 },
      { recordKind: 'station', reason: 'outside_service_area', count: 1 },
    ]);
    expect(reasonLabel('negative_count')).toBe('recuento negativo');
    expect(reasonLabel('motivo_nuevo')).toBe('motivo_nuevo');
    expect(t().limits.rejectionLine(3, 'observation', reasonLabel('negative_count'))).toBe(
      '3 observaciones: recuento negativo',
    );
  });
});
