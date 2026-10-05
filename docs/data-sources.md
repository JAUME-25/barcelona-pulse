# Fuentes de datos

Comprobado el 5 de octubre de 2026 desde este entorno. Las muestras y su procedencia (URL, hora,
estado HTTP, sha256) están en [`docs/samples/`](samples/); las del GBFS del operador no se
redistribuyen porque no publica licencia. Que un catálogo liste un recurso no
prueba que funcione: todo lo de aquí se ha pedido de verdad.

## Resumen

| Fuente | Acceso hoy | Uso previsto |
| --- | --- | --- |
| Bicing tiempo real, Open Data BCN (JSON) | **Requiere token personal.** Sin él: 302 a `/tokens`. | B2, cuando Jaume tenga el token. |
| Bicing histórico mensual, Open Data BCN (.7z con CSV) | Público. 2019-03 a 2026-08, con huecos. | B2 (una muestra real) y B3. |
| Información de estaciones histórica (.7z) | Público. Columnas sin comprobar. | B2/B3, para ubicaciones y capacidades. |
| GBFS del operador (`barcelona.publicbikesystem.net`) | Público y sin autenticación. **Sin licencia publicada.** | Ninguno hasta aclarar condiciones. |
| datos.gob.es | Solo metadatos; remite a Open Data BCN; desactualizado (último mes listado: 2026-04). | Ninguno. |
| API antigua `api.bsmsa.eu` | 503 «API blocked». | Ninguno. |
| Mapa base OpenFreeMap | Público, sin clave ni límites publicados. | Ya en uso. |
| Límites administrativos, Open Data BCN | Público, CC BY 4.0. | B4 (área de estudio). |

## Bicing en Open Data BCN

Datasets `estat-estacions-bicing` (estado) e `informacio-estacions-bicing` (información).
Licencia **CC BY 4.0**. Las condiciones del portal exigen citar «Fuente de los datos: Ayuntamiento
de Barcelona» e indicar que los datos se han modificado cuando se distribuyen transformados.

### Tiempo real (token)

- Los recursos JSON responden `302` a `https://opendata-ajuntament.barcelona.cat/tokens?…` sin
  token, y también con una cabecera `Authorization` inventada.
- Esquema documentado en CKAN (no observado): `last_updated`, `ttl` y `data.stations[]` con
  `station_id`, `num_bikes_available`, `num_bikes_available_types{mechanical, ebike}`,
  `num_docks_available`, `is_installed`, `is_renting`, `is_returning`, `last_reported`,
  `is_charging_station` y `status`. Inferencia: es el GBFS 1.1 del operador.

**Qué tiene que hacer Jaume para obtener el token** (los nombres son los que salen en pantalla;
no se ha creado ninguna cuenta):

1. Registrarse en https://opendata-ajuntament.barcelona.cat/es/user/register («Crear nueva
   cuenta»): nombre de usuario, correo, «Tipo de usuario», «Te interesan los datos por» y el
   consentimiento de protección de datos.
2. Iniciar sesión en `/es/user/login`.
3. Pedir el token en la página «Token de acceso» (`/es/tokens`). Según el portal hace falta una
   solicitud explícita; no se ha visto dónde aparece el token después.
4. Guardarlo en `.env` como `OPENDATA_BCN_TOKEN=…` (B2 lo añadirá a `.env.example` vacío). La
   API lo enviará como cabecera `Authorization: <token>`, sin «Bearer», que es como aparece en
   el ejemplo del portal. Nunca en el código, en los logs ni en el navegador.

Pendiente de comprobar con un token válido: formato real, versión GBFS, si trae campos
`*_disabled`, caducidad del token y cuota (el portal la menciona sin cifra).

### Histórico mensual (público)

- Archivos `AAAA_MM_<Mes>_BicingNou_ESTACIONS.7z` (estado) e `…_INFORMACIO.7z` (información). El
  enlace de CKAN redirige (302) a `/resources/bcn/BicingBCN/<archivo>.7z`, que responde 200 sin
  autenticación.
- Cobertura: 87 archivos de estado y 88 de información, de 2019-03 a 2026-08. Faltan 2025-11
  (documentado), 2026-07 y 2026-09; 2026-01 existe en la ruta estática pero no en CKAN. El de
  2022-03 «INFORMACIO» en CKAN apunta en realidad al de ESTACIONS.
