# Modelo de datos

PostgreSQL 18 con PostGIS 3.6. Nombres en `snake_case`. Instantes en `timestamptz` (UTC).
Esquema en `apps/api/Infrastructure/Migrations`.

## Tablas

| Tabla | Qué guarda | Clave natural |
| --- | --- | --- |
| `data_sources` | Fuente: `kind` (`observed` o `synthetic`), nombre, atribución, licencia, tolerancia de frescura y recuento de observaciones (lo llevan ingesta y purga). | `id` (texto: `demo`, …) |
| `stations` | Identidad estable de una estación dentro de su fuente. | `(source_id, source_station_id)` |
| `station_versions` | Nombre, dirección, distrito, barrio, ubicación (`geometry(Point,4326)`) y capacidad durante un intervalo. | una vigente por estación |
| `station_observations` | Estado publicado en un instante: estado, bicis (total, mecánicas, eléctricas), anclajes libres, deshabilitados, si presta y si admite devoluciones, y marcas de calidad. | `(station_id, observed_at)` |
| `ingestion_runs` | Cada ingesta: fuente, adaptador y versión, entrada y sha256, periodo observado y periodo que dice cubrir (`covered_from`, `covered_to`), recuentos (nuevas, duplicadas, en conflicto, rechazadas), resultado y, si sus días se quitaron, cuándo (`purged_at`). | |
| `ingestion_rejections` | Registros rechazados con su motivo (hasta 1 000 por ingesta; el total va en `ingestion_runs`). | |
| `study_areas` | Áreas de estudio de la cobertura en EPSG:25831: los 10 distritos oficiales y Barcelona como su unión, con su superficie, procedencia y sha256 del archivo. | `id` (`barcelona`, `districte-01`…) |

Los escenarios hipotéticos (B4) no se guardan: se calculan al pedirlos y el escenario viaja en
la petición (ADR 0013). Ninguna tabla tiene estaciones inventadas.

## Contrato normalizado

Los adaptadores traducen su formato a `IngestionBatch` (`Features/Ingestion/IngestionBatch.cs`):
`SourceDescriptor`, `NormalizedStation`, `NormalizedObservation` y `RejectedRecord`. El resto de
la aplicación no conoce el esquema de ningún proveedor. Campos mínimos: identificador de origen,
procedencia, instante observado, instante de ingesta (`ingested_at`), estado y calidad.

## Reglas

**Idempotencia.** Una observación es «la estación X según la fuente en el instante T»: la clave
es `(station_id, observed_at)`, no la hora de descarga. Repetir una ingesta o recibir dos veces
el mismo feed no crea filas. Cada fila válida acaba en uno de tres recuentos: **nueva**,
**duplicada** (misma clave y mismos valores que otra ya vista) o **en conflicto** (misma clave,
valores distintos). En un conflicto se conserva la primera, en el lote y frente a lo guardado.
Una ingesta con rechazos o conflictos termina como `succeeded_with_issues`.

**Versiones de atributos.** Si cambia el nombre, la dirección, la ubicación (más de ~1 cm) o la
capacidad, se cierra la versión vigente (`valid_to`) y se abre otra (`valid_from`). La primera
versión conocida tiene `valid_from` nulo: no sabemos desde cuándo existe y se asume vigente
hacia atrás. Si se consulta un instante anterior a su publicación, la API lo marca con
`metadataAssumed`. Un lote puede traer varias publicaciones de la misma estación (el histórico
repite los atributos en cada instantánea): se reducen a los momentos en que cambian y cada
cambio abre una versión. Al reimportar un periodo ya conocido, una publicación antigua que
coincide con la versión de su momento no es nueva. Si se importa después un periodo anterior o
intermedio, completa la historia: la versión que se suponía vigente hacia atrás pasa a empezar
cuando se publicó, o el tramo ya conocido se parte en dos. Lo que ya estaba observado no
cambia.

**Estado en un instante** (ADR 0005). Última observación con `observed_at ≤ T`. Si su antigüedad
supera la tolerancia de la fuente (30 min en la demo, 15 min en el histórico de Bicing; límite
incluido), el estado es
`unknown` y los recuentos `null`. `freshness` lo explica: `current`, `stale` (hay dato pero
viejo) o `none` (nunca hubo).

