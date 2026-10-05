# Hoja de ruta

Actualizado el 5 de octubre de 2026.

| Bloque | Estado | Criterio de cierre |
| --- | --- | --- |
| **B0** Validación y decisiones | Hecho | Fuentes comprobadas, versiones fijadas, arquitectura y ADR. |
| **B1** Primera funcionalidad completa | Hecho | PostGIS, demo idempotente, API de estaciones, mapa, lista y detalle, pruebas. |
| **B2** Ingesta observada | En curso | Una muestra real entra y se consulta con origen y fecha; repetirla no duplica. |
| B3 Reproducción histórica | Pendiente | Reproduce un periodo real respetando huecos y de forma determinista. |
| B4 Escenarios de cobertura | Pendiente | Cálculo espacial comprobado, sin solapes duplicados ni conclusiones de demanda. |
| B5 Demo y portfolio | Pendiente | Demo estable y desplegada, rendimiento medido, caso técnico. |

## Decisiones tomadas

- **Diseño:** «Fanals», trabajado para que se oriente tan bien como la versión clara
  (`docs/design.md`). Las otras dos direcciones se descartaron.
- **B2 empieza por el histórico público.** El token del tiempo real queda para más adelante
  (pasos en `docs/data-sources.md`).
- **Repositorio público** en GitHub (`JAUME-25/barcelona-pulse`), código con licencia MIT. Los
  datos y recursos de terceros conservan sus licencias (ver README).

## B2: plan

Empezar por lo que es público y tiene licencia clara, sin esperar al token:

1. Adaptador del histórico mensual (`BicingMonthlyArchiveAdapter`): lectura en streaming del CSV
   dentro del 7z, límites de tamaño descomprimido, filas y tiempo; `last_reported` epoch → UTC;
   `NA` → nulo; `station_id` como texto; mapeo de `status` e `is_installed/is_renting/is_returning`
   al estado normalizado. Fixtures pequeños versionados (cabecera + filas reales recortadas, más
   casos rotos a mano).
2. Metadatos: leer el `…_INFORMACIO.7z` del mismo mes para ubicaciones y capacidades (sus columnas
   están sin comprobar: es lo primero).
3. Comando `ingest bicing-archive --month 2026-08 [--day 2026-08-20]` que descarga con timeout,
   reintentos acotados y verificación de tamaño, o lee un archivo local. Importar un día, no el mes
   entero, para empezar.
4. Fuente `bicing-bcn` de tipo `observed`, con atribución «Fuente de los datos: Ayuntamiento de
   Barcelona» visible en la interfaz.
5. Recuento de conflictos (misma clave, valores distintos) y paso a `COPY` si el volumen lo pide.
6. Con token: adaptador del tiempo real (`Authorization: <token>`; un 302 a `/tokens` es un
   fallo de autenticación, no un éxito), tarea programada con su intervalo y estado «Última
   observación» con la frescura medida.

## Backlog

- Web: cargar MapLibre en diferido (el paquete principal pesa 1,28 MB).
- Web: idiomas (ca, en) cuando haya textos estables; hoy solo es.
- Web: E2E en CI (Compose con API y PostGIS) cuando haya despliegue.
- API: compresión de respuestas; caché HTTP con validación para `/api/stations`.
- API: cabeceras reenviadas (`ForwardedHeaders`) para el límite por IP detrás de un proxy.
- Índice no único en `station_versions(station_id)` si las consultas de detalle crecen.
- Rendimiento: conjunto de referencia de ~540 estaciones y medida de fps en escritorio y móvil.
- Fuentes: aclarar condiciones del GBFS del operador antes de cualquier uso.

## Fuera de alcance de la primera versión

Tráfico, contaminación, meteorología, rutas a pie, predicción de demanda, recomendaciones
operativas, cuentas, suscripciones, colaboración y administración compleja.
