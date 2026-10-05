# 0007. Mapa base de OpenFreeMap con degradación útil

Fecha: 2026-10-05. Estado: aceptada.

## Contexto

Se necesita un mapa base vectorial compatible con MapLibre, con alturas de edificios para el 3D,
sin coste ni claves en el navegador.

## Decisión

- OpenFreeMap, estilo `dark` transformado al cargarlo para el diseño Fanals (calles y nombres
  legibles, nombres locales). Sin clave ni registro, uso comercial permitido, atribución
  automática desde la TileJSON.
- Edificios 3D con `render_height`/`render_min_height` desde z14; en los estilos que no traen
  extrusión, la añade la aplicación.
- Si el estilo no carga o no hay WebGL2, la web lo dice y la lista de estaciones sigue
  funcionando. Si fallan algunas teselas, aviso discreto.
- Nada de precargar ni empaquetar teselas de terceros.

## Consecuencias

- Sin SLA: puede cerrar sin aviso. Plan B: autoalojar OpenFreeMap (MIT) o un proveedor de pago
  tras documentar cuotas y costes.
- Las pruebas automáticas no dependen de las teselas: la prueba de humo las bloquea.
