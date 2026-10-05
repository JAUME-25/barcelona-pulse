# 0002. Entorno reproducible con Docker Compose y SDK de .NET en contenedor

Fecha: 2026-10-05. Estado: aceptada.

## Contexto

El equipo de desarrollo no tenía el SDK de .NET instalado (solo runtimes 6 y 8). Se pide un
entorno reproducible desde un checkout limpio, sin imágenes `latest`.

## Decisión

- `docker-compose.yml` con `db` (PostGIS fijado por digest), `migrate` (aplica migraciones y
  termina), `api` y `sdk` (perfil `tools`, imagen `sdk:10.0.401-noble`) para compilar, probar y
  generar migraciones sin instalar nada más que Docker.
- `UseArtifactsOutput`: lo compilado va a `artifacts/` en local y a un volumen en el contenedor;
  no se pisan.
- Puertos publicados solo en `127.0.0.1`. Secretos en `.env` (no versionado).
- La web se ejecuta con Node en el equipo (Vite necesita recarga rápida) y reenvía `/api`.
- El SDK local sigue siendo recomendable para el IDE; `global.json` fija 10.0.401 con parches.

## Consecuencias

- Requisitos mínimos: Docker y Node 24.
- El primer `dotnet` en el contenedor descarga paquetes a un volumen de caché; después es rápido.
- La imagen de PostGIS solo existe para `linux/amd64`: en Mac con Apple Silicon corre emulada.
