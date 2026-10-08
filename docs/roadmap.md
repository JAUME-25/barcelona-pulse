# Hoja de ruta

Actualizado el 7 de octubre de 2026.

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
2. **Hecho.** En marcha desde el 6-10-2026 en
   https://pulse.jaumeperez.com con las cuatro semanas del 4 al 31 de mayo de 2026 (decidido
   por Jaume ese día), en el VPS de Forge: un VPS aparte con memoria suficiente costaba el
   doble, y en el de Forge había 3 GB de memoria disponibles y 28 GB de disco. Medido en
   producción (sin la estación de pruebas del operador desde el 7-10-2026): 28 días sin
   rechazos, 4 229 260 observaciones y 547 estaciones; de media, el 98,5 % de las estaciones
   con dato en cada paso de 5 min; 18 de 8 064 pasos por debajo del 90 % (de madrugada, los
   miércoles 6, 13, 20 y 27) y ninguno vacío. La web dice «Datos históricos · mayo de 2026» y
   la fecha completa del instante. Comprobado desde fuera: cabeceras de seguridad, `/api` y
   `/health/ready` a través de nginx, certificado, y los tres modos sin errores en la consola
   en escritorio, 375 y 320 px (`e2e/despliegue.capture.ts`). El portal de Open Data BCN
   contesta 403 al servidor: los .7z de mayo se descargaron fuera y se subieron
   (`docs/despliegue.md`). Monitor externo en UptimeRobot desde el 6-10-2026, como el de
   jaumeperez.com: la portada y `/health/ready`, HTTP cada 5 min y aviso por correo (los dos
   «Up» al crearlos, en la captura de Jaume). `/health/ready` responde 503 si la API no llega a
   la base de datos: comprobado en local parando PostGIS.
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
     98,5 % de las estaciones de media y 12 de 2 688 pasos por debajo del 95 %, todos de
     madrugada (02:15 a 04:45) los miércoles 6, 13, 20 y 27.
   - La rejilla tardaba 12,5 s la primera vez que se abría después de arrancar la API (calcula
     las cuatro semanas) y 0,5 s después. Ahora `infra/deploy.sh` la deja calculada
     (`infra/warm-up.mjs`) y la caché de líneas temporales ya no caduca por tiempo. Comprobado
     en el despliegue de `6664c93` (6-10-2026, 59 s en total): la API se recreó, el
     precalentamiento tardó de 3,5 a 4,2 s por semana y, después, la rejilla salió en 0,58 s a
     la primera.
   - Un reinicio sin despliegue, una importación o una purga volvían a dejar la espera a la
     primera visita. Desde el 6-10-2026 la deja calculada la propia API (`TimelineWarmUp`): al
     arrancar y cada 5 minutos, si falta alguna semana en la caché. `infra/warm-up.mjs` sobra y se
     quita. En local: 6 semanas en unos 10 s al arrancar y la rejilla después en 42 ms (antes,
     3,2 s en frío). En producción desde el 6-10-2026 (`e40ef77`, despliegue de 43 s ya sin
     precalentar): a la primera, las 4 semanas en 173 ms pedidas desde fuera y la rejilla en el
     navegador en 374 ms en escritorio y 531 ms en móvil (`e2e/despliegue.capture.ts`).
4. **En curso.** Caso técnico para el portfolio: qué problema resuelve, decisiones, dificultades
   reales, mediciones y límites. El texto está en `docs/caso-tecnico.md` (6-10-2026), con las
   cifras de las ADR, de `docs/architecture.md` y de producción, y las pruebas de la CI de
   `5d438d7` (151 de backend y 71 de la web). Dice que está hecho con un asistente de IA, sin
   decir que lo haya hecho todo la IA (decidido por Jaume el 6-10-2026).
   - Página en jaumeperez.com (`/barcelona-pulse`, decidida ese día): la plantilla de Cuadra, en
     tres idiomas, con tres capturas reales de producción a 2880 × 1800
     (`e2e/portfolio.capture.ts`). Hecha y revisada en local en la rama `caso/barcelona-pulse`
     de jaumeperez-web: tipos, compilación, pruebas, marcadores, su recorrido de revisión (sin
     desbordes de 320 a 1280 px y 0 infracciones de axe en claro y oscuro) y usada en el
     navegador. Sin publicar.
   - Se llega desde «Programas a medida»: en «Lo que ya he hecho», después del CRM y de Cuadra,
     y en su cierre (decidido por Jaume el 6-10-2026, que también dio por buenas las
     traducciones). Falta publicarla cuando Jaume lo diga.
5. **Hecho.** Pruebas de humo en la CI: un trabajo nuevo levanta PostGIS, las migraciones y la
   API con Docker Compose (como en local), importa el demo y las áreas de estudio y pasa las 8
   pruebas de humo en escritorio y móvil. Si falla, deja el registro de la API y las trazas de
   Playwright. Ensayado el 6-10-2026 desde una base vacía (proyecto `bp-ci`, otros puertos) y
   en GitHub con `a6a3b06`: 16 de 16 en 18,5 s; el trabajo entero, 2 min 9 s, en paralelo con
   los otros dos.
6. **Hecho.** Nombres de estación legibles, elegidos por Jaume el 6-10-2026 entre tres
   formas: «como en la placa» («Av. Can Marcet, 3») y las erratas de la fuente corregidas
   (`docs/design.md`, `features/stations/names.ts`). Pasado por los 548 nombres de mayo sin
   ningún caso raro; 53 cambian algo más que mayúsculas y espacios (7 nombres cortados que se
   completan con su dirección). El dato guardado no cambia y el buscador encuentra los dos.
   Revisado en la lista, el detalle, «Qué muestra y qué no» y Experimentar, en escritorio, 375 y
   320 px. En `743c39c`; en producción desde el 6-10-2026, desplegado junto con los idiomas.
7. **Hecho.** La aplicación en catalán e inglés (`docs/design.md`, «Idiomas»), con el
   selector que eligió Jaume el 6-10-2026 (ES · CA · EN en la cabecera). Pruebas: unitarias de
   textos de los dos idiomas y de la detección, una de la app con el selector y una de humo
   (catalán por la URL, inglés con el selector). Usada en el navegador con la red real en las
   cuatro vistas, en escritorio, 375 y 320 px, sin errores, sin scroll lateral y sin palabras en
   otro idioma fuera de los datos (`e2e/idiomas.capture.ts`). En `0f88dee`, en producción desde
   el 6-10-2026: comprobado desde fuera con esas mismas capturas en los tres idiomas, en
   escritorio, 375 y 320 px, con el selector, sin errores en la consola.
