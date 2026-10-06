import { describe, expect, it } from 'vitest';
import { formatDuration, formatMonths, formatTime, formatTimeRelativeToDay } from './format';

describe('meses de los datos', () => {
  it('nombra los meses que cubren los días importados', () => {
    expect(formatMonths(['2026-05-04', '2026-05-31'])).toBe('mayo de 2026');
    expect(formatMonths(['2026-08-17', '2026-05-04', '2026-05-05'])).toBe('mayo y agosto de 2026');
    expect(formatMonths(['2026-05-04', '2026-06-01', '2026-08-30'])).toBe(
      'mayo, junio y agosto de 2026',
    );
    expect(formatMonths(['2025-12-31', '2026-01-01'])).toBe('diciembre de 2025 y enero de 2026');
    expect(formatMonths([])).toBeNull();
  });
});

describe('horas en Europe/Madrid', () => {
  it('convierte UTC a hora de invierno y de verano', () => {
    expect(formatTime('2026-03-10T09:00:00Z')).toBe('10:00'); // CET, UTC+1
    expect(formatTime('2026-07-10T09:00:00Z')).toBe('11:00'); // CEST, UTC+2
  });

  it('respeta el cambio de hora de marzo (02:00 → 03:00)', () => {
    expect(formatTime('2026-03-29T00:59:00Z')).toBe('01:59');
    expect(formatTime('2026-03-29T01:00:00Z')).toBe('03:00');
  });

  it('distingue las dos 02:30 del cambio de hora de octubre', () => {
    expect(formatTime('2026-10-25T00:30:00Z')).toBe('02:30');
    expect(formatTime('2026-10-25T01:30:00Z')).toBe('02:30');
  });

  it('el cambio de día se decide en hora de Barcelona', () => {
    // 23:30 UTC del día 9 ya es día 10 en Barcelona.
    expect(formatTimeRelativeToDay('2026-03-09T23:30:00Z', '2026-03-10T09:00:00Z')).toBe('00:30');
    expect(formatTimeRelativeToDay('2026-03-09T22:30:00Z', '2026-03-10T09:00:00Z')).toMatch(
      /9 de marzo de 2026/,
    );
  });
});

describe('formatDuration', () => {
  it('expresa la antigüedad en horas y minutos', () => {
    expect(formatDuration('2026-03-10T06:45:00Z', '2026-03-10T09:00:00Z')).toBe('2 h 15 min');
    expect(formatDuration('2026-03-10T08:20:00Z', '2026-03-10T09:00:00Z')).toBe('40 min');
    expect(formatDuration('2026-03-10T07:00:00Z', '2026-03-10T09:00:00Z')).toBe('2 h');
    expect(formatDuration('2026-03-10T08:59:30Z', '2026-03-10T09:00:00Z')).toBe('menos de 1 min');
    expect(formatDuration('2026-03-01T09:00:00Z', '2026-03-10T09:00:00Z')).toBe('9 días');
  });
});
