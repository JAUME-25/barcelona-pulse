# Sistema visual: Fanals

Barcelona de noche, con la luz de las farolas como color de los datos. Elegido el 5 de octubre de
2026 entre tres direcciones (Quadrícula, Fanals, Relleu), con la condición de conservar la
claridad de la versión clara. Tokens en `apps/web/src/app/theme.ts`.

## Principios

- El mapa es el protagonista y tiene que servir para orientarse: calles y barrios legibles aunque
  el ambiente sea oscuro.
- Ningún estado depende solo del color: la forma del marcador y su número dicen lo mismo.
- La procedencia y el momento del dato siempre a la vista.
- Búsqueda, leyenda y filtros siempre a mano, también con el detalle abierto.

## Estados de estación

El marcador es una manzana del Eixample (cuadrado con chaflanes) y funciona como un depósito: la
forma ya dice cuántas bicis hay. Desde el zoom 13 lleva dentro el número de bicis.

| Estado | Forma | Color | Número |
| --- | --- | --- | --- |
| Con bicis (4 o más) | lleno | ámbar `#ffc65c` | bicis |
| Pocas bicis (1 a 3) | lleno hasta el 40 % | naranja `#ff8f3f` | bicis |
| Sin bicis | solo el contorno | rojo `#ff5468` | 0 |
| Llena (sin anclajes libres) | lleno con doble contorno | violeta `#c38bff` | bicis |
| Fuera de servicio | lleno y tachado | gris `#7d8a9c` | ninguno |
| Sin dato reciente | contorno discontinuo | gris `#8a97a8` | ? |

Ámbar, naranja y rojo son una sola escala cálida: «se acaban las bicis». El violeta es otro
problema distinto: no se puede devolver. Todos los marcadores llevan un contorno exterior oscuro
que los separa de cualquier fondo, también de los edificios claros en 3D.

## Escala reservada: cobertura y simulaciones

Cian (`--coverage-1` a `--coverage-4`: `#0f3b47`, `#16707f`, `#26a9b8`, `#7fe3ea`). Ningún estado
de estación lo usa, para que un escenario hipotético (B4) nunca se confunda con una observación.
Las estaciones hipotéticas tendrán además su propia forma.

## Reproducir

Elegido el 6 de octubre de 2026 entre tres propuestas (Pletina, Marea y Rellotge): la base es
Pletina, con los relojes de la semana y los pasos de 5 minutos de Rellotge.

- Distribución de Explorar: estaciones a la izquierda y el reproductor abajo, sobre el mapa. Se
  puede consultar una estación mientras se ve cómo cambia durante el día.
- El reproductor tiene: −5 min, reproducir y +5 min, la velocidad, la hora grande con la fecha
  completa (con el año: es un día del pasado), los recuentos del momento y los relojes de la
  semana.
- La pista es la forma del día: estaciones sin bicis hacia arriba (rojo) y llenas hacia abajo
  (violeta), con la misma escala, que se indica. Debajo, una franja con las estaciones con dato:
  continua si informan casi todas y rayada si falta parte.
- Una hora sin datos se dibuja con el eje discontinuo y sin área: sin datos no es cero.
- Relojes de 24 horas, uno por día: dentro las vacías, fuera las llenas, por horas y con la
  misma escala en toda la semana para que se puedan comparar. El día elegido lleva borde ámbar.
  Las bandas son sectores contiguos: barras sueltas parecían un trazo discontinuo, que aquí
  significa «sin datos».
- En escritorio la leyenda sube por encima del reproductor y se compacta; en móvil, el
  reproductor va entre el mapa y la leyenda.

## Encuadre

Al abrir, las estaciones ocupan la parte del mapa que no tapan el panel, la leyenda y, al
reproducir, el reproductor. `fitBounds` no tiene en cuenta la cámara inclinada y dejaba mucho
municipio vecino y mar: después se ajusta con dónde caen las estaciones en pantalla.

## Mapa base

El estilo `dark` de OpenFreeMap se transforma al cargarlo (`features/stations/basemap.ts`):

- fondo azul noche (`#0b1422`) en lugar de negro;
- calles más claras que las manzanas y con contorno las principales;
- nombres de calle y de barrio claros, con halo oscuro y algo más grandes;
- nombres locales (`name`, como en las placas) en vez de la traducción inglesa;
- barrios de clase `quarter` visibles (en OSM, la mayoría de barris de Barcelona);
- parques en verde muy oscuro y agua en azul oscuro, para reconocer Montjuïc, Collserola o el mar.

Edificios en 3D desde z14, más claros cuanto más altos (`#22334c` → `#435d86`).

## Tipografía y medidas

Barlow Semi Condensed (OFL), solo subconjuntos latinos. Base de 17 px. En el panel, las cifras de
bicis y anclajes van a 24 px en la lista y a 56 px en el detalle; el momento del dato, a 20 px.

## Contraste medido

Ratios WCAG calculados con los colores de `theme.ts` y `basemap.ts` (5 de octubre de 2026):

| Par | Ratio |
| --- | --- |
| Texto del panel / panel | 16,3:1 |
| Texto secundario / panel | 9,8:1 |
| Nombre de barrio / fondo | 15,0:1 |
| Nombre de calle / fondo | 10,0:1 |
| Nombre de calle / edificio 3D más claro | 3,6:1 |
| Marcadores / fondo (el más bajo, fuera de servicio) | 5,3:1 |
| Número dentro del marcador (el más bajo, llena) | 7,4:1 |

Límite conocido: en «pocas bicis», la parte inferior del número puede caer sobre el naranja
(1,85:1 sin ayuda). Lo resuelve el halo oscuro del texto; si se ve justo en pantallas pequeñas,
bajar el nivel de llenado.
