---
title: "feat: Vigilancia — Conversión a SaaS Multi-Tenant con Agente Local"
type: feat
status: active
date: 2026-04-25
---

# feat: Vigilancia — Conversión a SaaS Multi-Tenant con Agente Local

## Overview

Convertir la aplicación monolítica de vigilancia local en un producto SaaS multi-tenant
accesible desde cualquier lugar. Cada usuario se registra en la URL pública deployada,
instala un **agente local** en su red doméstica, y visualiza/controla sus cámaras desde
el celular o cualquier navegador sin tocar `localhost`.

El trabajo se divide en cuatro fases entregables independientemente:

1. **Fase 1 — Telegram + celular (quick wins):** Notificaciones de movimiento por Telegram
   y UI responsiva para móvil. No requiere cambios de arquitectura.
2. **Fase 2 — Auth + base de datos:** Reemplazar HTTP Basic Auth por cuentas de usuario,
   reemplazar flat files por SQLite/Prisma, aislar datos por usuario.
3. **Fase 3 — Cloud deployment:** VPS público con URL propia, SSL, múltiples usuarios.
4. **Fase 4 — Agente local:** Separar FFmpeg/streaming del servidor cloud; cada usuario
   instala un proceso liviano en su red que conecta hacia afuera (sin port-forwarding).

---

## Problem Frame

El sistema actual corre en la misma máquina que las cámaras (red local). Tres limitaciones
lo hacen inviable para otros usuarios:

1. **Auth global**: un solo `APP_PASSWORD` para toda la app — imposible aislar usuarios.
2. **Config plana**: `cameras.json` y `events.json` no tienen concepto de propietario.
3. **FFmpeg local**: el servidor necesita alcanzar las cámaras vía RTSP — imposible desde
   un VPS en la nube si las cámaras están en la red doméstica del usuario.

El tercer punto es el desafío técnico central: la solución es un **agente local** que corre
en la red del usuario, conecta hacia afuera al servidor cloud (sin abrir puertos), y actúa
como proxy de streams y eventos.

---

## Requirements Trace

- R1. Un usuario puede registrarse con email/password y ver solo sus propias cámaras.
- R2. Las notificaciones de Telegram llegan cuando el detector de movimiento detecta actividad.
- R3. La UI es usable desde el celular (responsive, controles táctiles).
- R4. El sistema corre en una URL pública con SSL, no en localhost.
- R5. Cada usuario instala un agente local en su red que se conecta al cloud sin
  configuración de port-forwarding.
- R6. El agente proxy-ea los streams MJPEG al cloud para que el browser los visualice.
- R7. Los eventos de movimiento se almacenan en base de datos con aislamiento por usuario.
- R8. Las credenciales RTSP (IP, usuario, contraseña de cámara) no viajan en texto plano.

---

## Scope Boundaries

- No incluye billing/planes de pago en esta iteración.
- No incluye grabaciones en cloud storage (S3/Backblaze) — los recordings siguen siendo
  locales en la máquina del agente.
- No incluye PTZ desde el cloud (el PTZ ya tiene problemas de credenciales DVRIP sin
  resolver — ver CLAUDE.md).
- No incluye app móvil nativa — la UI web responsiva es suficiente para el caso de uso.
- No incluye autenticación social (Google, GitHub) — email/password es suficiente para v1.

### Deferred to Follow-Up Work

- Cloud storage para recordings: iteración futura cuando haya más usuarios.
- Multi-factor authentication: puede agregarse después de NextAuth.js estable.
- Dashboard de administración global: para cuando haya más de 5 usuarios.
- WebRTC peer-to-peer para streams de ultra-baja latencia: el proxy MJPEG es suficiente
  para monitoreo de seguridad.

---

## Context & Research

### Relevant Code and Patterns

- `src/middleware.ts` — 28 líneas de HTTP Basic Auth global; reemplazar completamente.
- `src/lib/stream-manager.js` — gestión de FFmpeg por `cameraId`; en multi-tenant necesita
  `userId:cameraId` como clave de namespace, o cada agente tiene su propia instancia.
- `src/lib/camera-utils.js` — `CameraManager` carga `cameras.json` en un Map en memoria;
  reemplazar por queries Prisma filtradas por `userId`.
