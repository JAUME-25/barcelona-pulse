// Genera el fixture de demostración sintético de Barcelona Pulse.
// Determinista: misma semilla, mismo archivo byte a byte.
//
//   node scripts/generate-demo-fixture.mjs
//
// Salida: apps/api/Features/Ingestion/Demo/demo-fixture.v1.json
// Los datos son inventados. Las ubicaciones son puntos aproximados de Barcelona
// elegidos a mano; no corresponden a estaciones reales de Bicing.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SEED = 20260310;
// Martes 10/03/2026, de 07:00 a 10:00 hora de Barcelona (CET, UTC+1), cada 15 min.
const START_UTC = Date.UTC(2026, 2, 10, 6, 0, 0);
const STEP_MIN = 15;
const STEPS = 13;

// R: residencial (pierde bicis por la mañana), C: centro/trabajo (gana), M: mixto.
const PLACES = [
  ['Pl. de Catalunya', 41.387, 2.1699, 'C'],
  ['Pg. de Gràcia - Aragó', 41.3917, 2.165, 'C'],
  ['Rambla de Catalunya - Diagonal', 41.3965, 2.1571, 'C'],
  ['Pl. de la Universitat', 41.3862, 2.1637, 'C'],
  ['Mercat de Sant Antoni', 41.3784, 2.1617, 'M'],
  ['Av. del Paral·lel', 41.3749, 2.1695, 'M'],
  ['Drassanes', 41.3762, 2.1756, 'C'],
  ['Liceu', 41.3807, 2.1735, 'C'],
  ['Jaume I', 41.384, 2.1779, 'C'],
  ['Mercat de Santa Caterina', 41.386, 2.1785, 'C'],
  ['Arc de Triomf', 41.391, 2.1806, 'C'],
  ['Wellington - Ciutadella', 41.3896, 2.1905, 'M'],
  ['Pl. de la Barceloneta', 41.3805, 2.1893, 'R'],
  ['Av. d\'Icària', 41.3895, 2.196, 'M'],
  ['Rambla del Poblenou', 41.3995, 2.202, 'R'],
  ['Llacuna', 41.3992, 2.1974, 'C'],
  ['Pl. de les Glòries', 41.4033, 2.1872, 'C'],
  ['El Clot', 41.4095, 2.1872, 'R'],
  ['Pl. de Gaudí', 41.4045, 2.1755, 'M'],
  ['Hospital de Sant Pau', 41.4116, 2.1743, 'M'],
  ['Verdaguer', 41.3994, 2.1678, 'C'],
  ['Pl. del Sol', 41.4006, 2.1575, 'R'],
  ['Fontana', 41.4025, 2.1527, 'R'],
  ['Pl. de Lesseps', 41.4062, 2.1497, 'R'],
  ['Pl. de Francesc Macià', 41.3926, 2.1432, 'C'],
  ['Hospital Clínic', 41.389, 2.1525, 'C'],
  ['Estació de Sants', 41.3793, 2.1405, 'M'],
  ['Pl. de Sants', 41.3757, 2.1356, 'R'],
  ['Pl. d\'Espanya', 41.3751, 2.1488, 'M'],
  ['Pl. de Tetuan', 41.3949, 2.1754, 'C'],
  ['Pl. de la Concòrdia', 41.3846, 2.1324, 'R'],
  ['Maria Cristina', 41.3879, 2.1262, 'C'],
  ['Zona Universitària', 41.3849, 2.1128, 'C'],
  ['Sarrià', 41.3993, 2.1218, 'R'],
  ['Pl. de la Bonanova', 41.404, 2.133, 'R'],
  ['Vall d\'Hebron', 41.4251, 2.1425, 'R'],
  ['Horta', 41.43, 2.1595, 'R'],
  ['Virrei Amat', 41.4303, 2.1745, 'R'],
  ['Fabra i Puig', 41.4297, 2.1834, 'R'],
  ['Pl. d\'Orfila', 41.4353, 2.1897, 'R'],
  ['La Sagrera', 41.4228, 2.1905, 'R'],
  ['Diagonal Mar', 41.41, 2.2165, 'C'],
  ['Fòrum', 41.4113, 2.2209, 'C'],
  ['Badal', 41.3756, 2.1275, 'R'],
  ['Carrer de Blai', 41.3731, 2.1636, 'R'],
  ['Mercat de la Concepció', 41.3958, 2.1676, 'C'],
];