8. **Hecho.** Revisión de backend y web (6-10-2026) y sus arreglos, en producción desde el
   7-10-2026 (`4919523` a `236569c`, CI verde):
   - Edificios en 3D opacos y por encima de las calles: la capa 3D iba antes de `water_name`
     y MapLibre pintaba calles y plantas encima, así que se veían transparentes. Dirección A
     (los colores de antes), elegida por Jaume entre tres con capturas; al experimentar, sin
     3D. De paso, los bosques con su verde.
   - Ingesta fuera de orden: importar un periodo anterior ya no cambia los atributos de días
     importados (en local, 463 de 549 estaciones salían en mayo con atributos supuestos;
     producción no estaba afectada). La base local se rehízo importando en orden.
   - Reproducir sin pasos de otra hora: el anterior solo se ve dentro de la tolerancia, la
     reproducción espera a cada paso y un fallo se dice con «Reintentar».
   - Fallos con salida: errores de pintado, el día que no llega, el contexto WebGL perdido y el
     aviso del mapa base. La cámara se conserva al cambiar de idioma.
   - Línea temporal: la semana del cambio de hora de octubre (169 h) ya no da 400; como mucho
     dos cálculos a la vez, 20 s de tope y sin JIT.
   - Sin desbordes de 768 a 1179 px, y la leyenda no tapa los controles en ventanas bajas.
   - Escenarios: enlaces con los identificadores de Bicing (`trasladadas`, `retiradas`),
     arrastres que no se quedan pegados y «0,00 puntos» si se gana lo mismo que se pierde.
   - Pruebas: 159 de backend, 112 de la web y 18 de humo. Comprobado en producción desde fuera:
     `e2e/despliegue.capture.ts` 8 de 8, el 3D y Experimentar en escritorio y móvil, Reproducir
     con una hora lenta y con un error simulado, y la cámara al cambiar de idioma, sin errores
     en la consola.

9. **Hecho** y en producción desde el 7-10-2026 (`1755304` a `f497b2f`, CI verde). Segunda
   revisión de backend y web y sus arreglos, y el mapa base más legible:
   - Web: el foco ya no salta al detalle al cambiar de día en Reproducir (en móvil la página
     bajaba 487 px); una sola escritura de URL al pararse, no una por paso; al cambiar de día,
     la misma hora de reloj (en un día de 25 h se iba una hora atrás); el paso anterior, bajo
     la hora pedida, con lo que ya pasa de la tolerancia como desconocido; el fallo de la hora
     pedida por adelantado no para la reproducción; con el dedo, la pista deja desplazar la
     página; «Vista 3D» según la cámara del enlace; una tesela que no llega no da el mapa por
     perdido; si falla el fragmento del mapa, la lista sigue; cambiar de modo no vuelve a
     encuadrar si se ha movido el mapa; el recuento no se anuncia en cada paso.
   - Backend: importar días seguidos fuera de orden ya no deja los atributos viejos a
     medianoche ni rechaza el día que publica a las 00:00 en punto, y un periodo antiguo que
     acaba como lo conocido no deja nada supuesto en medio (sin tocar días ya importados);
     cobertura con tope de 100 quitadas, dos cálculos a la vez y 64 KB por petición; recuentos
     e instantes que no se entienden se rechazan con su motivo; la caché de la línea temporal
     cambia con el recuento de observaciones; los 429 llevan `Retry-After` y una IPv6 cuenta
     por su /64.
   - Mapa (`docs/design.md`, «Mapa base»): nombres de calle cortos y por prioridad, barrios,
     metro, parques, portales, carriles bici de OSM y más contraste en calles y plantas.
     Propuesto con capturas y medido con la compilación de producción: fluidez y carga iguales.
   - Pruebas: 187 de backend, 140 de la web y 18 de humo; las nuevas fallan sin el arreglo.
     Comprobado en el navegador (foco, pista con el dedo, encuadre, teselas que fallan), en los
     tres idiomas a 1440, 375 y 320 px y la leyenda de 320 a 1440 px.
   - Descartado de la revisión: «si falla la cobertura se ve el cálculo anterior» no pasa
     (`useRemote` no guarda lo anterior tras un fallo); queda una prueba que lo vigila.
   - Comprobado en producción desde fuera: `e2e/despliegue.capture.ts` 8 de 8 y el mapa nuevo
     en cinco vistas, de barrio a calle, en escritorio y móvil, sin errores ni avisos en la
     consola y sin peticiones fallidas.
10. **Hecho** y en producción desde el 7-10-2026 (`e440c18` y `fca47f5`, CI verde). El patrón
    de la estación y sin la estación de pruebas del operador:
    - «Cómo suele estar», en la ficha: una columna por hora, en laborables y en fin de semana,
      con las veces que estuvo sin bicis, con pocas, con bicis, llena, fuera de servicio o sin
      dato (los colores de la leyenda), y en frases («De 10 a 11 h estuvo sin bicis el 78 % del
      tiempo»). Es lo que pasó en los días importados, no una previsión; los festivos cuentan
      como laborables. Elegida entre tres formas (columnas, relojes y curva) por ser la más fácil
      de leer, en el mismo idioma visual que la leyenda.
    - API: `GET /api/stations/{id}/pattern`, el estado cada 15 min de cada día importado con la
      regla del mapa, por hora y tipo de día; 25–35 ms con 42 días (sin JIT; con él, 0,9 s). La
      web lo pide una vez por estación y página, aunque el detalle se vuelva a montar. En
      producción, con 28 días, medido desde fuera y descontada la red: unos 30 ms si se repite
      y 0,2 s la primera vez que se pide cada estación.
    - La «Estación de TESTING (no usuarios)» del operador ya no se importa y la migración
      `RemoveOperatorTestStation` la quita de lo importado con su recuento (en local, 549 → 548;
      en producción, 548 → 547 y 9 observaciones menos, y la media de estaciones con dato pasa
      del 98,3 al 98,5 %).
    - Pruebas: 197 de backend (con PostGIS: la regla, cerrada no es vacía, días de 23 y 25 h y
      la migración), 144 de la web y 18 de humo. Usado en el navegador en los tres idiomas a
      1440, 375 y 320 px, sin desbordes ni errores, y al reproducir, una sola petición.
    - Comprobado en producción desde fuera: el patrón en los tres idiomas a 1440, 375 y 320 px,
      sin desbordes ni errores en la consola, y una sola petición al reproducir.
