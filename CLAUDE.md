# Vigilancia — Camera System

Next.js 15.5.3 (Pages Router), React 19, Tailwind CSS 4. Security camera dashboard for WiFi IP cameras.

## Camera Hardware

**Model**: Geotek dual-lens WiFi cameras (firmware V5.04.R02.000A07F3 / iCSee app)
**Credentials**: `admin` / `admin123` (factory default for all Geotek units)
**RTSP URL format**: `rtsp://admin:admin123@<ip>:554/live`
**Network**: 192.168.68.x subnet

Current cameras:
- `cam103` → 192.168.68.103
- `cam106` → 192.168.68.106

## Architecture

- **Live view**: FFmpeg MJPEG decode → multipart HTTP stream (`/api/cameras/[id]/mjpeg`)
- **Recording**: FFmpeg direct RTSP copy (`-c:v copy`) to MP4 — zero CPU, original quality
- **Two independent FFmpeg processes per camera**: one for viewer, one for recorder
- **Database**: Prisma 7 + SQLite (`prisma/dev.db`) via `@prisma/adapter-better-sqlite3`
- **Auth**: NextAuth v4 con CredentialsProvider + JWT sessions (`src/lib/auth.js`)
- **Single-user mode**: NextAuth es solo el gate de login — todos los datos viven bajo `LOCAL_USER_ID='local'`
- **Internet access**: Cloudflare Tunnel → `https://cam.jcsolutions.dev`

## Key Files

- `src/lib/stream-manager.js` — manages viewer streams and recorders
- `src/lib/camera-utils.js` — CameraManager (Prisma CRUD + in-memory Map), PTZController, buildRtspUrl()
- `src/lib/db.js` — Prisma singleton con better-sqlite3 adapter + ensureLocalUser()
- `src/lib/auth.js` — authOptions de NextAuth (exportado para reuso en API routes)
- `src/lib/session.js` — requireUserId() helper (single-user mode)
- `src/lib/crypto.js` — AES-256-GCM encrypt/decrypt para credenciales RTSP en DB
- `src/lib/event-store.js` — insertEvent / getEvents / purgeOldEvents via Prisma
- `src/lib/retention.js` — disk cleanup by age (MAX_RECORDING_AGE_HOURS) and size (MAX_RECORDINGS_GB)
- `src/pages/api/cameras/scan.js` — TCP port scan to discover cameras on LAN
- `src/components/CameraStream.js` — live view card with recording and PTZ controls
- `src/components/CameraSetup.js` — camera registration form + scan results (stays mounted across tab switches)
- `src/components/FilesViewer.js` — recordings/screenshots browser with disk space panel
- `scripts/migrate-json-to-db.js` — migración one-time de cameras.json + events.json → SQLite

## Environment Variables (.env.local)

```
APP_PASSWORD=                    # Contraseña para login — OBLIGATORIO en producción (vacío = sin auth)
MAX_RECORDING_AGE_HOURS=72
MAX_RECORDINGS_GB=10
RECORDING_SEGMENT_MINUTES=30

DATABASE_URL=file:./prisma/dev.db

NEXTAUTH_URL=https://cam.jcsolutions.dev   # URL pública — cambiar si se mueve el dominio
NEXTAUTH_SECRET=                           # openssl rand -base64 32
ENCRYPTION_KEY=                            # openssl rand -hex 32 (para credenciales RTSP en DB)
```

## Detección de movimiento — Python + OpenCV

La detección de movimiento usa un script Python (`scripts/motion_detector.py`) con sustracción de fondo MOG2. Es mucho más sensible que el enfoque anterior (FFmpeg scene change): detecta personas, mascotas y cualquier movimiento pequeño.

**Instalar dependencias Python (una vez):**
```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

**Verificar instalación:**
```bash
.venv/bin/python3 -c "import cv2; print(cv2.__version__)"
```

**Probar manualmente:**
```bash
python3 scripts/motion_detector.py rtsp://admin:admin123@192.168.68.103:554/live
# Mover la mano frente a la cámara → imprime "motion" por cada frame con movimiento
```

**Sensibilidad (`motionSensitivity`)**: área mínima de contorno en píxeles sobre un frame de 320×240. Default: 500 px (objeto de ~20×25 px). Más alto = menos sensible. Configurable por cámara.

**Limpiar procesos huérfanos** (ffmpeg y motion_detector de una corrida anterior):
```bash
chmod +x scripts/cleanup-orphans.sh   # solo la primera vez
bash scripts/cleanup-orphans.sh
```

## Deployment con pm2

Arrancar en producción (instalación nueva o servidor nuevo):
```bash
npm install
npx prisma db push          # ← OBLIGATORIO: crea/actualiza el schema en la DB
npm run build
pm2 start ecosystem.config.cjs
pm2 save
```

Actualizar en servidor existente (después de un `git pull`):
```bash
npx prisma db push          # solo si hubo cambios en prisma/schema.prisma
npm run build
pm2 restart vigilancia
```

Registrar arranque automático al encender el servidor (solo una vez):
```bash
pm2 startup          # copia y ejecuta el comando que imprime
pm2 save
```

Comandos útiles:
```bash
pm2 list             # ver estado
pm2 logs vigilancia  # ver logs en vivo
pm2 restart vigilancia
pm2 stop vigilancia
```

## Cloudflare Tunnel (acceso desde internet)

URL pública: `https://cam.jcsolutions.dev`
El túnel expone `localhost:3000` como HTTPS público sin abrir puertos del router.
Las cámaras IP **nunca** son accesibles desde internet — solo el tráfico HTTP de Next.js pasa por el túnel.

