# Despliegue

Barcelona Pulse se publica en **https://pulse.jaumeperez.com**, en el VPS que ya gestiona Forge
(Hetzner, el de Cuadra y jaumeperez.com), con las cuatro semanas del 4 al 31 de mayo de 2026.
En marcha desde el 6 de octubre de 2026.

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
- El contrato de la API es una página estática más (`/contrato.html`) que lee el documento
  OpenAPI de `/api/openapi/v1.json`, por el mismo `location /api/`: nginx no cambia.

## Una sola vez

Cada paso en Forge o en Cloudflare se hace mirando la pantalla real (los paneles cambian).

1. **DNS en Cloudflare**: registro `A` `pulse` → la IP del servidor, solo DNS (nube gris), como
   `jaumeperez.com`.
2. **Docker en el servidor**, como root (receta de Forge o SSH con sudo), desde el repositorio
   oficial de Docker para Ubuntu (pasos de docs.docker.com comprobados el 6-10-2026; admite
   Ubuntu 22.04, 24.04 y 26.04), y el usuario `forge` en el grupo `docker`:

   ```bash
   set -eu
   export DEBIAN_FRONTEND=noninteractive
   . /etc/os-release
   echo "Sistema: $PRETTY_NAME"
   case "${UBUNTU_CODENAME:-$VERSION_CODENAME}" in
     jammy|noble|resolute) ;;
     *) echo "Docker no admite esta versión de Ubuntu: no se instala nada." >&2; exit 1 ;;
   esac
   apt-get update
   apt-get install -y ca-certificates curl
   install -m 0755 -d /etc/apt/keyrings
   curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
   chmod a+r /etc/apt/keyrings/docker.asc
   cat > /etc/apt/sources.list.d/docker.sources <<EOF
   Types: deb
   URIs: https://download.docker.com/linux/ubuntu
   Suites: ${UBUNTU_CODENAME:-$VERSION_CODENAME}
   Components: stable
   Architectures: $(dpkg --print-architecture)
   Signed-By: /etc/apt/keyrings/docker.asc
   EOF
   apt-get update
   apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
   usermod -aG docker forge
   docker --version
   docker compose version
   systemctl is-active docker
   ```

   Ocupa unos 100 MB de memoria (el servicio de Docker). Los puertos que publica Docker se saltan
   ufw; por eso aquí solo se publica `127.0.0.1:5080`. Se quita con
   `apt-get purge docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin`.
3. **Sitio en Forge** `pulse.jaumeperez.com`: estático, repositorio `JAUME-25/barcelona-pulse`
   (público), rama `main`, directorio web `/apps/web/dist`, sin despliegue automático al
   principio. En **Domains**, editar el dominio y en **Redirects** marcar **No redirect**: la
   opción «Recommended» añade `www.pulse.jaumeperez.com`, que no tiene DNS, y el certificado
   falla.
4. **`.env` de producción** en la raíz del sitio, con una clave que no sale del servidor (no se
   escribe en ningún registro):

   ```bash
   umask 077; printf 'POSTGRES_DB=barcelona_pulse\nPOSTGRES_USER=pulse\nPOSTGRES_PASSWORD=%s\nAPI_PORT=5080\n' "$(openssl rand -hex 24)" > .env
   ```

5. **Script de despliegue** del sitio: el `git pull` de Forge y después `bash infra/deploy.sh`
   (compila la web, levanta la base de datos y la API, aplica las migraciones y falla si la API
   no responde en `/health/ready`). Desde el 8-10-2026 la línea temporal se lee de un resumen
   por paso (`timeline_summaries`, ADR 0015) que mantienen la ingesta y la purga; la primera vez,
   `migrate` lo calcula entero (un segundo por día importado, aproximadamente) antes de que
   arranque la API, y la rejilla de huecos de «Qué muestra y qué no» sale en milisegundos.
6. **Primer despliegue**: «Deploy now».
7. **Certificado** de Let's Encrypt desde Forge.
8. **nginx del sitio**, con el certificado ya puesto: en el bloque `server` de HTTPS, quitar el
   `location /` y las tres `add_header` que pone Forge (las cabeceras van en `pulse.conf`) y
   añadir `include /home/forge/pulse.jaumeperez.com/infra/nginx/pulse.conf;`. Lo demás (SSL,
   registros) lo deja Forge, que comprueba la configuración y recarga nginx al guardar.