11. **Hecho** y en `main` desde el 7-10-2026 (`a23c0fd`, CI verde; lo despliega Jaume). Lo que
    la API ya calculaba y la web no enseñaba, salido de una revisión de backend y web de ese día:
    - Reproducir: bicis ancladas y anclajes libres de cada paso junto a los recuentos, y una
      línea ámbar en la pista con esa cifra. Un paso sin dato queda en hueco, no en cero.
    - «Por distrito» bajo la búsqueda, en Explorar y Reproducir: estaciones, sin bicis, llenas y
      sin dato por distrito en el instante mostrado. Elegida entre tres formas con capturas
      (selector con la tabla plegada, tabla siempre a la vista con el nombre como filtro, y
      tarjetas con barras); Jaume pidió la mejor para quien la usa y es la segunda: resumen y
      filtro en lo mismo, y en Reproducir se ve cambiar cada distrito a cada paso. La de
      tarjetas ocupaba dos pantallas en móvil. El nombre de cada fila filtra lista, mapa,
      recuento y leyenda (teclado y `aria-pressed`; la elegida con marca, negrita y ámbar);
      «Sin distrito» y «Sin dato» van aparte y nunca suman a vacías. El desplegable se puede
      plegar y el navegador lo recuerda.
    - `GET /api/sources/{id}/ingestions`: ingestas terminadas con periodo cubierto, recuentos
      (nuevas, repetidas, en conflicto, rechazadas) y rechazos por motivo. «Qué muestra y qué
      no» lo enseña en «Lo que entró cada día».
    - Pruebas: 199 de backend (la nueva, contra PostGIS) y 158 de la web; capturas en
      escritorio, 375 y 320 px (`e2e/distritos.capture.ts`, que además filtra por el Eixample
      con el teclado y comprueba lista, leyenda y recuento, y `e2e/limites.capture.ts`). Sin
      comprobar: la tabla en catalán e inglés a 320 px y el móvil con un dedo real.
12. **Hecho** y en producción desde el 7-10-2026. Un momento representativo al abrir, primero de
    una revisión de backend y web de ese día con propuestas para hacer la aplicación más útil
    (Jaume: «empieza por lo que creas más oportuno»):
    - Explorar abría en el último dato, un domingo a las 23:55, y Reproducir en el último día a
      las 00:00. Ahora los dos abren en el último laborable importado a las 08:30
      (`features/history/moment.ts`), con el día de la semana a la vista («viernes, 29 de mayo
      de 2026, 08:30»). Los festivos cuentan como laborables: no hay calendario.
    - «Cambiar momento», junto al momento mostrado, lleva a Reproducir parado en ese instante con
      el foco en la pista. Al volver a Explorar o Experimentar se queda el momento que se estaba
      viendo, también si se salió con la reproducción en marcha, y va en la URL
      (`?dia=…&hora=…`), que ahora Explorar también lee. Reproducir guarda el día en la URL
      aunque sea el de por defecto: el enlace sigue valiendo cuando se importen más días.
    - La demo sintética no cambia: sigue abriendo al final de sus datos (10:00) y sin el botón.
    - Pruebas: 168 de la web (nuevas: el día representativo, la hora de reloj en los días de 23
      y 25 h, el instante con y sin día pedido, y la ida y vuelta con «Cambiar momento»). Usado
      en el navegador con la red real en escritorio, 375 y 320 px, en los tres idiomas y con la
      demo, sin errores en la consola ni desbordes. En `56c26f3`.
13. **Hecho** y en producción desde el 7-10-2026. Buscar y ordenar como se busca una estación,
    segundo bloque de la misma propuesta:
    - La búsqueda encuentra también por barrio y por distrito («Poblenou», «Gràcia»), que no
      suelen ir en el nombre, y mientras se busca el mapa encuadra los resultados aunque se
      hubiera movido antes (`frameFollows` en `StationMap`). Intro abre la primera de la lista.
    - Cada fila lleva el barrio junto al estado («Con bicis · el Poblenou»), para situar la
      estación al buscar o al ordenar por cifras.
    - «Orden», junto al recuento: por nombre o, de más a menos, por bicis, anclajes libres o
      eléctricas (`sortStations`); las que no enseñan cifra (sin dato, fuera de servicio) van al
      final y a igual cifra se conserva el nombre. Solo el orden de la lista: el mapa no cambia.
      Se oculta con el detalle abierto; no va en la URL (eso es del bloque de compartir).
    - Al elegir una estación a escala de ciudad (zoom < 13, sin números en los marcadores), el
      mapa se acerca a ella a nivel de calle; al llegar con un enlace se respeta su cámara.
    - Pruebas: 173 de la web (nuevas: búsqueda por barrio y distrito, los cuatro órdenes con
      empates y sin cifra, y una de la app con el orden, el barrio en la fila, la búsqueda por
      barrio e Intro). Usado en el navegador con la red real: «gràcia» da 31 de 548 y el mapa se
      va a Gràcia; «Más bicis» pone primero la de 18; Intro abre la primera y el mapa pasa de
      z12,5 a z14 sobre ella; recuento y «Orden» en una línea a 375 px y en dos a 320 px, sin
      desbordes, en los tres idiomas y sin errores en la consola. En `2c76b73`.
14. **Hecho** y en producción desde el 7-10-2026. Las eléctricas como dato de primera, tercer
    bloque de la propuesta (`docs/design.md`, «Eléctricas»):
    - API: la línea temporal suma las eléctricas de cada paso (`ebikesAvailable`) y dice en
      cuántas estaciones se contaron (`stationsCountedEbikes`): solo las que publican el
      desglose, una fuente sin él no suma cero. OpenAPI y tipos del cliente regenerados.
      Reproducir lo enseña («5 056 bicis (2 301 eléctricas) y 8 579 anclajes libres en 542
      estaciones») solo si todas las contadas publican el desglose.
    - Web: interruptor «Número en el mapa y la lista: Bicis · Eléctricas» arriba de la leyenda,
      elegido por mí a petición de Jaume entre tres direcciones con capturas (`e2e/
      electricas.capture.ts`). Con «Eléctricas», marcadores y lista pasan a eléctricas y las
      estaciones sin ninguna se atenúan (`icon-opacity` 0,3, debajo de las demás); las
      categorías no cambian. No va en la URL (bloque de compartir).
    - Pruebas: 199 de backend (la regla contra el mapa comprueba también las eléctricas y una
      estación sin desglose) y 175 de la web (recuentos con y sin desglose completo, el
      interruptor en la app). Formato de .NET y web, lint y tipos en verde. En `376de78`.
15. **Hecho** y en producción desde el 7-10-2026. Compartir y Atrás, primera parte del bloque 10
    de la propuesta:
    - Atrás ya no sale de la aplicación: abrir el detalle, abrir «Qué muestra y qué no» y
      cambiar de modo añaden una entrada al historial (`pushParams`, con el motivo en
      `history.state`); Atrás y Adelante vuelven al estado de esa URL (modo, estación, ficha y
      momento), y el cierre con el botón vuelve atrás si la entrada era suya, para que los dos
      caminos dejen el mismo historial. Lo que cambia a cada paso (la hora al reproducir, el
      escenario, la cámara) sigue reemplazando la entrada.
    - Título de la pestaña por vista: «Av. Can Marcet, 3 · Barcelona Pulse», «Qué muestra y qué
      no · …», «Reproducir · …».
    - «Copiar enlace» bajo el aviso de procedencia, en los tres modos y con la demo: en un
      teléfono abre la hoja de compartir; si no, copia la URL (con la cámara) y lo dice; si el
      navegador no deja copiar, enseña la URL en un campo para copiarla a mano.
    - Vista previa al compartir: `og:title`, `og:description`, `og:image` (`public/og.jpg`,
      1200 × 630, generada con `e2e/og.capture.ts` con la red real) y `theme-color`.
    - Pendiente del bloque: filtros, distrito, búsqueda y orden en la URL.
    - Pruebas: 177 de la web (Atrás cierra detalle, ficha y modo con el título; copiar) y una de
      humo nueva (Atrás y Adelante con el detalle). Usado en el navegador: abrir, Atrás, título
      y el campo de la URL cuando el navegador integrado no deja copiar. En `1bf6062`.
