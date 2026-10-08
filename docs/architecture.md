# Arquitectura

Monolito modular: una SPA estática, una API en un contenedor y una base de datos PostgreSQL con
PostGIS. Sin colas, cachés externas ni servicios separados mientras no haga falta medirlo.

```
Navegador ── SPA React (estática) ──HTTP/JSON──▶ API ASP.NET Core ──EF Core/Npgsql──▶ PostgreSQL + PostGIS
   │                                                ▲
   └── teselas del mapa base (OpenFreeMap)          └── CLI de la misma imagen: migrate, ingest
```

El navegador solo habla con nuestra API y con el proveedor de teselas. Nunca descarga ni procesa
los archivos de Bicing: eso lo hace la ingesta en el servidor.

## Módulos

El backend es un único proyecto (`apps/api`) agrupado por funcionalidad. Cada carpeta tiene sus
entidades, su configuración de EF y sus endpoints. No hay repositorios genéricos ni interfaces
que solo reenvían llamadas.

| Carpeta | Responsabilidad |
| --- | --- |
| `Features/Sources` | Fuentes de datos (observada o sintética) y `GET /api/sources` con el periodo observado y los días que se pueden reproducir (ADR 0011). |
| `Features/Stations` | Estaciones, versiones de atributos y observaciones; regla del estado en un instante; `GET /api/stations` y `GET /api/stations/{id}`. |
| `Features/Ingestion` | Contrato normalizado, validación común, `StationIngestor` (idempotente) y adaptadores: `Demo/DemoFixtureAdapter` y `BicingArchive/BicingArchiveAdapter`. |
| `Features/History` | Reproducir un periodo: línea temporal `GET /api/sources/{id}/timeline`, leída del resumen por paso `timeline_summaries` que mantienen la ingesta y la purga (ADR 0015; antes calculada al pedirla, ADR 0009), y fotogramas `GET /api/sources/{id}/frames` (ADR 0010). |
| `Features/Scenarios` | Cobertura (B4): áreas de estudio `GET /api/study-areas` y escenarios `POST /api/scenarios/coverage`, calculados en EPSG:25831 y sin guardar (ADR 0013). |
| `Infrastructure` | `PulseDbContext`, migraciones, registro de servicios, CLI, utilidades de instantes y geometría. |

La web (`apps/web`) sigue la misma idea: `features/stations` con el mapa, la lista, el detalle y
las reglas de presentación; `features/history` con el modo «Reproducir»; `api` con el cliente
tipado; `app` con la composición y el tema visual (`theme.ts`).

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
5. Para reproducir un periodo, `GET /api/sources/{id}/timeline` aplica la misma regla en una
   rejilla de pasos y devuelve, en cada uno, cuántas estaciones tienen dato y cuántas bicis
   suman. Los huecos se ven como pasos con menos estaciones con dato (ADR 0009).
6. Al reproducir, la web pide la línea temporal del día cada 5 min y la de la semana por horas.
   El estado de las estaciones llega en fotogramas de una hora (`GET /api/sources/{id}/frames`,
   ADR 0010): una petición por hora del día, con la siguiente pedida por adelantado. Mientras
   llega una hora se sigue viendo el último paso ya cargado.
7. «Qué muestra y qué no» pide la línea temporal de cada semana importada cada 15 minutos (con
   mayo, 4 peticiones) para la rejilla de huecos, y la guarda mientras la página siga abierta:
   cada petición cuenta para el límite de la API. Desde el 9-10-2026 la línea temporal se lee
   del resumen por paso de 5 minutos que mantienen la ingesta y la purga (`timeline_summaries`,
   ADR 0015): una semana son milisegundos, también la primera vez. `TimelineWarmUp`, que las
   dejaba calculadas al arrancar, ya no tiene qué proteger y se quita en un bloque aparte.

## Ingesta

Puntos de entrada, por línea de comandos (no hay endpoint HTTP de importación):

- `docker compose run --rm api ingest demo`: el fixture sintético.
- `docker compose run --rm api ingest bicing-archive --day 2026-08-20`: un día natural (hora de
  Barcelona) del histórico de Bicing. Descarga los dos .7z del mes a archivos temporales, los
  lee en streaming y los borra al terminar. Con `--status-file` e `--info-file` usa archivos
  locales.
- `… ingest bicing-archive --from 2026-08-17 --to 2026-08-23`: un periodo de hasta 31 días.
  Cada día es una ejecución propia; los archivos de cada mes se descargan una sola vez.
