# Procedencia de las muestras de Bicing

Muestras pequeñas tomadas el 2026-10-05 para conocer el formato real de cada fuente. No contienen tokens ni credenciales. Los hashes y tamaños son de la respuesta completa (cuerpo ya descomprimido si llegó en gzip), no del archivo recortado que hay aquí.

## 1. Fuente municipal: Open Data BCN (CKAN)

Datasets: `estat-estacions-bicing` y `informacio-estacions-bicing`.

- Licencia (CKAN `license_id`): **CC-BY-4.0**, «Creative Commons Attribution 4.0», https://creativecommons.org/licenses/by/4.0/
- Condiciones de uso del portal: https://opendata-ajuntament.barcelona.cat/es/condicions-us . Cita exigida, literal: «Fuente de los datos: Ayuntamiento de Barcelona» (versión inglesa: «Source of the data: Barcelona City Council»). Las modificaciones sobre los datos deben indicarse como tales al distribuirlos.
- Autor según CKAN: «Gerència d'Ecologia, Urbanisme i Mobilitat»; `fuente`: B:SM.

### 1a. Tiempo real (JSON securizado): sin muestra

Ambos recursos JSON (`Estat_Estacions_Bicing_securitzat_json`, `Informacio_Estacions_Bicing_securitzat.json`) exigen token. No se ha guardado muestra. Respuesta observada sin token (y también con una cabecera `Authorization` inventada, no válida), 2026-10-05T18:39:24Z y 18:46:40Z:

```
GET https://opendata-ajuntament.barcelona.cat/data/dataset/6aa3416d-ce1a-494d-861b-7bd07f069600/resource/1b215493-9e63-4a12-8980-2d7e0fa19f85/download
HTTP/1.1 302 Found
Content-Type: text/html; charset=UTF-8
Content-Length: 481
Location: https://opendata-ajuntament.barcelona.cat/tokens?resource_id=1b215493-9e63-4a12-8980-2d7e0fa19f85&package_id=6aa3416d-ce1a-494d-861b-7bd07f069600
<html> ... <h1>302 Found</h1> The resource was found at <a href="https://opendata-ajuntament.barcelona.cat/tokens?..."> ... (recortado)
```

El recurso de información (`.../bd2462df-6e1e-4e37-8205-a4b8e7313b84/resource/f60e9291-5aaa-417d-9b91-612a9de800aa/download`) responde igual, con su propio `resource_id` en el `Location`.

### 1b. Histórico mensual: `2026_08_Agost_BicingNou_ESTACIONS_head20.csv`

| Campo | Valor |
|---|---|
| URL CKAN | https://opendata-ajuntament.barcelona.cat/data/dataset/6aa3416d-ce1a-494d-861b-7bd07f069600/resource/f00d2447-ca0f-4188-adfb-3ae9c9a24ff0/download |
| Redirección (302) a | https://opendata-ajuntament.barcelona.cat/resources/bcn/BicingBCN/2026_08_Agost_BicingNou_ESTACIONS.7z |
| Descarga (UTC) | 2026-10-05T18:47:01Z |
| HTTP | 302 → 200, `Content-Type: application/x-7z-compressed`, `Last-Modified: Fri, 02 Oct 2026 21:02:48 GMT`, `ETag: "1126b69-65ce1dac7caa5"` |
| Archivo .7z completo | 17 984 361 bytes, sha256 `3eff97c1d27a1074a9dd1e3f9be459debe3f29ec58c7ccae6f202b96b5dc9cea` |
| CSV dentro del .7z | `2026_08_Agost_BicingNou_ESTACIONS.csv`, 256 371 890 bytes, sha256 `b568cc5f9e7dee20e102cc4737215470e27d76fbaded7c6aed7e09046dd8a3e5`, 3 987 120 filas de datos |
| Extracción | `C:\Windows\System32\tar.exe -xf` (bsdtar 3.8.8 / libarchive 3.8.8) |
| Recorte | cabecera + primeras 20 filas, bytes idénticos al original (fin de línea LF, sin BOM) |
| Licencia / atribución | CC BY 4.0; «Fuente de los datos: Ayuntamiento de Barcelona» |

