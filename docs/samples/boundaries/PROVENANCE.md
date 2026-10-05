# Procedencia: BarcelonaCiutat_Districtes.json

Copia sin modificar del recurso publicado por el Ajuntament de Barcelona.

| Campo | Valor |
|---|---|
| Dataset | `20170706-districtes-barris` (Open Data BCN, «Administrative units of the city of Barcelona») |
| Recurso | `5f8974a7-7937-4b50-acbc-89204d570df9` (BarcelonaCiutat_Districtes.json) |
| URL de descarga | https://opendata-ajuntament.barcelona.cat/data/dataset/808daafa-d9ce-48c0-925a-fa5afdb1ed41/resource/5f8974a7-7937-4b50-acbc-89204d570df9/download |
| Redirige (302) a | https://opendata-ajuntament.barcelona.cat/resources/bcn/EstadisticaUnitatsAdministratives/BarcelonaCiutat_Districtes.json |
| Descargado (UTC) | 2026-10-05T18:42:05Z (cabecera `Date` de la respuesta) |
| `Last-Modified` del servidor | Tue, 29 Sep 2026 00:24:36 GMT (ETag `"82afb-65c94351f8563"`) |
| `last_modified` en CKAN | 2024-11-12T07:57:18 |
| Tamaño | 535291 bytes |
| SHA-256 | `af77999dcfcc336a22ff51c25bb3d4e76c6435eeffee4280307469d347682e12` |
| Licencia | CC BY 4.0 (`license_id: CC-BY-4.0` en CKAN). Fuente según CKAN: «Ajuntament de Barcelona» |

## Formato

No es GeoJSON. Es un array JSON de 10 objetos (uno por distrito) con estas claves:

- `Codi_Districte`, `nom_districte`
- `geometria_etrs89`: WKT (`POLYGON` / `MULTIPOLYGON`) en EPSG:25831 (ETRS89 / UTM 31N, metros)
- `geometria_wgs84`: WKT con la misma geometría en grados, orden lon lat

Comprobado el 2026-10-05: al proyectar con proj4 a EPSG:25831 los vértices de `geometria_wgs84`
(184 vértices muestreados, uno de cada 50), coinciden con `geometria_etrs89` a menos de 1 mm.

No incluye el límite municipal como polígono propio.