- `… purge bicing-bcn --from 2026-08-24 --to 2026-08-30`: dice qué borraría; con `--yes`,
  quita esos días (ADR 0012).

- Cada ejecución queda en `ingestion_runs` con fuente, adaptador y versión, entrada y su
  sha256, periodo, recuentos y resultado; los rechazos, en `ingestion_rejections` con su motivo.
- Un bloqueo consultivo por fuente evita dos ingestas simultáneas.
- Una descarga que falla (el portal contesta 403 al servidor, o 503) también queda en
  `ingestion_runs`, como fallida y con su error: el registro cuenta los intentos, no solo lo que
  entró. Y una ejecución que se quedó «en marcha» porque el proceso murió (memoria agotada,
  `docker stop`) la cierra como fallida la API al arrancar, pasada una hora
  (`Features/Ingestion/IngestionJanitor.cs`); sin eso, `/api/sources` la daba por última ingesta
  para siempre.
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
- Validadores (ADR 0014): el estado en un instante pedido, el detalle y el patrón de una
  estación, la línea temporal y los fotogramas llevan un ETag débil con la versión de los datos
  de su rango y `Cache-Control: private, no-cache`; con `If-None-Match` responden 304 sin
  calcular nada. «Ahora» de una fuente observada no se valida. La versión lleva también la
  compilación (`DataVersion.Build`): un despliegue invalida lo que guardó el navegador.

## Seguridad y operación

- Secretos fuera del código: `.env` (no versionado) para Compose y variables de entorno en la
  imagen. `.env.example` solo tiene valores de ejemplo.
- Repositorio público en GitHub: escaneo de secretos con bloqueo en el push (activo por defecto)
  y Dependabot con alertas y actualizaciones de seguridad (activado el 5-10-2026). La CI usa
  permisos de solo lectura y ningún secreto.
- CORS solo para los orígenes de `Cors:AllowedOrigins`: `GET` y el `POST` de la cobertura, un
  cálculo sin estado. En local y en producción no hace falta: Vite y nginx reenvían `/api`.
- Límite de 120 peticiones por minuto e IP en `/api` (configurable). Consultas acotadas: caja
  máxima de 1° y un máximo de 1 000 estaciones por respuesta (`truncated` lo indica).
- La línea temporal calcula como mucho dos rangos a la vez; los demás esperan y, si mientras
  tanto otro ha calculado el mismo, lo toman de la caché. Lo que ya está en la caché no espera.
  La espera tiene tope (`Infrastructure/ComputationGate.cs`): 10 s en la línea temporal y 5 s en
  el patrón de una estación; pasado, la petición responde 503 en `problem+json` con
  `Retry-After` en vez de seguir en cola hasta que nginx corte a los 30 s. El precalentamiento
  espera sin tope. El patrón de una estación se guarda también en la caché, con la versión de
  la fuente en la clave (la misma del ETag) y prioridad baja: si la caché se llena, se va antes
  que las semanas de la rejilla de huecos. Las consultas de estado y fotogramas tienen un tope
  de 10 s (`StationQueries.QueryTimeoutSeconds`).
- Registro de peticiones (`Infrastructure/RequestLogging.cs`): solo las que merecen mirarse,
  lentas (más de 1 s), rechazadas por el límite (429), sin hueco (503) y con fallo (5xx), con
  método, ruta, estado y duración. Sin la IP ni nada de quién las hizo.
- Índice BRIN sobre `station_observations(observed_at)` (migración `ObservedAtBrin`, 120 kB para
  768 MB): la línea temporal de una semana leía la tabla entera (650 MB, medido el 7-10-2026 con
  4 semanas en local) y ahora solo las páginas de esa semana; en local, el recorrido pasa de 130
  a 55 ms por proceso y la semana de 820 a 725 ms. En producción, medido con el precalentamiento
  tras el despliegue del 7-10-2026: las cuatro semanas de mayo en 2 955, 2 911, 2 805 y 2 815 ms,
  frente a los 3 500–4 200 de antes (un 20–30 % menos; el disco del VPS sigue mandando). Subir
  `work_mem` (4 → 64 o 256 MB) no ayuda: cambia el plan a uno sin paralelismo y tarda más;
  `random_page_cost = 1.1` tampoco (plan por el índice único, 2,5 s). Para bajar de ahí hacía
  falta la tabla de resumen, no otro índice.
