# ADR 0014: Versión de los datos por rango y validadores HTTP

Fecha: 7 de octubre de 2026. Estado: aceptada.

## Contexto

La línea temporal se calcula al pedirla y se guarda en memoria hasta que cambian los datos
(ADR 0009). La clave de la caché llevaba la última ingesta de la fuente, la última purga y el
recuento de observaciones: cualquier ingesta, de cualquier día, invalidaba todas las semanas, y
`TimelineWarmUp` las volvía a calcular todas (de 3,5 a 4,2 s por semana en producción). Con
tiempo real, una ingesta por minuto dejaría la caché inservible.

Además, ninguna respuesta de la API llevaba validadores HTTP. El estado de la red en un
instante pasado, una hora de fotogramas o el patrón de una estación no cambian hasta que
entran o salen datos, pero cada visita volvía a descargarlos (29 KB el estado, 110 KB una hora
de fotogramas, comprimidos) y la API los volvía a calcular.

## Decisión

- **Versión de los datos por rango** (`Infrastructure/DataVersion.cs`): para una fuente y un
  rango de instantes, la última ingesta terminada que toca el rango y cuántas purgas ha habido
  en la fuente. Una ingesta toca el rango si lo hace el periodo que dice cubrir o el de sus
  observaciones (el archivo de un día trae a veces las últimas del día anterior), contando la
  tolerancia de la fuente hacia atrás (las observaciones anteriores a `from` deciden el estado en
  `from`). Sin rango, todos los datos de la fuente.
- **Las purgas se cuentan** en `data_sources.purge_generation`, que `purge` incrementa en su
  transacción (como el recuento de la ADR 0012). Una purga borra observaciones sin dejar
  ingesta nueva, también de días sin ingesta propia: la generación hace que cambie la versión
  de cualquier rango. Es un cambio raro; recalcularlo todo entonces es aceptable.
- **La clave de la caché de la línea temporal** es el rango, el paso y esa versión. Importar
  un día nuevo solo invalida las semanas que lo tocan.
- **ETag débil y `Cache-Control: private, no-cache`** en las respuestas que solo dependen de los
  datos y de la petición: el estado en un instante pedido (o el final de los datos de una fuente
  sintética), el detalle de una estación, su patrón, la línea temporal y los fotogramas. Con
  `If-None-Match`, la API responde 304 antes de calcular nada. «Ahora» de una fuente observada
  cambia con el reloj y no lleva validador. `no-cache` obliga a revalidar siempre: lo que se
  ahorra es el cuerpo y el cálculo, no la petición, y así una ingesta se ve en la siguiente
  visita.

## Consecuencias

- Tras importar un día, el precalentamiento recalcula una semana (dos si el día es lunes o el
  anterior trae observaciones del domingo), no todas.
- El navegador guarda las respuestas y las revalida: los enlaces compartidos, Atrás y Adelante y
  volver a una vista ya vista no descargan de nuevo el estado ni los fotogramas.
- La versión viaja en el ETag (`W/"stations:<instante>:<fuente>:<ingesta>:<purgas>"`): no
  revela nada que no diga ya `/api/sources/{id}/ingestions`.
- Un día purgado sin ingesta propia sigue sin poder detectarse por sus ingestas; lo cubre la
  generación de purgas. El recuento de observaciones deja de formar parte de la clave.
- Si una fuente de tiempo real importa cada pocos minutos, la versión del día en curso cambia a
  ese ritmo y la de los días anteriores no: es lo que hace falta para que la caché y los ETag
  sigan sirviendo.