16. **Hecho** y en producción desde el 7-10-2026. La vista de Explorar en la URL, lo que faltaba
    del bloque 10 (`features/stations/viewParams.ts`): `ocultar=sin-dato,fuera-de-servicio`
    (categorías de la leyenda apagadas), `distrito=Eixample` (vacío, «Sin distrito»),
    `buscar=…` (al dejar de escribir, 400 ms), `orden=bicis|libres|electricas` y
    `numero=electricas`. Sin parámetro, lo de siempre. Cambian la entrada del historial sin
    apilar (son ajustes, no lugares), Atrás y Adelante los devuelven con lo demás, y el cambio
    de idioma ya no los pierde. Pruebas: 181 de la web (ida y vuelta de cada parámetro y una de
    la app que llega con un enlace y lo cambia todo) y el humo comprueba `ocultar` y `buscar`.
    En `f49bd66`.
17. **Hecho** y en producción desde el 7-10-2026. «Solo las del mapa», la lista que sigue al mapa
    (del roadmap «Siguiente»): una casilla junto al título de la lista deja en ella solo las
    estaciones de la parte del mapa que se ve, al cargar y tras cada movimiento (`moveend`;
    `features/stations/mapBounds.ts`). El mapa no cambia: es él quien acota. El recuento la
    sigue; si no queda ninguna a la vista, lo dice y un botón vuelve a toda la lista. Va en la
    URL (`lista=mapa`, con la cámara en `#mapa`) y Atrás y el idioma la respetan. Si el mapa no
    está disponible, la casilla no sale; mientras carga, se enseña todo. Pruebas: 183 de la web
    (parámetro y una de la app con límites simulados del mapa: lista, recuento, URL, vacío y
    «Ver toda la lista»), humo 20/20 y `e2e/lista-mapa.capture.ts` con el mapa real en escritorio
    y 375 px (15 de 548 a nivel de calle, cambia al mover el mapa y entran más al alejarse). El
    navegador integrado de Claude en modo móvil no pinta el mapa: allí la lista sale entera, que
    es lo previsto mientras el mapa no carga. En `ef28ceb`.
18. **Hecho** y en producción desde el 7-10-2026. La versión de los datos por rango y los
    validadores HTTP (ADR 0014), la deuda B2 de la propuesta:
    - `DataVersion.ForRangeAsync`: la última ingesta terminada que toca el rango (por el periodo
      cubierto o el de sus observaciones, con la tolerancia hacia atrás) y cuántas purgas ha
      habido (`data_sources.purge_generation`, migración `PurgeGeneration`, que `purge` sube en
      su transacción). La clave de la caché de la línea temporal pasa a ser el rango, el paso y
      esa versión: importar un día solo invalida sus semanas; antes, todas, y el
      precalentamiento las recalculaba todas.
    - ETag débil y `Cache-Control: private, no-cache` en estado (con `at` o fuente sintética),
      detalle, patrón, línea temporal y fotogramas; con `If-None-Match`, 304 antes de calcular.
      «Ahora» no se valida.
    - Pruebas: 4 nuevas contra PostGIS (una ingesta cambia solo los días que toca y una purga
      todos; el archivo de un día que trae observaciones del anterior cambia también el
      anterior; ETag y 304 en estado, línea temporal, fotogramas, detalle y patrón, y que el
      patrón cambia con otro día mientras el estado del 19 sigue en 304; «ahora» sin ETag). En
      `d0cd1bf`.
19. **Hecho** y en producción desde el 7-10-2026. «Cercanas» y «Cerca de mí», el bloque 5 de la
    propuesta (`docs/design.md`, «Cercanas y Cerca de mí»):
    - «Cerca de mí» junto al buscador: la ubicación se pide al pulsar y vive solo en memoria. La
      lista se ordena por distancia en línea recta (EPSG:25831 en el navegador,
      `features/stations/distance.ts`, comprobado contra PostGIS a menos de 1 cm), con los metros
      en cada fila, y el mapa se acerca a la persona con un punto con halo y su clave. «Más cerca
      de mí» es un orden más mientras haya ubicación, nunca en la URL; Atrás no lo quita. Fuera de
      Barcelona, sin permiso, sin posición o con el tiempo agotado se dice cada uno; con mucho
      error, «aproximada (±1,8 km)» (`features/stations/useNearMe.ts`).
    - «Copiar enlace» va sin la cámara del mapa mientras se sepa dónde está la persona, y lo dice.
    - «Cercanas» en la ficha, tras los datos de la estación: las cinco más próximas, con su
      distancia y la misma cifra que la lista (bicis o eléctricas).
    - De paso: `replaceUrl` borraba la marca de la entrada del historial al cambiar de estación
      con el detalle abierto (o la hora al reproducir), y «Volver» dejaba una entrada de más.
    - nginx: `geolocation=(self)` en `infra/nginx/pulse.conf`; hay que recargar nginx al
      desplegarlo (`docs/despliegue.md`).
    - Pruebas: 189 de la web (la distancia contra PostGIS; la app: orden, Atrás, enlace sin
      cámara, cercanas con eléctricas, fuera de Barcelona, fallos por motivo, aproximada y la
      clave; `shared/url.test.ts`), humo 20/20 y `e2e/cerca.capture.ts` con el mapa real
      (ubicación concedida y denegada) en escritorio y 375 px. Usado en el navegador en los tres
      idiomas a 1440, 375 y 320 px. En `f5fa0b1`.
20. **Hecho** y en producción desde el 7-10-2026. La versión por rango, que no acotaba, y la
    compilación en el ETag (ADR 0014, «Corrección»):
    - Las 28 ingestas de mayo tenían `period_from` el 12-6-2025 (la estación 366 repite ese
      `last_reported` en cada archivo y el periodo se calculaba con todo el lote): cualquier
      rango quedaba «tocado» por la última ingesta y cada importación seguía invalidando todas
      las semanas y todos los ETag. Ahora el periodo es el de las filas que la sentencia insertó;
      sin filas nuevas, nulo. Reimportar los días ya importados (idempotente) deja sus periodos
      en nulo y desde entonces acotan.
    - La versión acaba en la compilación (`DataVersion.Build`, MVID del ensamblado): tras un
      despliegue, el navegador no recibe un 304 con un cuerpo viejo.
    - Pruebas: una nueva contra PostGIS (la observación de 2025 repetida no cambia la versión
      del otro día; el periodo de cada ingesta; reimportar sin nada nuevo) y la compilación en
      la versión y en el ETag. `ingest` dice «sin observaciones nuevas» cuando no guarda nada. En
      `506cd0b`. En producción, los 28 días de mayo se reimportaron el 8-10-2026 (con la
      altitud, B5.27): sus periodos quedaron a nulo y desde entonces la versión por rango acota.
