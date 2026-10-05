# Barcelona Pulse

Mapa de las estaciones de Bicing de Barcelona con la disponibilidad de cada una y la procedencia
de cada dato. Más adelante: reproducción del histórico y escenarios de cobertura.

**Estado (5 de octubre de 2026):** B0 y B1 terminados en local. La aplicación funciona con datos
sintéticos de demostración; la ingesta de datos reales de Bicing es el bloque B2. No está
desplegada. Detalle en [docs/roadmap.md](docs/roadmap.md).

## Qué hay

- **API** ASP.NET Core sobre .NET 10 con PostgreSQL 18 y PostGIS 3.6: fuentes de datos,
  estaciones y su estado en un instante, con OpenAPI.
- **Ingesta** por línea de comandos, idempotente y con registro de cada ejecución.
- **Web** React + MapLibre: mapa, leyenda que también filtra, lista accesible y detalle.
- **Diseño «Fanals»**: Barcelona de noche, con estados que se distinguen por forma, color y
  número. Ver [docs/design.md](docs/design.md).

## Requisitos

- Docker Desktop con Compose v2. Basta para la base de datos, la API y las pruebas de backend:
  el SDK de .NET se ejecuta en un contenedor (`sdk`).
- Node.js 24 LTS (24.15 o posterior) y npm 11, para la web.
- Opcional: SDK de .NET 10.0.401 en el equipo, para el IDE y un ciclo más rápido.

## Arranque desde cero

```bash
cp .env.example .env
docker compose up -d --build api
docker compose run --rm api ingest demo
npm --prefix apps/web ci
npm --prefix apps/web run dev
```

La web queda en http://localhost:5173 y la API en http://127.0.0.1:5080 (documento OpenAPI en
`/openapi/v1.json`, salud en `/health/live` y `/health/ready`).

`docker compose up` arranca PostGIS, aplica las migraciones (servicio `migrate`) y después
levanta la API. `ingest demo` se puede repetir: la segunda vez informa de 0 observaciones nuevas
y 572 ya existentes.

## Pruebas

| Qué | Comando | Necesita |
| --- | --- | --- |
| Backend: unitarias e integración con PostGIS real | `docker compose run --rm -e BP_REQUIRE_DB=true sdk dotnet test` | Docker |
| Web: unitarias y de componentes | `npm --prefix apps/web test` | Node |
| Web: lint, tipos y formato | `npm --prefix apps/web run lint`, `typecheck`, `format:check` | Node |
| Humo en navegador (escritorio y móvil) | `npm --prefix apps/web run test:e2e` | API con el demo importado |

- Sin `BP_TEST_POSTGRES`, las pruebas de integración salen como **omitidas**, nunca como
  pasadas. Con `BP_REQUIRE_DB=true` fallan. Dentro del contenedor `sdk` la variable ya está
  definida.
- La prueba de humo bloquea el mapa base para no depender de un servicio público: comprueba la
  lógica y que la aplicación sigue siendo usable sin mapa. El mapa conectado se revisa con las
  capturas (`npx playwright test --config e2e/tools.config.ts --grep captura`, desde `apps/web`).

## Operación

- **Migraciones:** `docker compose run --rm migrate`.
- **Nueva migración:**
  `docker compose run --rm sdk sh -c "dotnet tool restore && dotnet ef migrations add NombreCambio --project apps/api/BarcelonaPulse.Api.csproj --output-dir Infrastructure/Migrations"`.
- **Contrato HTTP:** compilar la API regenera `apps/api/openapi/barcelona-pulse-api.json`, y
  `npm --prefix apps/web run gen:api` regenera los tipos del cliente. La CI falla si alguno no
  está al día con el código.
- **Demo:** `node scripts/generate-demo-fixture.mjs` lo regenera de forma determinista. Si cambia
  su contenido, reinicia la base local: la importación conserva las observaciones que ya tenían
  la misma clave.
- **Reiniciar la base local:** `docker compose down` y `docker volume rm barcelona-pulse_db-data`.

