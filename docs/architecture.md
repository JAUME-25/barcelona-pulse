# Arquitectura

Monolito modular: una SPA estática, una API en un contenedor y una base de datos PostgreSQL con
PostGIS. Sin colas, cachés externas ni servicios separados mientras no haga falta medirlo.

```
Navegador ── SPA React (estática) ──HTTP/JSON──▶ API ASP.NET Core ──EF Core/Npgsql──▶ PostgreSQL + PostGIS
   │                                                ▲
   └── teselas del mapa base (OpenFreeMap)          └── CLI de la misma imagen: migrate, ingest demo
```

El navegador solo habla con nuestra API y con el proveedor de teselas. Nunca descarga ni procesa
los archivos de Bicing: eso lo hace la ingesta en el servidor.

## Módulos

El backend es un único proyecto (`apps/api`) agrupado por funcionalidad. Cada carpeta tiene sus
entidades, su configuración de EF y sus endpoints. No hay repositorios genéricos ni interfaces
que solo reenvían llamadas.

| Carpeta | Responsabilidad |
| --- | --- |
| `Features/Sources` | Fuentes de datos (observada o sintética) y `GET /api/sources` con el periodo cubierto. |
| `Features/Stations` | Estaciones, versiones de atributos y observaciones; regla del estado en un instante; `GET /api/stations` y `GET /api/stations/{id}`. |
| `Features/Ingestion` | Contrato normalizado, validación común, `StationIngestor` (idempotente) y adaptadores. Hoy: `Demo/DemoFixtureAdapter`. |
| `Infrastructure` | `PulseDbContext`, migraciones, registro de servicios, CLI, utilidades de instantes y geometría. |

Previstos: `Features/History` (B3) y `Features/Scenarios` (B4), en sus propias carpetas.

La web (`apps/web`) sigue la misma idea: `features/stations` con el mapa, la lista, el detalle y
las reglas de presentación; `api` con el cliente tipado; `app` con la composición y el tema
visual (`theme.ts`).

## Flujo de una consulta

1. La web pide `GET /api/sources` y elige una fuente: una observada con datos si existe; si no, la
   demo. Nunca combina dos.
2. Pide `GET /api/stations?source=…`. Sin `at`, la API usa el final de los datos para una fuente
   sintética y el momento actual para una observada (`atBasis` lo dice).
3. La API toma, por estación, la versión de atributos vigente en `at` y la última observación
   ≤ `at` (SQL explícito con `LEFT JOIN LATERAL` sobre el índice único
   `(station_id, observed_at)`, ADR 0008), y aplica la tolerancia de la fuente.
4. La web pinta el mapa con una capa de símbolos (imágenes generadas en canvas, sin un nodo DOM
   por estación) y la lista con los mismos datos. La selección se comparte y va en la URL
   (`?estacion=<id de origen>`).

## Ingesta

Puntos de entrada, por línea de comandos (no hay endpoint HTTP de importación):

- `docker compose run --rm api ingest demo`: el fixture sintético.
- `docker compose run --rm api ingest bicing-archive --day 2026-08-20`: un día natural (hora de
  Barcelona) del histórico de Bicing. Descarga los dos .7z del mes a archivos temporales, los
  lee en streaming y los borra al terminar. Con `--status-file` e `--info-file` usa archivos
  locales.

- Cada ejecución queda en `ingestion_runs` con fuente, adaptador y versión, entrada y su
  sha256, periodo, recuentos y resultado; los rechazos, en `ingestion_rejections` con su motivo.
- Un bloqueo consultivo por fuente evita dos ingestas simultáneas.
- Las observaciones entran por lotes de 5 000 con `INSERT … SELECT unnest(…) ON CONFLICT DO
  NOTHING`. Repetir una ingesta no duplica nada.
- Si falla, la transacción se deshace y la ejecución queda como `failed` con el error.
- Límites. Demo: 5 MB de entrada y profundidad JSON 16. Histórico: 64 MB por .7z, 2 GB
  descomprimidos, 6 millones de filas, 15 min por ejecución y comprobación de que lo descargado
  es un 7z (no una página de error). Descarga con 5 min de tiempo de espera y dos reintentos
  (2 s y 5 s) ante 5xx o cortes: el portal da 503 a ratos.

## Contrato HTTP

- OpenAPI 3.1 generado al compilar (`Microsoft.Extensions.ApiDescription.Server`) en
  `apps/api/openapi/barcelona-pulse-api.json`, versionado. También se sirve en `/openapi/v1.json`.
- `openapi-typescript` genera `apps/web/src/api/schema.d.ts`; `openapi-fetch` lo usa en el
  cliente. La CI comprueba que ninguno de los dos difiere de lo versionado.
- Enums en `snake_case`, números estrictos y campos requeridos según los constructores.
- Errores como `application/problem+json` (RFC 9457): 400 con `errors` por parámetro, 404 y
  429.

## Seguridad y operación

- Secretos fuera del código: `.env` (no versionado) para Compose y variables de entorno en la
  imagen. `.env.example` solo tiene valores de ejemplo.
