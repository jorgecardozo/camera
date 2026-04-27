---
title: "feat: Deploy Vigilancia on Raspberry Pi"
type: feat
status: active
date: 2026-04-27
---

# feat: Deploy Vigilancia on Raspberry Pi

## Overview

Migrar el servidor de Vigilancia de la Mac actual a una Raspberry Pi autónoma. El objetivo es tener un dispositivo dedicado, de bajo consumo y bajo costo que corra el servidor Next.js, la detección de movimiento (Python/YOLO) y el túnel Cloudflare — sin depender de que la Mac esté encendida. El acceso externo sigue siendo por `https://cam.jcsolutions.dev`.

---

## Problem Frame

El servidor corre en una Mac con SSD que no está dedicada exclusivamente a vigilancia. Si la Mac se apaga o se mueve, el sistema deja de funcionar. Una Raspberry Pi resuelve esto: es un dispositivo siempre encendido, silencioso, de ~5W de consumo, que puede vivir en un cajón conectado al router.

---

## Requirements Trace

- R1. El servidor Next.js, pm2, y el túnel Cloudflare deben correr en la RPi y ser accesibles vía `https://cam.jcsolutions.dev`
- R2. La detección de movimiento con YOLO11n debe funcionar en ARM64 con rendimiento aceptable (<500 ms/inferencia)
- R3. Las grabaciones y capturas deben persistir en un SSD externo, no en la SD card de la RPi
- R4. El sistema debe arrancar automáticamente al encender la RPi, sin intervención manual
- R5. Las dependencias nativas (`better-sqlite3`, FFmpeg) deben compilarse/instalarse correctamente en ARM64

---

## Scope Boundaries

- No se containeriza el sistema (sin Docker) — pm2 directo, igual que en Mac
- No se cambia el código de la aplicación — solo ajustes de configuración y entorno
- No se migra a otro hosting cloud — la RPi es el servidor
- Arduino: descartado — es un microcontrolador sin OS, incapaz de correr Node.js

### Deferred to Follow-Up Work

- IP fija en el router para la RPi (DHCP reservation): se hace en la app Deco, independiente de esta instalación
- IP fija para las cámaras: mismo paso, hacerlo junto con el punto anterior

---

## Context & Research

### Relevant Code and Patterns

- `ecosystem.config.cjs` — configuración de pm2 (sin cambios, salvo `FFMPEG_PATH`)
- `src/lib/stream-manager.js` — usa `FFMPEG_PATH` env var o `ffmpeg-static` como fallback
- `requirements.txt` — ya usa `opencv-python-headless` (correcto para RPi sin display)
- `CLAUDE.md` — sección Deployment con pm2 (mantener actualizada)
- `prisma/schema.prisma` — SQLite, sin cambios

### Key Findings from Research

- **`ffmpeg-static` npm** puede no tener binario ARM64 funcional — usar FFmpeg del sistema (`apt install ffmpeg`) con `FFMPEG_PATH=/usr/bin/ffmpeg`
- **`better-sqlite3`** es binding C++ nativo — **debe compilarse en la RPi misma**, no en la Mac
- **torch en ARM64** — solo instalar versión CPU (`torch` desde PyPI soporta ARM64 via wheel estándar desde torch 2.0+)
- **opencv-python-headless** ya está en requirements.txt — correcto, no tiene dependencias de display
- **Prisma** gestiona su propio query engine y descarga el binario ARM64 automáticamente en `prisma generate`
- **Recordings/screenshots** usan paths relativos al proyecto — montar SSD y apuntar via symlinks o env vars
- **Consumo estimado (peor caso, 3 cámaras):** ~1 GB RAM, ~60–80% CPU → RPi 5 (8 GB) recomendada; RPi 4 (8 GB) funciona pero con margen justo

---

## Key Technical Decisions

