# Caso técnico: Barcelona Pulse

Mapa de las estaciones de Bicing de Barcelona que enseña, de cada dato, de dónde sale y de
cuándo es. Permite recorrer días reales del histórico paso a paso y comparar la cobertura de la
red con escenarios hipotéticos.

Proyecto propio de Jaume Pérez Sentís para su portfolio. Lo ha hecho con un asistente de IA para
programar; suyos son el alcance, las reglas de datos, la elección de fuentes y de diseño, el
despliegue y la revisión de cada bloque antes de pasar al siguiente.

| | |
| --- | --- |
| Demo | https://pulse.jaumeperez.com, con las cuatro semanas del 4 al 31 de mayo de 2026 |
| Código | https://github.com/JAUME-25/barcelona-pulse, licencia MIT |
| Datos | Histórico de Bicing y distritos del Ajuntament de Barcelona (CC BY 4.0) |
| Estado | En producción desde el 6 de octubre de 2026 |

## El problema

Bicing publica cada cinco minutos el estado de sus estaciones, unas 540. Lo que se puede descargar
sin registrarse es un archivo por mes: dos .7z con CSV. Agosto de 2026 son 3 987 120 filas de
estado y otras tantas de información, que repiten el nombre y la ubicación de cada estación en
cada instantánea: 870 MB descomprimidos de datos que casi no cambian. Hay horas sin
instantáneas, estaciones que llevan meses sin informar y filas que se contradicen.

Al convertir eso en un mapa, es fácil decir más de lo que dicen los datos: pintar como vacía una
estación de la que no se sabe nada, o una hora sin datos como una caída a cero. Barcelona Pulse
responde a tres preguntas sin hacerlo:

- **Explorar:** cómo estaba cada estación en un momento dado, con la hora y la fuente del dato.
- **Reproducir:** cómo cambia la red a lo largo de un día, en pasos de 5 minutos, con los huecos
  a la vista.
- **Experimentar:** qué parte de Barcelona queda a menos de cierta distancia de una estación (el
  56 % a 300 m) y cuánto gana o pierde si se añaden, mueven o quitan estaciones.

Una ficha, «Qué muestra y qué no», reúne de cuándo son los datos, los huecos de cada día y hora,
qué estaciones no informan y por qué, y lo que la aplicación no dice.

## Decisiones

**Tres tipos de dato que no se mezclan.** Observado (el histórico), sintético (una demo inventada,
para probar sin datos reales) e hipotético (los escenarios). Cada fuente declara su tipo y no lo
puede cambiar, y cada vista enseña una sola fuente. Los escenarios no se guardan: viajan en la URL
y se calculan al pedirlos, así que ninguna tabla tiene estaciones inventadas.

**Sin dato no es cero.** El estado de una estación en el instante T es su última observación
anterior o igual a T, si no tiene más de 15 minutos. El margen sale de medir el archivo: las
estaciones informan cada 361 s de mediana (p99, 375 s). Pasado ese margen, la estación sale «sin
dato reciente» y sus recuentos son nulos en la base de datos, en la API y en pantalla. Una
estación cerrada que publica ceros tampoco sale vacía. No se interpola: que cambie el número de
bicis no dice de dónde a dónde fue nadie.

**Una sola regla para todo.** El mapa, la línea temporal de Reproducir y los fotogramas de cada
hora aplican esa misma regla, y dos pruebas de integración comparan cada paso con lo que da el
mapa en ese instante.

**Medir en metros.** Las ubicaciones se guardan en WGS84, pero distancias y superficies se
calculan en EPSG:25831, el sistema que usa el Ajuntament: Web Mercator alarga las distancias 1,33
veces en Barcelona. La cobertura es la unión de los círculos, sin contar dos veces los solapes,
recortada a un área de estudio declarada: Barcelona (101,7 km²) o uno de sus distritos.

**Un monolito modular.** Una API ASP.NET Core que lleva la ingesta en el mismo binario, como línea
de comandos y sin endpoint HTTP; una web estática, y PostgreSQL con PostGIS. Sin colas ni
servicios aparte mientras ninguna medición los pida. El contrato OpenAPI se genera al compilar,
los tipos de la web salen de él y la CI falla si alguno no está al día.

**Importaciones que se pueden repetir y revisar.** Una observación se identifica por estación e
instante observado: importar dos veces el mismo día no duplica nada. Cada ejecución guarda qué
archivo entró y su sha256, cuántas filas eran nuevas, repetidas, contradictorias o rechazadas, y
cada rechazo con su motivo. Nombre, ubicación y capacidad van en versiones con fecha, para que un
cambio no reescriba el pasado.