21. **Hecho** y en producción desde el 7-10-2026. Topes y observabilidad, el punto 16 de la
    propuesta, lo que conviene tener firme antes del tiempo real:
    - Tope de espera en los cálculos caros (`Infrastructure/ComputationGate.cs`): la línea
      temporal esperaba un hueco sin límite y nginx cortaba a los 30 s; ahora 10 s (el patrón,
      5 s) y después 503 en `problem+json` con `Retry-After`. El precalentamiento espera sin tope.
    - El patrón de una estación pasa por el mismo paso (2 a la vez) y se guarda en la caché con
      la versión de la fuente en la clave, prioridad baja. Antes se calculaba en cada petición.
    - Consultas de estado y fotogramas con tope de 10 s; antes, los 30 s de Npgsql, los mismos
      que nginx.
    - Registro de peticiones lentas (más de 1 s), 429, 503 y 5xx, con método, ruta, estado y
      duración; sin IP. Antes, en producción no se veía ninguna.
    - Índice BRIN sobre `station_observations(observed_at)` (migración `ObservedAtBrin`): salió de
      medir si `work_mem` explicaba los 3,5–4,2 s por semana de producción. No: con 4 MB el plan
      recorre la tabla entera (650 MB por semana) en paralelo; con 64 o 256 MB cambia a un plan
      sin paralelismo y tarda más; `random_page_cost = 1.1`, igual. El BRIN (120 kB) deja leer
      solo las páginas de la semana: en local, de 820 a 725 ms; en producción, medido tras el
      despliegue del 7-10-2026 con el precalentamiento, de 3 500–4 200 ms por semana a
      2 805–2 955 (un 20–30 % menos; el disco del VPS sigue mandando).
    - Los dos endpoints declaran el 503 en OpenAPI; `schema.d.ts` regenerado.
    - Pruebas: unitarias del paso (espera, rendición, doble liberación, `Retry-After`) y una
      contra PostGIS con la API: el patrón responde 503 con `Retry-After` mientras los dos huecos
      están ocupados y sirve la caché después aunque no haya hueco. Las que piden patrones van en
      una colección para no pisarse el paso, que es global.
    - Descartado por ahora: `healthcheck` de la API en Compose. Sin orquestador no reinicia nada
      (Docker solo marca «unhealthy»), la imagen no tiene shell y arrancar `dotnet` cada 30 s
      cuesta; UptimeRobot ya avisa por `/health/ready`.
    - En `a109a20`; la medida del BRIN en producción, en `a4d0b94`.
22. **Hecho** y en producción desde el 7-10-2026. Para quien busca bici o sitio, los puntos 3, 4 y
    5 de la propuesta, solo web (`docs/design.md`, «Anclajes y atajos», «Momento mostrado» y
    «Cómo suele estar»):
    - «Anclajes» en el interruptor del número: el marcador lleva los anclajes libres, la lista
      los pone delante y las llenas se atenúan (`numero=anclajes`).
    - Dos atajos en la leyenda, «Quiero una bici» y «Quiero aparcar»: lo visible y el número a
      la vez, con `ocultar=` y `numero=`; pulsado otra vez, todo a la vista.
    - «A esta hora», junto a «Cambiar momento»: el último día importado con el día de la semana
      de hoy (o del mismo tipo, o el último) a la hora de reloj de ahora
      (`features/history/moment.ts`, `momentLikeNow`).
    - «Cómo suele estar» empieza por la hora que se ve en el mapa: cuántas veces tuvo alguna
      bici y la mediana (`medianBikes`, que la API ya daba).
    - Pruebas: 197 de la web (parámetro `anclajes`, atajos y su marca, `lacksDocks`,
      `momentLikeNow` con día de la semana, tipo y sin días, mediana y parte con bici por hora,
      y en la app: Anclajes y atajos, «A esta hora» con el reloj fijado, la frase del patrón),
      humo 20/20 y `e2e/atajos.capture.ts` con el mapa real en escritorio y 375 px (aparcar,
      anclajes delante en la lista, «A esta hora» y la frase). Usado en el navegador en
      castellano, catalán e inglés a 320 px, sin desbordes. En `dce1de9`.
23. **Hecho** y en producción desde el 7-10-2026. Rigor visible, el punto 12 de la propuesta: lo
    que la API ya daba y la web callaba, solo web.
    - La ficha de la estación dice desde cuándo se conoce («Vista por primera vez el 4 de mayo
      de 2026») y, plegados, los cambios de nombre, dirección, sitio (metros, EPSG:25831) y
      capacidad en los días importados, con su fecha (`GET /api/stations/{id}`, que nadie
      llamaba; `features/stations/versions.ts`, caché por página en `stationDetails.ts`).
    - «Qué muestra y qué no» dice cuántas observaciones hay guardadas y cómo acabó la última
      importación (cuándo, estado y recuentos).
    - Un enlace que pide una estación que no está en la fuente o un día no importado lo dice,
      en vez de callarse y enseñar otra cosa; y si la API recorta la respuesta (`truncated`, que
      se forzaba a falso), también.
    - Pruebas: 204 de la web (los pasos de versión: orden, qué cambió, bajo el metro no es
      traslado; en la app: la ficha con cambios y sin ellos, los tres avisos y que el de la
      estación se va al elegir otra, la última importación en la ficha de límites). En
      `0dc7e4f`; el aviso del enlace, sin borde lateral, en `c211b1f`.
24. **Hecho** y en producción desde el 7-10-2026. Móvil con el mapa más arriba, el punto 7 de la propuesta:
    cabecera plegable, elegida entre tres direcciones con capturas reales (`docs/design.md`,
    «Móvil: cabecera plegable»). Sin lema, el idioma junto al nombre y la procedencia en una
    línea que «Más» despliega; el mapa pasa de empezar a 555 px a unos 200 (266 a 320 px). Se
    decide por el ancho de la ventana (`shared/useMediaQuery.ts`); en escritorio no cambia nada.
    Pruebas: 205 de la web (en «móvil», plegado y desplegado) y `e2e/movil.capture.ts` con el
    mapa real a 375 y 320 px, plegada y abierta. Usado en el navegador en los tres idiomas. En
    `89d7d30`.
