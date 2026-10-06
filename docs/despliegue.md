# Despliegue

Barcelona Pulse se publica en **https://pulse.jaumeperez.com**, en el VPS que ya gestiona Forge
(Hetzner, el de Cuadra y jaumeperez.com), con las cuatro semanas del 4 al 31 de mayo de 2026.

## Por qué ese servidor

Decidido el 6 de octubre de 2026. Un VPS aparte habría aislado el proyecto, pero el plan
equivalente al CX23 (5,99 €/mes con IPv4, sin IVA) no estaba disponible y el primero disponible
con memoria suficiente, el CPX12 (2 GB), costaba 14,51 €/mes con IVA. El CPX02 (1 GB, 7,85 €)
no da margen: la pila usa unos 0,9 GB con el sistema.

El VPS de Forge, ese día: 3 079 MB de memoria disponibles de 3 819, 1 GB de swap sin usar,
28 GB libres de 38, 2 vCPU con una carga de 0,08. Barcelona Pulse necesita:

| | En marcha | Importando un mes |
| --- | --- | --- |
| API | ~200 MB | ~450 MB más (el proceso de importación) |
| PostGIS | ~335 MB | ~660 MB, parte caché de disco |
| Disco | ~0,9 GB los datos de mayo, ~1,5 GB las imágenes | |

Los contenedores tienen límites (`infra/compose.prod.yml`): 768 MB y 1,5 CPU cada uno, para no
quitar sitio a Cuadra.

## Cómo queda

```
navegador ─HTTPS─▶ nginx de Forge ─┬─ /          web estática (apps/web/dist)
                                   └─ /api/  ─▶ 127.0.0.1:5080 ─▶ API (Docker) ─▶ PostGIS (Docker)
```

- La API y PostGIS solo escuchan dentro del servidor: la API publica `127.0.0.1:5080` y PostGIS
  no publica ningún puerto. El cortafuegos (ufw) no cambia.
- nginx pone las cabeceras de seguridad y la IP del cliente en `X-Forwarded-For`; la API solo
  la cree si llega desde la red de Docker del proyecto (`172.30.30.0/24`), para el límite de
  120 peticiones por minuto e IP.
- La web se compila en un contenedor `node:24-slim`: el servidor no necesita Node 24.

## Una sola vez

Cada paso en Forge o en Cloudflare se hace mirando la pantalla real (los paneles cambian).

1. **DNS en Cloudflare**: registro `A` `pulse` → la IP del servidor, solo DNS (nube gris), como
   `jaumeperez.com`.
2. **Docker en el servidor**, como root (receta de Forge o SSH con sudo), desde el repositorio
   oficial de Docker para Ubuntu, y el usuario `forge` en el grupo `docker`:

   ```bash
   apt-get update && apt-get install -y ca-certificates curl
   install -m 0755 -d /etc/apt/keyrings
   curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
   chmod a+r /etc/apt/keyrings/docker.asc
   echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
   apt-get update && apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
   usermod -aG docker forge
   ```

   Ocupa unos 100 MB de memoria (el servicio de Docker). Se quita con
   `apt-get purge docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin`.
3. **Sitio en Forge** `pulse.jaumeperez.com`: estático, repositorio `JAUME-25/barcelona-pulse`
   (público), rama `main`, directorio web `/apps/web/dist`, sin despliegue automático al
   principio.
4. **`.env` de producción** en la raíz del sitio, con una clave que no sale del servidor (no se
   escribe en ningún registro):

   ```bash
   umask 077; printf 'POSTGRES_DB=barcelona_pulse\nPOSTGRES_USER=pulse\nPOSTGRES_PASSWORD=%s\nAPI_PORT=5080\n' "$(openssl rand -hex 24)" > .env
   ```

5. **nginx del sitio**: dentro del bloque `server` de HTTPS, en lugar del `location /` que pone
   Forge, `include /home/forge/pulse.jaumeperez.com/infra/nginx/pulse.conf;`. Lo demás (SSL,
   registros) lo deja Forge. Comprobar con `sudo nginx -t` y recargar.
6. **Script de despliegue** del sitio: el `git pull` de Forge y después `bash infra/deploy.sh`
   (compila la web, levanta la base de datos y la API, aplica las migraciones y falla si la API
   no responde en `/health/ready`).
7. **Primer despliegue** y los datos (descargan ~31 MB del portal de Open Data BCN; mayo tarda
   unos minutos, en segundo plano y con registro):

   ```bash
   docker compose -f infra/compose.prod.yml --env-file .env run --rm api ingest study-areas
   nohup docker compose -f infra/compose.prod.yml --env-file .env run --rm api ingest bicing-archive --from 2026-05-04 --to 2026-05-31 > ingesta-mayo.log 2>&1 &
   tail -3 ingesta-mayo.log
   ```

8. **Certificado** de Let's Encrypt desde Forge.
9. **Comprobar** desde fuera: la portada, `https://pulse.jaumeperez.com/health/ready`
   («Healthy») y la web en los tres modos sin errores en la consola, en escritorio y móvil:
   `E2E_BASE_URL=https://pulse.jaumeperez.com npx playwright test --config e2e/tools.config.ts --grep despliegue`
   (desde `apps/web`).
10. **Monitor externo** (UptimeRobot, como jaumeperez.com): la portada y `/health/ready`.

## Cada despliegue

«Deploy now» en Forge (o activar el despliegue al hacer push, cuando todo esté estable). La CI
no despliega: un push con la CI en rojo no debería publicarse.

## Datos

- Otro periodo: `ingest bicing-archive --from … --to …` como arriba (hasta 31 días por vez).
- Quitar días: `purge bicing-bcn --from … --to …` dice qué borraría; con `--yes`, lo borra
  (ADR 0012).
- Copias: no hacen falta para la demo; todo sale de los archivos públicos y se puede volver a
  importar.

## Quitarlo todo

```bash
docker compose -f infra/compose.prod.yml --env-file .env down -v
```

Después, borrar el sitio en Forge, el registro DNS y, si nada más lo usa, Docker.

## Ensayado en local

El 6 de octubre de 2026, con `infra/compose.prod.yml` (proyecto `bp-prodtest`, puerto 5090), un
día de mayo, la web compilada como en `deploy.sh` y nginx 1.28 con `infra/nginx/pulse.conf`:
cabeceras de seguridad en todas las rutas, `/api` y `/health/ready` a través de nginx, rutas de
la aplicación que vuelven a `index.html`, archivos con caché de un año y gzip, y los tres modos
con el mapa y sin errores en la consola en escritorio y móvil (`e2e/despliegue.capture.ts`).
En local hay que usar otro nombre de proyecto (`-p`) y otro puerto: `compose.prod.yml` se llama
igual que el entorno de desarrollo. Y no ejecutar `deploy.sh` en Windows: el `npm ci` del
contenedor dejaría en `node_modules` binarios de Linux.