9. **Los datos.** Las áreas de estudio van dentro de la API:

   ```bash
   docker compose -f infra/compose.prod.yml --env-file .env run --rm api ingest study-areas
   ```

   Los .7z de mayo, no: el portal de Open Data BCN contesta 403 a las descargas desde el
   servidor (6-10-2026; desde una conexión doméstica, 200). No se sortea: se descargan en un PC,
   se suben y se importan desde disco con el mismo código. Cada ingesta guarda el nombre y el
   sha256 del archivo, como si se hubiera descargado allí.

   En el PC, con una clave SSH que entre en el servidor (sha256 de los de mayo: `ed9b684b9c7d…`
   el de estado, `360e1495f357…` el de información):

   ```bash
   curl -fLO https://opendata-ajuntament.barcelona.cat/resources/bcn/BicingBCN/2026_05_Maig_BicingNou_ESTACIONS.7z
   curl -fLO https://opendata-ajuntament.barcelona.cat/resources/bcn/BicingBCN/2026_05_Maig_BicingNou_INFORMACIO.7z
   ssh forge@pulse.jaumeperez.com "mkdir -p ~/bicing-mayo"
   scp 2026_05_Maig_BicingNou_*.7z forge@pulse.jaumeperez.com:bicing-mayo/
   ```

   En el servidor, comprobar que han llegado enteros y lanzar la importación en segundo plano
   (unos 20 s por día; el avance, en `days` de `/api/sources` o en el registro):

   ```bash
   cd ~/bicing-mayo && printf '%s  %s\n' ed9b684b9c7dedf603bf9440eff211cc5b8568a878f8f7498630f1e16bd0114f 2026_05_Maig_BicingNou_ESTACIONS.7z 360e1495f357729fb7c642f528621d212bb64e2e41bb06be7e06ceba44810e19 2026_05_Maig_BicingNou_INFORMACIO.7z | sha256sum -c -
   cd ~/pulse.jaumeperez.com && (nohup docker compose -f infra/compose.prod.yml --env-file .env run --rm -v ~/bicing-mayo:/data:ro api ingest bicing-archive --from 2026-05-04 --to 2026-05-31 --status-file /data/2026_05_Maig_BicingNou_ESTACIONS.7z --info-file /data/2026_05_Maig_BicingNou_INFORMACIO.7z > ~/pulse-ingesta-mayo.log 2>&1 &)
   tail -5 ~/pulse-ingesta-mayo.log
   ```

10. **Comprobar** desde fuera: la portada, `https://pulse.jaumeperez.com/health/ready`
    («Healthy») y la web en los tres modos sin errores en la consola, en escritorio, 375 y
    320 px:
    `E2E_BASE_URL=https://pulse.jaumeperez.com npx playwright test --config e2e/tools.config.ts --grep despliegue`
    (desde `apps/web`).
11. **Monitor externo** (UptimeRobot, como jaumeperez.com): la portada y `/health/ready`. Hecho
    el 6-10-2026: dos monitores «HTTP / website monitoring», cada 5 min, con aviso por correo.
    `/health/ready` da 503 si la API no llega a PostGIS y nginx da 502 si la API no responde;
    los dos cuentan como caída.

## Cada despliegue

«Deploy now» en Forge (o activar el despliegue al hacer push, cuando todo esté estable). La CI
no despliega: un push con la CI en rojo no debería publicarse.

Si el despliegue cambia `infra/nginx/pulse.conf` (el 7-10-2026, `geolocation=(self)` para
«Cerca de mí»), hay que recargar nginx: Forge solo lo recarga al guardar desde su panel, no al
desplegar. En Forge, el botón de reiniciar nginx del servidor (el nombre exacto, en pantalla) o,
por SSH, `sudo service nginx reload`. Comprobación desde fuera:

```bash
curl -sI https://pulse.jaumeperez.com/ | grep -i permissions-policy
```

tiene que decir `geolocation=(self)`; hasta entonces, «Cerca de mí» falla siempre.

## Datos

- Otro periodo: `ingest bicing-archive --from … --to …` como arriba (hasta 31 días por vez y,
  mientras el portal conteste 403 al servidor, con los archivos del mes subidos aparte).
- Al importar o quitar días, la ingesta y la purga dejan al día el resumen de la línea
  temporal (ADR 0015); no hace falta nada más. Si cambia la regla, `summarize bicing-bcn` lo
  recalcula entero (un segundo por día, aproximadamente).
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