**Nulos.** Un recuento ausente es `null` en la base de datos, la API y la interfaz. Una estación
`closed` o en `maintenance` no se presenta como vacía aunque publique ceros. El histórico no
publica elementos deshabilitados: quedan nulos, no a cero. `is_renting` e `is_returning` son
nulos si la fuente no los da; una estación en servicio que no presta ni admite devoluciones se
muestra fuera de servicio.

**Validación común** (`IngestionRules`), sea cual sea el adaptador:

| Motivo | Cuándo |
| --- | --- |
| `missing_field` | Falta id, nombre, coordenadas o instante. |
| `invalid_value` | Valor fuera del vocabulario (p. ej. un estado desconocido). |
| `ambiguous_timestamp` | Instante sin zona: no se convierte por suposición. |
| `timestamp_in_future` | Más de 5 min por delante del reloj del servidor. |
| `coordinates_out_of_range` | No es una coordenada WGS84 válida. |
| `outside_service_area` | Fuera de una envolvente amplia de Barcelona (incluye lat/lon intercambiadas). |
| `negative_count` | Algún recuento negativo. |
| `duplicate_in_batch` | La misma estación dos veces en un lote. |
| `unknown_station` | Observación de una estación que no está en la fuente. |
| `metadata_older_than_current` | Publicación antigua que ninguna versión cubre. No debería darse: la primera versión se asume vigente hacia atrás. |

**Marcas de calidad.** No se corrigen los datos; se señalan. `counts_exceed_capacity`: bicis y
anclajes (libres y deshabilitados) suman más que la capacidad publicada.
`bike_types_mismatch`: mecánicas más eléctricas no dan el total. Que sumen menos que la
capacidad es normal y no se marca.

**Días que se pueden reproducir** (ADR 0011). Las fechas de Barcelona que tocan los periodos
cubiertos por ingestas terminadas: el día pedido en el histórico, de la primera a la última
observación en el demo. No salen del mínimo y el máximo de las observaciones: una estación que
repite un `last_reported` de 2025 estiraría el periodo hasta entonces.

**Zona horaria.** Se guarda UTC. La web formatea con `Intl` en `Europe/Madrid`, sea cual sea la
zona del navegador (la prueba de humo corre con el navegador en Nueva York).

## Índices

- `ux_station_observations_station_observed_at` (único): idempotencia y la búsqueda de la
  última observación ≤ T por estación, con un recorrido hacia atrás por estación (ADR 0008).
- `ix_station_versions_location` (GiST): filtro por caja.
- `ix_station_versions_one_current_per_station` (único parcial, `valid_to IS NULL`).
- `ix_stations_source_id_source_station_id` (único).

**Retención** (ADR 0012). Se guardan los periodos que se importan a propósito, sin borrado
automático: ~155 000 observaciones y unos 30 MB por día, 206 MB por semana, ~11 GB al año. Para
el despliegue, unas 4 semanas elegidas. `purge` quita días enteros (sus observaciones) y marca
sus ingestas; reimportarlos los recupera. Las consultas no dependen del tamaño de la tabla (van
por el índice); sin particiones mientras no haya una ventana móvil.

## Fixture de demostración

`apps/api/Features/Ingestion/Demo/demo-fixture.v1.json`, generado por
`scripts/generate-demo-fixture.mjs` con semilla fija (mismo archivo byte a byte). 46 estaciones
en ubicaciones aproximadas, 572 observaciones del martes 10-3-2026 de 07:00 a 10:00 (hora de
Barcelona) cada 15 min. Casos límite a propósito:

| Id | Caso |
| --- | --- |
| `demo-008` | En mantenimiento, con 6 anclajes deshabilitados. |
| `demo-013` | Cerrada todo el periodo (publica ceros: no es vacía). |
| `demo-015` | Hueco de una hora y vuelve a informar. |
| `demo-019` / `demo-022` | Acaba llena / acaba vacía. |
| `demo-024` | Deja de informar a las 07:45: al final, fuera de tolerancia. |
| `demo-031` | Recuentos por encima de la capacidad (marca de calidad). |
| `demo-037` | Nunca informa. |
| `demo-042` | Solo publica el total de bicis, sin desglose. |