**Solo fuentes con licencia clara.** El tiempo real municipal necesita un token personal que aún
no se ha pedido. El feed GBFS del operador es público, pero no publica licencia: no se usa,
tampoco como sustituto.

**Diseño elegido viendo propuestas.** El sistema visual y cada pantalla nueva se eligieron entre
tres propuestas distintas. El diseño, «Fanals», es Barcelona de noche con los datos en el color
de las farolas. Ningún estado depende solo del color: el marcador es una manzana del Eixample que
se llena como un depósito y lleva dentro el número de bicis.

## Dificultades reales

**La consulta central se hacía más lenta con cada día importado.** «Para cada estación, su última
observación anterior a T», escrita con LINQ, EF Core la traducía como un `ROW_NUMBER()` sobre
todo el histórico: 119 ms con un solo día. En SQL explícito, con `LEFT JOIN LATERAL`, baja por el
índice `(station_id, observed_at)` una vez por estación: 14–16 ms por petición (6 ms en
PostgreSQL). Medida después con una semana y con dos, tarda lo mismo en los dos casos.

**Reproducir agotaba el límite de la API.** Una petición por paso de 5 minutos superaba las 120
por minuto: a los 20 s la API respondía 429 y el mapa se congelaba. Bajar el ritmo y saltarse
pasos lo evitaba a costa de enseñar menos. La solución fue pedir una hora entera por petición:
un día completo a la velocidad más alta, con todos los pasos, son 23 peticiones y ningún 429.

**Un dato de 2025 estiraba el calendario.** Una estación repite desde junio de 2025 la misma hora
de último informe. El dato es correcto (por él sale «sin dato reciente»), pero el periodo de la
fuente pasaba a decir «de junio de 2025 a agosto de 2026». Los días que se pueden reproducir
salen ahora de lo que cubre cada importación terminada. La misma estación hacía decir a la lista
«sin dato reciente desde las 10:54», cuando no informa desde junio de 2025.

**El archivo se repite y se contradice.** La información de estaciones se reduce a los momentos
en que algo cambia. En un solo día hay 202 casos de la misma estación en el mismo instante con
cifras distintas: se conserva la primera y se cuentan, en vez de elegir en silencio. Los .7z se
leen en streaming: los dos de agosto (256 y 870 MB descomprimidos) en 1–2 s cada uno, con menos
de 40 MB de memoria.

**El portal bloquea al servidor.** Open Data BCN contesta 403 a las descargas desde el VPS de
producción y 200 desde una conexión doméstica. No se sortea: los archivos se descargan aparte, se
suben y se importan desde disco con el mismo código, que registra su sha256 igual que si los
hubiera descargado.

**Detrás de nginx, todas las visitas eran la misma IP.** Compartían el límite de 120 peticiones
por minuto. La API usa ahora `X-Forwarded-For`, pero solo si la conexión llega de la red de
Docker del proyecto: desde fuera, nadie puede hacerse pasar por otra IP.

**Que no pase nada también hay que explicarlo.** Al probar Experimentar, una estación nueva en
Navas no ganaba superficie (la zona ya estaba cubierta) y parecía que la aplicación no respondía.
Ahora cada estación nueva o movida enseña su círculo de alcance, y un aviso dice por qué la cifra
no cambia. Por el camino apareció otro caso: restos de coma flotante (1e-8 m²) contaban como
superficie ganada. Las superficies se redondean al metro cuadrado.

**La primera visita a los límites esperaba 12,5 s.** La rejilla de huecos calculaba las cuatro
semanas de mayo la primera vez que se abría tras arrancar la API. Dejarla calculada al desplegar
no bastaba: un reinicio, una importación o una purga devolvían la espera a la primera visita.
Ahora la calcula la propia API al arrancar y comprueba cada 5 minutos que siga en la caché: tras
desplegar, la rejilla sale a la primera en 0,37 s (0,53 s en móvil).

## Mediciones

Medido el 5 y el 6 de octubre de 2026. En local: Windows 11, API y PostGIS en Docker en el mismo
equipo, compilación de producción y Chromium con GPU; el móvil, emulado a 375 × 812 con la CPU
cuatro veces más lenta (la GPU sigue siendo la del equipo). Dos trampas cambiaron el método: con
la CPU ralentizada, el reloj de Playwright sumaba su propio retraso (la lista parecía tardar 1,7 s
y eran 0,5), así que se usan los tiempos del navegador; y sin ventana, Chromium pinta el mapa por
software, así que la fluidez se mide con la GPU.

