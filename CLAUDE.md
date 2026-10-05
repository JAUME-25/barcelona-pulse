# Barcelona Pulse: instrucciones para Claude

Proyecto propio de Jaume para el portfolio de jaumeperez.com. Mapa de estaciones de Bicing con
procedencia visible de los datos. Estado y siguiente paso: `docs/roadmap.md`.

## Reglas de datos (no negociables)

- Observado, demo sintética y escenario hipotético no se mezclan nunca: ni en tablas, ni en la
  API, ni en la interfaz. Una fuente no cambia de tipo (lo impide `StationIngestor`).
- Falta de dato no es cero. Estación cerrada no es estación vacía. Los recuentos ausentes son
  `null` de punta a punta.
- Instantes en UTC (`timestamptz`); se muestran en `Europe/Madrid`. Una hora sin zona no se
  convierte por suposición: se rechaza (`Instants.TryParseExplicit`).
- Los identificadores de estación se guardan como texto, tal como los publica la fuente.
- Estado en un instante T: última observación ≤ T dentro de la tolerancia de la fuente; fuera
  de ella, desconocido. Sin interpolar (ADR 0005).
- Metros y superficies nunca sobre grados: EPSG:25831 o `geography` (ADR 0004).
- No se dice «En directo» sin una integración con frescura comprobada.

## Cómo se trabaja aquí

- Bloques pequeños, cada uno comprobado antes del siguiente. Sin commit ni push si Jaume no
  los pide.
- Commits a nombre de Jaume (la identidad git configurada), en español y al estilo
  `feat(B2): …` / `docs: …`, sin líneas `Co-Authored-By` ni menciones a Claude.
- El repositorio es público: nada de secretos, tokens ni datos personales en código, commits,
  logs o issues. Un secreto que llegue a un commit se da por expuesto: se revoca.
- Un cambio de esquema lleva su migración. Un cambio de contrato HTTP lleva el documento
  OpenAPI regenerado (se hace al compilar) y los tipos del cliente (`npm run gen:api`).
- SQL espacial y consultas EF se prueban contra PostGIS real, no con un proveedor en memoria.
- Una pantalla no está hecha hasta usarla en el navegador: escritorio y móvil (320–375 px).

## Comandos

```bash
docker compose up -d --build api                                   # PostGIS + migraciones + API
docker compose run --rm api ingest demo                            # importar el demo (idempotente)
docker compose run --rm api ingest bicing-archive --day 2026-08-20  # un día real del histórico
docker compose run --rm -e BP_REQUIRE_DB=true sdk dotnet test      # pruebas de backend
docker compose run --rm --no-deps sdk dotnet format BarcelonaPulse.slnx --verify-no-changes
npm --prefix apps/web run dev                                      # web en http://localhost:5173
npm --prefix apps/web test                                         # vitest
npm --prefix apps/web run test:e2e                                 # humo con Playwright
```

En este equipo no hay SDK de .NET instalado: todo lo de .NET va por el contenedor `sdk`.

## Trampas conocidas

- `ExecuteSqlRaw` trata el SQL como cadena de formato: nada de llaves literales (`'{}'`); usa
  `ARRAY[]::text[]` o parámetros.
- Npgsql 10.0.3 no tiene `EF.Functions.IntersectsBbox`; `geom.Intersects(rect)` se traduce a
  `ST_Intersects` y usa el índice GiST.
- `dotnet ef ... -c` es `--context`, no la configuración: usa `--configuration`.
- En Windows, `localhost` puede tardar ~200 ms (prueba IPv6 primero): usa `127.0.0.1`.
- MapLibre 6 exige WebGL2, solo ESM y `setWorkerUrl` con `?worker&url` en Vite.
- `openapi-fetch` capturaría `fetch` al crearse: el cliente lo resuelve en cada petición para
  poder simularlo en pruebas.
- TypeScript 5.9 a propósito: typescript-eslint y openapi-typescript aún no admiten TS 7.
- No edites archivos con `sed` o heredocs si llevan `${...}`, comillas invertidas o barras: usa
  Edit o Write.
- La consulta del estado en un instante es SQL explícito (ADR 0008): EF la traducía con
  `ROW_NUMBER()` sobre todo el histórico. Si cambian columnas de `station_observations`, revísala.
- `returning` es palabra reservada de PostgreSQL: no la uses como alias.
- La línea temporal (`Features/History/TimelineQuery.cs`, ADR 0009) repite en SQL la regla del
  estado en un instante y la precedencia de la leyenda (`availability.ts`) para vacías y
  llenas. Si cambia una, cambian las otras; la prueba `Every_step_matches_the_map_at_that_instant`
  lo vigila.
- Un `MAX(observed_at)` sobre el join de observaciones y estaciones recorre todo el histórico
  (~100 ms con una semana): usa `StationQueries.LatestObservationAsync`, que va por estación.
- Cada fotograma de «Reproducir» es una petición a `/api/stations`, y la API admite 120 por
  minuto e IP: no subas el ritmo de `useReplay` sin un endpoint de fotogramas. Las capturas
  seguidas también lo agotan (sale «Too Many Requests»): espera un minuto.
- El navegador integrado de Claude no pinta WebGL si su ventana no está al frente: el mapa se
  revisa con las capturas de Playwright (`e2e/*.capture.ts`).
- SharpCompress 1.0.0: `SevenZipArchive.Open(...)` (la documentación de `master` dice
  `OpenArchive`) y no escribe 7z. Los fixtures del histórico se generan con
  `node scripts/make-bicing-archive-fixtures.mjs` usando bsdtar.
- Importar un día real descarga ~25 MB del portal de Open Data BCN: no lo metas en pruebas ni
  en CI; para eso están los fixtures.

## Diseño

Diseño único «Fanals» (`docs/design.md`, tokens en `apps/web/src/app/theme.ts`). Ningún
estado depende solo del color. El cian está reservado para cobertura y escenarios (B4): no lo uses
para otra cosa. El marcador de estación es un octógono: una manzana del Eixample.
