# 0006. Contrato HTTP con OpenAPI generado y tipos del cliente derivados

Fecha: 2026-10-05. Estado: aceptada.

## Contexto

La web y la API deben compartir tipos sin copiarlos a mano, con un mecanismo simple que la CI
pueda comprobar.

## Decisión

- La API usa `Microsoft.AspNetCore.OpenApi` (OpenAPI 3.1) y genera el documento al compilar
  (`Microsoft.Extensions.ApiDescription.Server`) en `apps/api/openapi/barcelona-pulse-api.json`,
  que se versiona.
- `openapi-typescript` genera `apps/web/src/api/schema.d.ts` y `openapi-fetch` lo usa en el
  cliente.
- JSON con enums en `snake_case`, números estrictos y nulabilidad y obligatoriedad respetadas, para
  que los tipos generados sean exactos (`number | null`, no `number | string`).
- La CI compila la API y regenera los tipos; si cualquiera de los dos archivos cambia, falla.

## Consecuencias

- Cambiar un DTO obliga a regenerar y revisar el diff del contrato: el cambio queda a la vista.
- TypeScript se queda en 5.9 hasta que openapi-typescript y typescript-eslint admitan TS 7.