25. **Hecho** y en producción desde el 7-10-2026. Deuda del backlog, el punto 17 de la propuesta:
    - `station_versions` no admite dos versiones vigentes a la vez (`EXCLUDE` con `btree_gist`,
      diferida al commit; migración `VersionsNoOverlap`). En local no había ningún solape.
    - Las ingestas que se quedaron «en marcha» por un proceso que murió se cierran como
      fallidas al arrancar la API, pasada una hora (`IngestionJanitor`).
    - Una descarga del histórico que falla (el 403 del portal, un 503) queda registrada como
      ingesta fallida con su error.
    - CORS admite el `POST` de la cobertura para los orígenes configurados.
    - Pendiente del backlog: `purge` sigue borrando por instante, no por ingesta.
    - Pruebas contra PostGIS: el solape se rechaza y dos versiones seguidas pasan en la misma
      transacción; el cierre de ingestas viejas y no de las recientes.
    - En `4f43b62` (CI verde), desplegado el 7-10-2026 con todo lo anterior y comprobado desde
      fuera: Healthy, `geolocation=(self)`, ETag con la compilación, cabecera plegable en móvil,
      guiones `despliegue` y `limites` 12 de 12 y `cerca` 2 de 2. Después, solo pruebas y
      documentación (`2f8a4fc`, `a4d0b94`).
26. **Hecho** y en producción desde el 8-10-2026 (`4c40842`, CI verde; comprobado desde fuera:
    Healthy, el bundle servido con los textos del balance en los tres idiomas y
    `e2e/balance.capture.ts` contra producción 4 de 4: el 13-5-2026 de 07:00 a 10:00, 197
    ganan, 297 pierden, 38 igual y 15 sin dato de 547). Balance entre dos horas, lo primero que
    quedaba de la propuesta: el cuarto modo, «Balance» (`docs/design.md`, «Balance entre dos
    horas»), elegido
    entre tres direcciones con capturas sobre datos reales (Marea, Antes y después, Por barrios)
    por encargo de Jaume («la que veas más cómoda para el usuario siguiendo la estética de la
    web»): Marea, con la frase y las barras por distrito de Por barrios.
    - Sin cambios en la API: dos peticiones a `/api/stations` del mismo día (la partida,
      `?desde=07:00`, y la llegada, que es el momento mostrado, `dia` y `hora`) y el balance en
      el navegador (`features/balance/balance.ts`): bicis ancladas después menos antes por
      estación; sin dato fiable o fuera de servicio en cualquiera de los dos momentos, «sin
      dato», nunca cero. Totales solo con las que tienen dato en los dos, por distrito en bicis
      por estación, y las seis que más se llenan y más se vacían. Al entrar sin hora pedida, el
      momento pasa a las 10:00 del día mostrado y la partida va tres horas antes.
    - Mapa: variante «balance» de los marcadores (`StationMap`): octógono lleno violeta si gana,
      hueco rojo si pierde, el tamaño según cuántas bicis (tope en 25) y el número con signo
      desde z13; las que más cambian, encima. Mientras llega la partida sigue el estado.
    - Panel (`features/balance/BalancePanel.tsx`): día y dos horas en pasos de media hora,
      totales, la frase de los distritos, barras divergentes y las dos listas; cada estación
      abre su ficha del momento de llegada. La clave, en la leyenda (`BalanceKey`); en móvil, el
      sello con las dos horas. Con cuatro modos, el selector se aprieta a 375 px y a 320 pasa a
      dos filas.
    - El 13-5-2026 de 07:00 a 10:00: 197 estaciones ganan (+2019), 297 pierden (−2478), 38
      igual y 16 sin dato; en las 532 con dato en los dos momentos, de 5289 a 4830 bicis
      ancladas. Ganan Les Corts (+6,5 por estación), Ciutat Vella y Sant Martí; pierden Sant
      Andreu (−6,5), Horta-Guinardó y Gràcia.
    - Pruebas: 215 de la web (nuevas: el balance con sus clases, totales, listas y distritos;
      las dos horas y sus selectores; y en la app, los dos instantes pedidos, la clave, la
      partida en la URL y la ficha desde la lista), humo 22 de 22 (el balance con la demo:
      totales, clave, las dos horas en la URL y Atrás) y `e2e/balance.capture.ts` con el mapa
      real: escritorio a escala de ciudad y de calle, 375 px (mapa, panel y distritos, en los
      tres idiomas) y 320 px. Tipos, lint y formato en verde.
27. **Hecho** y en producción desde el 8-10-2026 (`498f3c3`, CI verde). Jaume reimportó los 28
    días de mayo desde los archivos subidos al servidor (28 ingestas, todas con avisos como la
    primera vez, 0 observaciones nuevas, 3 versiones nuevas, los 28 periodos a nulo); comprobado
    desde fuera: 545 de 547 estaciones con altitud el 4 y el 31 de mayo (543 el 13; de 2 a 184
    m, mediana 26) y `balance.capture.ts` contra producción con los mismos tercios que en local.
    La altitud de las estaciones, el segundo punto que quedaba de la propuesta:
    - `station_versions.altitude` (metros, nula si la fuente no la da; migración
      `StationAltitude`). El adaptador del histórico la lee de `altitude`; «NA» o un valor
      ilegible dejan la estación sin ella, no la rechazan. Cuenta como atributo solo cuando la
      publican las dos partes que se comparan: una versión guardada sin ella la toma de una
      publicación con los mismos atributos sin abrir otra versión (`FillAltitude`), porque la
      altitud de un sitio no cambia, solo se conoce más tarde; otra altitud con los mismos
      atributos (la estación se movió) sí abre versión (`docs/data-model.md`, «Versiones de
      atributos»).
    - API: `altitude` en `/api/stations`, en los fotogramas y en las versiones del detalle;
      OpenAPI y `schema.d.ts` regenerados.
    - Web: «Altitud · 41 m» en la ficha (sin ella, no se nombra), el cambio de altitud entre
      versiones en «Cambios de esta estación», y en Balance «Por altitud»: tres tercios por la
      altitud publicada con las barras de los distritos (`docs/design.md`).
    - Base local: reimportados el 4, 13, 20 y 27 de mayo y el 17 y 28 de agosto (unos 15 s cada
      uno, 0 versiones nuevas): 544 a 546 de 548 estaciones con altitud según el instante (de 2
      a 184 m; mediana 26). El 13-5-2026 de 7 a 10: hasta 15 m, +4,0 bicis por estación (181
      estaciones); de 15 a 40 m, −5,4 (171); más de 40 m, −1,6 (178).
    - Pruebas: 212 de backend (nuevas: la altitud del archivo en metros y ausente sin rechazar;
      una publicada después completa la versión y otra distinta abre una; la altitud en la API
      del histórico) con los fixtures regenerados; 216 de la web (tercios por altitud, la ficha
      con y sin altitud); `balance.capture.ts` comprueba los tres tercios con el mapa real.
      Formato de .NET y web, lint y tipos en verde.
