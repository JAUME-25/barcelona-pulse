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

## Momento mostrado

Un histórico abre en el último laborable importado a las 08:30, con el día de la semana a la
vista, en Explorar y en Reproducir (decidido el 7-10-2026). El final del periodo caía en domingo a
las 23:55, el rato más tranquilo de la semana, y no decía nada de cómo se usa la red. «Cambiar
momento», junto a la hora, lleva a Reproducir parado en ese instante; el momento que se deja allí
sigue en Explorar y Experimentar y va en la URL. Los festivos cuentan como laborables.

«A esta hora» (7-10-2026), al lado: quien abre a las 18:00 veía la mañana del viernes. Pone el
último día importado con el mismo día de la semana que hoy (si no lo hay, el último del mismo
tipo; si no, el último) a la hora de reloj de ahora en Barcelona, en pasos de 5 minutos, y lo deja
en la URL como «Cambiar momento». En la demo no sale.

## Eléctricas

Mucha gente prefiere una eléctrica, y quien la busca mira el mapa. Elegido el 7-10-2026 entre tres
direcciones con capturas (desglose de tres cifras en cada fila, interruptor del número, y texto
discreto en la línea del estado), por encargo de Jaume («la mejor para los usuarios»): el
**interruptor**, con una mezcla. Arriba de la leyenda, «Número en el mapa y la lista: Bicis ·
Eléctricas». Con «Eléctricas», el número del marcador y la cifra grande de la lista pasan a ser las
eléctricas («eléc.»), y las estaciones sin ninguna se atenúan en el mapa (siguen ahí y se pueden
tocar): es lo que hacía el filtro de las otras direcciones sin quitar el contexto. Forma y color no
cambian: siguen diciendo si hay bicis, con la misma regla que la API, así que una estación ámbar
con «0» es «tiene bicis, ninguna eléctrica». Sin desglose publicado no se atenúa ni se dice cero.
Reproducir suma las eléctricas de cada paso junto a las bicis, solo si todas las estaciones
contadas publican el desglose.

## Anclajes y atajos

«¿Podré aparcar?» no tenía vista propia: los anclajes libres solo salían en la lista y en el
detalle. Desde el 7-10-2026, como retoque de la leyenda:

- El interruptor del número tiene una tercera opción, **Anclajes**: el marcador lleva los anclajes
  libres y, en la lista, van delante y las bicis detrás (siempre se ven las dos cifras). Las
  llenas se atenúan, como las sin eléctricas con «Eléctricas»; forma y color no cambian. Va en la
  URL (`numero=anclajes`).
- Dos **atajos** encima del interruptor, para las dos preguntas de siempre: «Quiero una bici» deja
  a la vista las que tienen alguna (también las llenas) y pone las bicis; «Quiero aparcar» deja
  las que tienen anclajes libres (también las vacías) y pone los anclajes. Fuera, las que no
  operan y las sin dato. Un atajo está marcado solo si lo visible y el número coinciden
  exactamente con él; pulsado otra vez, vuelve a enseñarlo todo con las bicis. No añaden nada a
  la URL: son `ocultar=` y `numero=`, que ya iban.

## Móvil: cabecera plegable

En el teléfono el mapa empezaba a 555 px de 812: marca con lema, idioma, modos, fuente y el
aviso de procedencia entero (ocho líneas). Elegida el 7-10-2026 entre tres direcciones con
capturas reales (compacta, mapa primero y plegable), por encargo de Jaume («la que veas más
cómoda para el usuario»): la **plegable**.

- Sin lema, el nombre más pequeño y el idioma a la derecha del nombre (a 320 px vuelve a su
  fila). Los modos siguen arriba.
- El aviso de procedencia es una línea: «Datos reales · vie 28 de agosto, 08:30 · Más». «Más»
  despliega lo de siempre: la frase del histórico, el momento con «Cambiar momento» y «A esta
  hora», el crédito y los enlaces. Es un `details` sin estado propio: queda como lo deje la
  persona.