- **Hardware: Raspberry Pi 5 (8 GB)** — RPi 4 (8 GB) es la alternativa mínima; RPi 4 (4 GB) es insuficiente para 2+ cámaras con YOLO simultáneo. Arduino: descartado.
- **OS: Raspberry Pi OS Lite 64-bit (Bookworm)** — sin desktop, footprint mínimo, ARM64 nativo para todos los paquetes
- **FFmpeg: sistema en lugar de ffmpeg-static** — `apt install ffmpeg` en la RPi; configurar `FFMPEG_PATH=/usr/bin/ffmpeg` en `.env.local`
- **Storage: SSD USB 3.0 externo** — la SD card no soporta la carga de escritura continua de grabaciones; el SSD se monta en `/mnt/ssd` y se crea un symlink `public/recordings → /mnt/ssd/recordings`
- **Compilación nativa en la RPi** — `npm install` debe correr en la RPi, no copiar `node_modules` de la Mac (arquitecturas diferentes)
- **Python torch CPU-only** — no instalar la variante CUDA; la RPi no tiene GPU NVIDIA. PyPI ya sirve wheels ARM64 para torch ≥ 2.0

---

## Open Questions

### Resolved During Planning

- **¿Docker?** Descartado — añade complejidad sin beneficio real para un único servicio en hardware propio
- **¿ffmpeg-static ARM64?** Probablemente no funciona en RPi; usar FFmpeg del sistema es más confiable y simple
- **¿RPi 4 vs 5?** RPi 5 recomendada por margen de CPU/RAM; RPi 4 8GB es alternativa viable

### Deferred to Implementation

- Tiempo real de compilación de `better-sqlite3` en RPi (estimado 10–15 min en RPi 4, ~5 min en RPi 5)
- Si `ffmpeg-static` funciona en RPi 5 ARM64, se puede omitir el `FFMPEG_PATH`; validar en el momento
- Velocidad de inferencia YOLO11n en RPi 5 real (estimado 200–400 ms/inferencia en RPi 4)

---

## High-Level Technical Design

> *Esto ilustra el enfoque propuesto y es guía direccional para revisión, no especificación de implementación.*

```
Raspberry Pi 5 (8GB)
├── microSD (boot)
│   ├── OS: RPi OS Lite 64-bit
│   ├── Node.js + pm2
│   ├── Python venv (.venv/)
│   └── Código app (/home/pi/camera/)
│       ├── prisma/dev.db           ← SQLite DB (pequeña, SD está bien)
│       ├── public/recordings/  ──┐
│       └── public/screenshots/ ──┤── symlinks → /mnt/ssd/
│                                 │
└── SSD USB 3.0 (1–2 TB)          │
    └── /mnt/ssd/                 │
        ├── recordings/  ←────────┘
        └── screenshots/ ←────────┘

pm2 processes:
  vigilancia  →  next start (port 3000)
  tunnel      →  cloudflared tunnel run vigilancia

Internet access: cam.jcsolutions.dev → Cloudflare → cloudflared → localhost:3000
```

---

## Implementation Units

- [ ] U1. **Hardware y OS**

**Goal:** RPi lista con OS, actualizaciones y dependencias del sistema instaladas

**Requirements:** R1, R5

**Dependencies:** Ninguna (punto de partida)

**Files:**
- No hay archivos del repo involucrados en este paso
- Actualizar: `CLAUDE.md` (sección Hardware al final)

**Approach:**
- Instalar Raspberry Pi OS Lite 64-bit (Bookworm) en microSD con Raspberry Pi Imager
- Habilitar SSH en el Imager antes de flashear (sin necesidad de monitor)
- Conectar RPi por cable ethernet al router (más estable que WiFi para un servidor)
- Actualizar el sistema: `apt update && apt upgrade`
- Instalar dependencias del sistema: `curl`, `git`, `build-essential`, `python3-dev`, `python3-venv`, `ffmpeg`
- Instalar Node.js via `nvm` o NodeSource (versión LTS, actualmente v22)
- Instalar pm2 globalmente: `npm install -g pm2`
- Instalar cloudflared ARM64: descargar `.deb` del release oficial de Cloudflare

**Test scenarios:**
- Happy path: `node --version` retorna v22.x, `ffmpeg -version` retorna build ARM64, `python3 --version` retorna 3.11+
- Happy path: SSH desde Mac funciona sin contraseña (clave pública copiada)
- Edge case: Si `apt install ffmpeg` falla por mirrors lentos, usar `--fix-missing` o mirror alternativo

