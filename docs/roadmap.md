# Hoja de ruta

Actualizado el 6 de octubre de 2026.

| Bloque | Estado | Criterio de cierre |
| --- | --- | --- |
| **B0** Validación y decisiones | Hecho | Fuentes comprobadas, versiones fijadas, arquitectura y ADR. |
| **B1** Primera funcionalidad completa | Hecho | PostGIS, demo idempotente, API de estaciones, mapa, lista y detalle, pruebas. |
| **B2** Ingesta observada | Hecho | Una muestra real entra y se consulta con origen y fecha; repetirla no duplica. |
| **B3** Reproducción histórica | Hecho | Reproduce un periodo real respetando huecos y de forma determinista. |
| **B4** Escenarios de cobertura | Hecho | Cálculo espacial comprobado, sin solapes duplicados ni conclusiones de demanda. |
| **B5** Demo y portfolio | En curso | Demo estable y desplegada, rendimiento medido, caso técnico. |

## Decisiones tomadas

- **Diseño:** «Fanals», trabajado para que se oriente tan bien como la versión clara
  (`docs/design.md`). Las otras dos direcciones se descartaron.
- **B2 empieza por el histórico público.** El token del tiempo real queda para más adelante
  (pasos en `docs/data-sources.md`).
- **Repositorio público** en GitHub (`JAUME-25/barcelona-pulse`), código con licencia MIT. Los
  datos y recursos de terceros conservan sus licencias (ver README).
- **Reproducir:** el reproductor bajo el mapa, con los relojes de la semana y los pasos de 5
  minutos de otra de las propuestas (`docs/design.md`).
- **Retención:** periodos elegidos, sin borrado automático; unas 4 semanas para el despliegue y
  `purge` para quitar días (ADR 0012).
- **Experimentar:** el mando bajo el mapa, como en Reproducir, de las tres propuestas
  (`docs/design.md`).

## B2: cómo se cerró

- `ingest bicing-archive --day 2026-08-20` descarga los dos .7z de agosto, importa el día y
  registra la ejecución: 540 estaciones (549 versiones), 155 364 filas, 154 389 observaciones
  nuevas, 773 repetidas, 202 en conflicto y 0 rechazadas. Repetirla: 0 nuevas, 0 versiones,
  0 rechazos.
- La API la sirve con su origen (`observed`), su atribución y su licencia; la web la enseña en su
  último momento («20 de agosto de 2026, 23:55») avisando de que no es el estado actual.
- Fallos explicados: rechazos con motivo en `ingestion_rejections`, conflictos contados en la
  ejecución, límites de tamaño y tiempo, reintentos ante 503.
- Por el camino: la consulta del estado pasó a SQL explícito (de 119 a 14 ms, ADR 0008) y las
  respuestas se comprimen (285 KB → 29 KB).

## B3: cómo se cerró

1. **Hecho.** Importar un periodo: `--from` y `--to` (hasta 31 días), con la descarga de cada
   mes una sola vez. La semana del 17 al 23 de agosto de 2026 entró en 72 s (925 784
   observaciones nuevas). Reimportarla: 0 nuevas y 0 rechazos. Importar un periodo anterior a
   lo conocido completa la historia de versiones en vez de rechazarla.
2. **Hecho.** Línea temporal: `GET /api/sources/{id}/timeline` con estaciones con dato y sumas
   por paso, misma regla que el mapa, máximo 7 días y caché por ingesta (ADR 0009).
3. **Hecho.** Interfaz de «Reproducir» (`?modo=reproducir&dia=…&hora=…`), elegida entre tres
   propuestas (`docs/design.md`). Pista y relojes con teclado, ratón y pasos de 5 min; la
   reproducción para si no llega el estado de las estaciones. Una petición por paso superaba el
   límite de 120 por minuto (429): ahora el estado llega en fotogramas de una hora (punto 7).
4. **Hecho.** Pruebas: rejilla en días de 23 y 25 h, huecos que dejan estaciones sin dato, cada
   paso igual al mapa en ese instante, horas de Barcelona en el navegador, interfaz (unitarias,
   de componentes y de humo en escritorio y móvil).
5. **Hecho.** Retención (ADR 0012): periodos importados a propósito, sin borrado automático;
   `purge` quita días enteros (sin `--yes`, solo dice qué borraría). Medido: con el doble de
   datos, estado, fotogramas y línea temporal tardan lo mismo; `/api/sources`, que contaba todo,
   pasa de 117–177 ms a 12 ms con un recuento que llevan ingesta y purga.
