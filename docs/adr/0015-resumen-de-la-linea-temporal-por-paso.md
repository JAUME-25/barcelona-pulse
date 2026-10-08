# 0015. Resumen de la línea temporal por paso, mantenido por la ingesta

Fecha: 2026-10-09. Estado: aceptada. Sustituye el cálculo al pedirla de la ADR 0009.

## Contexto

La línea temporal (`GET /api/sources/{id}/timeline`) se calculaba al pedirla sobre las
observaciones (ADR 0009): cada observación cubre los pasos desde su instante hasta el siguiente
reporte de su estación, sin pasar de la tolerancia, y se agrega por paso. Con un índice BRIN y la
versión de los datos por rango (ADR 0014) se quedó en 2,8–3,0 s por semana en producción, y la
nota de `architecture.md` lo decía: para bajar de ahí hace falta una tabla de resumen, no otro
índice. Mientras tanto, un precalentamiento (`TimelineWarmUp`) dejaba calculadas las semanas de la
rejilla de huecos al arrancar y las vigilaba cada 5 minutos, con un tope de dos cálculos a la vez
y un 503 si no había hueco.

## Decisión

- **Una tabla, `timeline_summaries`**: por fuente y paso de 5 minutos, lo que la línea temporal
  devuelve en un punto (estaciones con dato, contadas, vacías, llenas, sumas de bicis, anclajes y
  eléctricas). El paso es el más fino que sirve la API; los demás (10, 15, 30 y 60) son
  subconjuntos exactos de la misma rejilla, alineada en UTC. Solo hay fila en los pasos con
  alguna estación con dato: los demás son ceros y nulos al leer. Un año de una fuente son unas
  105 000 filas.
- **La mantienen la ingesta y la purga, en su transacción** (`TimelineSummaries.RefreshAsync`),
  como el recuento de observaciones (ADR 0012): la ingesta vuelve a calcular los pasos desde la
  primera observación nueva hasta la última más la tolerancia (lo que esas observaciones pueden
  decidir); la purga, los de los días quitados más la tolerancia. La regla es la misma de antes,
  la del estado en un instante (ADR 0005) con la precedencia de la leyenda, en un solo SQL que
  ahora corre una vez por ingesta en vez de en cada petición. Con el cerrojo por fuente de la
  ingesta, nunca hay dos recalculando lo mismo.
- **Las estaciones conocidas no van en la tabla.** Dependen de las versiones de hoy (una estación
  nueva se asume conocida hacia atrás) y las cuenta la lectura con dos listas ordenadas de
  inicios y fines de versión y una búsqueda binaria por paso, en vez de cruzar en SQL cada paso
  con todas las versiones.
- **La primera vez la calcula `migrate`** (`RebuildMissingAsync`: fuentes con observaciones y
  sin resumen), para que la API arranque con la línea temporal entera sin un paso manual. Y
  `summarize [FUENTE]` la recalcula entera, para cuando cambie la regla: un día por consulta,
  porque sobre todo el histórico de golpe ordenaría millones de filas.
- Lo que no cambia: la prueba que cruza cada paso con `GET /api/stations?at=…` sigue vigilando
  la regla, y el ETag de la línea temporal sigue con la versión por rango (ADR 0014), porque las
  filas de un rango solo cambian con las ingestas que lo tocan o con una purga.

## Consecuencias

- Leer una semana es leer 2 016 filas y contar versiones: milisegundos, también la primera vez
  después de arrancar. Medido en local el 9-10-2026 con 42 días: las semanas de la rejilla de
  huecos pasan de 1 435–1 650 ms a 5–41 ms; un día a 5 min, 24 ms. La tabla, 288 filas por día
  (12 110 filas y 1,7 MB para esos 42 días). En producción, las cuatro semanas de mayo en 84,
  9, 11 y 10 ms frente a 2 955, 2 911, 2 805 y 2 815 ms antes (`architecture.md`).
- Cada ingesta de un día tarda algo más (el cálculo de ese día, medio segundo en local).
  `migrate` calculó los 42 días en 12,7 s.
- Hay una tabla derivada que mantener. Si se borran observaciones por otra vía que `purge`, o
  cambia la regla, `summarize` la deja bien. Si una fuente de tiempo real importa cada pocos
  minutos, cada ingesta recalcula solo los pasos que toca.
- El precalentamiento (`TimelineWarmUp`), la caché en memoria, el tope de cálculos y el 503 de
  la línea temporal ya no tenían qué proteger: se quitaron el mismo 9-10-2026 (B5.32). El
  patrón de una estación conserva su caché y su tope.