- `src/lib/notification-manager.js` — ya implementa envío Telegram con bot token + chat ID;
  solo falta ser llamado desde el flujo de detección de movimiento.
- `src/lib/motion-detector.js` — spawns `scripts/motion_detector.py`, parsea JSON lines
  del stdout; necesita llamar a `notification-manager.js` cuando hay detección.
- `src/lib/event-store.js` — `events.json` in-memory; reemplazar por tabla Prisma `Event`.
- `scripts/motion_detector.py` — emite JSON con `motion`, `boxes`, `frame_b64`; agnostico
  de auth, puede reutilizarse sin cambios en el agente.

### Institutional Learnings

- Ninguna en `docs/solutions/` (primer plan de esta categoría).

### External References

- NextAuth.js v5 (Auth.js): `https://authjs.dev/` — mejor soporte Next.js 15 App/Pages.
- Prisma ORM: `https://www.prisma.io/docs/` — SQLite para dev, PostgreSQL para prod.
- `ws` package para WebSocket servidor: `https://github.com/websockets/ws`
- Caddy como reverse proxy con SSL automático: `https://caddyserver.com/docs/`
- Hetzner CX22 (2 vCPU / 4GB RAM / 40GB SSD, ~4€/mes): mínimo viable para el cloud.

---

## Key Technical Decisions

- **NextAuth.js v5 sobre JWT manual**: manejo de sesiones, CSRF, rotación de tokens ya
  resueltos. Soporta Pages Router con adaptador Prisma.
- **SQLite en dev + PostgreSQL en prod via Prisma**: misma codebase, cambio de `provider`
  en `schema.prisma`. SQLite evita operar un servidor de DB en desarrollo.
- **Un agente Node.js por usuario**: aísla completamente recursos (FFmpeg, eventos, archivos).
  Más simple que namespace compartido. El agente reusa `stream-manager.js` y
  `motion-detector.js` con mínimos cambios.
- **WebSocket Secure (WSS) agent → cloud**: el agente inicia la conexión hacia afuera
  (sin port-forwarding). El cloud acepta en `/api/agent/ws`. Protocolo JSON con tipos de
  mensaje (`REGISTER`, `FRAME`, `EVENT`, `COMMAND`).
- **MJPEG proxy via WebSocket**: el agente envía frames JPEG como binary WebSocket messages.
  El cloud los recibe y los escribe en la response SSE/multipart del browser. Añade
  ~10-30ms de latencia, aceptable para seguridad.
- **Credenciales RTSP cifradas**: almacenadas con AES-256-GCM en la DB usando
  `ENCRYPTION_KEY` env var. El agente las recibe cifradas y las desencripta localmente.
- **Caddy como reverse proxy**: SSL automático via Let's Encrypt, sin configurar nginx/certbot
  manualmente. Proxy a `localhost:3000`.
- **Fase 1 independiente de Fases 2-4**: Telegram y UI mobile no requieren multi-tenancy
  y pueden deployarse/testearse en el setup actual.

---

## Open Questions

### Resolved During Planning

- **¿WebRTC o WebSocket para streaming?** WebSocket — más simple, no requiere STUN/TURN,
  suficiente para monitoreo de seguridad (no gaming en tiempo real).
- **¿Un agente por usuario o namespace compartido?** Un proceso por usuario — aislamiento
  completo, crash de un agente no afecta otros, más fácil de debuggear.
- **¿SQLite o PostgreSQL desde el inicio?** SQLite para dev/staging, PostgreSQL para prod.
  Prisma abstrae la diferencia.
- **¿Dónde viven las recordings en el SaaS?** En la máquina del agente local, accesibles
  solo desde la red del usuario. Cloud storage queda para iteración futura.

### Deferred to Implementation

- **Protocolo exacto de WebSocket**: los tipos de mensaje se definen al implementar U9.
- **Reconnect strategy del agente**: backoff exponencial, detalles al implementar U10.
- **Cómo el browser accede a recordings**: si están en el agente, hay que servirlas via
  el proxy cloud o descargarlas directamente (cuando el usuario está en su red local).
- **Límite de frames por segundo en el proxy**: a determinar por pruebas de carga en U11.

---

## High-Level Technical Design

