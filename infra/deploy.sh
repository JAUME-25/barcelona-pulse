#!/usr/bin/env bash
# Despliegue en el servidor, desde la raíz del repositorio y después de `git pull` (en Forge, el
# script de despliegue del sitio hace el pull y luego `bash infra/deploy.sh`). Necesita Docker y
# el .env de producción (docs/despliegue.md).
set -euo pipefail
cd "$(dirname "$0")/.."

# La web, con el mismo Node que la CI y sin instalarlo en el servidor. Se compila aparte y se
# cambia de golpe: nginx no sirve nunca una carpeta a medias.
docker run --rm --user "$(id -u):$(id -g)" -e HOME=/tmp -e npm_config_cache=/tmp/npm-cache \
  -v "$PWD:/src" -w /src/apps/web node:24-slim \
  sh -c "npm ci --no-audit --no-fund && npm run build -- --outDir dist-next --emptyOutDir"
rm -rf apps/web/dist-previous
if [ -d apps/web/dist ]; then mv apps/web/dist apps/web/dist-previous; fi
mv apps/web/dist-next apps/web/dist
rm -rf apps/web/dist-previous

# Base de datos, migraciones y API: reconstruye la imagen si cambió el código y reinicia lo que
# haga falta.
docker compose -f infra/compose.prod.yml --env-file .env up -d --build --remove-orphans

# La API tiene que responder con la base de datos lista; si no, el despliegue falla. Los primeros
# intentos pueden llegar mientras arranca: sin mensajes hasta el veredicto.
for attempt in $(seq 1 30); do
  if curl -fs http://127.0.0.1:5080/health/ready > /dev/null 2>&1; then
    echo "API lista."
    break
  fi
  if [ "$attempt" -eq 30 ]; then
    echo "La API no responde en /health/ready." >&2
    docker compose -f infra/compose.prod.yml --env-file .env logs --tail 50 api >&2
    exit 1
  fi
  sleep 2
done

# La rejilla de huecos de «Qué muestra y qué no» tarda unos 12 s en calcularse: se deja hecha
# para que no la espere la primera visita. Desde la red del proyecto (`name:` de
# compose.prod.yml + `_default`). Si falla, el despliegue sigue bien: se calcula al abrir la ficha.
docker run --rm --network barcelona-pulse_default -v "$PWD/infra:/infra:ro" node:24-slim \
  node /infra/warm-up.mjs http://api:8080 \
  || echo "No se ha podido dejar calculada la rejilla de huecos; se calculará al abrir la ficha." >&2

# Imágenes y capas de compilación que ya no se usan.
docker image prune -f > /dev/null
