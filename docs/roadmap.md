# Hoja de ruta

Actualizado el 5 de octubre de 2026.

| Bloque | Estado | Criterio de cierre |
| --- | --- | --- |
| **B0** Validación y decisiones | Hecho | Fuentes comprobadas, versiones fijadas, arquitectura y ADR. |
| **B1** Primera funcionalidad completa | Hecho | PostGIS, demo idempotente, API de estaciones, mapa, lista y detalle, pruebas. |
| **B2** Ingesta observada | Hecho | Una muestra real entra y se consulta con origen y fecha; repetirla no duplica. |
| **B3** Reproducción histórica | En curso | Reproduce un periodo real respetando huecos y de forma determinista. |
| B4 Escenarios de cobertura | Pendiente | Cálculo espacial comprobado, sin solapes duplicados ni conclusiones de demanda. |
| B5 Demo y portfolio | Pendiente | Demo estable y desplegada, rendimiento medido, caso técnico. |

## Decisiones tomadas

- **Diseño:** «Fanals», trabajado para que se oriente tan bien como la versión clara
  (`docs/design.md`). Las otras dos direcciones se descartaron.
- **B2 empieza por el histórico público.** El token del tiempo real queda para más adelante
  (pasos en `docs/data-sources.md`).
- **Repositorio público** en GitHub (`JAUME-25/barcelona-pulse`), código con licencia MIT. Los
  datos y recursos de terceros conservan sus licencias (ver README).

## B2: cómo se cerró

- `ingest bicing-archive --day 2026-08-20` descarga los dos .7z de agosto, importa el día y
  registra la ejecución: 540 estaciones (549 versiones), 155 364 filas, 154 389 observaciones
  nuevas, 773 repetidas, 202 en conflicto y 0 rechazadas. Repetirla: 0 nuevas, 0 versiones,
  0 rechazos.
- La API la sirve con su origen (`observed`), su atribución y su licencia; la web la enseña en su
  último momento («20 de agosto de 2026, 23:55») avisando de que no es el estado actual.
- Fallos explicados: rechazos con motivo en `ingestion_rejections`, conflictos contados en la
  ejecución, límites de tamaño y tiempo, reintentos ante 503.
- Por el camino: la consulta del estado pasó a SQL explícito (de 119 a 14 ms, ADR 0008) y las
  respuestas se comprimen (285 KB → 29 KB).

## B3: estado

1. **Hecho.** Importar un periodo: `--from` y `--to` (hasta 31 días), con la descarga de cada
   mes una sola vez. La semana del 17 al 23 de agosto de 2026 entró en 72 s (925 784
   observaciones nuevas). Reimportarla: 0 nuevas y 0 rechazos. Importar un periodo anterior a
   lo conocido completa la historia de versiones en vez de rechazarla.
2. **Hecho.** Línea temporal: `GET /api/sources/{id}/timeline` con estaciones con dato y sumas
   por paso, misma regla que el mapa, máximo 7 días y caché por ingesta (ADR 0009).
3. **Hecho.** Interfaz de «Reproducir» (`?modo=reproducir&dia=…&hora=…`), elegida entre tres
   propuestas (`docs/design.md`). Pista y relojes con teclado, ratón y pasos de 5 min; la
   reproducción para si no llega el estado de las estaciones. Medido: cada fotograma es una
   petición a `/api/stations` y a velocidad alta se pasaba del límite de 120 por minuto (429).
   Ahora el ritmo es fijo (un fotograma cada 0,7 s, 88 peticiones en un minuto, ningún 429) y la
   velocidad decide cuánto avanza el reloj (5, 15 o 30 min).
4. **Hecho.** Pruebas: rejilla en días de 23 y 25 h, huecos que dejan estaciones sin dato, cada
   paso igual al mapa en ese instante, horas de Barcelona en el navegador, interfaz (unitarias,
   de componentes y de humo en escritorio y móvil).
5. **Por decidir.** Retención: un año entero serían ~57 millones de filas y ~11 GB. Decidir qué
   periodos se guardan antes de importar más de unas semanas.
6. **Pendiente.** Días que se pueden reproducir. El periodo de una fuente va de su primera a su
   última observación, y una estación que publica el mismo `last_reported` desde el 12-6-2025
   lo estira hasta entonces (el dato es correcto: por eso sale «sin dato reciente»). Los días
   reproducibles deben salir de lo importado (la ventana de cada ingesta), no del mínimo y el
   máximo. Mientras, la web ofrece los últimos 7 días del periodo.
7. **Propuesta.** Endpoint de «fotogramas» (una hora de pasos en una petición, cacheable porque
   el pasado no cambia): reproducción a pasos de 5 min más rápida sin acercarse al límite.

## Backlog

- Web: cargar MapLibre en diferido (el paquete principal pesa 1,28 MB).
- Web: los nombres reales llegan en mayúsculas («AV. CAN MARCET, 3»); valorar un formato de
  lectura que respete partículas catalanas, sin cambiar el dato guardado.
- Web: a escala de ciudad, 540 marcadores se solapan; valorar una vista agregada que no esconda
  estados.
- Web: idiomas (ca, en) cuando haya textos estables; hoy solo es.
- Web: E2E en CI (Compose con API y PostGIS) cuando haya despliegue.
- Tiempo real con el token de Open Data BCN (`Authorization: <token>`; un 302 a `/tokens` es un
  fallo de autenticación): tarea programada y «Última observación» con frescura medida.
- API: caché HTTP con validación para `/api/stations`.
- API: `GET /api/sources` calcula el periodo y el recuento recorriendo todas las observaciones
  de la fuente (80 ms con una semana real; crecerá con el histórico). Sacarlo de
  `ingestion_runs` o precalcularlo en cada ingesta.
- API: cabeceras reenviadas (`ForwardedHeaders`) para el límite por IP detrás de un proxy.
- Índice no único en `station_versions(station_id)` si las consultas de detalle crecen.
- Rendimiento: medir la carga de la web con las 540 estaciones reales y la fluidez (fps).
- Fuentes: aclarar condiciones del GBFS del operador antes de cualquier uso.

## Fuera de alcance de la primera versión

Tráfico, contaminación, meteorología, rutas a pie, predicción de demanda, recomendaciones
operativas, cuentas, suscripciones, colaboración y administración compleja.