- Con eso el mapa empieza a unos 200 px (154 en producción, sin selector de fuente; a 320 px,
  302 desde que el cuarto modo, «Balance», pasa a una segunda fila, antes 266). El sello sobre
  el mapa sigue: dice qué es y de cuándo aunque la cabecera haya quedado
  arriba. «Qué muestra y qué no» y «Copiar enlace» quedan detrás de «Más»: los guiones de
  captura que los pulsan en móvil abren antes el pliegue.
- Descartadas: la compacta (302 px, lo mismo sin plegar) y «mapa primero» (51 px, pero mandaba
  los modos debajo de un mapa de dos tercios de pantalla, un gesto más lejos).

## Cercanas y Cerca de mí

Quien busca una bici está en un sitio concreto y, si la estación que tiene delante no sirve
(vacía, llena, sin dato), quiere la siguiente. Hecho el 7-10-2026 como retoque de la lista y la
ficha, sin pantalla nueva:

- «Cerca de mí», junto al buscador: pide la ubicación al pulsar (nunca al abrir). La lista pasa a
  ordenarse de más cerca a más lejos, con los metros en cada fila («240 m · Con bicis»; en línea
  recta en EPSG:25831, no a pie), y el mapa se acerca a nivel de calle con un punto claro con halo
  tenue, distinto del pictograma del metro y explicado en la clave «También en el mapa». Un aviso
  dice que está ordenada y que la ubicación no sale del navegador; con un error grande (más de
  500 m: la de un ordenador, que sale de la IP) dice «aproximada (±1,8 km)». Fuera de Barcelona no
  ordena y lo dice; sin permiso, sin posición o con el tiempo agotado, cada uno con su motivo.
- La ubicación vive solo en memoria: no va en la URL ni se guarda, y «Copiar enlace» va sin la
  cámara del mapa mientras se sepa dónde está la persona (apuntaría a ella), y lo dice. «Más cerca
  de mí» es un orden más del selector, solo mientras haya ubicación; Atrás no lo quita. La cámara
  va a la persona solo cuando llega una ubicación nueva: al volver de Experimentar se queda donde
  estaba.
- «Cercanas», en la ficha, después de los datos de la estación y antes de «Cómo suele estar»: las
  cinco más próximas con su estado y su distancia desde la estación, con la misma cifra que la
  lista (bicis o eléctricas). Cada una abre su ficha.
- En producción, la cabecera `Permissions-Policy` de nginx lleva `geolocation=(self)`.

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
  escenario, cian intenso; lo que pierde, rayado. El área de estudio, en discontinuo gris. Sin
  edificios en 3D, para que se vea entera.
- Una estación nueva es un rombo; una quitada deja su octógono en discontinuo con aspa; una
  movida, sin aspa y con una línea hasta su sitio nuevo. La nueva y la movida llevan siempre su
  círculo de alcance en discontinuo, aunque no ganen nada.
- Si un cambio no mueve la superficie (estación en zona ya cubierta o fuera del área de estudio),
  un aviso junto a los números dice por qué: sin él parecía que no había pasado nada.
- «Sin cambio» solo si no se gana ni se pierde nada; las superficies pequeñas van en m².
- Todo el escenario va en la URL (`&radio=…&area=…&nuevas=…&trasladadas=…&retiradas=…`). Las
  estaciones reales, con su identificador en Bicing, como `?estacion=`: el enlace vale en
  cualquier copia de la base. Los enlaces anteriores al 7-10-2026 (`movidas`, `quitadas`, con el
  identificador interno) se siguen leyendo.
- En escritorio la leyenda sube por encima del mando; en móvil, el mando va entre el mapa y la
  leyenda, y el panel debajo.

## Balance entre dos horas

Dónde se acumulan y dónde se vacían las bicis entre dos horas del mismo día: el cuarto modo,
«Balance». Elegido el 8-10-2026 entre tres direcciones con capturas sobre datos reales (el
13-5-2026 de 07:00 a 10:00): «Marea» (cada estación con su diferencia en el mapa), «Antes y
después» (el mapa de siempre en dos momentos, con un conmutador) y «Por barrios» (un círculo por
barrio con su balance). Por encargo de Jaume («la que veas más cómoda para el usuario siguiendo la
estética de la web»): **Marea**, con la frase y las barras por distrito de «Por barrios» en el
panel.

