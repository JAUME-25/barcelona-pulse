# 0010. Fotogramas para reproducir

Fecha: 2026-10-06. Estado: aceptada.

## Contexto

Al reproducir un día, la web pedía `GET /api/stations?at=…` en cada paso de 5 minutos. La API
admite 120 peticiones por minuto e IP, y a velocidad alta se pasaba: la API respondía 429 a los
20 s y el mapa se quedaba congelado. El arreglo provisional fue un ritmo fijo de 0,7 s por paso
y saltos de 15 o 30 minutos para ir más deprisa, a costa de saltarse pasos.

## Decisión

- `GET /api/sources/{id}/frames?from&step` devuelve 12 pasos seguidos (con el paso de 5 min, una
  hora): los atributos de las estaciones una vez y, en cada paso, el estado de cada estación con
  versión vigente.
- Cada estado sale de `StationStateRules`, la misma regla que `GET /api/stations`. Por estación
  se leen la última observación anterior a la ventana (decide «sin dato reciente» aunque sea de
  hace días) y las de dentro, dos búsquedas por el índice `(station_id, observed_at)`. Una prueba
  de integración comprueba que cada paso coincide con `/api/stations?at=…`.
- Formato: el `StationState` de siempre, sin un segundo formato que mantener. Medido con una hora
  real: 2 MB sin comprimir y 110 KB con Brotli. Un formato por columnas bajaría a ~58 KB, a cambio
  de traducir el estado en el cliente; se descarta por ahora.
- Sin caché en el servidor: una hora se calcula en 47–110 ms. La web guarda en memoria las
  últimas 8 horas, pide la siguiente por adelantado y, mientras se arrastra por la pista, solo la
  hora en la que se para.

## Consecuencias

- Una petición por hora del día en vez de doce. Un día entero a la velocidad más alta, ahora con
  todos los pasos de 5 min: 43,7 s, 23 peticiones, ningún 429 (compilación de producción, GPU).
- Un día entero son unos 2,6 MB comprimidos. Si pesa en móvil, el formato por columnas o una
  caché comprimida en el servidor son los siguientes pasos.
- Las tareas largas del navegador (pintar el mapa) ocupan un 13 % del tiempo en esa medición;
  medirlo en móvil queda para B5.
