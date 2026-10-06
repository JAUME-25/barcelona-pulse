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
Las estaciones hipotéticas tienen además su propia forma: un rombo con una cruz.

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
  Se ve la semana entera (de lunes a domingo): un día sin datos importados sale apagado y no se
  puede elegir. Si hay más semanas importadas, flechas a los lados.
  Las bandas son sectores contiguos: barras sueltas parecían un trazo discontinuo, que aquí
  significa «sin datos».
- En escritorio la leyenda sube por encima del reproductor y se compacta; en móvil, el
  reproductor va entre el mapa y la leyenda.

## Experimentar

Elegido el 6 de octubre de 2026 entre tres propuestas (Consola, Lienzo y Cuaderno): la base es
Consola, un mando bajo el mapa como el de Reproducir.

- El mando: Añadir, Mover y Quitar (pulsar la activa la suelta) con lo que hace cada una, el radio
  (50 a 1000 m) y el área de estudio (Barcelona o un distrito). Al otro lado, la comparación
  grande «Red real 56,0 % → Escenario 56,3 %», con la etiqueta «Hipotético» en el escenario, lo
  que gana y lo que pierde, Deshacer y Volver a la red real.
- El panel explica qué se mide (geometría en línea recta, no demanda), de qué día es la red real,
  la lista de cambios (cada uno se deshace por separado) y los supuestos del modelo, plegados.
- En el mapa, las estaciones reales son octógonos grises pequeños, sin estado ni número: aquí
  importa dónde están. La cobertura de la red real es un charco de luz cian tenue; lo que gana el
  escenario, cian intenso; lo que pierde, rayado. El área de estudio, en discontinuo gris.
- Una estación nueva es un rombo; una quitada deja su octógono en discontinuo con aspa; una
  movida, sin aspa y con una línea hasta su sitio nuevo. La nueva y la movida llevan siempre su
  círculo de alcance en discontinuo, aunque no ganen nada.
- Si un cambio no mueve la superficie (estación en zona ya cubierta o fuera del área de estudio),
  un aviso junto a los números dice por qué: sin él parecía que no había pasado nada.
- «Sin cambio» solo si no se gana ni se pierde nada; las superficies pequeñas van en m².
- Todo el escenario va en la URL (`&radio=…&area=…&nuevas=…&movidas=…&quitadas=…`).
- En escritorio la leyenda sube por encima del mando; en móvil, el mando va entre el mapa y la
  leyenda, y el panel debajo.

## Límites visibles

Elegido el 6 de octubre de 2026 mezclando tres propuestas (Ficha, Sello y Lupa): la explicación
completa en un solo sitio y, junto a cada dato, lo justo para no malinterpretarlo.

- «Qué muestra y qué no», en el aviso de procedencia de los tres modos, abre una ficha en el
  panel (el mapa sigue a la vista; va en la URL, `?vista=limites`). Lleva:
  - los datos: periodo, último dato, ritmo y cuándo caduca un dato;
  - los huecos;
  - las estaciones sin dato en el momento mostrado, con el motivo;
  - lo que la aplicación no dice;
  - de dónde sale cada cosa, con su licencia, y el enlace al código.
- Huecos: un día por fila y una hora por casilla, rayada si falta parte de las estaciones y en
  discontinuo si no hay ninguna, como la franja de Reproducir. Pulsar un día lo reproduce.
- Estaciones sin dato, agrupadas: ningún dato hasta ese momento, días, horas o minutos sin
  informar. Cada una abre su detalle y se marca en el mapa (al experimentar no, porque allí
  tocar una estación la quita).
- Junto al dato:
  - bajo la pista de Reproducir, a qué horas faltan datos;
  - «N de M con dato» y, en Experimentar, «En línea recta · Superficie, no población · No mide
    viajes» llevan una nota (subrayado de puntos) que se abre debajo del bloque, sin partir la
    frase.