**Verification:**
- `node --version`, `ffmpeg -version`, `python3 --version`, `pm2 --version` retornan versiones esperadas en la RPi

---

- [ ] U2. **Storage — SSD externo**

**Goal:** SSD montado en `/mnt/ssd` con estructura de directorios, auto-mount al boot, symlinks en el proyecto

**Requirements:** R3

**Dependencies:** U1

**Files:**
- No hay archivos del repo involucrados (configuración del OS)

**Approach:**
- Formatear SSD como ext4 (mejor rendimiento en Linux que exFAT/NTFS)
- Agregar entrada en `/etc/fstab` con UUID del SSD para auto-mount al boot
- Crear `/mnt/ssd/recordings/` y `/mnt/ssd/screenshots/` en el SSD
- Crear symlinks en el proyecto: `public/recordings → /mnt/ssd/recordings`, `public/screenshots → /mnt/ssd/screenshots`
- Verificar permisos correctos (usuario que corre Node.js tiene write access)

**Test scenarios:**
- Happy path: Reboot RPi → SSD montado automáticamente en `/mnt/ssd`
- Happy path: Escribir un archivo en `public/recordings/test.mp4` → aparece en `/mnt/ssd/recordings/`
- Error path: SSD no conectado al boot → verificar que la app arranca igual (directorio vacío)

**Verification:**
- `df -h` muestra SSD montado; `ls -la public/recordings` muestra symlink apuntando a SSD

---

- [ ] U3. **Deploy del código**

**Goal:** Código clonado, dependencias instaladas compilando nativamente en ARM64, schema de DB sincronizado

**Requirements:** R1, R5

**Dependencies:** U1, U2

**Files:**
- Compilación nativa: `node_modules/better-sqlite3/` (compilado en RPi)
- Modificar: `ecosystem.config.cjs` si se necesita ajustar `max_memory_restart` para RPi

**Approach:**
- `git clone` del repositorio en `/home/pi/camera/`
- `npm install` — esto compila `better-sqlite3` con los build tools instalados en U1 (tarda ~10 min en RPi 4, ~5 min en RPi 5)
- Si `ffmpeg-static` falla al importar (binario incompatible), no hay acción: el fallback `FFMPEG_PATH` en `.env.local` lo resuelve
- `npx prisma db push` para sincronizar schema
- `npm run build` para compilar Next.js

**Test scenarios:**
- Happy path: `npm install` completa sin errores; `node -e "require('better-sqlite3')"` no lanza
- Error path: `npm install` falla en `better-sqlite3` → verificar que `build-essential` y `python3-dev` están instalados (U1)
- Happy path: `npx prisma db push` crea `prisma/dev.db` con el schema correcto
- Happy path: `npm run build` completa sin errores de TypeScript o webpack

**Verification:**
- `npm run build` completa; `prisma/dev.db` existe y tiene las tablas correctas (`sqlite3 prisma/dev.db ".tables"`)

---

- [ ] U4. **Entorno Python (YOLO + OpenCV)**

**Goal:** Virtualenv Python con torch CPU-only, OpenCV headless y ultralytics instalados; detector funcional en ARM64

**Requirements:** R2

**Dependencies:** U1, U3

**Files:**
- Sin cambios en el repo; usa `requirements.txt` existente

**Approach:**
- Crear venv: `python3 -m venv .venv`
- Instalar dependencias: `.venv/bin/pip install -r requirements.txt`
- `torch` en PyPI sirve wheels ARM64 automáticamente desde v2.0 — no se necesita nada especial
- `opencv-python-headless` ya está en requirements.txt — correcto para entorno sin display
- Modelo `yolo11n.pt` (5.4 MB) ya está en el repo; `ultralytics` lo carga desde el path del proyecto
- Validar rendimiento: correr el detector manualmente con una URL RTSP y medir tiempo de inferencia