28. **Hecho** y en producción desde el 8-10-2026 (`7481a17`, con `1c99eae`, CI verde;
    comprobado desde fuera: Healthy, `/contrato.html` con la CSP de siempre,
    `/api/openapi/v1.json` con las 9 rutas y `altitude`, y `contrato.capture.ts` contra
    producción 4 de 4). La página del contrato de la API, el tercer punto que quedaba de la
    propuesta (`docs/design.md`, «Contrato de la API»):
    - La API publica el OpenAPI bajo `/api/openapi/v1.json` (antes `/openapi/v1.json`, que nginx
      no reenviaba): pasa por nginx tal cual está, sin tocar `pulse.conf` ni la CSP.
    - La web tiene una segunda página, `/contrato.html` (`src/contract/`, entrada aparte en
      Vite, sin mapa), con el tema, las fuentes y los idiomas de la aplicación: lee el documento
      del mismo servidor que la sirve y lo enseña como rutas por etiqueta (parámetros con dónde
      van, si son obligatorios y su tipo; cuerpo; respuestas enlazadas a su esquema) y los
      esquemas que alguna ruta nombra, con sus propiedades. Nada se escribe a mano salvo las
      «reglas comunes» (instantes con zona, nulos, observado y sintético, 120 por minuto, ETag,
      503, `problem+json`). Las descripciones del contrato están en castellano, como las escribe
      la API, y la página lo dice. Enlace desde «Qué muestra y qué no».
    - Descartado Scalar: su visor pide estilos y fuentes de fuera (la CSP solo admite lo propio),
      pesa más que la aplicación y no se parece a ella.
    - La marca y el selector de idioma pasan a `app/brand.css`, que cargan las dos páginas.
    - Pruebas: 212 de backend (la ruta nueva del documento), 223 de la web (nuevas: la lectura
      del OpenAPI real, el texto de los tipos, los esquemas que se enseñan; la página con el
      documento simulado, el fallo con reintento y el cambio de idioma; el enlace desde la ficha
      de límites), humo 24 de 24 (la página contra la API real y el enlace a un esquema) y
      `e2e/contrato.capture.ts` (página entera en escritorio; 375 y 320 px en los tres idiomas
      sin desbordes). Tipos, lint y formato en verde. De paso, `movil.capture.ts` admite que a
      320 px el mapa empiece a 302 px: con cuatro modos el selector pasa a dos filas.
29. **Hecho** y en producción desde el 8-10-2026 (`1c99eae`; el bundle servido lleva `lang` y
    `translate` en los nombres). Chrome ofrecía traducir la página «del noruego»: su detector
    no se fía de `lang="es"` y los 548 nombres catalanes de estación y barrio pesan más que el
    texto en castellano. Los nombres de estación, barrio y distrito (lista, ficha, balance,
    límites y tabla de distritos) llevan `lang="ca"` y `translate="no"`: son nombres propios de
    la fuente y no se traducen. Si Chrome sigue ofreciéndolo, queda `<meta name="google"
    content="notranslate">` (lo decide Jaume en su Chrome con `chrome://translate-internals`).
    Pruebas: 223 de la web (la ficha lleva `lang` y `translate`), humo 24 de 24.

30. **Hecho** y en producción desde el 8-10-2026 (`66d9e09`, con `58ba45f` y `5cbf8b0`; CI run
    37741376373 verde; comprobado desde fuera: Healthy, `firstSeenAt`/`lastSeenAt` en el estado y
    los fotogramas con el ETag de la compilación nueva, bundle `main-o7OYUAaY.js`, la ficha de
    Espronceda 298 el 13-5 con «Alta», y «Altas y bajas» con 2 altas y 5 bajas: Tarongers | Av.
    Miramar hasta el 15-5, Crta. de Ribes 77 hasta el 27-5 y las tres de C/ Bruc hasta el 28-5,
    que en local, con agosto importado, no son bajas porque la fuente las vuelve a listar: es lo
    que avisa la nota de la sección). Altas y bajas de estaciones, el siguiente punto de la
    propuesta del 7-10. La base ya guardaba la primera y la última publicación de cada
    estación (`stations.first_seen_at`, `last_seen_at`) y nadie las enseñaba: van en
    `GET /api/stations`, en el detalle y en los fotogramas (`firstSeenAt`, `lastSeenAt`), y el
    ETag de esas tres respuestas pasa a la versión de toda la fuente (ADR 0014, corrección del
    9-10): con la del rango, importar agosto dejaba en 304 un estado de mayo con una baja sin
    estrenar. La web solo afirma lo que un día importado anterior o posterior demuestra
    (`features/stations/lifecycle.ts`, `docs/design.md` «Límites visibles»): en la ficha, «Alta»
    y «Baja» entre los datos y en la explicación del dato que falta; en «Qué muestra y qué no», la
    sección «Altas y bajas», y en «Sin dato en este momento» el motivo pasa a ser ese. En local
    (mayo y agosto): 3 altas (C/ Espronceda, 298 el 12-5 a las 12:25; Rambla de Prim, 256 el
    15-5; C/ Agricultura, 116 entre el 31-5 y el 17-8) y 5 bajas (C/ Villena, 1, listada por
    última vez el 26-8; Copa América 542 y 543, Gran Via 902 y C/ Garcilaso, 56, entre el 1-6 y el
    17-8: su última publicación es del 1-6, un día importado y quitado el 7-10, porque `purge` no
    toca `stations`). Dejar de listar no cierra la versión ni quita la estación del mapa. Pruebas:
    214 de backend (las fechas de un alta y una baja por la ingesta y por la API; ETag por fuente
    del estado, el detalle y los fotogramas, y por rango de la línea temporal), 232 de la web
    (`lifecycle.test.ts`; la ficha y la sección en `App.test.tsx`), humo 24 de 24, capturas
    `e2e/altas-bajas.capture.ts` en escritorio, 375 y 320 px y la ficha en catalán e inglés
    (las capturas y el humo seguidos agotan los 120 por minuto de la API local: el humo se
    repite cuando `/api/sources` vuelve a dar 200).

31. **Hecho** y en producción desde el 8-10-2026 (`322520c`, CI run 37754056868 verde;
    comprobado desde fuera: Healthy, ETag con la compilación nueva, el punto de las 10:00 del
    13-5 igual que el mapa (535 con dato, 93 vacías, 50 llenas, 4 864 bicis); en el log del
    precalentamiento, las cuatro semanas de mayo en 84, 9, 11 y 10 ms frente a 2 955, 2 911,
    2 805 y 2 815 ms antes, y desde fuera una semana sin caché en 0,30–0,34 s de ida y vuelta,
    lo mismo que una cacheada: manda la red). La tabla de resumen de la línea temporal, el
    siguiente punto de la propuesta: `timeline_summaries`, la red de cada fuente en cada paso de
    5 minutos (el más fino que sirve la API; 10, 15, 30 y 60 son subconjuntos exactos), mantenida
    por la ingesta y la purga en su transacción con el mismo SQL que antes corría en cada
    petición (ADR 0015, que sustituye el cálculo al pedirla de la ADR 0009). Las estaciones
    conocidas no van en la tabla: la lectura las cuenta con las versiones de hoy y una búsqueda
    binaria por paso. `migrate` la calcula la primera vez (los 42 días locales, 12,7 s) y
    `summarize [FUENTE]` la recalcula entera si cambia la regla. En local, las semanas de la
    rejilla de huecos pasan de 1 435–1 650 ms a 5–41 ms, y una semana sin caché a 11–14 ms; la
    tabla, 288 filas por día (1,7 MB con 42 días). Pruebas: 216 de backend
    (`TimelineSummaryTests`: una segunda importación del mismo día actualiza sus pasos, y
    recalcular entero da las mismas filas; `Every_step_matches_the_map_at_that_instant` y la
    purga siguen vigilando la regla). La web no cambia. Lo que protegía a la línea temporal lenta
    se quita en B5.32.

