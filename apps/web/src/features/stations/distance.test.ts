import { describe, expect, it } from 'vitest';
import { distanceMeters, formatDistance, toUtm31 } from './distance';

// Valores de PostGIS (ST_Transform a 25831 y ST_Distance), tomados el 7-10-2026 de la base local.
const POSTGIS: [number, number, number, number][] = [
  [2.1801069, 41.3979779, 431461.86463110684, 4583262.211280969],
  [2.15187841563274, 41.4341809929127, 429141.4714046639, 4587304.161335054],
  [2.1699, 41.387, 430596.9455500386, 4582051.585539377],
  [2.2273, 41.4186, 435427.3786491117, 4585515.389452986],
];

describe('EPSG:25831 en el navegador', () => {
  it('proyecta como PostGIS, a menos de un centímetro', () => {
    for (const [lon, lat, x, y] of POSTGIS) {
      const p = toUtm31(lon, lat);
      expect(Math.abs(p.x - x)).toBeLessThan(0.01);
      expect(Math.abs(p.y - y)).toBeLessThan(0.01);
    }
  });

  it('mide en metros como PostGIS, no sobre grados', () => {
    // Gran Via, 760 a Pl. de Catalunya: 1487,85 m en 25831 (1488,36 en geography).
    const d = distanceMeters(
      { longitude: 2.1801069, latitude: 41.3979779 },
      { longitude: 2.1699, latitude: 41.387 },
    );
    expect(Math.abs(d - 1487.8506991631725)).toBeLessThan(0.01);
  });

  it('escribe metros enteros y kilómetros con un decimal', () => {
    const format = (n: number, digits: number) => n.toFixed(digits).replace('.', ',');
    expect(formatDistance(240.4, format)).toBe('240 m');
    expect(formatDistance(999.6, format)).toBe('1,0 km');
    expect(formatDistance(1487.85, format)).toBe('1,5 km');
  });
});