6. **Hecho.** Días que se pueden reproducir: salen del periodo que cubre cada ingesta terminada
   (`days` en `/api/sources`, ADR 0011), no del mínimo y el máximo de las observaciones, que
   una estación con un `last_reported` de 2025 estiraba. La web enseña la semana del día
   elegido, con los días sin datos a la vista, y flechas si hay más semanas. En local hay dos
   semanas importadas (17 a 30 de agosto de 2026).
7. **Hecho.** Fotogramas: `GET /api/sources/{id}/frames`, 12 pasos por petición con la misma
   regla que el mapa (ADR 0010). Un día entero a la velocidad más alta, con todos los pasos de
   5 min: 43,7 s, 23 peticiones y ningún 429.

## B4: cómo se cerró

1. **Hecho.** Áreas de estudio: los 10 distritos oficiales del Ajuntament y Barcelona como su
   unión (101,702 km²), con `ingest study-areas` (ADR 0013).
2. **Hecho.** Cálculo: `POST /api/scenarios/coverage`, modelo `cobertura-geometrica` v1, sin
   guardar escenarios. Comprobado con PostGIS (un círculo exacto, estaciones coincidentes,
   solapes, recorte al área, capacidad que no cambia nada, mismo resultado al repetir) y medido
   con la red real: 0,33–0,37 s; el 56 % de Barcelona a menos de 300 m. Superficies al metro
   cuadrado: una estación en zona ya cubierta dejaba restos de coma flotante (1e-8 m²).
3. **Hecho.** Pantalla «Experimentar» (`?modo=experimentar`), elegida entre tres propuestas
   (`docs/design.md`): añadir, mover y quitar estaciones en el mapa (ratón y dedo), radio y área,
   la comparación con la red real, los supuestos y el escenario en la URL. Cada nueva o movida
   enseña su círculo de alcance (`geometries.reach`) y un aviso explica por qué un cambio no
   mueve la superficie: al probarla, una estación nueva en Navas no ganaba nada y parecía que no
   pasaba nada.
4. **Hecho.** Pruebas: de backend (cero exacto en zona cubierta, círculos del cálculo, estación
   fuera del área), unitarias (cifras, aviso, círculos vigentes), de componentes (quitar tocando
   el mapa cambia lo que se calcula), de humo con la demo y capturas con el mapa real que también
   la usan (añadir con ratón y con el dedo, mover, quitar, recuperar, radio, área y aviso) en
   escritorio, 375 y 320 px.

## B5: estado

Entrega del brief: pulido visual, rendimiento medido, despliegue documentado y material para el
caso técnico. Cierre: demo estable, límites visibles, pruebas pertinentes y una explicación
honesta de lo hecho.

1. **Hecho.** Rendimiento con la red real (544 estaciones) en escritorio y móvil, carga y
   fluidez de los tres modos (`docs/architecture.md`). MapLibre pasa a su propio fragmento: en
   móvil, la lista llega a los 533 ms en vez de 885.
2. **Hecho**, salvo el monitor externo. En marcha desde el 6-10-2026 en
   https://pulse.jaumeperez.com con las cuatro semanas del 4 al 31 de mayo de 2026 (decidido
   por Jaume ese día), en el VPS de Forge: un VPS aparte con memoria suficiente costaba el
   doble, y en el de Forge había 3 GB de memoria disponibles y 28 GB de disco. Medido en
   producción: 28 días sin rechazos, 4 229 269 observaciones y 548 estaciones, con dato en el
   98,3 % de los pasos de 5 min de media; 20 de 8 064 pasos por debajo del 90 % (miércoles 6,
   13, 20 y 27, unos minutos) y ninguno vacío. La web dice «Datos históricos · mayo de 2026» y
   la fecha completa del instante. Comprobado desde fuera: cabeceras de seguridad, `/api` y
   `/health/ready` a través de nginx, certificado, y los tres modos sin errores en la consola
   en escritorio, 375 y 320 px (`e2e/despliegue.capture.ts`). El portal de Open Data BCN
   contesta 403 al servidor: los .7z de mayo se descargaron fuera y se subieron
   (`docs/despliegue.md`).