> *Ilustra el enfoque previsto como guía de dirección para revisión, no como especificación
> de implementación.*

```
                    INTERNET
                       │
              ┌────────▼────────┐
              │   VPS Cloud     │
              │  Next.js :3000  │
              │  (Caddy :443)   │
              │                 │
              │  ┌───────────┐  │
              │  │ Auth      │  │  ← R1: NextAuth.js
              │  │ (NextAuth)│  │
              │  └───────────┘  │
              │  ┌───────────┐  │
              │  │ DB        │  │  ← R7: Prisma + PostgreSQL
              │  │ (Prisma)  │  │     users, cameras, events
              │  └───────────┘  │
              │  ┌───────────┐  │
              │  │ WS Server │  │  ← R5/R6: acepta agentes
              │  │ /api/agent│  │     proxy frames → browser
              │  └───────────┘  │
              └────────▲────────┘
                       │ WSS outbound
          ─────────────┼─────────────
              RED LOCAL DEL USUARIO
                       │
              ┌────────▼────────┐
              │  Local Agent    │
              │  (Node.js)      │
              │                 │
              │  stream-manager │  ← reusa código existente
              │  motion-detect  │
              │  notification   │  ← R2: Telegram directo
              └────────▲────────┘
                       │ RTSP
              ┌────────▼────────┐
              │  Cámaras IP     │
              │  192.168.68.x   │
              └─────────────────┘
```

**Flujo de un frame MJPEG:**
```
Cámara → FFmpeg (local) → stream-manager → WebSocket frame →
→ Cloud WS server → buffer → API route /mjpeg → browser
```

**Flujo de un evento de movimiento:**
```
motion_detector.py stdout → motion-detector.js →
  a) Telegram API (directo, R2)
  b) POST /api/events cloud (R7) → Prisma save
```

---

## Phased Delivery

### Fase 1 — Telegram + Mobile (sin cambios de arquitectura)

Entregable inmediato. El sistema sigue siendo local, pero Nicolás / Jorge pueden recibir
alertas en el celular y usar la UI desde el teléfono.

### Fase 2 — Auth + Base de Datos

Convierte la app en multi-usuario sin cambiar el deployment. Cada persona puede correr
su propia instancia con cuentas separadas. Prerequisito para Fase 3.

### Fase 3 — Cloud Deployment

La app corre en un VPS con URL pública. Múltiples usuarios pueden registrarse. Las cámaras
siguen necesitando estar en la misma red que la instancia Next.js — o usar la opción
Cloudflare Tunnel por usuario como workaround temporal antes de Fase 4.

### Fase 4 — Agente Local

Separa el server cloud del procesamiento local. Cualquier usuario desde cualquier red
puede usar el servicio instalando el agente. Entrega el SaaS completo.

---

## Implementation Units

### Fase 1

- [ ] U1. **Notificaciones Telegram vía detección de movimiento**

**Goal:** Cuando `motion-detector.js` recibe una detección con objetos del detector Python,
llama a `notification-manager.js` para enviar el frame anotado a Telegram si el usuario
lo tiene configurado en la cámara.

**Requirements:** R2

**Dependencies:** None (todo existe en código actual)

**Files:**
- Modify: `src/lib/motion-detector.js`
- Modify: `src/lib/notification-manager.js`
- Test: `src/lib/__tests__/notification-manager.test.js`

**Approach:**
- En `motion-detector.js`, cuando se parsea un JSON line del detector Python con `motion: true`
  y `boxes` no vacío, obtener la cámara del `CameraManager` para leer `telegramEnabled`,
  `telegramBotToken`, `telegramChatId`, `notifyObjects`.
- Si Telegram está habilitado y el label detectado está en `notifyObjects` (o `notifyObjects`
  es null → notificar todo), llamar `notificationManager.sendMotionAlert(camera, frame_b64)`.
- `notification-manager.js`: agregar método `sendMotionAlert(camera, frameBase64)` que
  envía el frame como foto con caption al bot de Telegram usando la Bot API
  (`sendPhoto` con buffer desde base64).
- Throttle: no enviar más de 1 notificación por cámara cada 30 segundos para evitar spam.

