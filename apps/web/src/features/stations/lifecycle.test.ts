import { describe, expect, it } from 'vitest';
import { stationFixture } from '../../test/fixtures';
import { lifecycleOf, lifecycles, localDayOf, noLongerListed, notYetListed } from './lifecycle';

// Mayo del 4 al 31 y agosto del 17 al 30 de 2026, como en la base local.
const MAY = Array.from({ length: 28 }, (_, i) => `2026-05-${String(4 + i).padStart(2, '0')}`);
const AUGUST = Array.from({ length: 14 }, (_, i) => `2026-08-${String(17 + i)}`);
const DAYS = [...MAY, ...AUGUST];

const seen = (firstSeenAt: string, lastSeenAt: string) =>
  stationFixture({ firstSeenAt, lastSeenAt });

describe('las altas y bajas de una estación', () => {
  it('no afirma nada de una estación vista desde el primer día importado hasta el último', () => {
    const all = seen('2026-05-03T22:00:01+00:00', '2026-08-29T22:00:02+00:00');
    expect(lifecycleOf(all, DAYS)).toEqual({ appeared: null, withdrawn: null });
  });

  it('un alta: la fuente no la listaba el día importado anterior', () => {
    // Publicada por primera vez el 12 de mayo a las 12:25 de Barcelona.
    const born = seen('2026-05-12T10:25:00+00:00', '2026-08-29T22:00:02+00:00');
    expect(lifecycleOf(born, DAYS)).toEqual({
      appeared: {
        at: '2026-05-12T10:25:00+00:00',
        day: '2026-05-12',
        absentOn: '2026-05-11',
        gap: false,
      },
      withdrawn: null,
    });
  });

  it('una baja: la fuente ya no la listaba el día importado siguiente', () => {
    // Listada por última vez el 26 de agosto (su primer listado de ese día, a las 00:00).
    const gone = seen('2026-05-03T22:00:01+00:00', '2026-08-25T22:00:05+00:00');
    expect(lifecycleOf(gone, DAYS)).toEqual({
      appeared: null,
      withdrawn: { lastDay: '2026-08-26', absentFrom: '2026-08-27', gap: false },
    });
  });

  it('con días sin importar en medio, el alta o la baja quedan entre dos fechas', () => {
    const between = seen('2026-08-16T22:04:59+00:00', '2026-08-29T22:00:02+00:00');
    expect(lifecycleOf(between, DAYS).appeared).toEqual({
      at: '2026-08-16T22:04:59+00:00',
      day: '2026-08-17',
      absentOn: '2026-05-31',
      gap: true,
    });
    const left = seen('2026-05-03T22:00:01+00:00', '2026-05-31T22:17:08+00:00');
    expect(lifecycleOf(left, DAYS).withdrawn).toEqual({
      lastDay: '2026-06-01',
      absentFrom: '2026-08-17',
      gap: true,
    });
  });

  it('con un solo día importado no hay altas ni bajas', () => {
    expect(
      lifecycleOf(seen('2026-03-10T06:00:00Z', '2026-03-10T06:00:00Z'), ['2026-03-10']),
    ).toEqual({ appeared: null, withdrawn: null });
  });

  it('dice si en el momento mostrado la fuente aún no la publicaba, o ya no', () => {
    const born = lifecycleOf(seen('2026-05-12T10:25:00+00:00', '2026-08-29T22:00:02+00:00'), DAYS);
    expect(notYetListed(born, '2026-05-12T10:00:00+00:00')?.day).toBe('2026-05-12');
    expect(notYetListed(born, '2026-05-12T10:25:00+00:00')).toBeNull();
    expect(noLongerListed(born, '2026-08-30T10:00:00+00:00')).toBeNull();

    const gone = lifecycleOf(seen('2026-05-03T22:00:01+00:00', '2026-08-25T22:00:05+00:00'), DAYS);
    expect(noLongerListed(gone, '2026-08-26T20:00:00+00:00')).toBeNull();
    expect(noLongerListed(gone, '2026-08-27T06:00:00+00:00')?.absentFrom).toBe('2026-08-27');
    expect(notYetListed(gone, '2026-05-04T06:00:00+00:00')).toBeNull();
  });

  it('agrupa las altas y las bajas de la red, por fecha y nombre', () => {
    const stations = [
      stationFixture({ id: 1, name: 'ZETA', firstSeenAt: '2026-05-15T08:50:05+00:00' }),
      stationFixture({ id: 2, name: 'ALFA', firstSeenAt: '2026-05-15T08:50:05+00:00' }),
      stationFixture({ id: 3, name: 'BETA', firstSeenAt: '2026-05-12T10:25:00+00:00' }),
      stationFixture({ id: 4, name: 'GAMMA', lastSeenAt: '2026-05-31T22:17:08+00:00' }),
      stationFixture({ id: 5, name: 'DELTA' }),
    ].map((s) => ({
      ...s,
      firstSeenAt: s.id <= 3 ? s.firstSeenAt : '2026-05-03T22:00:01+00:00',
      lastSeenAt: s.id === 4 ? s.lastSeenAt : '2026-08-29T22:00:02+00:00',
    }));
    const { appeared, withdrawn } = lifecycles(stations, DAYS);
    expect(appeared.map((a) => a.station.name)).toEqual(['BETA', 'ALFA', 'ZETA']);
    expect(withdrawn.map((w) => w.station.name)).toEqual(['GAMMA']);
  });

  it('el día de Barcelona de un instante', () => {
    expect(localDayOf('2026-05-11T22:30:00+00:00')).toBe('2026-05-12');
  });
});