- Cada estación es el mismo octógono, con el balance en vez del estado: **lleno violeta** si gana
  bicis y **hueco rojo** si las pierde; el tamaño dice cuántas (de poco más de la mitad del
  marcador a casi el doble, con el tope en 25 bicis) y, a escala de calle, el número con signo
  («+39», «−23»). Igual, un marcador neutro y pequeño; sin dato en uno de los dos momentos, el de
  desconocido. Violeta y rojo son los de «llena» y «sin bicis»: ganar bicis acerca a lo uno y
  perder, a lo otro. Las que más cambian se dibujan encima.
- El panel: el día y las dos horas (en pasos de media hora; la de llegada es el momento mostrado
  y la de partida, tres horas antes si nadie pide otra); los totales en dos cifras grandes
  («+2019 bicis más, en 197 estaciones» y «−2478 bicis menos, en 297»), cuántas quedan igual y
  cuántas sin dato, y las bicis ancladas antes y después en las que tienen dato en los dos
  momentos; la frase de los distritos («Ganan bicis Les Corts, Ciutat Vella y Sant Martí; pierden
  Sant Andreu, Horta-Guinardó y Gràcia»); las barras divergentes por distrito, en bicis por
  estación para comparar distritos de distinto tamaño; y las seis que más se llenan y las seis
  que más se vacían, con «2 → 41 de 43». Cada una abre su ficha del momento de llegada.
- «Por altitud» (8-10-2026, con la altitud del archivo ya importada): las estaciones con balance
  y altitud publicada en tres tercios («Hasta 15 m», «De 15 a 40 m», «Más de 40 m»; los límites
  salen de los datos), con las mismas barras que los distritos. El 13-5-2026 de 7 a 10, las más
  bajas ganan 4,0 bicis por estación, las intermedias pierden 5,4 y las más altas 1,6: por la
  mañana las bicis bajan, y salen sobre todo de la franja media.
- La clave, en la leyenda del mapa, con el recuento de cada clase; en móvil, el sello dice las
  dos horas.
- Son dos estados, no viajes, y se dice: lo que entra y sale entre medias no se ve. Sin dato no es
  cero: una estación sin dato fiable o fuera de servicio en cualquiera de los dos momentos queda
  en «sin dato» y fuera de los totales.
- En la URL: `modo=balance`, `dia` y `hora` (la llegada, como el momento mostrado) y `desde`. Al
  entrar sin hora pedida, el momento pasa a las 10:00 del día mostrado.
- Con cuatro modos, en móvil el selector va más prieto a 375 px y a 320 pasa a dos filas.
- Descartadas: «Antes y después» obliga a comparar de memoria dos mapas de 540 estaciones; «Por
  barrios» resume bien pero esconde las estaciones y mete una forma nueva (el círculo) para una
  zona. Su frase y sus barras se quedan.

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
- Desde el 7-10-2026, en «Los datos»: cuántas observaciones hay guardadas y la última
  importación (cuándo, cómo acabó y sus recuentos). Y fuera de la ficha, tres avisos que antes
  se callaban: un enlace con una estación que no está en la fuente, un enlace con un día no
  importado (se enseña otro) y una respuesta recortada por la API. En la ficha de la estación,
  desde cuándo se conoce y, plegados, sus cambios de nombre, sitio, capacidad o altitud con
  fecha: la API los guardaba por versiones y la web no los enseñaba. Desde el 8-10-2026, la
  altitud publicada («Altitud · 41 m») entre los datos de la estación; sin ella, no se nombra.