**Patterns to follow:**
- `src/lib/notification-manager.js` — ya tiene la estructura de llamada a Telegram API.
- `src/lib/motion-detector.js` — ver cómo parsea el stdout y accede a la cámara.

**Test scenarios:**
- Happy path: detección de "Persona" con `telegramEnabled=true` → `sendPhoto` llamado con
  el buffer JPEG correcto y el chat ID de la cámara.
- Edge case: `notifyObjects: ["Auto"]` y se detecta "Persona" → no envía notificación.
- Edge case: `notifyObjects: null` → notifica cualquier objeto detectado.
- Edge case: segunda detección dentro de los 30s → no envía segunda notificación (throttle).
- Error path: Telegram API retorna error (bot token inválido) → loguea el error, no crashea
  el motion detector.

**Verification:**
- Con cámara configurada y movimiento frente a ella, llega una foto al chat de Telegram
  en menos de 5 segundos.
- Logs no muestran errores de notificación en condiciones normales.

---

- [ ] U2. **UI responsiva para móvil**

**Goal:** La UI de cámaras, grabación y archivos es usable desde un celular — sin scroll
horizontal, controles con área de toque adecuada, video ajustado al ancho de pantalla.

**Requirements:** R3

**Dependencies:** None

**Files:**
- Modify: `src/components/CameraStream.js`
- Modify: `src/components/FilesViewer.js`
- Modify: `src/pages/index.js`
- Test: ninguno (UI visual — verificación manual en Chrome DevTools mobile)

**Approach:**
- `CameraStream.js`: el `<img>` del MJPEG stream debe ser `w-full` con `max-h-screen`;
  los botones de grabación y PTZ deben tener `min-h-[44px] min-w-[44px]` (tamaño mínimo
  táctil Apple HIG).
- Grid de cámaras: en mobile (`< sm`) mostrar 1 columna; en tablet 2; en desktop 2-4.
- `FilesViewer.js`: la grilla de thumbnails debe colapsar a 2 columnas en mobile.
- Tabs de navegación: en mobile mostrar como bottom navigation bar o tabs scrolleables.
- No introducir librerías nuevas — solo Tailwind CSS 4 que ya está configurado.

**Test scenarios:**
- Test expectation: none — verificación manual con Chrome DevTools en viewport 390×844
  (iPhone 14). Checklist: sin scroll horizontal, botones tocables sin zoom, video ocupa
  ancho completo.

**Verification:**
- En Chrome DevTools → mobile (390px de ancho), todas las funciones core son usables
  sin scroll horizontal ni zoom manual.

---

### Fase 2

- [ ] U3. **Schema de base de datos con Prisma**

**Goal:** Definir el modelo de datos multi-tenant y reemplazar `cameras.json` y `events.json`
por tablas SQLite (dev) / PostgreSQL (prod) gestionadas por Prisma.

**Requirements:** R1, R7, R8

**Dependencies:** None

**Files:**
- Create: `prisma/schema.prisma`
- Create: `prisma/migrations/` (generadas por Prisma)
- Modify: `package.json` (agregar prisma, @prisma/client)
- Create: `src/lib/db.js` (instancia singleton de PrismaClient)
- Test: `src/lib/__tests__/db.test.js`

**Approach:**
- Modelos: `User`, `Camera`, `Event`, `AgentToken`.
- `Camera.credentialsEncrypted`: campo texto con IP, usuario y contraseña de la cámara
  cifrado con AES-256-GCM usando `ENCRYPTION_KEY` env var. Se cifra en
  `camera-utils.js` al guardar y se descifra al leer para usarlo en FFmpeg.
- `Camera.settingsJson`: JSON con `continuousRecord`, `motionDetect`, `motionSensitivity`,
  `telegramEnabled`, `notifyObjects` — mismos campos actuales de cameras.json.
- `Event`: migrar estructura de events.json (`cameraId`, `userId`, `timestamp`, `label`,
  `confidence`, `screenshotPath`).
- `AgentToken`: usado en Fase 4 para autenticar agentes locales.
- Script de migración de datos: leer cameras.json y events.json existentes e insertar en DB.

**Technical design:**
```
User          Camera              Event
────          ──────              ─────
id            id                  id
email         userId (FK)         userId (FK)
passwordHash  name                cameraId (FK)
name          credentialsEncrypted timestamp
createdAt     settingsJson        label
              isOnline (runtime)  confidence
              createdAt           screenshotPath
AgentToken
──────────
id
userId (FK)
tokenHash
lastSeen
```

