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
12. **Hecho** en local (7-10-2026, sin commit). Un momento representativo al abrir, primero de
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
13. **Hecho** en local (7-10-2026, sin commit). Buscar y ordenar como se busca una estación,
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
14. **Hecho** en local (7-10-2026, sin commit). Las eléctricas como dato de primera, tercer
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
15. **Hecho** en local (7-10-2026, sin commit). Compartir y Atrás, primera parte del bloque 10
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
16. **Hecho** en local (7-10-2026, sin commit). La vista de Explorar en la URL, lo que faltaba
    del bloque 10 (`features/stations/viewParams.ts`): `ocultar=sin-dato,fuera-de-servicio`
    (categorías de la leyenda apagadas), `distrito=Eixample` (vacío, «Sin distrito»),
    `buscar=…` (al dejar de escribir, 400 ms), `orden=bicis|libres|electricas` y
    `numero=electricas`. Sin parámetro, lo de siempre. Cambian la entrada del historial sin
    apilar (son ajustes, no lugares), Atrás y Adelante los devuelven con lo demás, y el cambio
    de idioma ya no los pierde. Pruebas: 181 de la web (ida y vuelta de cada parámetro y una de
    la app que llega con un enlace y lo cambia todo) y el humo comprueba `ocultar` y `buscar`.
    En `f49bd66`.
17. **Hecho** en local (7-10-2026, sin commit). «Solo las del mapa», la lista que sigue al mapa
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
18. **Hecho** en local (7-10-2026, sin commit). La versión de los datos por rango y los
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
      patrón cambia con otro día mientras el estado del 19 sigue en 304; «ahora» sin ETag).
19. **Hecho** en local (7-10-2026, sin commit). «Cercanas» y «Cerca de mí», el bloque 5 de la
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
      idiomas a 1440, 375 y 320 px.

## Siguiente

- Propuestas: balance entre dos horas (dónde se acumulan y dónde se vacían; el
  13-5-2026 de 7 a 10, el tercio de estaciones más cerca del mar ganó 5,2 bicis de media y el
  intermedio perdió 6,1), estaciones que más tiempo pasan vacías o llenas, «cerca de mí» y una
  lista que siga al mapa, y en móvil un mapa más arriba (empieza a 475 px de 812).
- De la revisión del 7-10-2026, con datos que ya llegan: tooltip en el marcador; enlace
  compartible con título de pestaña por vista y metadatos; mediana de bicis por hora e
  historial de versiones en la ficha; cada casilla de la rejilla de huecos a su hora; aviso
  cuando la respuesta viene recortada (`truncated` se ignora) o el enlace trae un día o una
  estación que ya no existe; agrupación de marcadores a escala de ciudad con los recuentos
  en texto; en móvil, «Atrás» que cierre el detalle y la ficha. Lo grande: tiempo real con
  el token de Open Data BCN, que pide una clave de caché de la línea temporal por rango (hoy
  cualquier ingesta invalida todas las semanas) y `/api/sources` agregado en SQL.

## Backlog

- Riesgos vistos en la revisión del 7-10-2026, sin arreglar:
  - `station_versions` no tiene restricción de solape: si la ingesta fuera de orden dejara dos
    versiones vigentes, el mapa duplicaría la estación sin aviso. Una `EXCLUDE` con
    `btree_gist` lo convertiría en ingesta fallida.
  - El patrón de la estación no tiene caché ni semáforo y crece con los días importados.
  - `/health/ready` queda fuera del límite por IP y abre una conexión por petición.
  - CORS solo admite `GET` y la cobertura es `POST`: con un origen configurado, Experimentar
    fallaría.
  - `purge` borra por instante, no por ingesta: las observaciones del día que caen fuera de él
    sobreviven y la fuente sigue diciendo que tiene datos.
  - La regla del estado y la precedencia de la leyenda están cuatro veces en SQL y una en la
    web, con el umbral de «pocas» duplicado; el patrón no tiene prueba cruzada con el mapa.
  - Web: desde la ficha hay más de diez tabulaciones hasta el buscador y no hay «saltar a la
    lista»; `useScenario` llama a `setState` durante el render; `App.tsx` y `StationMap.tsx`
    pasan de 600 líneas y mezclan los tres modos.

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