**Setup inicial (ya realizado — no repetir):**
```bash
bash scripts/setup-tunnel.sh          # instala cloudflared, crea el túnel, genera config.yml
cloudflared tunnel route dns vigilancia cam.jcsolutions.dev   # crea el CNAME en Cloudflare DNS
```

**Config del túnel**: `~/.cloudflared/config.yml`
```yaml
tunnel: 2764b939-5f48-4ab1-a9f6-e76d1d2168ee
credentials-file: ~/.cloudflared/2764b939-5f48-4ab1-a9f6-e76d1d2168ee.json
ingress:
  - hostname: cam.jcsolutions.dev
    service: http://localhost:3000
  - service: http_status:404
```

El túnel arranca automáticamente con pm2 (proceso `tunnel` en `ecosystem.config.cjs`).

**Diagnóstico:**
```bash
pm2 logs tunnel --lines 30    # ver estado de conexiones
dig cam.jcsolutions.dev +short @1.1.1.1   # verificar DNS desde Cloudflare
curl --resolve cam.jcsolutions.dev:443:104.21.52.128 https://cam.jcsolutions.dev   # test sin DNS local
```

## Auth — Single-user mode

- `APP_PASSWORD` vacío → sin auth, acceso libre (modo dev local)
- `APP_PASSWORD` seteado → NextAuth gate: requiere login en `/auth/login`
- Registro en `/auth/register` (primera vez, crear cuenta)
- `requireUserId()` siempre retorna `LOCAL_USER_ID='local'` — todos los datos bajo un solo usuario
- El motion-detector accede al MJPEG via Basic Auth con `APP_PASSWORD` (bypass de sesión)
- `/api/auth/*` está excluido del middleware para permitir login/register sin sesión

## Important Behaviors

- The **setup tab stays mounted** (CSS hidden) so scan results survive tab switches
- The **cameras tab unmounts** on switch to stop MJPEG FFmpeg processes
- `buildRtspUrl()` omits credentials from URL when both username and password are empty
- Recorder restarts automatically after each segment when `continuousRecord: true`
- `forceStopAll(cameraId)` kills both viewer and recorder unconditionally (used on delete)
- Retention cleanup runs on server start and every hour

## PTZ — Motor físico confirmado, credenciales DVRIP desconocidas

Las cámaras Geotek **SÍ tienen motor PTZ físico** (320° horizontal / 90° vertical).
La app iCSee controla el PTZ via WiFi local. Una cámara rota (cam103 o cam106), la otra es fija.

**Protocolos investigados:**
- **DVRIP port 34567**: abierto, responde — pero `Ret=205` para TODOS los usuarios y contraseñas
  probadas (admin/admin123, admin/admin, vacías, MAC, SN, RandomUser del broadcast).
  La contraseña fue cambiada por iCSee durante el setup inicial. Usuario "admin" existe
  pero la contraseña es desconocida.
- **RTSP SET_PARAMETER** (port 554): devuelve `200 OK` incluso con sesión completa (SETUP+PLAY),
  pero la cámara NO se mueve (PSNR ~42 dB = imagen idéntica antes/después).
  La cámara H264DVR 1.0 acepta SET_PARAMETER pero lo ignora.
- **HTTP port 80**: `/cgi-bin/ptz.cgi` y `/cgi-bin/config.cgi` existen pero retornan
  "Not support this POST method" para todos los formatos intentados.
- **SSL port 8443**: cerrado. No hay ONVIF disponible.

**Para desbloquear PTZ** necesitás capturar el tráfico DVRIP de la app iCSee:
```bash
sudo tcpdump -i en0 -n -X 'port 34567'
# Luego mover la cámara desde iCSee → ver el login DVRIP con la contraseña real
```

**Datos de la cámara cam103** (del broadcast UDP):
- MAC: `e8:f4:94:ef:7e:cd`, SN: `09b9c5a04daa9d553jp2`
- Broadcast UDP cada 1s a 255.255.255.255:34569 con NetWork.NetCommon info
- Firmware: V5.04.R02.000A07F3.10010.346732.0000000

**Implementación actual:**
- `src/lib/dvrip-client.js` — cliente DVRIP correcto, falla por credenciales (keepear como referencia)
- `src/lib/rtsp-ptz-client.js` — cliente RTSP, devuelve 200 pero no mueve la cámara
- `src/pages/api/cameras/[id]/ptz.js` — usa RTSPPTZClient actualmente

## Network Scan

- Probes ports 554, 8554 (RTSP) and 80, 8080 (HTTP) per host
- Timeout: 800ms per connection
- Batch size: 30 hosts in parallel
- Only IPs with RTSP port open get the quick-connect "Agregar" button