- En móvil, un sello sobre el mapa con «Histórico, no es tiempo real» y el momento; en
  Experimentar, de cuándo es la red y si lleva cambios hipotéticos. Al bajar, el aviso de
  procedencia se queda arriba. En escritorio no hace falta: el panel está al lado.
- Descartado: una lupa que apagaba en el mapa las estaciones con dato y rotulaba las que no.
  Competía con la leyenda, que ya filtra, y en móvil los rótulos se cortaban en los bordes. Su
  idea, el motivo de cada estación, está en la ficha.

## Nombres de estación

Elegido el 6 de octubre de 2026 entre tres formas (como en la placa, calle completa y solo
arreglado): **como en la placa**. La fuente publica casi todos los nombres en mayúsculas
(«AV. CAN MARCET, 3»); la web los escribe para leerse («Av. Can Marcet, 3») sin cambiar el dato
guardado (`features/stations/names.ts`):

- Mayúscula al principio de cada palabra; «de», «del», «la», «les», «i», «d’», «l’» en minúscula
  salvo al empezar el nombre o la calle que sigue a «|» o « / ».
- Las abreviaturas como vienen («C/», «Av.», «Pg.», «Pl.»), los números romanos y las siglas en
  mayúsculas, «bis» en minúscula. Las palabras que ya vienen en minúscula no se tocan.
- Espacios y comas arreglados, la ela geminada («PARAL.LEL» → «Paral·lel») y las palabras
  pegadas («AV.DIAGONAL»).
- Si la fuente corta el nombre (hacia los 40 caracteres) y su dirección lo trae entero, se usa la
  dirección; si sigue cortado, acaba en «…».
- Erratas corregidas a mano solo si no admiten duda («DEDUARD» → «d’Eduard», «FORUM» →
  «Fòrum», acentos que faltan en «Guinardó» o «Marítim»). Las que tienen forma catalana y
  castellana (Marqués y Marquès, Ramón y Ramon) se dejan como vienen.
- Los distritos que llegan pegados («SantMartí») se separan.
- El buscador encuentra la estación por los dos nombres, sin acentos y sin «·», puntos ni
  apóstrofos: «parallel» encuentra «Av. Paral·lel».

## Idiomas

Castellano, catalán e inglés. El selector, elegido el 6 de octubre de 2026 entre tres (en la
cabecera, una fila «Idioma» como la de la fuente o un botón sobre el mapa): **ES · CA · EN en
la cabecera**, a la derecha y en su fila bajo el nombre en los tres idiomas. En la misma línea
que el título partía «Barcelona Pulse» a 320 px.

- El idioma va en la URL (`?idioma=ca`) y en el `lang` de la página. Sin parámetro, el primero
  del navegador que tenga la aplicación; si no tiene ninguno, inglés.
- Al cambiarlo, la aplicación se vuelve a montar: lo que va en la URL (modo, día, hora, estación,
  escenario, ficha) se conserva y el foco queda en el idioma elegido.
- Los textos están en `src/i18n` (`es.tsx`, `ca.tsx`, `en.tsx`), con la misma forma: TypeScript
  avisa si a un idioma le falta un texto. Fechas y cifras, con `Intl` en hora de Barcelona
  (`i18n/intl.ts`).
- Los datos no se traducen: nombres de estación, barrios, distritos y áreas de estudio salen como
  los publica la fuente.
- La API habla en castellano. En catalán e inglés, la web traduce el nombre y la atribución de
  las fuentes que conoce (por su id) y los supuestos de la cobertura solo si el modelo y su
  versión son los que conoce; si no, deja el texto de la API.
- Catalán: «la 01:30» pero «les 10:54», «d’agost», «de l’Eixample», «del 2026» (como `Intl`).
  Inglés: «4–31 May 2026», cifras con punto decimal.

## Encuadre

Al abrir, las estaciones ocupan la parte del mapa que no tapan el panel, la leyenda y, al
reproducir o experimentar, el mando. `fitBounds` no tiene en cuenta la cámara inclinada y dejaba mucho
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