- Altas y bajas (9-10-2026): la API da la primera y la última vez que la fuente publicó cada
  estación y la web solo afirma lo que un día importado anterior o posterior demuestra
  (`features/stations/lifecycle.ts`). En la ficha, entre los datos: «Alta · 12 de mayo de 2026,
  12:25 · el 11 de mayo no estaba en la lista de la fuente» y «Baja · 26 de agosto de 2026 · el
  27 de agosto ya no estaba en la lista de la fuente»; con días sin importar en medio, «el 31 de
  mayo, último día importado antes». Si el momento mostrado es anterior al alta, la explicación
  del dato que falta dice que la fuente aún no la publicaba; si es posterior a la baja, que dejó
  de publicarla: no «lleva días sin informar». En «Qué muestra y qué no», la sección «Altas y
  bajas» entre los huecos y las estaciones sin dato: las dos listas (cada una abre su ficha) y la
  nota de que dejar de informar no es una baja. Una baja no cierra la versión ni quita la
  estación del mapa: sigue sin dato, y en «Sin dato en este momento» el motivo es ese.
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

## Contrato de la API

Una página de lectura aparte, `/contrato.html` (8-10-2026), con el tema, las fuentes y el
selector de idioma de la aplicación y sin mapa: el documento OpenAPI que publica la API, legible.

- Una columna de hasta 1040 px. Arriba, qué es y de dónde sale (el JSON del mismo servidor,
  enlazado) y las reglas comunes; después el índice de rutas por etiqueta, las rutas en
  tarjetas (método como sello, ruta en monoespaciada, resumen y descripción) y los esquemas.
- Parámetros, respuestas y propiedades van en listas, no en tablas: una fila por elemento con el
  nombre, dónde va, «obligatorio» si lo es, el tipo y la descripción. Así caben a 320 px sin
  desbordes. Un tipo que es un esquema enlaza con su sección (subrayado de puntos).
- Las descripciones del contrato están en castellano, como las escribe la API; la página lo
  dice y traduce solo lo suyo (títulos, etiquetas, reglas).
- Descartado Scalar: pide estilos y fuentes de fuera (la CSP solo admite lo propio), pesa más que
  la aplicación y no se parece a ella.

## Cómo suele estar (patrón de la estación)

Elegido el 7-10-2026 entre tres formas (columnas, relojes y curva) por ser la más fácil de leer
para cualquiera: usa los mismos estados y colores que la leyenda del mapa.

- Al final de la ficha de la estación: una columna por hora, en laborables y en fin de semana,
  partida en las veces que estuvo sin bicis (abajo, en rojo), con pocas, con bicis, llena, fuera
  de servicio o sin dato (en discontinuo: sin dato no es cero). La hora del momento mostrado,
  recuadrada.
- Debajo de cada una, en frases: primero la hora que se ve en el mapa, en el bloque de su tipo de
  día («De 8 a 9 h tuvo alguna bici el 62 % del tiempo; la mediana, 5 bicis», desde el
  7-10-2026: la mediana la daba ya la API y no se enseñaba); después cuándo se quedó sin bicis
  («De 10 a 11 h estuvo sin bicis el 78 % del tiempo») o que casi nunca (por debajo del 10 %),
  cuándo se llenó y, si pasa del 10 %, cuánto falta de dato. Es lo que oye un lector de pantalla.
- Una clave con solo los estados que salen en esa estación.
- Siempre dice de qué días sale («en los 42 días importados, del…») y que no es una previsión;
  los festivos cuentan como laborables.

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

Los nombres de estación, barrio y distrito van en catalán, como los publica la fuente, en los
tres idiomas: llevan `lang="ca"` y `translate="no"` (8-10-2026) para que un traductor automático
no los toque y para que el detector de idioma del navegador no tome la página por otra cosa
(Chrome la daba por noruega: 548 nombres catalanes pesan más que el texto en castellano).

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
- calles claramente más claras que las manzanas, con contorno las principales, y las peatonales
  continuas (en Ciutat Vella son casi todas y el trazo discontinuo las hacía parecer caminos);