32. **Hecho** y en producción desde el 8-10-2026 (`35be920`, CI run 37756289886 verde;
    comprobado desde fuera: Healthy, ETag con la compilación nueva, el OpenAPI de la línea
    temporal sin el 503 y el del patrón con él, una semana sin caché en 0,28–0,39 s de ida y
    vuelta y el punto del 13-5 igual que antes). Limpieza tras el resumen (ADR 0015): fuera
    `TimelineWarmUp` (el precalentamiento al arrancar y cada 5 min, con su ajuste
    `Timeline:WarmUp`), la caché en memoria de la línea temporal (su clave por rango y
    prioridad), el tope de dos cálculos a la vez y el 503 con `Retry-After` de
    `GET /api/sources/{id}/timeline` (fuera también del OpenAPI y de `schema.d.ts`). El patrón de
    una estación conserva su caché y su `ComputationGate`. El comentario de `infra/deploy.sh` y
    la nota del contrato de la API sobre los cálculos caros, al día; `architecture.md` y
    `CLAUDE.md` lo cuentan en pasado. Pruebas: la del precalentamiento y las dos de sus semanas
    se van (la del cambio de hora de octubre queda sobre `TimelineGrid`); el resto, igual.

33. **Hecho** el 8-10-2026 (en local, sin push): el adaptador del feed de tiempo real, sin
    transporte todavía. El token de Open Data BCN responde 200 desde el PC de Jaume y el formato
    está comprobado (`docs/data-sources.md`): dos JSON al estilo GBFS 1.1, estado e información,
    543 estaciones, misma clave que el histórico (estación y `last_reported`) y el mismo
    `cross_street`. `BicingLiveAdapter` (`Features/Ingestion/BicingLive`) los traduce al contrato
    normalizado con las mismas reglas que el histórico (estado, prevista sin instalar, nulos sin
    cero, estación de pruebas fuera) y entra en la misma fuente `bicing-bcn`: una instantánea
    importada en directo es repetida, no duplicada, cuando llega el archivo del mes; cada una
    cubre el paso de cinco minutos de su `last_updated`. Comando `ingest bicing-live
    --status-file --info-file`. Desde el VPS el portal contesta 403 a todo, también a la portada
    (su nginx bloquea el rango de Hetzner; confirmado el 7 y el 8-10): pedida la admisión de la
    IP. Pruebas: 5 unitarias del adaptador y una de integración sobre el fixture del histórico
    (una repetida, una nueva, una estación desconocida rechazada, la altitud rellenada sin
    versión nueva).

## Siguiente

- Lo que queda de la propuesta del 7-10-2026 (el balance entre dos horas, la altitud, la página
  del contrato, las altas y bajas, la tabla de resumen con su limpieza y el adaptador del feed
  se hicieron el 8-10-2026, B5.26 a B5.33):
  - Tiempo real, el transporte. Decidido el 8-10-2026: la opción A, el servidor pide el feed
    cada 5 min con el token, y el proyecto queda en pausa hasta que el portal admita la IP del
    VPS (petición enviada por «Contact us»). La opción B (el PC de Jaume pide el feed y lo
    entrega a la API por un endpoint con secreto) se descarta de momento: un endpoint de
    escritura, un script en casa y una frescura que depende de un PC encendido, todo para
    tirarlo el día que el portal diga que sí. Cuando llegue A: un servicio en la API que pida el
    feed una vez cada 5 min con el token del `.env` y se pare ante 403 o 429; las ingestas en
    directo agrupadas en «Lo que entró cada día» (288 al día); la rejilla de huecos sin las
    horas que aún no han pasado; y «en directo» solo con frescura comprobada.
- Pendiente de antes: estaciones que más tiempo pasan vacías o llenas; tooltip en el marcador;
  cada casilla de la rejilla de huecos a su hora; agrupación de marcadores a escala de ciudad
  con los recuentos en texto; `/api/sources` agregado en SQL (hoy, varias consultas por fuente).

## Backlog

- Riesgos vistos en la revisión del 7-10-2026, sin arreglar (el solape de versiones, la caché del
  patrón y el CORS con `POST` se cerraron en B5.21 y B5.25):
  - `/health/ready` queda fuera del límite por IP y abre una conexión por petición.
  - `purge` borra por instante, no por ingesta: las observaciones del día que caen fuera de él
    sobreviven y la fuente sigue diciendo que tiene datos.
  - La regla del estado y la precedencia de la leyenda están cuatro veces en SQL y una en la
    web, con el umbral de «pocas» duplicado; el patrón tiene prueba de su regla, no cruzada con
    el mapa como la línea temporal.
  - Web: desde la ficha hay más de diez tabulaciones hasta el buscador y no hay «saltar a la
    lista»; `useScenario` llama a `setState` durante el render; `App.tsx` (970 líneas) y
    `StationMap.tsx` (770) mezclan los tres modos.
- En móvil, el sello sobre el mapa como botón que abra «Qué muestra y qué no».
- El caso técnico (`docs/caso-tecnico.md`, B5.4) no recoge lo hecho el 7 y el 8-10-2026.
- La reimportación de mayo en producción (8-10-2026) abrió 3 versiones que en local, con los
  mismos archivos, no se abrieron: mirar cuáles (`GET /api/stations/{id}` da las versiones).

- Ingesta fuera de orden: un periodo antiguo que acaba con otros atributos que los conocidos
  aún supone los de antes hasta la versión siguiente, incluidos los minutos antes de la primera
  publicación del día ya importado. Para resolverlo del todo, guardar cuándo se vio por última
  vez cada versión (migración).
- Límites: en los ~15 s que tarda la API en calcular la rejilla al arrancar, una visita que abra
  la ficha aún la calcula ella. Si llegara a importar, compartir el cálculo en curso entre
  peticiones o guardar un resumen por día y hora en cada ingesta.
- Mapa: los marcadores sin dato son discretos a propósito; si se filtran solo esos, cuesta
  verlos a escala de ciudad.
- Web: a escala de ciudad, 540 marcadores se solapan; valorar una vista agregada que no esconda
  estados.
- Experimentar: añadir y mover estaciones sin ratón ni pantalla táctil (hoy solo se deshace con
  el teclado). Probar el arrastre con el dedo en un teléfono de verdad (en Playwright solo se ha
  probado el toque para añadir).
- Tiempo real con el token de Open Data BCN (`Authorization: <token>`; un 302 a `/tokens` es un
  fallo de autenticación): tarea programada y «Última observación» con frescura medida.
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
