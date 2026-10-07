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
docker compose run --rm api purge bicing-bcn --day 2026-08-20      # qué borraría (con --yes, lo borra)
docker compose run --rm api ingest study-areas                     # áreas de estudio de la cobertura (B4)
docker compose run --rm -e BP_REQUIRE_DB=true sdk dotnet test      # pruebas de backend
docker compose run --rm --no-deps sdk dotnet format BarcelonaPulse.slnx --verify-no-changes
npm --prefix apps/web run dev                                      # web en http://localhost:5173
npm --prefix apps/web test                                         # vitest
npm --prefix apps/web run test:e2e                                 # humo con Playwright
```

En este equipo no hay SDK de .NET instalado: todo lo de .NET va por el contenedor `sdk`.

Producción: `pulse.jaumeperez.com` en el VPS de Forge, con `infra/compose.prod.yml` y
`infra/deploy.sh` detrás del nginx de Forge (`docs/despliegue.md`). Al servidor no se entra:
Jaume ejecuta los comandos en Forge y pega la salida.

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
- La cobertura (ADR 0013) se mide en EPSG:25831: las áreas de estudio ya se guardan así y los
  puntos se transforman con `ST_Transform`. Nunca áreas ni buffers sobre 4326.
- EF no traduce un `Where` sobre un registro ya proyectado (`Select(new X(...)).Where(x => x.Id
  == …)`): filtra la entidad y proyecta después.
- El recuento de observaciones de cada fuente (`data_sources.observation_count`) lo llevan la
  ingesta y `purge` en su transacción (ADR 0012): si se borran observaciones por otra vía,
  descuadra.
- La línea temporal (`Features/History/TimelineQuery.cs`, ADR 0009) repite en SQL la regla del
  estado en un instante y la precedencia de la leyenda (`availability.ts`) para vacías y
  llenas. Si cambia una, cambian las otras; la prueba `Every_step_matches_the_map_at_that_instant`
  lo vigila. El patrón de la estación (`Features/Stations/StationPattern.cs`) las repite también,
  con el umbral de «pocas» (`FEW_BIKES_MAX`, 3), y necesita el JIT apagado (0,9 s en vez de 28 ms).
- Las respuestas de estado, detalle, patrón, línea temporal y fotogramas llevan ETag con la
  versión de los datos de su rango (`Infrastructure/DataVersion.cs`, ADR 0014), y la caché de
  la línea temporal usa la misma versión. Si una consulta nueva depende de datos de otros días,
  su versión tiene que cubrirlos, o servirá un 304 (o una caché) viejo. «Ahora» no se valida.
  La versión lleva la compilación (`DataVersion.Build`) y el periodo de una ingesta es el de sus
  filas nuevas: una observación de 2025 repetida en cada archivo no lo estira (si lo hiciera,
  cada ingesta tocaría todos los rangos).
- Un `MAX(observed_at)` sobre el join de observaciones y estaciones recorre todo el histórico
  (~100 ms con una semana): usa `StationQueries.LatestObservationAsync`, que va por estación.
- «Reproducir» pide fotogramas de una hora (`/api/sources/{id}/frames`, ADR 0010), no
  `/api/stations` por paso: la API admite 120 peticiones por minuto e IP. Las capturas seguidas
  también pueden agotarlo (sale «Too Many Requests»): espera un minuto.
- «Qué muestra y qué no» pide una línea temporal por semana importada y la guarda en la página
  (`features/limits/quality.ts`): sin eso, abrirla y cerrarla agotaba el límite. Cada recarga
  vuelve a pedirlas. `TimelineWarmUp` (en la API) deja esas mismas semanas calculadas al
  arrancar y las vigila cada 5 min: si cambia cómo las pide la web (paso o semanas), cambia
  también `TimelineWarmUp.Weeks`, o la primera visita vuelve a esperar unos 12 s. En las pruebas
  va apagado (`Timeline:WarmUp=false` en `ApiFactory`).
- Una estación sin ninguna observación hasta el momento mostrado no «nunca ha informado»: al
  principio del periodo importado puede no haber empezado aún. Se dice «Ningún dato hasta este
  momento».
- Los nombres de estación se enseñan con `stationName` (`features/stations/names.ts`): la API y
  la base de datos guardan el de la fuente («LA RAMBLA, 75») y la pantalla dice «La Rambla, 75».
  Una prueba que busca una estación en pantalla usa el nombre legible. Una errata nueva de la
  fuente se corrige en `CORRECTIONS` solo si no admite duda.
- Un texto nuevo de la interfaz va en `src/i18n/es.tsx`, `ca.tsx` y `en.tsx` (TypeScript avisa si
  falta en uno) y se lee con `t()` al pintar, no en una constante de módulo: al cambiar de idioma
  la app se vuelve a montar, pero una constante se quedaría en el idioma de entrada. Las pruebas
  van en castellano (Vitest por defecto; Playwright con `locale: 'es-ES'`).
- Las traducciones de los supuestos de la cobertura van por posición y solo para
  `cobertura-geometrica` v1 con 7 supuestos: si cambian en `CoverageQuery.Model`, sube la versión
  o cambia también `ca.tsx` y `en.tsx`, o saldrán supuestos que no son.
- La fluidez se mide con la compilación de producción y la GPU (`e2e/reproduccion.measure.ts`):
  en el servidor de desarrollo React va varias veces más lento y, sin ventana, Chromium pinta
  WebGL por software.
- El navegador integrado de Claude no pinta WebGL si su ventana no está al frente: el mapa se
  revisa con las capturas de Playwright (`e2e/*.capture.ts`). En móvil, capturas de pantalla y no
  `fullPage`: en páginas largas Chromium deja el mapa en negro.
- La cobertura (ADR 0013) redondea las superficies al metro cuadrado: sin eso, una estación en
  zona ya cubierta «ganaba» 1e-8 m². «Sin cambio» en la web es ganar y perder 0 exactos.
- `infra/compose.prod.yml` se llama `barcelona-pulse`, como el entorno de desarrollo: para
  ensayarlo en local, `-p bp-prodtest` y otro `API_PORT`, o recrearía los contenedores de
  desarrollo. Y `infra/deploy.sh` no se ejecuta en Windows: su `npm ci` en un contenedor deja
  binarios de Linux en `node_modules`.
- Detrás de nginx, el límite por IP depende de `ForwardedHeaders:KnownNetworks`: sin él, todas
  las visitas comparten los 120 por minuto de la IP del proxy.
- SharpCompress 1.0.0: `SevenZipArchive.Open(...)` (la documentación de `master` dice
  `OpenArchive`) y no escribe 7z. Los fixtures del histórico se generan con
  `node scripts/make-bicing-archive-fixtures.mjs` usando bsdtar.
- Importar un día real descarga ~25 MB del portal de Open Data BCN: no lo metas en pruebas ni
  en CI; para eso están los fixtures.

## Diseño

Diseño único «Fanals» (`docs/design.md`, tokens en `apps/web/src/app/theme.ts`). Ningún
estado depende solo del color. El cian está reservado para cobertura y escenarios (B4): no lo uses
para otra cosa. El marcador de estación es un octógono: una manzana del Eixample.
