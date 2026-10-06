import { afterEach, describe, expect, it } from 'vitest';
import { formatShare } from '../features/scenarios/figures';
import { sourceName } from '../features/stations/sources';
import { detectLang, setLang, t, type Lang } from '.';

const MAY = Array.from({ length: 28 }, (_, i) => `2026-05-${String(i + 4).padStart(2, '0')}`);
const AUGUST = Array.from({ length: 14 }, (_, i) => `2026-08-${String(i + 17)}`);

function inLang<T>(lang: Lang, read: () => T): T {
  setLang(lang);
  return read();
}

afterEach(() => {
  setLang('es');
});

describe('idioma de entrada', () => {
  it('manda el de la URL si es uno de los tres', () => {
    expect(detectLang('ca', ['en-GB'])).toBe('ca');
    expect(detectLang('en', ['es-ES'])).toBe('en');
    expect(detectLang('fr', ['ca-ES', 'es'])).toBe('ca');
  });

  it('si no, el primero del navegador que tenga la aplicación', () => {
    expect(detectLang(null, ['ca-ES', 'es-ES'])).toBe('ca');
    expect(detectLang(null, ['de-DE', 'es-419', 'en'])).toBe('es');
    expect(detectLang(null, ['EN-us'])).toBe('en');
  });

  it('con un navegador en otro idioma, inglés', () => {
    expect(detectLang(null, ['fr-FR', 'de'])).toBe('en');
    expect(detectLang(null, [])).toBe('en');
  });
});

describe('catalán', () => {
  it('periodos y meses con «d’» delante de vocal y el año con «del»', () => {
    const days = [...MAY, ...AUGUST];
    expect(inLang('ca', () => t().limits.periodOf(days))).toBe(
      'del 4 al 31 de maig i del 17 al 30 d’agost del 2026',
    );
    expect(inLang('ca', () => t().format.months(days))).toBe('maig i agost del 2026');
    expect(inLang('ca', () => t().limits.listDays(['2026-08-01', '2026-08-08']))).toBe(
      '1 i 8 d’agost',
    );
  });

  it('«la 01:30» pero «les 23:39»', () => {
    const at = '2026-05-31T21:55:00Z';
    expect(
      inLang('ca', () => t().list.staleSince('Sense dada recent', '2026-05-30T23:30:00Z', at)),
    ).toBe('Sense dada recent des de la 01:30');
    expect(inLang('ca', () => t().limits.silentSince('2026-05-31T21:39:00Z', at))).toBe(
      'Sense dades des de les 23:39',
    );
    expect(inLang('ca', () => t().limits.silentSince('2026-05-28T03:04:45Z', at))).toBe(
      'Sense dades des del 28 de maig',
    );
  });

  it('el nombre del área con su artículo', () => {
    const of = (area: string) => inLang('ca', () => t().scenario.of(area, '7,46 km²', 300));
    expect(of('Eixample')).toBe(
      'De l’àrea de l’Eixample (7,46 km²) a menys de 300 m en línia recta.',
    );
    expect(of('Horta-Guinardó')).toMatch(/^De l’àrea d’Horta-Guinardó /);
    expect(of('Les Corts')).toMatch(/^De l’àrea de les Corts /);
    expect(of('Barcelona')).toMatch(/^De l’àrea de Barcelona /);
  });
});

describe('inglés', () => {
  it('periodos, «desde» y cifras a la inglesa', () => {
    expect(inLang('en', () => t().limits.periodOf([...MAY, ...AUGUST]))).toBe(
      '4–31 May and 17–30 August 2026',
    );
    expect(
      inLang('en', () =>
        t().list.staleSince('No recent data', '2025-06-12T08:54:16Z', '2026-05-31T21:55:00Z'),
      ),
    ).toBe('No recent data since 12 June 2025');
    expect(inLang('en', () => formatShare(0.56))).toBe('56.0%');
  });
});

describe('textos que vienen de la API', () => {
  const bicing = { id: 'bicing-bcn', name: 'Bicing, histórico del Ajuntament de Barcelona' };

  it('en castellano, tal como los da la API; en los otros dos, traducidos', () => {
    expect(sourceName(bicing)).toBe(bicing.name);
    expect(inLang('ca', () => sourceName(bicing))).toBe(
      'Bicing, històric de l’Ajuntament de Barcelona',
    );
    expect(inLang('en', () => sourceName(bicing))).toBe('Bicing, Barcelona City Council archive');
  });

  it('una fuente sin traducción se queda como la da la API', () => {
    const other = { id: 'otra', name: 'Otra fuente' };
    expect(inLang('en', () => sourceName(other))).toBe('Otra fuente');
  });

  it('los supuestos se traducen solo si son los del modelo que se conoce', () => {
    const seven = Array.from({ length: 7 }, (_, i) => `Supuesto ${String(i + 1)}`);
    const known = inLang('en', () => t().scenario.assumptionsOf('cobertura-geometrica', 1, seven));
    expect(known[0]).toMatch(/^Straight-line distance/);
    // Otra versión del modelo, u otro número de supuestos: lo que diga la API, sin adivinar.
    expect(inLang('en', () => t().scenario.assumptionsOf('cobertura-geometrica', 2, seven))).toBe(
      seven,
    );
    expect(
      inLang('ca', () => t().scenario.assumptionsOf('cobertura-geometrica', 1, ['Uno'])),
    ).toEqual(['Uno']);
  });
});
