# 0001. Monolito modular con una SPA y una base de datos

Fecha: 2026-10-05. Estado: aceptada.

## Contexto

Proyecto de una persona, para portfolio, que debe poder desplegarse barato: frontend estático y
backend en un contenedor. Las funcionalidades (estaciones, ingesta, histórico, escenarios)
comparten datos y transacciones.

## Decisión

- Un único proyecto ASP.NET Core (`apps/api`) agrupado por funcionalidad (`Features/…`), con la
  API HTTP y los comandos de operación (`migrate`, `ingest`) en el mismo binario.
- Una SPA React (`apps/web`) que solo habla con nuestra API.
- Una base de datos PostgreSQL con PostGIS.
- Sin repositorios genéricos ni interfaces de un solo uso: EF Core es la capa de acceso a datos.
  Se separa lógica (reglas puras, p. ej. `StationStateRules`, `IngestionRules`) de adaptadores de
  proveedor y de persistencia (`StationIngestor`) donde hay una responsabilidad real.

## Consecuencias

- Un despliegue de backend y una sola base que mantener.
- La ingesta comparte código y modelo con la API, sin exponerse por HTTP.
- Si un módulo necesitara escalar aparte, las carpetas por funcionalidad facilitan extraerlo;
  no se hará sin una medición que lo justifique.
