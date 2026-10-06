# 0011. Los días que se pueden reproducir salen de lo importado

Fecha: 2026-10-06. Estado: aceptada.

## Contexto

La web elegía los días que se podían reproducir a partir del periodo de la fuente: la primera y
la última observación. Pero una estación del histórico publica desde el 12-6-2025 el mismo
`last_reported`, y esa observación (correcta: por ella sale «sin dato reciente») estiraba el
periodo hasta 2025. Con una semana importada, el periodo decía «de junio de 2025 a agosto de
2026». Tampoco servía para saber qué días faltan si se importan semanas sueltas.

## Decisión

- Cada ingesta guarda el periodo que dice cubrir su entrada (`ingestion_runs.covered_from` y
  `covered_to`, [desde, hasta)): el día pedido del histórico (un día de Barcelona, de 23 o 25 h
  en los cambios de hora) o, en el demo, de su primera a su última observación.
- `GET /api/sources` devuelve `days`: las fechas de Barcelona que tocan esos periodos, solo de
  ingestas terminadas (una fallida no deja nada que reproducir). `period` se queda como estaba,
  porque dice otra cosa: la primera y la última observación.
- La web reproduce esos días y enseña la semana entera (de lunes a domingo) del día elegido:
  los días sin datos importados se ven, discontinuos, pero no se pueden elegir. Si hay más
  semanas, flechas para pasar de una a otra.
- Las ingestas anteriores a este cambio no tienen periodo: reimportar, que es idempotente, lo
  completa. Mientras una fuente no tenga ninguno, la web usa los últimos 7 días de su periodo.

## Consecuencias

- Con dos semanas importadas (17 a 30 de agosto de 2026), `days` da esos 14 días aunque el
  periodo empiece en 2025.
- Un día importado sin observaciones (si el portal publicara un día vacío) se puede elegir y se
  ve sin datos: es lo que hay.
- Quitar un periodo (retención, ADR 0012) tiene que quitarlo también de `days`.
