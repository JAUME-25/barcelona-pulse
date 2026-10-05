// Genera los fixtures del adaptador del histórico de Bicing: dos CSV con la cabecera real
// y filas inventadas que cubren cada caso, comprimidos en .7z como los publica el Ajuntament.
//
//   node scripts/make-bicing-archive-fixtures.mjs
//
// Necesita bsdtar (en Windows, C:\Windows\System32\tar.exe; en Linux/macOS, `bsdtar`):
// GNU tar no escribe 7z. Determinista salvo por los metadatos internos del .7z.

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'tests', 'BarcelonaPulse.Api.Tests', 'Fixtures', 'BicingArchive');
mkdirSync(out, { recursive: true });

const epoch = (iso) => Math.floor(Date.parse(iso) / 1000);
// Día de prueba: jueves 20-8-2026 en Barcelona (CEST, UTC+2) = [19-8 22:00Z, 20-8 22:00Z).
const S0 = epoch('2026-08-19T21:57:30Z'); // 23:57:30 del día 19: fuera
const S1 = epoch('2026-08-19T22:02:30Z'); // 00:02:30 del día 20: dentro
const S2 = epoch('2026-08-19T22:07:30Z');
const S3 = epoch('2026-08-20T12:00:00Z'); // 14:00 del día 20: cambia la capacidad de la 3
const S4 = epoch('2026-08-20T22:02:30Z'); // 00:02:30 del día 21: fuera

const STATUS_HEADER =
  '"station_id","num_bikes_available","is_charging_station","status","traffic","num_bikes_available_types.mechanical","num_bikes_available_types.ebike","num_docks_available","last_reported","is_installed","is_renting","is_returning","last_updated","ttl"';
const INFO_HEADER =
  '"station_id","external_id","name","physical_configuration","lat","lon","altitude","address","cross_street","post_code","capacity","is_charging_station","short_name","nearby_distance","x_ride_code_support","rental_uris","last_updated","ttl"';

const status = (id, bikes, mech, ebike, docks, reported, st, renting, returning, snapshot) =>
  [id, bikes, 'TRUE', `"${st}"`, 'NA', mech, ebike, docks, reported, 1, renting, returning, snapshot, 0].join(',');

const info = (id, name, lat, lon, cross, capacity, snapshot) =>
  [id, `"00000000-0000-0000-0000-00000000000${id}"`, `"${name}"`, '"ELECTRICBIKESTATION"', lat, lon, 20,
    `"${name}"`, cross === 'NA' ? 'NA' : `"${cross}"`, 8013, capacity, 'TRUE', id, 1000, 'TRUE', 'NA', snapshot, 0].join(',');

const statusRows = [
  // Fuera del día: se ignoran.
  status(1, 9, 9, 0, 30, S0 - 60, 'IN_SERVICE', 1, 1, S0),
  // S1
  status(1, 11, 11, 0, 28, S1 - 50, 'IN_SERVICE', 1, 1, S1),
  status(2, 0, 0, 0, 0, S1 - 100, 'NOT_IN_SERVICE', 0, 0, S1),
  status(3, 5, 3, 2, 25, S1 - 20, 'IN_SERVICE', 1, 1, S1),
  status(999, 4, 4, 0, 10, S1 - 30, 'IN_SERVICE', 1, 1, S1), // estación desconocida
  // S2: la 1 y la 2 repiten observación (duplicados); la 3 repite instante con otro valor (conflicto).
  status(1, 11, 11, 0, 28, S1 - 50, 'IN_SERVICE', 1, 1, S2),
  status(2, 0, 0, 0, 0, S1 - 100, 'NOT_IN_SERVICE', 0, 0, S2),
  status(3, 6, 4, 2, 24, S1 - 20, 'IN_SERVICE', 1, 1, S2),
  status(4, 2, 2, 0, 20, 'NA', 'IN_SERVICE', 1, 1, S2), // sin last_reported
  // S3
  status(1, 3, 2, 1, 36, S3 - 30, 'IN_SERVICE', 1, 1, S3),
  status(2, 0, 0, 0, 0, S3 - 60, 'NOT_IN_SERVICE', 0, 0, S3),
  status(3, 7, 4, 3, 26, S3 - 10, 'IN_SERVICE', 0, 1, S3), // en servicio, no presta, admite devolver
  status(4, 2, 2, 0, 20, S3 - 40, 'BROKEN', 1, 1, S3), // estado desconocido
  // Fuera del día.
  status(1, 8, 8, 0, 31, S4 - 20, 'IN_SERVICE', 1, 1, S4),
];

const infoRows = [S0, S1, S2, S3, S4].flatMap((snapshot) => [
  info(1, 'GRAN VIA CORTS CATALANES, 760', 41.3979779, 2.1801069, '02-Eixample/05-el Fort Pienc', 44, snapshot),
  info(2, 'C/ ROGER DE FLOR, 126', 41.3954877, 2.1771985, '02-Eixample/05-el Fort Pienc', 28, snapshot),
  info(3, 'PG. DE GRÀCIA, 30', 41.3912, 2.165, '02-Eixample/07-la Dreta de l\'Eixample', snapshot >= S3 ? 33 : 30, snapshot),
  info(4, 'C/ SENSE BARRI, 1', 41.38, 2.17, 'NA', 'NA', snapshot),
  ...(snapshot === S3 ? [info(5, 'SENSE COORDENADES', 'NA', 'NA', 'NA', 20, snapshot)] : []),
]);

const files = [
  ['2026_08_Agost_BicingNou_ESTACIONS', [STATUS_HEADER, ...statusRows]],
  ['2026_08_Agost_BicingNou_INFORMACIO', [INFO_HEADER, ...infoRows]],
];

const tar = process.platform === 'win32' ? 'C:\\Windows\\System32\\tar.exe' : 'bsdtar';
for (const [name, lines] of files) {
  writeFileSync(join(out, `${name}.csv`), lines.join('\n') + '\n', 'utf8');
  execFileSync(tar, ['--format', '7zip', '-cf', join(out, `${name}.7z`), '-C', out, `${name}.csv`]);
  console.log(`Escrito ${name}.csv y ${name}.7z (${lines.length - 1} filas)`);
}