**Test scenarios:**
- Happy path: crear usuario → crear cámara con `userId` → query de cámaras filtra por
  `userId` y retorna solo las de ese usuario.
- Edge case: dos usuarios con cámara de misma IP → coexisten sin conflicto (no hay unicidad
  por IP, solo por `id`).
- Integration: `credentialsEncrypted` se guarda cifrado en DB → al recuperar y descifrar
  con misma `ENCRYPTION_KEY` retorna IP/user/pass originales.
- Error path: `ENCRYPTION_KEY` ausente en env → `db.js` falla en startup con mensaje claro.

**Verification:**
- `npx prisma studio` muestra las 4 tablas con datos de prueba.
- Query de cámaras de un usuario no retorna cámaras de otro usuario.

---

- [ ] U4. **Auth con NextAuth.js v5**

**Goal:** Reemplazar el HTTP Basic Auth global por registro y login con email/password
usando NextAuth.js con adaptador Prisma. Sesiones JWT en cookie firmada.

**Requirements:** R1

**Dependencies:** U3

**Files:**
- Create: `src/pages/api/auth/[...nextauth].js`
- Create: `src/pages/auth/login.js`
- Create: `src/pages/auth/register.js`
- Modify: `src/middleware.ts` (reemplazar Basic Auth por validación de sesión NextAuth)
- Modify: `package.json` (next-auth)
- Test: `src/pages/api/auth/__tests__/register.test.js`

**Approach:**
- NextAuth.js v5 con `Credentials` provider: email + password. Hash con bcrypt (costo 12).
- Ruta `POST /api/auth/register` (fuera del handler `[...nextauth]`): crea usuario si email
  no existe, hashea password, retorna sesión.
- `src/middleware.ts`: en lugar de verificar el header `Authorization: Basic`, verificar
  el cookie de sesión NextAuth. Rutas públicas: `/auth/login`, `/auth/register`,
  `/_next/static`, `/_next/image`, `/favicon.ico`.
- Página login: formulario email/password, link a registro, mensaje de error claro.
- Página register: nombre, email, password, confirmar password.
- La sesión incluye `userId` en el JWT token para usarlo en API routes.

**Patterns to follow:**
- `src/middleware.ts` — la lógica de redirect al login reemplaza la de 401 Basic.

**Test scenarios:**
- Happy path: `POST /api/auth/register` con email nuevo → usuario creado, sesión iniciada,
  redirect a `/`.
- Happy path: login con credenciales correctas → sesión creada, cookie seteada.
- Error path: login con password incorrecto → mensaje "Email o contraseña incorrectos" sin
  revelar cuál es incorrecto.
- Error path: registro con email ya existente → mensaje "Ya existe una cuenta con ese email".
- Edge case: acceder a `/api/cameras` sin sesión → redirect a `/auth/login` (no 401).
- Edge case: acceder a `/api/cameras` con sesión válida → respuesta normal.

**Verification:**
- Flujo completo: registrar → logout → login → ver cámaras funciona en browser.
- Dos usuarios registrados no ven las cámaras del otro.

---

- [ ] U5. **API routes y CameraManager con scoping por usuario**

**Goal:** Todas las API routes leen `session.user.id` y filtran datos por ese `userId`.
Reemplazar `CameraManager` (cameras.json) y `EventStore` (events.json) por Prisma queries.

**Requirements:** R1, R7

**Dependencies:** U3, U4

**Files:**
- Modify: `src/lib/camera-utils.js` (reemplazar CameraManager con Prisma)
- Modify: `src/lib/event-store.js` (reemplazar con Prisma)
- Modify: `src/pages/api/cameras/index.js`
- Modify: `src/pages/api/cameras/[id]/index.js`
- Modify: `src/pages/api/cameras/[id]/recording.js`
- Modify: `src/pages/api/cameras/[id]/motion.js`
- Modify: `src/pages/api/events.js`
- Test: `src/pages/api/__tests__/cameras.test.js`

