# Hoja de ruta

Actualizado el 6 de octubre de 2026.

| Bloque | Estado | Criterio de cierre |
| --- | --- | --- |
| **B0** Validación y decisiones | Hecho | Fuentes comprobadas, versiones fijadas, arquitectura y ADR. |
| **B1** Primera funcionalidad completa | Hecho | PostGIS, demo idempotente, API de estaciones, mapa, lista y detalle, pruebas. |
| **B2** Ingesta observada | Hecho | Una muestra real entra y se consulta con origen y fecha; repetirla no duplica. |
| **B3** Reproducción histórica | Hecho | Reproduce un periodo real respetando huecos y de forma determinista. |
| **B4** Escenarios de cobertura | En curso | Cálculo espacial comprobado, sin solapes duplicados ni conclusiones de demanda. |
| B5 Demo y portfolio | Pendiente | Demo estable y desplegada, rendimiento medido, caso técnico. |

## Decisiones tomadas

- **Diseño:** «Fanals», trabajado para que se oriente tan bien como la versión clara
  (`docs/design.md`). Las otras dos direcciones se descartaron.
- **B2 empieza por el histórico público.** El token del tiempo real queda para más adelante
  (pasos en `docs/data-sources.md`).
- **Repositorio público** en GitHub (`JAUME-25/barcelona-pulse`), código con licencia MIT. Los
  datos y recursos de terceros conservan sus licencias (ver README).
- **Reproducir:** el reproductor bajo el mapa, con los relojes de la semana y los pasos de 5
  minutos de otra de las propuestas (`docs/design.md`).
- **Retención:** periodos elegidos, sin borrado automático; unas 4 semanas para el despliegue y
  `purge` para quitar días (ADR 0012).

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

## B3: cómo se cerró

1. **Hecho.** Importar un periodo: `--from` y `--to` (hasta 31 días), con la descarga de cada
   mes una sola vez. La semana del 17 al 23 de agosto de 2026 entró en 72 s (925 784
   observaciones nuevas). Reimportarla: 0 nuevas y 0 rechazos. Importar un periodo anterior a
   lo conocido completa la historia de versiones en vez de rechazarla.
2. **Hecho.** Línea temporal: `GET /api/sources/{id}/timeline` con estaciones con dato y sumas
   por paso, misma regla que el mapa, máximo 7 días y caché por ingesta (ADR 0009).
3. **Hecho.** Interfaz de «Reproducir» (`?modo=reproducir&dia=…&hora=…`), elegida entre tres
   propuestas (`docs/design.md`). Pista y relojes con teclado, ratón y pasos de 5 min; la
   reproducción para si no llega el estado de las estaciones. Una petición por paso superaba el
   límite de 120 por minuto (429): ahora el estado llega en fotogramas de una hora (punto 7).
4. **Hecho.** Pruebas: rejilla en días de 23 y 25 h, huecos que dejan estaciones sin dato, cada
   paso igual al mapa en ese instante, horas de Barcelona en el navegador, interfaz (unitarias,
   de componentes y de humo en escritorio y móvil).
5. **Hecho.** Retención (ADR 0012): periodos importados a propósito, sin borrado automático;
   `purge` quita días enteros (sin `--yes`, solo dice qué borraría). Medido: con el doble de
   datos, estado, fotogramas y línea temporal tardan lo mismo; `/api/sources`, que contaba todo,
   pasa de 117–177 ms a 12 ms con un recuento que llevan ingesta y purga.
6. **Hecho.** Días que se pueden reproducir: salen del periodo que cubre cada ingesta terminada
   (`days` en `/api/sources`, ADR 0011), no del mínimo y el máximo de las observaciones, que
   una estación con un `last_reported` de 2025 estiraba. La web enseña la semana del día
   elegido, con los días sin datos a la vista, y flechas si hay más semanas. En local hay dos
   semanas importadas (17 a 30 de agosto de 2026).
7. **Hecho.** Fotogramas: `GET /api/sources/{id}/frames`, 12 pasos por petición con la misma
   regla que el mapa (ADR 0010). Un día entero a la velocidad más alta, con todos los pasos de
   5 min: 43,7 s, 23 peticiones y ningún 429.

## B4: estado

1. **Hecho.** Áreas de estudio: los 10 distritos oficiales del Ajuntament y Barcelona como su
   unión (101,702 km²), con `ingest study-areas` (ADR 0013).
2. **Hecho.** Cálculo: `POST /api/scenarios/coverage`, modelo `cobertura-geometrica` v1, sin
   guardar escenarios. Comprobado con PostGIS (un círculo exacto, estaciones coincidentes,
   solapes, recorte al área, capacidad que no cambia nada, mismo resultado al repetir) y medido
   con la red real: 0,33–0,37 s; el 56 % de Barcelona a menos de 300 m.
3. **Siguiente.** Pantalla «Experimentar»: dos o tres direcciones para elegir antes de
   construirla. Colocar, mover y quitar estaciones; radio y área; base y escenario comparados
   con los números y los supuestos a la vista; cian solo para la cobertura y forma propia para
   las hipotéticas; el escenario en la URL.
4. **Pendiente.** Pruebas de la interfaz y de humo.

## Backlog

- Web: cargar MapLibre en diferido (el paquete principal pesa 1,30 MB).
- Web: los nombres reales llegan en mayúsculas («AV. CAN MARCET, 3»); valorar un formato de
  lectura que respete partículas catalanas, sin cambiar el dato guardado.
- Web: a escala de ciudad, 540 marcadores se solapan; valorar una vista agregada que no esconda
  estados.
- Web: idiomas (ca, en) cuando haya textos estables; hoy solo es.
- Web: E2E en CI (Compose con API y PostGIS) cuando haya despliegue.
- Tiempo real con el token de Open Data BCN (`Authorization: <token>`; un 302 a `/tokens` es un
  fallo de autenticación): tarea programada y «Última observación» con frescura medida.
- API: caché HTTP con validación para `/api/stations`.
- Reproducir: los fotogramas pesan 110 KB por hora con Brotli (2,6 MB un día). Si pesa en
  móvil, formato por columnas (~58 KB) o caché comprimida en el servidor. Medir también la
  fluidez en móvil: pintar el mapa es lo que más cuesta.
- Despliegue (B5): elegir las ~4 semanas que se publican (ADR 0012); una laborable de otoño
  enseñaría mejor los desplazamientos al trabajo que agosto.
- API: cabeceras reenviadas (`ForwardedHeaders`) para el límite por IP detrás de un proxy.
- Índice no único en `station_versions(station_id)` si las consultas de detalle crecen.
- Rendimiento: medir la carga de la web con las 540 estaciones reales y la fluidez (fps).
- Fuentes: aclarar condiciones del GBFS del operador antes de cualquier uso.

## Fuera de alcance de la primera versión

Tráfico, contaminación, meteorología, rutas a pie, predicción de demanda, recomendaciones
operativas, cuentas, suscripciones, colaboración y administración compleja.