- Tamaño: de 1,6 a 26 MB comprimidos (mediana 22,7 MB); unos 1,84 GB en total. Agosto de 2026:
  18 MB en 7z, 256 MB y 3 987 120 filas en CSV.
- Se descomprime con el `tar.exe` de Windows (bsdtar/libarchive).
- CSV con cabecera entre comillas, separador coma, fin de línea LF y sin BOM. Columnas:
  `station_id, num_bikes_available, is_charging_station, status, traffic,
  num_bikes_available_types.mechanical, num_bikes_available_types.ebike, num_docks_available,
  last_reported, is_installed, is_renting, is_returning, last_updated, ttl`.
  Booleanos `TRUE`/`FALSE`, ausentes `NA` (`traffic` siempre), indicadores 0/1. Sin columnas de
  elementos deshabilitados.
- `station_id` son enteros sin comillas: se guardarán como texto.
- `last_reported` y `last_updated` son **segundos epoch en UTC**. El archivo de agosto acaba en
  2026-08-31T21:55:04Z, las 23:55 en Barcelona. Inferencia: los meses se cortan en hora local.
- Una instantánea cada ~300 s (288 por día local).
- Calidad observada: del 1 al 5 de agosto de 2026 casi no hay instantáneas (2 a 10 por día) y no
  figura en la lista de huecos conocidos del dataset. La estación 366 lleva `last_reported` de
  junio de 2025 en el archivo y en el feed actual del operador.

## GBFS del operador (candidato aparte)

- Listado en el catálogo de MobilityData (`systems.csv`):
  `https://barcelona.publicbikesystem.net/customer/gbfs/v3.0/gbfs.json`, versiones 1.1, 2.3 y
  3.0. Responde 200 sin autenticación, con CORS abierto y `ttl: 0`.
- 543 estaciones. `station_id` de texto (`"1"`) y `external_id` UUID. v2.3 incluye
  `num_bikes_disabled` y `num_docks_disabled`; v3.0 usa `vehicle_types_available`.
- `feed_contact_email` es de Lyft. **No publica licencia ni condiciones**, y la CC BY del
  Ajuntament no lo cubre. No se usa hasta aclararlo con el operador; tampoco como sustituto
  silencioso del feed municipal.

## Mapa base: OpenFreeMap

- Estilos que responden: `liberty`, `bright`, `positron`, `dark` y `fiord`
  (`https://tiles.openfreemap.org/styles/<nombre>`). Teselas vectoriales OpenMapTiles hasta
  z14 (por encima, sobreescaladas).
- Edificios: capa `building` con `render_height` y `render_min_height` (comprobado en una
  tesela del centro). Solo `liberty` trae extrusión (`building-3d`, desde z14); en `positron` y
  `dark` la añade la aplicación con esos atributos. A z14 los edificios llegan fusionados por
  altura: no se pueden seleccionar uno a uno.
- Gratis, sin registro, sin clave y sin límites publicados; uso comercial permitido; sin SLA y
  puede cerrar sin aviso (ToS del 9-9-2026). Prohíbe la descarga automatizada masiva: no se
  precargan ni empaquetan teselas.
- Atribución obligatoria: «OpenFreeMap © OpenMapTiles Data from OpenStreetMap». MapLibre la
  muestra a partir de la TileJSON.
- Plan B si deja de servir: autoalojar (MIT, descargas semanales del planeta) o un proveedor de
  pago, documentando cuotas y costes antes.

## Límites administrativos

- Dataset `20170706-districtes-barris`, CC BY 4.0. Los «JSON» no son GeoJSON: son arrays con
  geometrías WKT en EPSG:25831 (`geometria_etrs89`) y en WGS84 (`geometria_wgs84`, orden lon
  lat). 10 distritos y 73 barrios.
- El término municipal como polígono está en un ZIP de CartoBCN (EPSG:25831, 22,8 MB).
- El servidor da 503 a ratos; hay que reintentar con espera.
- Muestra: `docs/samples/boundaries/BarcelonaCiutat_Districtes.json` (sin modificar).

## Sistema de referencia para medir

EPSG:25831 (ETRS89 / UTM 31N), oficial en España para cartografía (RD 1071/2007) y el que usa
el Ajuntament. En Barcelona las distancias salen un 0,03 % más cortas (unos 3 m cada 10 km).
Web Mercator las infla 1,33 veces a esta latitud: no sirve para medir. Ver ADR 0004.
