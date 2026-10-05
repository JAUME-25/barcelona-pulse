# 0008. Consulta del estado en un instante con SQL explícito

Fecha: 2026-10-05. Estado: aceptada.

## Contexto

La consulta central de la API («para cada estación, la última observación ≤ T») estaba escrita
en LINQ. Con un día real del histórico (154 389 observaciones), EF Core la traducía como
`ROW_NUMBER() OVER (PARTITION BY station_id ORDER BY observed_at DESC)` sobre todas las
observaciones de todas las fuentes anteriores a T: 100 ms por petición y creciendo con cada día
importado (en B3 serían millones de filas).

## Decisión

- La consulta va en SQL explícito (`StationQueries.StatesSql`): por cada versión vigente en T,
  `LEFT JOIN LATERAL (… ORDER BY observed_at DESC LIMIT 1)`, que baja hacia atrás por el índice
  único `(station_id, observed_at)` una vez por estación.
- El resto del acceso a datos sigue en EF Core. La regla de frescura sigue en
  `StationStateRules`: el SQL solo busca la observación.
- Las pruebas de integración contra PostGIS cubren la consulta (caja, límites de tolerancia,
  instante anterior a los datos, versiones vigentes en T).

## Consecuencias

- Medido el 5-10-2026 con 540 estaciones reales: 6 ms en PostgreSQL (540 búsquedas por índice,
  `EXPLAIN ANALYZE`) y 14–16 ms de mediana por petición HTTP en local, frente a 119 ms antes.
- El coste depende del número de estaciones, no del tamaño del histórico.
- Un cambio de columnas en `station_observations` obliga a revisar este SQL; las pruebas de
  integración fallan si se olvida.
