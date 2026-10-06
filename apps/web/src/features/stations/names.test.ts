import { describe, expect, it } from 'vitest';
import { districtName, readableName, stationName } from './names';

// Nombres reales del histórico de Bicing (mayo de 2026), tal como los publica la fuente.
describe('readableName', () => {
  it.each([
    ['AV. CAN MARCET, 3', 'Av. Can Marcet, 3'],
    ["AV. MARQUÉS DE  L'ARGENTERA,13", 'Av. Marqués de l’Argentera, 13'],
    ['AV. PARAL.LEL, 132', 'Av. Paral·lel, 132'],
    ['AV. PARAL·LEL, 146 BIS', 'Av. Paral·lel, 146 bis'],
    ['AV.LITORAL, 84', 'Av. Litoral, 84'],
    ['C/ CIUTAT DE GRANADA, 168| AV.DIAGONAL', 'C/ Ciutat de Granada, 168 | Av. Diagonal'],
    ["C/ DEL COMTE D'URGELL 75 B", 'C/ del Comte d’Urgell 75 B'],
    ['C/ JOSEP SAMITIER | AV. JOAN XXIII', 'C/ Josep Samitier | Av. Joan XXIII'],
    ['PG.DE COLOM (LES RAMBLES)', 'Pg. de Colom (les Rambles)'],
    ['C/ DE ROSSELLÓ I PORCEL, 1 | AV. MERIDIANA', 'C/ de Rosselló i Porcel, 1 | Av. Meridiana'],
    ['C / GIRONA, 176', 'C/ Girona, 176'],
    ['RONDA DE SANT PAU , 51', 'Ronda de Sant Pau, 51'],
    ['PL JOANIC - C / BRUNIQUER, 59', 'Pl Joanic - C/ Bruniquer, 59'],
    ['LA BARCELONETA (CN BARCELONETA)', 'La Barceloneta (CN Barceloneta)'],
    ['C/ SANT ANTONI Mª CLARET, 290-296', 'C/ Sant Antoni Mª Claret, 290-296'],
  ])('%s → %s', (raw, readable) => {
    expect(readableName(raw)).toBe(readable);
  });

  it('solo cambia las palabras en mayúsculas: lo escrito a mano se queda', () => {
    expect(readableName('C/ BRUC, 103 (xamfrà)')).toBe('C/ Bruc, 103 (xamfrà)');
    expect(readableName('PG. LLUíS COMPANYS (ARC TRIOMF)')).toBe('Pg. Lluís Companys (Arc Triomf)');
    expect(readableName('Copa América Barcelona - 542')).toBe('Copa América Barcelona - 542');
    // Los del demo ya vienen bien escritos.
    expect(readableName('Pl. de Lesseps')).toBe('Pl. de Lesseps');
    expect(readableName('Jaume I')).toBe('Jaume I');
  });

  it('corrige las erratas de la fuente que no admiten duda', () => {
    expect(readableName('AV.DEDUARD MARISTANY,1 /FORUM')).toBe('Av. d’Eduard Maristany, 1 / Fòrum');
    expect(readableName('PG. DE LLUIS COMPANYS (ARC DE TRIOMF )')).toBe(
      'Pg. de Lluís Companys (Arc de Triomf)',
    );
    // Las que tienen forma catalana y castellana, no.
    expect(readableName('AV. MARQUÉS DE COMILLAS')).toBe('Av. Marqués de Comillas');
  });
});

describe('stationName', () => {
  it('completa con la dirección un nombre que la fuente ha cortado', () => {
    expect(
      stationName({
        name: 'JARDINS DE CAN FERRERO/PG.DE LA ZONA FR',
        address: 'JARDINS DE CAN FERRERO/PG.DE LA ZONA FRANCA',
      }),
    ).toBe('Jardins de Can Ferrero / Pg. de la Zona Franca');
    expect(
      stationName({
        name: 'AV. LITORAL (PG MARÍTIM DEL PORT OLÍMPI',
        address: 'AV. LITORAL (PG MARÍTIM DEL PORT OLÍMPIC)',
      }),
    ).toBe('Av. Litoral (Pg Marítim del Port Olímpic)');
  });

  it('si la dirección dice otra cosa, se queda el nombre', () => {
    expect(
      stationName({
        name: 'C/ CIUTAT DE GRANADA, 168| AV.DIAGONAL',
        address: 'C/ CIUTAT DE GRANADA, 165 | AV.DIAGONAL',
      }),
    ).toBe('C/ Ciutat de Granada, 168 | Av. Diagonal');
    expect(stationName({ name: 'Pl. de Lesseps', address: null })).toBe('Pl. de Lesseps');
  });

  it('si sigue cortado, lo dice', () => {
    expect(
      stationName({
        name: 'CAMPANA DE LA MAQUINISTA (SAO PAULO I P',
        address: 'CAMPANA DE LA MAQUINISTA (SAO PAULO I PL. DE',
      }),
    ).toBe('Campana de la Maquinista (Sao Paulo i Pl. de…)');
  });
});

describe('districtName', () => {
  it('separa los distritos que la fuente publica pegados', () => {
    expect(districtName('SantMartí')).toBe('Sant Martí');
    expect(districtName('Sarrià-StGervasi')).toBe('Sarrià-Sant Gervasi');
    expect(districtName('Eixample')).toBe('Eixample');
  });
});