- Resumen de la línea temporal por paso de 5 minutos (`timeline_summaries`, ADR 0015, desde el
  9-10-2026): el mismo SQL de antes corre una vez por ingesta (los pasos que tocan las
  observaciones nuevas, más la tolerancia) o por purga, en su transacción, y la línea temporal
  lee filas. Medido en local con 42 días (6 semanas, 6 388 595 observaciones): las semanas de la
  rejilla pasan de 1 435–1 650 ms a 5–41 ms; una semana a 15 min no cachead, 170 ms la primera
  petición tras arrancar y menos de 30 ms después; un día a 5 min, 24 ms. La tabla, 12 110 filas
  y 1,7 MB para esos 42 días (288 por día); `migrate` la calculó entera en 12,7 s, con medio
  segundo por día importado. La clave de la caché sigue llevando la versión de los datos del
  rango (ADR 0014): importar un día solo invalida las semanas que lo tocan; una purga, todas.
  El cálculo de un día en la ingesta va sin JIT, que con la estimación del `generate_series` se
  activaba siempre y añadía un 50 %.
- Detrás de un proxy, la IP del cliente sale de `X-Forwarded-For` solo si la conexión llega de
  las redes de `ForwardedHeaders:KnownNetworks` (o de localhost); si no, se ignora y nadie puede
  hacerse pasar por otra IP. En producción, la red de Docker del proyecto (`docs/despliegue.md`).
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

Entorno: Windows 11, 16 núcleos, Docker Desktop 29.6 (API y PostGIS en el mismo equipo),
compilación de producción servida por `vite preview`, Chromium 153 con la GPU. Móvil: 375×812 y
CPU ×4 (la GPU sigue siendo la del equipo: un teléfono real tiene menos). Red sin limitar; las
teselas llegan de OpenFreeMap por internet. Medido el 6 de octubre de 2026, medianas de 5, con
tiempos del propio navegador desde el inicio de la navegación (con la CPU ralentizada, el reloj
de Playwright añade el retraso de sus comprobaciones: la lista parecía tardar 1,7 s y eran 0,5).

| Carga (ms) | Escritorio, demo | Escritorio, red real | Móvil, demo | Móvil, red real |
| --- | --- | --- | --- | --- |
| HTML listo (DOMContentLoaded) | 34 | 34 | 124 | 130 |
| Primera fila de la lista | 103 | 124 | 433 | 533 |
| Mapa listo (estilo y capas) | 756 | 854 | 1 286 | 2 061 |

- La red real son 544 estaciones; la demo, 46.
- MapLibre llega en su propio fragmento: el JavaScript inicial pesa 297 KB (90 KB comprimido)
  y el del mapa 1,04 MB (273 KB) más su worker, 511 KB (143 KB). Con todo en un paquete, el
  mismo método daba en móvil con la red real el HTML a 242 ms y la lista a 885 ms; el mapa,
  igual (2,1 s). Con los límites visibles, el inicial pasa a 313 KB (97 KB comprimido) y, con
  los nombres legibles y los tres idiomas, a 353 KB (107 KB comprimido).
- Medido otra vez el 7-10-2026, `main` (`f1da256`) frente al mapa con los rótulos y las
  referencias nuevas (calles, barrios, metro, parques, portales y carriles bici), dos rondas de
  medianas de 5: mapa listo con la red real, 904–921 ms frente a 923–931 en escritorio y
  2 211–2 315 frente a 2 221–2 261 en móvil; la lista, 137–139 frente a 136–138 y 610–613
  frente a 592–596. Igual, dentro del ruido. El JavaScript, de 1 865 a 1 874 KB sin comprimir.
