# 0004. WGS84 para guardar, EPSG:25831 para medir

Fecha: 2026-10-05. Estado: aceptada (la parte de medición se aplicará en B4).

## Contexto

Las fuentes publican latitud y longitud WGS84. La cobertura (B4) necesita metros y metros
cuadrados fiables. Calcular sobre grados da resultados sin sentido, y Web Mercator infla las
distancias 1,33 veces a la latitud de Barcelona.

## Decisión

- Ubicaciones en `geometry(Point,4326)` con índice GiST. En código, orden longitud, latitud
  (X, Y), como GeoJSON.
- Filtros por zona con `ST_Intersects` sobre una caja WGS84 (usa el índice).
- Distancias, buffers y áreas en **EPSG:25831** (ETRS89 / UTM 31N): `ST_Transform` a 25831,
  cálculo en metros y, si hace falta, vuelta a 4326. Es el sistema oficial (RD 1071/2007) y el
  que usa el Ajuntament en sus límites. En Barcelona el error de escala es de ~0,03 %.
- `geography` solo si algún cálculo saliera del área de Barcelona.

## Consecuencias

- B4 debe comprobar unidades en las pruebas (p. ej. un buffer de 300 m tiene ~282 743 m²).
- Los límites de Open Data BCN ya traen geometría en 25831: se pueden usar sin reproyectar.
