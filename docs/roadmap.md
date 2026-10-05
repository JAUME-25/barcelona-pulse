# Hoja de ruta

Actualizado el 5 de octubre de 2026.

| Bloque | Estado | Criterio de cierre |
| --- | --- | --- |
| **B0** Validación y decisiones | Hecho | Fuentes comprobadas, versiones fijadas, arquitectura y ADR. |
| **B1** Primera funcionalidad completa | Hecho | PostGIS, demo idempotente, API de estaciones, mapa, lista y detalle, pruebas. |
| **B2** Ingesta observada | Hecho | Una muestra real entra y se consulta con origen y fecha; repetirla no duplica. |
| **B3** Reproducción histórica | Siguiente | Reproduce un periodo real respetando huecos y de forma determinista. |
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

## B3: plan

1. Importar un periodo: `--from` y `--to` reutilizando la descarga del mes. Empezar con una
   semana completa (17 a 23 de agosto de 2026) y medir volumen (~155 000 filas por día).
2. Periodos disponibles: endpoint con la cobertura real por hora (instantáneas y estaciones con
   dato), para que la línea temporal enseñe los huecos en vez de esconderlos.
3. Línea temporal en la web: control deslizante accesible con teclado, pasos de 5 y 15 min,
   reproducción con pausa, sin animación si se pide movimiento reducido. Cancelar las peticiones
   viejas al moverse; medir antes de decidir si hace falta un endpoint de «fotogramas».
4. Pruebas: días de cambio de hora (23 y 25 h), cambio de día, huecos que dejan estaciones en
   «sin dato reciente», resultado igual para el mismo instante.
5. Retención: un año entero serían ~57 millones de filas. Decidir qué periodos se guardan antes
   de importar más de unas semanas.

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
- API: cabeceras reenviadas (`ForwardedHeaders`) para el límite por IP detrás de un proxy.
- Índice no único en `station_versions(station_id)` si las consultas de detalle crecen.
- Rendimiento: medir la carga de la web con las 540 estaciones reales y la fluidez (fps).
- Fuentes: aclarar condiciones del GBFS del operador antes de cualquier uso.

## Fuera de alcance de la primera versión

Tráfico, contaminación, meteorología, rutas a pie, predicción de demanda, recomendaciones
operativas, cuentas, suscripciones, colaboración y administración compleja.
