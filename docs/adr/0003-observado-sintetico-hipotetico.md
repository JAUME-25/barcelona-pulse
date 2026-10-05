# 0003. Observado, demo sintética y escenario hipotético nunca se mezclan

Fecha: 2026-10-05. Estado: aceptada.

## Contexto

La demo debe poder probarse sin credenciales de Bicing, pero no puede confundirse con
disponibilidad real. Los escenarios (B4) inventan estaciones a propósito.

## Decisión

- Cada fuente (`data_sources`) declara `kind`: `observed` o `synthetic`. El ingestor impide que
  una fuente cambie de tipo.
- La API devuelve siempre la fuente con su tipo, y la web muestra un aviso «Demo: datos
  inventados» mientras se vea una sintética. Una vista muestra una sola fuente: no hay mezcla.
- Sin `at`, una fuente sintética se muestra en el final de sus datos (10-3-2026, 10:00), nunca
  como «ahora».
- Los escenarios hipotéticos tendrán tablas y endpoints propios en B4.

## Consecuencias

- La demo es un adaptador más: recorre el mismo camino de validación e idempotencia que los
  datos reales.
- Para regenerar el fixture con otro contenido hay que reiniciar la base local o subir su
  versión: la clave de idempotencia conserva lo ya importado.
