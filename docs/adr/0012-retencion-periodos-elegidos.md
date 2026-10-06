# 0012. Retención: periodos elegidos y un comando para quitarlos

Fecha: 2026-10-06. Estado: aceptada.

## Contexto

El histórico de Bicing son unas 155 000 observaciones al día: 206 MB por semana con índices,
~57 millones de filas y ~11 GB al año. Medido con una y con dos semanas reales (1,08 y 2,16
millones de filas): el estado en un instante (27 ms), los fotogramas (45–103 ms) y la línea
temporal de un día (0,48–0,56 s) no cambian, porque van por el índice `(station_id,
observed_at)`. Lo único que crecía con la tabla era `GET /api/sources`, que contaba todas las
observaciones en cada petición (de 80 a 177 ms; con un año serían segundos en cada carga de
página).

## Decisión

- Sin borrado automático ni ventana móvil: los datos son periodos del histórico importados a
  propósito. Para el despliegue (B5), un presupuesto de unas 4 semanas elegidas (~0,8 GB), por
  ejemplo una de agosto y una laborable de otoño.
- `purge FUENTE (--day D | --from D --to D) [--yes]` quita días enteros de Barcelona, hasta 31
  por orden. Sin `--yes` solo dice qué borraría. Borra las observaciones de esos días y marca
  las ingestas que los cubrían (`ingestion_runs.purged_at`), que se conservan como registro y
  dejan de dar días para reproducir. Estaciones y versiones no se tocan. No parte una ingesta
  que cubra días dentro y fuera. Usa el mismo cerrojo por fuente que la ingesta. Volver a
  importar esos días los recupera.
- El recuento de observaciones de cada fuente se guarda (`data_sources.observation_count`): la
  ingesta suma las nuevas y la purga resta las borradas, en la misma transacción. La primera y
  la última observación se buscan por estación, con el índice. `GET /api/sources` pasa de 117–177
  ms a 12 ms con dos semanas, y ya no depende del tamaño.
- La caché de la línea temporal incluye la última purga en su clave: borrar datos la invalida
  aunque no haya una ingesta nueva.

## Consecuencias

- Al quitar un día, los minutos iniciales del día siguiente pueden quedarse sin dato: la última
  observación anterior era del día quitado. Es lo que dice la regla del estado en un instante.
- Las observaciones de una ingesta que caen fuera de su día (las de las 23:5x del día anterior,
  o el `last_reported` de 2025 que repite una estación) no se borran con ese día: se borran por
  instante, no por ingesta.
- Sin particiones: a este tamaño no hacen falta. Si llega el tiempo real (una ingesta cada pocos
  minutos y una ventana móvil), particiones por mes y borrar particiones enteras.