**Approach:**
- En cada API route, obtener `userId` de la sesión NextAuth con `getServerSession(req, res)`.
- `GET /api/cameras` → `prisma.camera.findMany({ where: { userId } })`.
- `PATCH/DELETE /api/cameras/[id]` → verificar que `camera.userId === userId` antes de
  operar (evitar IDOR — Insecure Direct Object Reference).
- `CameraManager._load()` queda obsoleto; los métodos delegan a Prisma con `userId`.
- `StreamManager` sigue usando `cameraId` como clave pero ahora el `cameraId` es el UUID
  de Prisma (único globalmente, no solo "cam103").
- `EventStore` reemplazado por `prisma.event.create` y `prisma.event.findMany({ where: { userId } })`.

**Test scenarios:**
- Happy path: usuario A crea cámara, usuario B autentica → `GET /api/cameras` no incluye
  la cámara de A.
- Error path: usuario B hace `DELETE /api/cameras/<id-de-A>` → 403 Forbidden.
- Error path: API route sin sesión válida → 401.
- Integration: crear cámara → stream-manager la recibe vía CameraManager → stream arranca.

**Verification:**
- Test de IDOR: usuario B no puede leer, modificar ni borrar cameras de usuario A aunque
  conozca el ID.
- Todos los tests de API pasan con usuarios mockeados.

---

### Fase 3

- [ ] U6. **VPS deployment con Caddy + SSL**

**Goal:** El sistema corre en un VPS con dominio propio, HTTPS automático, y múltiples
usuarios pueden registrarse y usar la app.

**Requirements:** R4

**Dependencies:** U4, U5

**Files:**
- Create: `Caddyfile`
- Create: `scripts/deploy.sh`
- Modify: `ecosystem.config.cjs` (agregar `env_production` con DATABASE_URL, ENCRYPTION_KEY, etc.)
- Modify: `.env.example` (agregar todas las vars nuevas)
- Create: `docs/deployment.md`

