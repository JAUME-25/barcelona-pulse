# 0005. Estado de una estación en un instante

Fecha: 2026-10-05. Estado: aceptada.

## Contexto

Explorar (B1) y Reproducir (B3) necesitan la misma respuesta a «¿cómo estaba esta estación en
el instante T?». Las fuentes publican a intervalos, con huecos y con estaciones que dejan de
informar. Rellenar huecos inventaría datos.

## Decisión

- Se toma la última observación con `observed_at ≤ T`. Nunca una posterior.
- Si `T − observed_at` supera la tolerancia de la fuente (`data_sources.staleness_tolerance`;
  30 min en la demo), el estado es `unknown` y los recuentos `null`. El límite exacto cuenta
  como vigente.
- `freshness` distingue `current`, `stale` (hay dato, pero viejo; se devuelve su fecha) y `none`.
- Sin interpolar bicis entre observaciones ni dibujar trayectos: los cambios de stock no dicen de
  dónde a dónde fue nadie.
- La regla vive en un único sitio (`StationStateRules`) y la consulta SQL solo busca la última
  observación ≤ T.

## Consecuencias

- Determinista: la misma T da la misma respuesta.
- B3 reutiliza la regla moviendo T por la línea temporal.
- La tolerancia de cada fuente real se fijará viendo su frecuencia de publicación (el histórico
  municipal publica cada ~5 min).