// Casos límite deliberados (índice base 1 = número de estación).
const CLOSED = 13; // cerrada todo el periodo: no equivale a vacía
const MAINTENANCE = 8; // en mantenimiento con anclajes deshabilitados
const STOPS_REPORTING = 24; // deja de informar a las 07:45: al final, dato fuera de tolerancia
const NEVER_REPORTS = 37; // existe pero nunca envía observaciones
const OVER_CAPACITY = 31; // en los últimos tramos bicis + anclajes superan la capacidad
const NO_BIKE_SPLIT = 42; // solo informa del total, sin desglose mecánica/eléctrica
const GAP = 15; // hueco de 07:30 a 08:30 UTC y vuelve a informar
const ENDS_FULL = 19; // acaba sin anclajes libres
const ENDS_EMPTY = 22; // acaba sin bicis

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(SEED);
const randInt = (min, max) => min + Math.floor(rand() * (max - min + 1));
const iso = (ms) => new Date(ms).toISOString().replace('.000Z', 'Z');
const id = (n) => `demo-${String(n).padStart(3, '0')}`;

const stations = PLACES.map(([name, lat, lon, kind], i) => ({
  id: id(i + 1),
  name,
  lat,
  lon,
  capacity: [18, 21, 24, 27, 30, 33][randInt(0, 5)],
  kind,
}));

const observations = [];
for (const [i, s] of stations.entries()) {
  const n = i + 1;
  if (n === NEVER_REPORTS) continue;

  const docksDisabled = n === MAINTENANCE ? 6 : n === CLOSED ? s.capacity : randInt(0, 1);
  const bikesDisabled = n === CLOSED ? 0 : randInt(0, 1);
  const usable = s.capacity - docksDisabled - bikesDisabled;
  const trend = s.kind === 'R' ? -1 : s.kind === 'C' ? 1 : 0;
  const startShare = s.kind === 'R' ? 0.6 + rand() * 0.25 : s.kind === 'C' ? 0.15 + rand() * 0.2 : 0.4 + rand() * 0.2;
  let bikes = Math.round(usable * startShare);

  for (let step = 0; step < STEPS; step++) {
    const at = START_UTC + step * STEP_MIN * 60_000;
    if (step > 0) {
      bikes += Math.round(trend * usable * 0.035) + randInt(-2, 2);
    }
    if (n === ENDS_FULL && step >= STEPS - 3) bikes = usable;
    if (n === ENDS_EMPTY && step >= STEPS - 3) bikes = 0;
    bikes = Math.max(0, Math.min(usable, bikes));

    if (n === STOPS_REPORTING && step > 3) continue;
    if (n === GAP && step >= 6 && step <= 9) continue;

    const status = n === CLOSED ? 'closed' : n === MAINTENANCE ? 'maintenance' : 'in_service';
    const current = n === CLOSED ? 0 : bikes;
    const ebike = Math.round(current * (0.25 + rand() * 0.2));
    let docks = n === CLOSED ? 0 : usable - current;
    if (n === OVER_CAPACITY && step >= STEPS - 2) docks += 3;

    const obs = { station: s.id, at: iso(at), status };
    if (n === NO_BIKE_SPLIT) {
      obs.bikes = current;
    } else {
      obs.mechanical = current - ebike;
      obs.ebike = ebike;
    }
    obs.docks = docks;
    obs.bikesDisabled = bikesDisabled;
    obs.docksDisabled = docksDisabled;
    observations.push(obs);
  }
}

observations.sort((a, b) => (a.at === b.at ? a.station.localeCompare(b.station) : a.at.localeCompare(b.at)));

const fixture = {
  format: 'barcelona-pulse/demo-fixture',
  formatVersion: 1,
  notice:
    'Datos sintéticos generados para demostración. No son observaciones de Bicing ni reflejan disponibilidad real.',
  generator: { script: 'scripts/generate-demo-fixture.mjs', seed: SEED },
  source: {
    id: 'demo',
    name: 'Demo sintética',
    attribution: 'Datos sintéticos de Barcelona Pulse. Ubicaciones aproximadas, no son estaciones reales.',
    stalenessToleranceMinutes: 30,
  },
  stationsSeenAt: iso(START_UTC),
  stations: stations.map(({ kind, ...rest }) => rest),
  observations,
};

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'apps', 'api', 'Features', 'Ingestion', 'Demo', 'demo-fixture.v1.json');
writeFileSync(out, JSON.stringify(fixture, null, 2) + '\n', 'utf8');
console.log(`Escrito ${out}: ${fixture.stations.length} estaciones, ${observations.length} observaciones`);