- plantas de los edificios visibles antes del 3D (hasta z14), con su contorno;
- nombres locales (`name`, como en las placas) en vez de la traducción inglesa;
- nombres de calle como en los planos de Barcelona, sin «Carrer de» y con las abreviaturas de
  las estaciones («Mallorca», «Av. Diagonal», «Pg. de Gràcia»), en minúscula: las principales
  en negrita desde z12 y antes que las demás; el resto, desde z14. Propuesto con capturas y
  aprobado por Jaume el 7-10-2026 frente al nombre completo, que no cabía en las calles cortas
  (en el Gòtic a z16,6 se veían 3 nombres; así, 40). Los pasillos y andenes del metro, que OSM
  también nombra, no;
- barrios de clase `quarter` (en OSM, la mayoría de barris de Barcelona) de z14 a z16: la
  tesela los trae desde z14 y el estilo los apagaba en z14, así que no salían nunca;
- referencias para orientarse: metro, tren y tranvía desde z14 (pictograma redondo y claro, no
  octógono, y el nombre en cursiva), parques desde z14 y jardines desde z16, y números de portal
  desde z17 (las estaciones se llaman por su dirección);
- carriles bici en verde (`#7ad08f`), solo los que OSM dibuja aparte de la calzada: no están
  todos y así lo dicen la leyenda («También en el mapa») y «Qué muestra y qué no». Al
  experimentar no se dibujan, como los edificios;
- sin las flechas de sentido único;
- parques y bosques en verde oscuro y agua en azul oscuro, para reconocer Montjuïc, Collserola o
  el mar (los bosques sin el patrón del estilo, que no está en su sprite);
- las etiquetas, después de todo lo demás. Prioridad al colocarlas: barrios, metro, parques,
  calles principales, el resto de calles y portales.

Medido el 7-10-2026 con la compilación de producción: la fluidez y la carga no cambian (ver
`docs/architecture.md`).

Edificios en 3D desde z14, opacos y más claros cuanto más altos (`#22334c` → `#435d86`),
elegido por Jaume el 7-10-2026 entre tres (maqueta, noche y solo los altos). Van encima de calles
y plantas y debajo de las etiquetas: MapLibre pinta sin profundidad lo que queda encima de una
capa 3D, y con los edificios debajo de las calles se veían transparentes. Al experimentar no se
dibujan: tapaban la cobertura.

## Tipografía y medidas

Barlow Semi Condensed (OFL), solo subconjuntos latinos. Base de 17 px. En el panel, las cifras de
bicis y anclajes van a 24 px en la lista y a 56 px en el detalle; el momento del dato, a 20 px.

## Contraste medido

Ratios WCAG calculados con los colores de `theme.ts` y `basemap.ts` (5 de octubre de 2026; el
mapa base, de nuevo el 7 de octubre):

| Par | Ratio |
| --- | --- |
| Texto del panel / panel | 16,3:1 |
| Texto secundario / panel | 9,8:1 |
| Nombre de distrito / fondo | 15,0:1 |
| Nombre de barrio / fondo | 12,8:1 |
| Nombre de calle principal / fondo | 15,1:1 |
| Nombre de calle / fondo | 11,4:1 (antes 10,0) |
| Nombre de calle principal / edificio 3D más claro | 5,5:1 (antes 3,6) |
| Nombre de calle / edificio 3D más claro | 4,1:1 |
| Metro, tren y tranvía / fondo | 13,8:1 |
| Parque / fondo | 9,4:1 |
| Número de portal / fondo | 6,1:1 |
| Carril bici / fondo · / calle | 9,9:1 · 4,4:1 |
| Calle / manzana (líneas, antes del 3D) | 1,8:1 (antes 1,4) |
| Marcadores / fondo (el más bajo, fuera de servicio) | 5,3:1 |
| Número dentro del marcador (el más bajo, llena) | 7,4:1 |

Límite conocido: en «pocas bicis», la parte inferior del número puede caer sobre el naranja
(1,85:1 sin ayuda). Lo resuelve el halo oscuro del texto; si se ve justo en pantallas pequeñas,
bajar el nivel de llenado.