**Approach:**
- VPS: Hetzner CX22 (2 vCPU / 4GB RAM, ~4€/mes). Ubuntu 24.04.
- Caddy: reverse proxy `dominio.com → localhost:3000` con TLS automático (Let's Encrypt).
- Next.js: sigue con PM2 (`pm2 start ecosystem.config.cjs`).
- DB: PostgreSQL en el mismo VPS o Railway/Supabase free tier para simplificar ops.
- Env vars críticas en el servidor: `DATABASE_URL`, `NEXTAUTH_SECRET`, `ENCRYPTION_KEY`,
  `NEXTAUTH_URL` (URL pública), `APP_PASSWORD` puede eliminarse.
- `scripts/deploy.sh`: git pull, npm ci, npx prisma migrate deploy, npm run build, pm2 restart.
- `docs/deployment.md`: pasos para setup inicial del VPS, Caddy, PM2, vars de entorno.

**Test scenarios:**
- Test expectation: none — verificación operacional. Checklist: HTTPS funciona, registro
  de usuario nuevo funciona, dos sesiones paralelas de distintos usuarios funcionan,
  `pm2 logs vigilancia` no muestra errores.

**Verification:**
- `https://dominio.com` sirve la app con certificado válido.
- Registro + login + ver cámaras completo desde el celular via URL pública.

---

### Fase 4

- [ ] U7. **Agente local — scaffold y comunicación con cloud**

**Goal:** Proceso Node.js standalone que corre en la red local del usuario, se registra
con el cloud usando un token de agente, y mantiene una conexión WebSocket persistente
para recibir comandos y enviar eventos.

**Requirements:** R5, R7

**Dependencies:** U5, U6

**Files:**
- Create: `agent/index.js` (entry point del agente)
- Create: `agent/cloud-connection.js` (WebSocket client hacia cloud)
- Create: `agent/camera-manager.js` (versión agente de CameraManager, sin DB)
- Create: `src/pages/api/agent/register.js` (cloud: crear AgentToken)
- Create: `src/pages/api/agent/ws.js` (cloud: WebSocket server para agentes)
- Create: `agent/package.json`
- Test: `agent/__tests__/cloud-connection.test.js`

**Approach:**
- El agente arranca con un `AGENT_TOKEN` (generado en el cloud al registrarse por primera
  vez) y la `CLOUD_URL` en su `.env`.
- Al iniciar, conecta via WSS a `wss://dominio.com/api/agent/ws` con el token en el header.
- Protocolo de mensajes JSON:
  - `REGISTER`: agente → cloud, informa cámaras disponibles localmente.
  - `CAMERAS_CONFIG`: cloud → agente, devuelve config de cámaras del usuario con credenciales
    desencriptadas (la desencriptación ocurre en el cloud antes de enviar, en tránsito TLS).
  - `START_STREAM / STOP_STREAM`: cloud → agente, arrancar/detener FFmpeg MJPEG.
  - `START_RECORD / STOP_RECORD`: cloud → agente, control de grabación.
  - `EVENT`: agente → cloud, evento de movimiento detectado.
  - `HEARTBEAT`: agente → cloud, cada 30s para mantener conexión viva.
- El agente reusa `stream-manager.js` y `motion-detector.js` directamente (symlink o copy).
- Reconnect: backoff exponencial 1s → 2s → 4s → max 60s.

**Test scenarios:**
- Happy path: agente conecta → cloud recibe `REGISTER` → envía `CAMERAS_CONFIG` → agente
  arranca FFmpeg para cada cámara configurada.
- Error path: token de agente inválido → cloud cierra WebSocket con código 4001, agente
  loguea "Token inválido — regenerar desde el panel" y no reintenta.
- Edge case: conexión WebSocket se corta → agente reconecta con backoff, stream-manager
  mantiene FFmpeg local corriendo mientras no haya clientes browser (o los detiene — TBD).
- Integration: agente envía `EVENT` con movimiento → cloud persiste en DB → aparece en
  el panel del usuario.

**Verification:**
- Agente conecta al cloud local (dev) y el panel muestra el agente como "conectado".
- Si se mata el proceso del agente, el cloud marca el agente como "offline" tras 90s.

---

- [ ] U8. **Proxy de streams MJPEG a través del cloud**

**Goal:** El browser recibe el stream MJPEG de una cámara enrutado cloud → agente → FFmpeg →
cámara, sin exponer la red local del usuario.

**Requirements:** R6

**Dependencies:** U7

**Files:**
- Modify: `src/pages/api/cameras/[id]/mjpeg.js` (reemplazar FFmpeg local por proxy WS)
- Modify: `agent/cloud-connection.js` (enviar frames binarios al cloud)
- Create: `src/lib/stream-proxy.js` (buffer de frames por `agentId:cameraId`)
- Test: `src/lib/__tests__/stream-proxy.test.js`

**Approach:**
- Cuando el cloud recibe `GET /api/cameras/[id]/mjpeg`, verifica que el agente del usuario
  esté conectado; si no → 503 "Agente desconectado".
- Envía `START_STREAM` al agente via WebSocket.
- El agente arranca (o reutiliza) el FFmpeg MJPEG viewer y empieza a enviar frames como
  mensajes binarios WebSocket al cloud.
- `stream-proxy.js` en el cloud mantiene un Map `agentId:cameraId → lastFrame + Set<SSEWriter>`.
  Cuando llega un frame, lo escribe en todas las response streams activos.
- Cuando todos los browsers se desconectan del stream, el cloud envía `STOP_STREAM` al agente.
- El API route `/api/cameras/[id]/mjpeg` sigue siendo `multipart/x-mixed-replace` para el
  browser — el formato de respuesta no cambia, solo la fuente de los frames.

**Test scenarios:**
- Happy path: browser abre stream → cloud envía START_STREAM al agente → agente inicia FFmpeg
  → frames llegan al browser vía proxy.
- Edge case: dos browsers del mismo usuario abren la misma cámara → solo un FFmpeg en el
  agente, ambos browsers reciben los mismos frames.
- Edge case: agente se desconecta durante streaming → el cloud cierra el multipart response
  con un frame de error o simplemente termina el stream.
- Error path: agente offline → `GET /mjpeg` retorna 503 con mensaje legible.

**Verification:**
- Desde el celular vía URL pública, el stream de una cámara local se visualiza sin latencia
  perceptible mayor a 1-2 segundos.
- Dos usuarios simultáneos no ven el stream del otro usuario.

---

## System-Wide Impact

- **Interaction graph:** `stream-manager.js` en el agente reusa el código existente casi
  sin cambios. El cloud lo reemplaza con `stream-proxy.js`. `middleware.ts` pasa de
  verificar un password global a verificar sesión NextAuth — cambia el comportamiento para
  todas las rutas.
- **Error propagation:** errores de agente desconectado deben llegar al usuario como mensajes
  claros en el panel (no como 500). El proxy debe manejar el caso offline gracefully.
- **State lifecycle risks:** al migrar de cameras.json a Prisma, los IDs de cámaras
  cambian de strings cortos (`"cam103"`) a UUIDs. El StreamManager usa el ID como clave —
  asegurarse de que la migración de datos no duplique cámaras.
- **API surface parity:** los componentes React (`CameraStream.js`, `FilesViewer.js`) usan
  `/api/cameras/[id]/mjpeg` — ese endpoint mantiene el mismo contrato de respuesta
  `multipart/x-mixed-replace` en todas las fases.
- **Integration coverage:** el proxy WS → MJPEG requiere test de integración real porque
  el timing de frames y la correcta terminación del multipart response no puede probarse
  con mocks.
- **Unchanged invariants:** el formato de recordings (MP4 en `public/recordings/`), el
  protocolo RTSP con las cámaras, y el script `motion_detector.py` no cambian.

---

## Risk Analysis & Mitigation

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|------------|---------|-----------|
| Latencia del proxy MJPEG inaceptable (>3s) | Media | Alto | Medir en Fase 4 con red real; fallback: tunnel Cloudflare por usuario como opción alternativa documentada |
| VPS con 4GB RAM saturado por múltiples FFmpeg | Media | Medio | FFmpeg corre en agente local, no en cloud; el cloud solo maneja frames ya codificados (JPEG) |
| NextAuth.js v5 breaking changes durante desarrollo | Baja | Medio | Fijar versión exacta en package.json; testear migración antes de deploy |
| Credenciales RTSP expuestas si DB comprometida | Media | Alto | AES-256-GCM con ENCRYPTION_KEY externa a la DB; rotar key es posible sin downtime |
| Usuario instala agente en Windows (path separators, etc.) | Alta | Bajo | Usar `path.join` consistentemente; documentar instalación en Windows en README del agente |
| Agente local no puede conectar al cloud (firewall corporativo) | Baja | Alto | WSS usa puerto 443 — casi nunca bloqueado; documentado como prerequisito |

---

## Phased Delivery Summary

| Fase | Unidades | Valor entregado | Prerequisito |
|------|----------|-----------------|--------------|
| 1 — Quick wins | U1, U2 | Telegram + móvil hoy | Ninguno |
| 2 — Multi-user | U3, U4, U5 | Cuentas separadas, datos aislados | Fase 1 o en paralelo |
| 3 — Cloud deploy | U6 | URL pública, SSL, acceso desde cualquier lugar | Fase 2 |
| 4 — Agente local | U7, U8 | SaaS real: cualquier usuario con sus cámaras | Fase 3 |

---

## Documentation / Operational Notes

- `docs/deployment.md` (U6): guía paso a paso para setup del VPS desde cero.
- `agent/README.md` (U7): instrucciones de instalación del agente para usuarios finales
  (Windows y Linux/macOS), incluyendo cómo obtener el `AGENT_TOKEN` del panel.
- Variables de entorno nuevas a documentar en `.env.example`:
  `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `ENCRYPTION_KEY`.
- Rotación de `ENCRYPTION_KEY`: requiere re-encriptar todos los `credentialsEncrypted`
  en DB — documentar script de rotación antes de primer deploy productivo.

---

## Sources & References

- Código existente: `src/lib/stream-manager.js`, `src/lib/camera-utils.js`,
  `src/lib/notification-manager.js`, `src/lib/motion-detector.js`
- Auth.js (NextAuth v5): `https://authjs.dev/getting-started/installation`
- Prisma con Next.js: `https://www.prisma.io/docs/guides/nextjs`
- WebSocket en Next.js Pages Router (custom server): `https://github.com/websockets/ws`
- Caddy reverse proxy: `https://caddyserver.com/docs/quick-starts/reverse-proxy`
- AES-256-GCM en Node.js: `crypto` built-in (sin dependencias externas)