3. **Hecho** y en producción desde el 6-10-2026 (`8903d65`, CI verde). Límites visibles,
   elegidos ese día mezclando tres propuestas (`docs/design.md`):
   - «Qué muestra y qué no»: de cuándo son los datos, una rejilla de huecos por día y hora que
     lleva a reproducir el día, las estaciones sin dato con el motivo, qué no dice la aplicación
     y de dónde sale cada cosa.
   - Junto al dato: a qué horas faltan datos bajo la pista de Reproducir y notas en «con dato» y
     en el resultado de la cobertura.
   - Un sello en el mapa en móvil.
   - Corregido de paso: la lista decía «Sin dato reciente desde las 10:54» de una estación sin
     datos desde junio de 2025, y el detalle, «es de las 12 de junio…».
   - Pruebas: unitarias de textos y huecos, una de la app con la ficha, y capturas en
     escritorio, 375 y 320 px (`e2e/limites.capture.ts`).
   - Comprobado en producción desde fuera: los tres modos y la ficha en escritorio y móvil, sin
     errores en la consola (`e2e/despliegue.capture.ts`). Mayo, medido cada 15 min: dato en el
     98,3 % de las estaciones de media y 12 de 2 688 pasos por debajo del 95 %, todos de
     madrugada (02:15 a 04:45) los miércoles 6, 13, 20 y 27.
   - La rejilla tardaba 12,5 s la primera vez que se abría después de arrancar la API (calcula
     las cuatro semanas) y 0,5 s después. Ahora `infra/deploy.sh` la deja calculada
     (`infra/warm-up.mjs`) y la caché de líneas temporales ya no caduca por tiempo. Comprobado
     en el despliegue de `6664c93` (6-10-2026, 59 s en total): la API se recreó, el
     precalentamiento tardó de 3,5 a 4,2 s por semana y, después, la rejilla salió en 0,58 s a
     la primera.
4. **Pendiente.** Caso técnico para el portfolio: qué problema resuelve, decisiones, dificultades
   reales, mediciones y límites.

## Backlog

- Límites: la rejilla de huecos se mide cada 15 min en el navegador, con una petición por semana
  importada. `deploy.sh` la deja calculada, pero si la API se reinicia sin desplegar (un
  reinicio del servidor), la primera visita vuelve a esperar unos 12 s. Si molesta, un resumen
  por día y hora en la API, calculado en cada ingesta (daría también el detalle de 5 min).
- Mapa: los marcadores sin dato son discretos a propósito; si se filtran solo esos, cuesta
  verlos a escala de ciudad.
- Web: los nombres reales llegan en mayúsculas («AV. CAN MARCET, 3»); valorar un formato de
  lectura que respete partículas catalanas, sin cambiar el dato guardado.
- Web: a escala de ciudad, 540 marcadores se solapan; valorar una vista agregada que no esconda
  estados.
- Web: idiomas (ca, en) cuando haya textos estables; hoy solo es.
- Experimentar: añadir y mover estaciones sin ratón ni pantalla táctil (hoy solo se deshace con
  el teclado). Probar el arrastre con el dedo en un teléfono de verdad (en Playwright solo se ha
  probado el toque para añadir).
- Web: E2E en CI (Compose con API y PostGIS) cuando haya despliegue.
- Tiempo real con el token de Open Data BCN (`Authorization: <token>`; un 302 a `/tokens` es un
  fallo de autenticación): tarea programada y «Última observación» con frescura medida.
- API: caché HTTP con validación para `/api/stations`.
- Reproducir: los fotogramas pesan 110 KB por hora con Brotli (2,6 MB un día). Si pesa en
  móvil, formato por columnas (~58 KB) o caché comprimida en el servidor. Medir también la
  reproducción a la velocidad más alta en móvil (arrastrar el mapa ya está medido: 48 fps).
- Mapa: al moverse en móvil, explorar y reproducir van a 48 fps y experimentar a 60. La
  diferencia probable son los números dentro de los marcadores (experimentar no los lleva y sus
  marcadores son más pequeños): comprobarlo antes de cambiar nada (p. ej., números desde z14).
- Índice no único en `station_versions(station_id)` si las consultas de detalle crecen.
- Fuentes: aclarar condiciones del GBFS del operador antes de cualquier uso.

## Fuera de alcance de la primera versión

Tráfico, contaminación, meteorología, rutas a pie, predicción de demanda, recomendaciones
operativas, cuentas, suscripciones, colaboración y administración compleja.