El .7z y el CSV completos se borraron de la carpeta temporal; no están en el repo.

## 2. Candidato aparte: feed GBFS del operador (no es el feed municipal)

Listado en el catálogo oficial de MobilityData (`systems.csv`, rama master, último commit al archivo 2026-09-28):

```
ES,Bicing,Barcelona,bike_barcelona,https://www.bicing.barcelona/,https://barcelona.publicbikesystem.net/customer/gbfs/v3.0/gbfs.json,1.1 ; 2.3 ; 3.0,,,
```

- Dominio `barcelona.publicbikesystem.net`. `system_information` dice `name: "Bike Barcelona"`, `feed_contact_email: "mobility-data-client@lyft.com"`.
- **Licencia: ninguna publicada.** Ni el feed (`system_information` no trae `license_url`, `terms_url` ni `attribution_*`) ni el catálogo (columnas de autenticación vacías y sin columna de licencia) indican condiciones de uso. Antes de usarlo en producción hay que aclararlas con el operador.
- Sin autenticación: todas las peticiones dieron 200 sin cabeceras especiales.

| Archivo | URL | Descarga (UTC) | HTTP | Encoding | Bytes (cuerpo completo) | sha256 (cuerpo completo) | Recorte |
|---|---|---|---|---|---|---|---|
| `gbfs-v3.0_gbfs.json` | https://barcelona.publicbikesystem.net/customer/gbfs/v3.0/gbfs.json | 2026-10-05T18:48:50Z | 200 | gzip | 968 | `ae72a93a1c4ed1da950528335f6c0a129e1068f3e915a8ff9b0f40a643b79326` | ninguno |
| `gbfs-v3.0_gbfs_versions.json` | https://barcelona.publicbikesystem.net/customer/gbfs/v3.0/gbfs_versions | 2026-10-05T18:48:51Z | 200 | gzip | 331 | `af184d2c2fdb1ca4c580f7668f9b77aac3842c4eb69540b80cbfad7c39793020` | ninguno |
| `gbfs-v3.0_system_information.json` | https://barcelona.publicbikesystem.net/customer/gbfs/v3.0/system_information | 2026-10-05T18:48:51Z | 200 | gzip | 478 | `ffd01863126e2409b37e8fedc7365aa17fb82a9c406d4525b9db7b1e7543173e` | ninguno |
| `gbfs-v3.0_vehicle_types.json` | https://barcelona.publicbikesystem.net/customer/gbfs/v3.0/vehicle_types | 2026-10-05T18:48:52Z | 200 | gzip | 4022 | `3a8ec723d52c3e0ffae6e1d231674c8b767f1caba56f7c5c4b6b66072aeef7a9` | ninguno |
| `gbfs-v3.0_station_information.json` | https://barcelona.publicbikesystem.net/customer/gbfs/v3.0/station_information | 2026-10-05T18:48:52Z | 200 | gzip | 516508 | `cdeeafb5188ebc34a9599d6bd7d361d1b342b00cb02f8876a64d4ec86538ea8b` | `data.stations`: 5 de 543 |
| `gbfs-v3.0_station_status.json` | https://barcelona.publicbikesystem.net/customer/gbfs/v3.0/station_status | 2026-10-05T18:48:53Z | 200 | gzip | 267679 | `26401e970a1a1ac72989578d20be479d44c5e6e746842b2d42b7d5cddbcd6655` | `data.stations`: 5 de 543 |
| `gbfs-v3.0_system_pricing_plans.json` | https://barcelona.publicbikesystem.net/customer/gbfs/v3.0/system_pricing_plans | 2026-10-05T18:48:53Z | 200 | gzip | 11171 | `0d432c8cec48233a8170beeeb625d651c0feb88d4da50561a0945f807647b0de` | `data.plans`: 2 de 20 |
| `gbfs-v3.0_system_regions.json` | https://barcelona.publicbikesystem.net/customer/gbfs/v3.0/system_regions | 2026-10-05T18:48:54Z | 200 | gzip | 85 | `d4221660b81b1f8cb63b634d3f0b89cc40bafd22c6810508313ab81c4a4ef8cf` | ninguno |
| `gbfs-v3.0_geofencing_zones.json` | https://barcelona.publicbikesystem.net/customer/gbfs/v3.0/geofencing_zones | 2026-10-05T18:48:54Z | 200 | gzip | 152 | `05a59a81e0d3c3e243690e3ac33d6571313bc2f6b7f7f45ed797d86d27de6f53` | ninguno |
| `gbfs-v2.3_gbfs.json` | https://barcelona.publicbikesystem.net/customer/gbfs/v2/gbfs.json | 2026-10-05T18:48:55Z | 200 | gzip | 4600 | `d4c158f34de299086f538a4722941fde0ae78df2d585f069659e7d63d11521b7` | solo bloque `en` (había en, fr, ca, nl, es) |
| `gbfs-v2.3_en_system_information.json` | https://barcelona.publicbikesystem.net/customer/gbfs/v2/en/system_information | 2026-10-05T18:48:55Z | 200 | gzip | 401 | `f6afeb3750f80d78ce2b87787dcfa95ee0574d1c2336ce5bfc8cd098a14a1e2e` | ninguno |
| `gbfs-v2.3_en_station_information.json` | https://barcelona.publicbikesystem.net/customer/gbfs/v2/en/station_information | 2026-10-05T18:48:56Z | 200 | gzip | 326390 | `efb7f617cadbe2619333504aacb5172098bbc2e1ea8e42a6c43a629797afa7ff` | `data.stations`: 5 de 543 |
| `gbfs-v2.3_en_station_status.json` | https://barcelona.publicbikesystem.net/customer/gbfs/v2/en/station_status | 2026-10-05T18:48:56Z | 200 | gzip | 290594 | `29d9273395e9e7eed64abf370a481fa6ba3d5628e8170f43ee9267092fd01eae` | `data.stations`: 5 de 543 |
| `gbfs-v1.1_gbfs.json` | https://barcelona.publicbikesystem.net/ube/gbfs/v1/ | 2026-10-05T18:48:57Z | 200 | gzip | 3814 | `f63ab08249818862a70e0c6ae016134d33d636b9f1a1b31f063dfbc59c17358d` | solo bloque `en` (había en, fr, ca, nl, es) |
| `gbfs-v1.1_en_system_information.json` | https://barcelona.publicbikesystem.net/customer/ube/gbfs/v1/en/system_information | 2026-10-05T18:48:57Z | 200 | gzip | 385 | `a8cbb6e203d82d16d963c07b6fdcd91877db9bcc167b08bdeb7be6cdae14c797` | ninguno |
| `gbfs-v1.1_en_station_information.json` | https://barcelona.publicbikesystem.net/customer/ube/gbfs/v1/en/station_information | 2026-10-05T18:48:57Z | 200 | gzip | 286735 | `99f5232c66b47026b34a7b32baf57cf6542b4e36f1dd1ce947929c63bc1de199` | `data.stations`: 5 de 543 |
| `gbfs-v1.1_en_station_status.json` | https://barcelona.publicbikesystem.net/customer/ube/gbfs/v1/en/station_status | 2026-10-05T18:48:58Z | 200 | gzip | 169045 | `4c5cb8ca5dbc76acb6a97dec925f1c5f494d7bf7b718508b380b3e5d88b8667d` | `data.stations`: 5 de 543 |

**Estas muestras no están en el repositorio.** Se guardaron durante la comprobación del 5 de octubre de 2026 (recortadas a 5 estaciones), pero el feed no publica licencia y el repositorio es público, así que no se redistribuyen. La tabla conserva la URL, la hora, el tamaño y el sha256 de cada respuesta completa para poder repetir la comprobación. Los feeds tienen `ttl: 0` y `last_updated` cambia en cada petición: una descarga nueva dará otro hash.