## Problemas frecuentes

- **«Falta .env»** al usar Compose: copia `.env.example` a `.env`.
- **Puerto ocupado** (55432, 5080, 5173): cambia `DB_PORT` o `API_PORT` en `.env`; para el
  proxy de Vite, `VITE_DEV_API_TARGET`.
- **Peticiones a `localhost` lentas (~200 ms) en Windows:** usa `127.0.0.1`; los puertos se
  publican solo en IPv4.
- **«No se ha podido cargar el mapa base»:** no hay conexión con `tiles.openfreemap.org`. La
  lista de estaciones sigue funcionando.
- **Mezclar SDK local y contenedor:** no se pisan. En local se compila en `artifacts/`; en el
  contenedor, en un volumen.

## Estructura

```
apps/api/                 API, ingesta y migraciones (un proyecto, agrupado por funcionalidad)
apps/web/                 SPA React + Vite + MapLibre
tests/BarcelonaPulse.Api.Tests/   pruebas de backend (unitarias e integración con PostGIS)
scripts/                  generador del fixture de demostración
docs/                     arquitectura, fuentes, modelo de datos, hoja de ruta, ADR y muestras
docker-compose.yml        PostGIS, migraciones, API y contenedor del SDK
.github/workflows/ci.yml  CI: API con PostGIS y web
```

## Decisiones que conviene entender

- **Por qué este modelo de datos.** Cada estación tiene una identidad estable dentro de su
  fuente, sus atributos (nombre, ubicación, capacidad) van en versiones con fecha y cada
  observación se identifica por estación e instante observado. Así, repetir una importación no
  duplica nada y un cambio de ubicación no reescribe el pasado. Ver
  [docs/data-model.md](docs/data-model.md).
- **Cómo se detecta un dato desactualizado.** Para un instante T se toma la última observación
  anterior o igual a T. Si es más antigua que la tolerancia de su fuente, la estación pasa a «sin
  dato reciente» y sus recuentos quedan vacíos: no se rellena, no se interpola y no se supone
  vacía. Ver [ADR 0005](docs/adr/0005-estado-en-un-instante.md).
- **Qué significará la simulación de cobertura (B4).** El área a menos de cierta distancia en
  línea recta de alguna estación, medida en metros (EPSG:25831), sin contar dos veces los
  solapes y recortada a un área de estudio declarada. No es tiempo caminando, ni población
  cubierta, ni una predicción de viajes o esperas. Ver
  [ADR 0004](docs/adr/0004-coordenadas-y-crs.md).

## Licencia y atribuciones

El código de este repositorio se publica con licencia [MIT](LICENSE): se puede usar, también
comercialmente, conservando el aviso de copyright y la licencia.

La licencia MIT no cubre los datos ni los recursos de terceros, que mantienen sus condiciones:

- **Bicing y límites administrativos:** Ajuntament de Barcelona, CC BY 4.0. Cita exigida:
  «Fuente de los datos: Ayuntamiento de Barcelona». Las muestras de `docs/samples/` están
  recortadas; cada `PROVENANCE.md` dice qué se modificó.
- **Mapa base:** [OpenFreeMap](https://openfreemap.org/) © OpenMapTiles, datos ©
  colaboradores de OpenStreetMap (ODbL).
- **Tipografía:** Barlow Semi Condensed, SIL Open Font License 1.1.
- **Dependencias** (MapLibre GL JS, React, .NET, Npgsql…): cada una con su licencia.
- **Demo:** datos inventados por `scripts/generate-demo-fixture.mjs`, bajo la misma licencia
  MIT. No representan disponibilidad real y la interfaz lo indica siempre.

## Documentación

- [Arquitectura y versiones](docs/architecture.md)
- [Fuentes de datos](docs/data-sources.md)
- [Modelo de datos](docs/data-model.md)
- [Hoja de ruta y backlog](docs/roadmap.md)
- [Decisiones de arquitectura (ADR)](docs/adr/)