| Qué | Resultado |
| --- | --- |
| Estado de la red en un instante (540 estaciones, un día real) | 14–16 ms de mediana, 29 KB comprimido |
| El mismo estado con una semana y con dos (1,08 y 2,16 millones de observaciones) | 27 ms en los dos casos |
| Una hora de fotogramas para Reproducir | 47–110 ms, 110 KB con Brotli |
| Línea temporal: un día cada 5 min / una semana cada 15 min | 0,48 s / 1,7 s la primera vez; 5–9 ms desde la caché |
| Cobertura de la red real a 300 m | 0,33–0,37 s, 35 KB comprimido |
| Importar un día / una semana del histórico | ~19 s / 72 s (925 784 observaciones) |
| Carga en móvil con la red real: lista / mapa | 0,53 s / 2,06 s (la lista, 0,89 s antes de cargar el mapa aparte) |
| Carga en escritorio: lista / mapa | 0,12 s / 0,85 s |
| Arrastrar y acercar el mapa | 60 fps en escritorio; 48–49 en móvil (60 en Experimentar) |
| Producción, mayo de 2026 | 28 días, 4 229 269 observaciones, 548 estaciones; con dato, el 98,3 % de las estaciones de media y ningún paso vacío |
| Rejilla de huecos a la primera, tras desplegar (producción) | 0,37 s en escritorio y 0,53 s en móvil; antes, 12,5 s |
| Despliegue completo | 43 s |

Los tiempos de carga se midieron con 297 KB de JavaScript inicial (90 KB comprimido); con los
límites visibles son 313 KB (97 KB) y no se han vuelto a medir. Detalle y cómo repetir cada
medición: [arquitectura](architecture.md#mediciones).

## Pruebas

- 153 pruebas de backend, unitarias y de integración contra PostGIS real (no un proveedor en
  memoria), y 71 de la web, unitarias y de componentes. La CI las pasa y comprueba además el
  formato, el lint, los tipos, que el contrato OpenAPI esté al día y que no falte ninguna
  migración.
- Pruebas de humo con Playwright en escritorio y móvil, y capturas que usan cada pantalla con el
  mapa real en escritorio, 375 y 320 px. Estas se ejecutan en local, no en la CI.
- Casos buscados a propósito: días de 23 y 25 horas en los cambios de hora, huecos, estaciones
  cerradas que publican ceros, recuentos ausentes que no suman cero, cada paso de Reproducir igual
  al mapa en ese instante, un círculo de 300 m que mide lo que debe, dos estaciones en el mismo
  punto que cuentan una vez, el mismo escenario con la misma respuesta byte a byte y el navegador
  en la zona horaria de Nueva York, para que las horas sigan siendo las de Barcelona.

## Límites

- No es tiempo real: son cuatro semanas de mayo de 2026. El tiempo real necesita un token del
  portal y una medida de frescura que aún no existen.
- La cobertura es geometría en línea recta sobre la superficie: no es tiempo a pie, ni
  población, ni demanda. Collserola, Montjuïc y el puerto cuentan como cualquier otra zona.
- No predice ni recomienda nada.
- El móvil se ha medido emulado, no en un teléfono. En Experimentar, con el dedo solo se ha
  probado añadir estaciones, y con Playwright; falta arrastrarlas en un teléfono de verdad.
- En Experimentar, añadir y mover estaciones necesita ratón o pantalla táctil; con el teclado solo
  se deshace.
- A escala de ciudad los marcadores se solapan, y los nombres llegan en mayúsculas desde la
  fuente.
- El mapa base es un servicio gratuito sin garantía (OpenFreeMap). Si falla, la lista de
  estaciones sigue funcionando.
- En los primeros segundos tras arrancar la API (unos 15 s con mayo), quien abra «Qué muestra y
  qué no» aún espera a que se calcule la rejilla de huecos.
- Solo en español.

## Ficha técnica

| | |
| --- | --- |
| API | .NET 10, ASP.NET Core, EF Core con Npgsql y NetTopologySuite; SQL explícito donde EF no rinde |
| Datos | PostgreSQL 18 con PostGIS 3.6; SharpCompress para leer los .7z |
| Web | React 19, TypeScript, Vite y MapLibre GL JS 6 con teselas de OpenFreeMap; cliente tipado desde OpenAPI |
| Pruebas | xUnit v3, Vitest y Playwright |
| Entrega | Docker Compose, GitHub Actions y un VPS de Hetzner gestionado con Laravel Forge, detrás de nginx; monitor externo cada 5 minutos |

Más detalle: [arquitectura](architecture.md), [decisiones (ADR)](adr/),
[modelo de datos](data-model.md), [fuentes](data-sources.md) y [despliegue](despliegue.md).