- «Qué muestra y qué no» en producción (VPS de Forge, 6-10-2026): la rejilla de huecos salía a
  los 12,5 s la primera vez después de arrancar la API, que calcula a la vez las cuatro semanas
  de mayo cada 15 min, y a los 0,5 s cuando ya las tiene en memoria (cada semana, 56–190 ms).
  Primero las dejó calculadas `infra/deploy.sh` y la caché de líneas temporales dejó de caducar
  por tiempo (cambia de clave con cada ingesta o purga y la acota el límite de 200 entradas). En
  producción (despliegue de `6664c93`): de 3,5 a 4,2 s por semana, unos 15 s las cuatro; la
  rejilla después, 0,58 s. Pero un reinicio sin despliegue, una importación o una purga volvían
  a dejar la espera a la primera visita. Desde el 6-10-2026 lo hace la API (`TimelineWarmUp`):
  al arrancar y cada 5 minutos, si falta alguna semana en la caché. En local (6 semanas,
  16 núcleos): con la API recién arrancada y la caché vacía, la rejilla tardaba 3,2 s; con
  `TimelineWarmUp`, unos 10 s después de arrancar ya las tiene todas (1,6–1,9 s por semana) y
  la rejilla sale en 42 ms. Si alguien abre la ficha en esos primeros segundos, aún la calcula
  su petición. En producción (despliegue de `e40ef77`, que ya no precalienta): a la primera,
  las 4 semanas en 173 ms pedidas desde fuera y la rejilla en el navegador en 374 ms en
  escritorio y 531 ms en móvil.
- Fluidez del mapa con la red real, arrastrando y acercando hasta ver los edificios en 3D (6 a
  10 s de gesto): en escritorio, 60 fps en los tres modos y ningún fotograma de más de 50 ms;
  en móvil, 48–49 fps al explorar y al reproducir (p95 de 50 ms, 11–13 fotogramas de más de
  50 ms) y 60 al experimentar, cuyos marcadores no llevan número. Ninguna tarea larga durante
  el gesto. Con el mapa nuevo (7-10-2026), lo mismo: 60 fps en escritorio en los tres modos; en
  móvil, 48,4 al explorar (48,6 con `main` ese mismo día), 49,6 al reproducir y 60,1 al
  experimentar.

- API con la demo, 31 peticiones a `127.0.0.1`: `GET /api/stations?source=demo` mediana
  4,0 ms (p90 4,4 ms; 18,5 KB sin comprimir); con `bbox`, 3,7 ms; `GET /api/sources`, 3,4 ms.
- API con un día real (540 estaciones, 154 389 observaciones): `GET /api/stations?source=bicing-bcn&at=…`
  mediana 14–16 ms (p90 17–19 ms); la consulta en PostgreSQL, 6 ms. Respuesta de 285 KB, 29 KB
  comprimida (Brotli o gzip). La primera petición tras arrancar tarda ~1 s (arranque en frío).
- Ingesta de un día real: ~19 s en total, descargas incluidas. Una semana (17–23 de agosto de
  2026, 925 784 observaciones nuevas): 72 s.
- Línea temporal con esa semana (1 080 173 observaciones), calculada al pedirla (ADR 0009, hasta
  el 9-10-2026): un día a 5 min, 0,48 s la primera vez; la semana a 15 min, 1,7 s; repetidas,
  5–9 ms desde la caché. Desde el resumen por paso (ADR 0015), milisegundos sin caché.
- Fotogramas de una hora real: 47–110 ms; 2 MB sin comprimir y 110 KB con Brotli (ADR 0010).
- Con dos semanas (2,16 millones de observaciones, 406 MB la tabla con índices) los tiempos de
  estado, fotogramas y línea temporal no cambian. `GET /api/sources`, que contaba todas las
  observaciones, pasó de 117–177 ms a 12 ms con el recuento guardado (ADR 0012).
- Cobertura con la red real (544 estaciones, radio de 300 m, Barcelona): 0,33–0,37 s por
  cálculo, 0,68 s la primera vez; 179 KB sin comprimir y 35 KB con Brotli (ADR 0013).
- Reproducir un día entero a la velocidad más alta (compilación de producción, GPU): 43,7 s,
  23 peticiones y ningún 429; tareas largas del navegador, un 13 % del tiempo, la mayor de 90 ms.
  Sin ventana, Chromium pinta WebGL por software: con el servidor de desarrollo, cada paso
  tardaba ~260 ms en vez de 150. Por eso se mide con la GPU (`e2e/reproduccion.measure.ts`).
- El tiempo del mapa depende de la red hasta OpenFreeMap; la red no se limitó.
- Probado y descartado: `content-visibility: auto` en las filas de la lista empeoraba la carga en
  móvil (lista de 1,7 a 2,2 s con el reloj de Playwright).

Para repetirlas, desde `apps/web` y sin `E2E_BASE_URL` (Playwright compila y abre
`vite preview`): `npx playwright test --config e2e/tools.config.ts --grep medicion` (todas;
escriben `test-results/measurements.json`), `--grep "tiempos de carga"`, `--grep fluidez` o
`--grep perfil` (en qué se va el tiempo de la carga en móvil).