**Test scenarios:**
- Happy path: `.venv/bin/python3 -c "import cv2; import torch; from ultralytics import YOLO; print('ok')"` no lanza
- Happy path: `.venv/bin/python3 scripts/motion_detector.py <rtsp_url> 0.12` detecta frames y emite JSON
- Performance: inferencia YOLO < 500 ms por frame en RPi 5 (400–800 ms en RPi 4 es aceptable)
- Edge case: si `torch` instala la variante CUDA (raro en ARM64), verificar que corre en CPU sin error

**Verification:**
- `import torch; torch.zeros(1)` corre sin error y sin requerir CUDA; inferencia YOLO con `yolo11n.pt` produce output JSON válido

---

- [ ] U5. **Configuración de entorno (.env.local)**

**Goal:** `.env.local` creado en la RPi con todos los valores de producción correctos para ARM64

**Requirements:** R1, R2, R3, R4

**Dependencies:** U3

**Files:**
- Crear: `.env.local` (no commiteado — generarlo a partir de `.env.local.example`)

**Approach:**
- Copiar `.env.local.example` como `.env.local`
- Setear `FFMPEG_PATH=/usr/bin/ffmpeg` — evita que `stream-manager.js` use el binario de `ffmpeg-static` que puede ser incompatible con ARM64
- Setear `NEXTAUTH_URL=https://cam.jcsolutions.dev`
- Generar nuevo `NEXTAUTH_SECRET` con `openssl rand -base64 32`
- Reusar el mismo `ENCRYPTION_KEY` de la Mac (permite importar la DB existente con credenciales cifradas)
- `APP_PASSWORD` — mismo password de producción
- `MAX_RECORDINGS_GB` — ajustar al tamaño del SSD (ej: 500 para SSD de 1 TB)
- `DATABASE_URL=file:./prisma/dev.db` — sin cambios

**Test scenarios:**
- Happy path: `node -e "require('dotenv').config({path:'.env.local'}); console.log(process.env.FFMPEG_PATH)"` imprime `/usr/bin/ffmpeg`
- Edge case: Si `ENCRYPTION_KEY` cambia respecto a la Mac, las credenciales RTSP cifradas en la DB no se pueden leer — usar exactamente la misma clave

**Verification:**
- `.env.local` tiene todos los campos de `.env.local.example` completados; `FFMPEG_PATH` apunta a `/usr/bin/ffmpeg`

---

- [ ] U6. **pm2 + Cloudflare Tunnel + autostart**

**Goal:** Sistema arranca automáticamente al encender la RPi; acceso vía `cam.jcsolutions.dev` funcional

**Requirements:** R1, R4

**Dependencies:** U3, U5

**Files:**
- Sin cambios en el repo
- `ecosystem.config.cjs` — verificar que no hardcodea paths absolutos de Mac

**Approach:**
- Autenticar cloudflared con el token existente del túnel (`2764b939-5f48-4ab1-a9f6-e76d1d2168ee`)
- Copiar `~/.cloudflared/config.yml` y el archivo de credenciales del túnel desde la Mac a la RPi
- `pm2 start ecosystem.config.cjs`
- `pm2 startup` → copiar y ejecutar el comando que genera (registra pm2 en systemd)
- `pm2 save` para persistir la lista de procesos
- Verificar que `cam.jcsolutions.dev` resuelve correctamente desde internet

**Test scenarios:**
- Happy path: Reboot RPi → `pm2 list` muestra `vigilancia` y `tunnel` en estado `online` sin intervención
- Happy path: `curl https://cam.jcsolutions.dev/api/cameras` retorna JSON con cámaras (con header `Authorization`)
- Error path: Si cloudflared no encuentra las credenciales del túnel, re-autenticar con `cloudflared tunnel login`
- Integration: WebSocket (`wss://cam.jcsolutions.dev/api/cameras/cam106/ws`) conecta y recibe frames

**Verification:**
- Reboot de la RPi → sistema completamente operativo en <60 segundos, accesible desde internet sin intervención manual

---

- [ ] U7. **Migrar DB y validar sistema completo**

**Goal:** DB de producción (con cámaras y credenciales cifradas) migrada a la RPi; sistema funcional end-to-end

**Requirements:** R1, R2, R3, R4, R5

**Dependencies:** U1–U6

