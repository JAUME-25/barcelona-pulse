# 0009. Línea temporal calculada al pedirla

Fecha: 2026-10-05. Estado: aceptada.

## Contexto

Para reproducir un periodo (B3), la web necesita saber de antemano cómo es: en qué momentos hay
datos, cuántas estaciones informan y cuántas bicis hay. Sin eso, un hueco del histórico solo se
descubriría al llegar a él, y la tentación sería dibujarlo como una caída a cero.

Había dos opciones: calcularla al pedirla con la misma regla que el mapa (ADR 0005) o
precalcularla en una tabla en cada ingesta.

## Decisión

- `GET /api/sources/{id}/timeline?from&to&step` la calcula al pedirla, en SQL explícito
  (`TimelineQuery`): cada observación cubre los pasos desde su instante hasta el siguiente
  reporte de su estación, sin pasar de la tolerancia. Es la regla del estado en un instante
  aplicada a una rejilla, y una prueba de integración comprueba que cada paso coincide con
  `GET /api/stations?at=…`.
- Cada paso devuelve las estaciones conocidas, las que tienen dato, las que se pueden sumar (en
  servicio y con recuentos) y las sumas de esas. Si no se puede sumar ninguna, las sumas son
  `null`: cerrada no es vacía y sin dato no es cero.
- Pasos de 5, 10, 15, 30 o 60 minutos, alineados en UTC. Como máximo 7 días por petición.
- Caché en memoria (200 entradas) cuya clave incluye la última ingesta terminada de la fuente:
  una ingesta nueva la invalida sin más mecanismo.

## Consecuencias

- Medido el 5-10-2026 con una semana real (1 080 173 observaciones, 540 estaciones): un día a
  5 min, 0,48 s la primera vez; la semana a 15 min, 1,7 s; repetidas, 5–9 ms desde la caché.
- No hay tabla derivada que mantener ni que pueda quedar desfasada de las observaciones.
- Con ingestas cada pocos minutos (tiempo real), cada una invalidaría toda la caché de la
  fuente, también la de días que ya no cambian. Si llega a pasar, o si hacen falta periodos de
  más de 7 días, se precalculará por ingesta.