- Repositorio público en GitHub: escaneo de secretos con bloqueo en el push (activo por defecto)
  y Dependabot con alertas y actualizaciones de seguridad (activado el 5-10-2026). La CI usa
  permisos de solo lectura y ningún secreto.
- CORS solo para `GET` y para los orígenes de `Cors:AllowedOrigins`. En local no hace falta:
  Vite reenvía `/api`.
- Límite de 120 peticiones por minuto e IP en `/api` (configurable). Consultas acotadas: caja
  máxima de 1° y un máximo de 1 000 estaciones por respuesta (`truncated` lo indica).
- Logs estructurados en JSON fuera de desarrollo. Salud en `/health/live` y `/health/ready`
  (esta comprueba la base de datos). Sin rastreo de visitantes.
- Imagen de la API: `aspnet:10.0.12-noble-chiseled-extra`, sin shell y con usuario no root;
  incluye ICU y tzdata.

## Versiones

Comprobadas el 5 de octubre de 2026 en las fuentes oficiales (metadatos de versiones de .NET,
NuGet, npm, Docker Hub y MCR). Se fijan versiones exactas; los archivos de bloqueo son
`apps/web/package-lock.json` y `Directory.Packages.props`.

| Pieza | Versión | Nota |
| --- | --- | --- |
| .NET SDK / runtime | 10.0.401 / 10.0.12 | LTS, soporte hasta el 14-11-2028. `global.json` admite parches 10.0.4xx. |
| Imágenes .NET | `sdk:10.0.401-noble`, `aspnet:10.0.12-noble-chiseled-extra` | MCR. |
| EF Core, ASP.NET Core OpenAPI | 10.0.12 | |
| Npgsql EF Core (+ NetTopologySuite) | 10.0.3 | |
| EFCore.NamingConventions | 10.0.1 | Nombres `snake_case`. |
| SharpCompress | 1.0.0 | Lectura de los .7z del histórico (MIT). En 1.0.0 es `SevenZipArchive.Open`; no escribe 7z. |
| xUnit v3 (MTP v2) | 4.0.1 | `dotnet test` con Microsoft Testing Platform (`global.json`). |
| PostgreSQL / PostGIS | 18.6 / 3.6.4 | `postgis/postgis:18-3.6`, fijada por digest. Solo `linux/amd64`. |
| Node.js | 24 LTS (24.18 probado) | `.nvmrc`. |
| React | 19.3.0 | |
| Vite / plugin React | 8.3.2 / 6.1.2 | |
| TypeScript | 5.9.3 | No 7.0: typescript-eslint (`<6.1`) y openapi-typescript (`^5`) aún no lo admiten. |
| MapLibre GL JS | 6.12.0 | Exige WebGL2; solo ESM. |
| openapi-typescript / openapi-fetch | 7.13.0 / 0.17.0 | |
| Vitest / jsdom / Playwright | 5.0.3 / 30.1.2 / 1.63.0 | Playwright usa Chromium 153. |
| ESLint / typescript-eslint | 10.12.0 / 8.71.1 | |

Para actualizar: cambia la versión, ejecuta las pruebas y la CI, y actualiza esta tabla.

## Mediciones

Entorno: Windows 11, 16 núcleos, Docker Desktop 29.6, compilación de producción servida por
`vite preview` en local, Chromium 153. Demo de 46 estaciones. Medido el 5 de octubre de 2026.

| Medida | Escritorio | Móvil (CPU ×4) |
| --- | --- | --- |
| DOMContentLoaded (mediana de 5) | 111 ms | 413 ms |
| Lista de estaciones visible | 244 ms | 897 ms |
| Mapa listo (estilo cargado y capas añadidas) | 1 224 ms | 1 327 ms |
| JavaScript descargado, sin comprimir | 1 752 KB | 1 752 KB |

- API con la demo, 31 peticiones a `127.0.0.1`: `GET /api/stations?source=demo` mediana
  4,0 ms (p90 4,4 ms; 18,5 KB sin comprimir); con `bbox`, 3,7 ms; `GET /api/sources`, 3,4 ms.
- API con un día real (540 estaciones, 154 389 observaciones): `GET /api/stations?source=bicing-bcn&at=…`
  mediana 14–16 ms (p90 17–19 ms); la consulta en PostgreSQL, 6 ms. Respuesta de 285 KB, 29 KB
  comprimida (Brotli o gzip). La primera petición tras arrancar tarda ~1 s (arranque en frío).
- Ingesta de un día real: ~19 s en total, descargas incluidas.
- El tiempo del mapa depende de la red hasta OpenFreeMap; la red no se limitó.
- La carga de la web se midió con la demo. Falta medirla con las 540 estaciones reales, y la
  fluidez (fps) en escritorio y móvil: queda para B5.
- El paquete principal pesa 1,28 MB (358 KB con gzip), casi todo MapLibre. Cargarlo en diferido
  y quedarse con una sola fuente tipográfica son las primeras mejoras previstas.

Para repetirlas: `npx playwright test --config e2e/tools.config.ts --grep medicion` desde
`apps/web` (escribe `test-results/measurements.json`).