**Files:**
- `prisma/dev.db` — copiar desde Mac a RPi (o iniciar vacía y re-registrar cámaras desde la UI)

**Approach:**
- **Opción A (recomendada):** Copiar `prisma/dev.db` de la Mac a la RPi via `scp`. Funciona si `ENCRYPTION_KEY` es la misma en ambos. Las cámaras y credenciales quedan disponibles de inmediato.
- **Opción B:** Iniciar con DB vacía, re-registrar las 3 cámaras desde la UI con el scanner
- Apagar el servidor en la Mac (o al menos detener pm2) antes de activar la RPi para evitar conflictos de Cloudflare Tunnel (solo puede haber un proceso `tunnel run vigilancia` activo)
- Verificar que las 3 cámaras conectan, la detección de movimiento funciona y las grabaciones se guardan en el SSD

**Test scenarios:**
- Happy path: Las 3 cámaras (cam103/105, cam106, cam107) aparecen EN VIVO
- Happy path: Activar "Mov." en una cámara → boxes aparecen en el video
- Happy path: Iniciar grabación manual → archivo `.mp4` creado en `/mnt/ssd/recordings/`
- Happy path: Reboot → grabación manual retoma automáticamente (`manualRecording=true` en DB)
- Integration: Notificación Telegram llega al detectar una persona

**Verification:**
- Las 3 cámaras EN VIVO, detección de movimiento activa, grabación en SSD, acceso desde celular vía `cam.jcsolutions.dev`

---

## System-Wide Impact

- **Ningún cambio de código** — la migración es puramente de infraestructura y configuración
- **Cloudflare Tunnel:** Solo puede correr una instancia del túnel `vigilancia` al mismo tiempo — apagar la Mac antes de activar la RPi
- **`ENCRYPTION_KEY`:** Debe ser idéntica en ambas máquinas para que las credenciales RTSP cifradas en la DB sean legibles
- **Symlinks de storage:** Si el SSD no está conectado al boot, los symlinks apuntan a nada — la app arranca pero las grabaciones fallan silenciosamente. Verificar mount en systemd antes del start de pm2

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| `better-sqlite3` falla al compilar | Asegurarse de que `build-essential` y `python3-dev` están instalados antes de `npm install` |
| `ffmpeg-static` incompatible en ARM64 | Setear `FFMPEG_PATH=/usr/bin/ffmpeg` en `.env.local`; sistema FFmpeg via `apt` |
| RPi 4 8GB insuficiente para 3 cámaras + YOLO | Usar RPi 5; o reducir cámaras con `motionDetect` activo simultáneamente |
| SD card falla por escritura continua | Poner **solo** `prisma/dev.db` en SD; recordings/screenshots en SSD via symlinks |
| Thermal throttling en RPi 4 | Instalar heatsink + fan activo; monitorear temperatura con `vcgencmd measure_temp` |
| Pérdida del ENCRYPTION_KEY al migrar | Copiar `.env.local` completo de la Mac antes de apagar; no regenerar claves |
| Cloudflare Tunnel duplicado | Apagar pm2 en la Mac antes de hacer `pm2 start` en la RPi |

---

## Documentation / Operational Notes

- Actualizar `CLAUDE.md` con la nueva sección "Hardware de servidor" describiendo la RPi y el SSD
- Agregar al `CLAUDE.md` el comando `vcgencmd measure_temp` para monitorear temperatura en RPi
- Agregar a `CLAUDE.md` que en RPi hay que setear `FFMPEG_PATH=/usr/bin/ffmpeg` en `.env.local`
- El script `scripts/cleanup-orphans.sh` sigue siendo válido en RPi — mismos procesos (ffmpeg, python3)

---

## Sources & References

- Related code: `ecosystem.config.cjs`, `src/lib/stream-manager.js` (FFMPEG_PATH), `requirements.txt`
- External: Raspberry Pi OS Lite — https://www.raspberrypi.com/software/operating-systems/
- External: cloudflared ARM64 releases — https://github.com/cloudflare/cloudflared/releases
- External: NodeSource ARM64 — https://github.com/nodesource/distributions
- CLAUDE.md — sección "Deployment con pm2" (pasos base que aplican igual en RPi)
