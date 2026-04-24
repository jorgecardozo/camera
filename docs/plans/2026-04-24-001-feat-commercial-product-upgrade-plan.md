---
title: "feat: Commercial Product Upgrade — Detección, Compatibilidad, Seguridad, Notificaciones"
type: feat
status: active
date: 2026-04-24
---

# feat: Commercial Product Upgrade — Vigilancia NVR

## Overview

Vigilancia es un sistema de vigilancia IP funcional para uso personal. Para convertirlo en un producto comercial vendible que soporte "cualquier cámara WiFi", se requieren mejoras en cuatro dimensiones: seguridad (vulnerabilidades críticas), rendimiento de detección (modelo actual demasiado pesado para CPU), compatibilidad de cámaras (solo RTSP hoy), y valor de producto (sin notificaciones ni historial de eventos). Este plan define el trabajo de v1 comercial.

**Alcance del mercado objetivo:** hogares y pequeños negocios, hasta 8 cámaras, instalación sin conocimientos técnicos avanzados.

---

## Problem Frame

El sistema actual tiene tres problemas que bloquean la venta:

1. **Seguridad rota**: Los archivos en `public/recordings/` y `public/screenshots/` son accesibles sin autenticación vía URL directa, incluso con `APP_PASSWORD` configurado. Cualquier persona que adivine un nombre de archivo puede descargarlo.

2. **Detección lenta en CPU**: YOLO11x tiene 56.9M parámetros. En CPU, cada inferencia toma 300–700ms. Analizar el frame completo de 2–4 cámaras cada 3 frames a 25fps satura cualquier CPU de consumo. Frigate resuelve esto con una arquitectura en dos etapas: un detector de movimiento barato en CPU filtra el 90%+ de frames antes de invocar el modelo pesado solo sobre las regiones con cambio.

3. **Compatibilidad limitada**: El sistema solo funciona con cámaras que expongan RTSP en puertos estándar. Para soportar "cualquier cámara WiFi", se necesita ONVIF WS-Discovery (estándar industrial de auto-descubrimiento), que cubre la mayoría de cámaras IP del mercado.

4. **Onboarding manual**: El usuario debe conocer la IP de la cámara, el usuario y la contraseña antes de poder agregarla. La mayoría de cámaras WiFi del mercado usan credenciales de fábrica documentadas por marca. El sistema debería descubrirlas y configurarlas automáticamente sin intervención del usuario.

Adicionalmente: sin notificaciones, sin historial de eventos, sin health monitoring de cámaras, y problemas de deployment (requirements.txt incompleto, ffmpeg-static ignorado).

---

## Requirements Trace

- R1. Los archivos de grabaciones y capturas solo son accesibles a usuarios autenticados
- R2. La detección YOLO corre eficientemente en CPU para 2–4 cámaras simultáneas
- R3. El sistema descubre automáticamente cámaras WiFi en la LAN via ONVIF y port scan
- R8. El sistema prueba credenciales de fábrica por marca y configura la cámara sin intervención del usuario; cámaras no reconocidas presentan un formulario manual
- R4. El usuario recibe notificaciones en tiempo real cuando se detecta un objeto
- R5. El historial de eventos (detecciones con timestamp, tipo, captura) es consultable por cámara
- R6. El estado online/offline de cada cámara es visible y monitoreado
- R7. El entorno de producción es reproducible desde cero con un solo comando

---

## Scope Boundaries

- No incluye: interfaz multi-usuario / roles admin-viewer (v2)
- No incluye: almacenamiento remoto S3/NAS (v2)
- No incluye: PTZ funcional (requiere captura de tráfico DVRIP de la app iCSee — bloqueado por credenciales)
- No incluye: streaming via WebRTC/go2rtc (mejora válida pero MJPEG funciona; diferir a v2)
- No incluye: análisis estadístico o reportes
- No incluye: app móvil nativa

### Deferred to Follow-Up Work

- WebRTC / go2rtc como backbone de streaming: diferir a v2; go2rtc también tiene soporte nativo para DVRIP (protocolo Xiongmai) que podría desbloquear PTZ sin captura de tráfico
- Multi-usuario y roles: diferir a v2
- Almacenamiento externo (NAS, S3): diferir a v2
- OpenVINO / aceleración por iGPU Intel: diferir a v2; mejora de 4-35ms vs CPU puro, requiere runtime adicional

---

## Context & Research

### Hallazgos críticos del codebase

- `src/middleware.ts`: El matcher de Next.js no cubre `public/`. Los archivos en `public/recordings/` y `public/screenshots/` se sirven estáticamente sin pasar por el middleware de autenticación — bug de seguridad crítico.
- `src/lib/stream-manager.js`: El parsing de frames MJPEG fue mejorado a `Content-Length` (mpjpeg format), correcto. El viewer FFmpeg usa `-f mpjpeg`.
- `scripts/motion_detector.py`: Corre YOLO11x (`imgsz=640`) en cada 3er frame. Sin filtro de movimiento previo. Esto es el cuello de botella de CPU.
- `package.json`: `node-onvif 0.1.7` está instalado pero no se usa en ningún archivo. `ffmpeg-static 5.2.0` está instalado pero `stream-manager.js` llama a `spawn('ffmpeg', ...)` sin path absoluto — usa el FFmpeg del sistema, ignorando el bundled.
- `requirements.txt`: Solo declara `opencv-python-headless>=4.8`. No lista `ultralytics`, `torch`, ni `torchvision`. Un setup fresco falla en runtime.
- `cameras.json`: `_save()` usa `fs.writeFileSync` directo, no write-to-temp-then-rename. Writes concurrentes pueden corromper el archivo.
- Tanto `opencv-python` como `opencv-python-headless` están instalados en `.venv` — conflicto potencial; solo headless es necesario.

### Tecnología de detección — estado del arte 2026

La arquitectura en dos etapas de Frigate NVR es la referencia de la industria:
1. **Etapa rápida**: diferencia de frames o sustracción de fondo (MOG2) — puro CPU, ~1ms/frame, filtra ~90% de frames sin movimiento
2. **Etapa precisa**: YOLO solo sobre las regiones de la imagen donde se detectó cambio (crops) — reduce el área analizada dramáticamente

Con esta arquitectura, **YOLO11n** (nano, 2.6M params, ~56ms CPU) supera a YOLO11x en escenarios multi-cámara porque los crops son pequeños y el modelo se llama mucho menos frecuentemente. YOLO11x (56.9M params, ~500ms CPU) solo es viable con GPU.

**Nota**: La investigación encontró referencias a YOLO26 con benchmarks superiores (39ms CPU, mAP 40.9%). Verificar disponibilidad en `pip install ultralytics` antes de implementar — si existe, es preferible a YOLO11n.

### ONVIF — estándar de auto-descubrimiento

ONVIF WS-Discovery usa UDP multicast a `239.255.255.250:3702` para encontrar cámaras en la LAN. La mayoría de cámaras IP del mercado (Hikvision, Dahua, Reolink, TP-Link, Amcrest) responden. Las cámaras iCSee/Xiongmai tienen soporte ONVIF parcial en puerto 8899 con quirks propios.

- Node.js: librería `onvif` (agsh/onvif v0.8.1) — soporta WS-Discovery y control PTZ
- Python: `python-onvif-zeep` — alternativa para el pipeline Python

### go2rtc — componente de ecosistema relevante

go2rtc v1.9.14 es el backbone de streaming de Frigate. Soporta input: RTSP, ONVIF, **DVRIP/XMeye** (protocolo nativo Xiongmai), WebRTC; output: WebRTC, MSE, HLS, MJPEG. El módulo DVRIP podría desbloquear PTZ en las cámaras Geotek sin necesidad de capturar tráfico. Diferido a v2.

### Notificaciones — patrón de mercado

Frigate usa MQTT como bus de eventos y deja las notificaciones a integraciones externas (Home Assistant, Node-RED). Para un producto standalone, **Telegram Bot API** es el canal más simple y adoptado en el segmento de mercado objetivo: gratuito, no requiere configuración de servidor, funciona globalmente, soporta imágenes en el mensaje.

### External References

- [Frigate NVR — Two-stage detection pipeline](https://docs.frigate.video/configuration/object_detectors/)
- [Frigate — Recommended hardware / sizing](https://docs.frigate.video/frigate/hardware/)
- [go2rtc v1.9.14 — DVRIP module](https://github.com/AlexxIT/go2rtc)
- [YOLO11 vs YOLO26 benchmarks — Ultralytics](https://docs.ultralytics.com/compare/yolo26-vs-yolo11/)
- [ONVIF WS-Discovery — agsh/onvif](https://github.com/agsh/onvif)
- [iCSee ONVIF notes — iSpyConnect](https://www.ispyconnect.com/camera/icsee)

---

## Key Technical Decisions

- **Servir grabaciones/capturas via API en lugar de static**: Agregar rutas `/api/recordings/[filename]` y `/api/screenshots/[filename]` que verifiquen auth y sirvan el archivo con `fs.createReadStream`. Mover los directorios fuera de `public/` o mantenerlos en `public/` pero bloquearlos a nivel de middleware. La ruta API es más flexible (permite agregar permisos por cámara en v2).

- **Dos etapas de detección en el proceso Python**: Agregar MOG2 como pre-filtro en `motion_detector.py`. Si ningún contorno supera un umbral mínimo de área, saltear la llamada a YOLO. Esto reduce las llamadas YOLO en ~90% cuando no hay movimiento.

- **YOLO11n como modelo de producción**: Reemplazar YOLO11x por YOLO11n (o el nano más reciente disponible en ultralytics). Evaluar YOLO26n si está disponible. La pérdida de ~4% mAP frente a YOLO11x se compensa con el pre-filtro MOG2 (menos falsos positivos por contexto) y la arquitectura de crops.

- **ONVIF WS-Discovery via `onvif` npm package**: Añadir como canal de descubrimiento adicional al scan TCP existente. Los resultados se unifican en la UI de setup. El scan TCP sigue siendo el fallback para cámaras sin ONVIF.

- **Telegram como canal de notificaciones, configurable via UI**: El bot token y el chat ID se guardan en la config de la cámara o en un setting global. El mensaje incluye la imagen de captura automática + label del objeto detectado + nombre de cámara.

- **SQLite para event log**: Usar `better-sqlite3` (sync, sin deps nativas complejas) para una tabla de eventos de detección. No migrar `cameras.json` a SQLite en v1 — es un cambio mayor que puede romperse; solo agregar la tabla de eventos nueva. El archivo JSON persiste como está.

- **ffmpeg-static como fallback**: Modificar `stream-manager.js` para intentar usar el binary de `ffmpeg-static` si `ffmpeg` no está en PATH. Agregar check al startup.

---

## Open Questions

### Resolved During Planning

- **¿SQLite o PostgreSQL?**: SQLite via `better-sqlite3` — zero-config, file-based, suficiente para 8 cámaras, sin dependencias de servidor externo. Compatible con el modelo de deployment en un solo proceso.
- **¿Mover archivos fuera de `public/` o bloquear en middleware?**: Middleware es más simple y no requiere reorganizar los paths existentes. Agregar `matcher` en `middleware.ts` para capturar `/recordings/:path*` y `/screenshots/:path*`.
- **¿Qué objetos notificar?**: Solo clases de alto valor para seguridad del hogar: Persona, Auto, Camión, Moto. Excluir Pájaro, Bici, Barco para reducir ruido. Hacer configurable via UI.

### Deferred to Implementation

- **¿YOLO26 está disponible en ultralytics npm/pip?**: Verificar `pip index versions ultralytics` y la documentación actual. Si no existe, usar YOLO11n.
- **¿onvif WS-Discovery funciona con iCSee/Xiongmai en puerto 8899?**: Probar con las cámaras físicas. Si falla, el port scan sigue siendo el discovery principal.
- **¿`better-sqlite3` compila en el entorno de producción sin errores?**: Requiere node-gyp. Alternativa: `sql.js` (WASM, sin compilación nativa) si hay problemas de build.

---

## High-Level Technical Design

> *Ilustra el enfoque propuesto como guía de dirección para revisión, no como especificación de implementación.*

### Pipeline de detección (dos etapas)

```
RTSP stream (cámara)
  └─► FFmpeg (viewer) → MJPEG HTTP (localhost:3000)
        └─► Python MotionDetector
              ├── cv2.MOG2.apply(frame) → mask
              │     ├── contours_area < MIN_AREA → skip (no YOLO)   ← ~90% de frames
              │     └── contours_area ≥ MIN_AREA → crop bounding box
              │           └─► YOLO11n(crop, imgsz=320) → boxes
              │                 └─► JSON stdout → Node.js → motionBoxes
              │                       ├── UI overlay (400ms poll)
              │                       ├── Auto-screenshot (cooldown 10s)
              │                       └─► Telegram notification (si objeto en lista)
              └── [sin cambio] → siguiente frame
```

### Flujo de auto-provisioning (U3 + U8)

```
Primera apertura (0 cámaras) — auto-dispara scan
UI "Buscar cámaras" — también disparable manualmente
  │
  ├─ Etapa 1 (paralelo):
  │    ├── TCP port scan (554, 8554) → lista de IPs con RTSP abierto
  │    └── ONVIF WS-Discovery UDP 239.255.255.250:3702 → IPs + RTSP URL (si GetStreamUri responde)
  │
  ├─ Dedup por IP
  │    └── IPs con RTSP URL de ONVIF → status: 'verified', skip probing
  │
  └─ Etapa 2 — camera-prober (batches de 5 IPs en paralelo):
       Para cada IP sin RTSP URL confirmada:
         Iterar camera-profiles.js → ffprobe -t 2 por combinación (credential+path)
           ├── Hit → status: 'verified' con brand/user/pass/rtspUrl
           └── Miss → status: 'unknown'

UI CameraSetup:
  ✅ verified   → botón "Agregar" (o "Agregar todas")
  ⚠️ unknown   → formulario manual colapsado, expandible
  🔒 already   → deshabilitado "Ya registrada"
```

### Acceso autenticado a archivos

```
GET /recordings/cam_cam106_2026-04-24T01-48-15-924Z.mp4
  → middleware.ts (auth check)
  → /api/recordings/[...path].js → fs.createReadStream → pipe to res

(Sin auth: 401 Unauthorized — ya no sirve archivo estático directo)
```

---

## Implementation Units

- [x] U1. **Proteger grabaciones y capturas con autenticación**

**Goal:** Cerrar el bug de seguridad crítico donde `public/recordings/` y `public/screenshots/` son accesibles sin autenticación.

**Requirements:** R1

**Dependencies:** Ninguna

**Files:**
- Modify: `src/middleware.ts` — agregar patterns `/recordings/:path*` y `/screenshots/:path*` al matcher
- Create: `src/pages/api/recordings/[...path].js` — sirve archivos de grabación con auth
- Create: `src/pages/api/screenshots/[...path].js` — sirve archivos de captura con auth
- Modify: `src/components/FilesViewer.js` — actualizar URLs de video src y img src para usar las rutas API
- Modify: `src/components/CameraStream.js` — el lightbox y download links también deben apuntar a la ruta API

**Approach:**
- El middleware ya maneja auth para todas las rutas API. Extender el matcher para incluir los paths de archivos estáticos.
- Las rutas API leen el archivo del filesystem y lo pipean con `Content-Type` y `Content-Disposition` correctos.
- Para video, incluir soporte de `Range` header (necesario para que `<video>` seek funcione correctamente).
- Para descarga, usar `Content-Disposition: attachment`.

**Test scenarios:**
- Happy path: usuario autenticado accede a `/api/recordings/cam_cam106_*.mp4` → recibe el archivo con 200
- Error path: request sin auth a `/recordings/cam_cam106_*.mp4` → redirige a login o retorna 401
- Error path: request sin auth a `/api/recordings/cam_cam106_*.mp4` → 401
- Edge case: archivo no existente → 404
- Happy path: video tag con Range header → respuesta 206 Partial Content, seeking funciona

**Verification:**
- Abrir URL directa de una grabación sin estar autenticado retorna 401
- El reproductor de video en FilesViewer funciona con seeking
- El botón Descargar descarga el archivo correctamente

---

- [x] U2. **Arquitectura de detección en dos etapas — pre-filtro MOG2 + YOLO nano**

**Goal:** Reducir el uso de CPU de detección de ~500ms/frame a ~5ms/frame cuando no hay movimiento, y usar el modelo más eficiente disponible para CPU multi-cámara.

**Requirements:** R2

**Dependencies:** Ninguna

**Files:**
- Modify: `scripts/motion_detector.py` — agregar MOG2 pre-filter, cambiar a YOLO11n (o YOLO26n si disponible), inferir sobre crop en lugar de frame completo

**Approach:**
- Inicializar `cv2.createBackgroundSubtractorMOG2(history=500, varThreshold=16)` al inicio del loop.
- Por cada frame: aplicar MOG2, obtener contornos. Si el área máxima de contorno es menor a `MIN_CONTOUR_AREA` (configurable, default 1500px²), emitir `{"motion": false}` y continuar al siguiente frame sin llamar a YOLO.
- Si hay movimiento: calcular bounding box que engloba todos los contornos significativos, expandirlo 20% en cada lado (clipeado a límites del frame), recortar ese crop del frame original.
- Pasar el crop a `YOLO11n(crop, imgsz=320, conf=conf_thres)`.
- Mapear las coordenadas del box de crop-space a frame-space antes de emitir JSON (las coordenadas normalizadas deben ser relativas al frame completo, no al crop).
- Verificar disponibilidad de YOLO26n antes de usar YOLO11n como fallback.
- Eliminar el skip de 1/3 de frames (el MOG2 ya filtra lo que no tiene movimiento, más eficiente que un skip fijo).

**Execution note:** Verificar con una cámara real que las coordenadas de los bounding boxes en la UI corresponden a la posición visual correcta del objeto después del mapeo crop→frame.

**Patterns to follow:** `scripts/motion_detector.py` estructura existente (signal handlers, JSON stdout protocol)

**Test scenarios:**
- Happy path: frame sin movimiento → MOG2 retorna área < umbral → no se llama YOLO → JSON `{"motion": false}` emitido
- Happy path: frame con persona → MOG2 detecta movimiento → crop calculado → YOLO detecta Persona → JSON con box en coordenadas de frame completo
- Edge case: objeto en esquina del frame → crop expandido 20% pero clipeado → coordenadas correctas
- Edge case: múltiples objetos separados → bounding box engloba todos → coordenadas de cada box dentro del crop mapeadas correctamente
- Integration: boxes en UI corresponden visualmente a la posición del objeto en el video

**Verification:**
- En un frame sin movimiento, el proceso Python no llama a `model()` (verificable con `print` de debug temporal)
- Los boxes en la UI están correctamente posicionados sobre los objetos detectados
- CPU usage con 2 cámaras activas y sin movimiento es < 10% en un Mac Mini o hardware equivalente

---

- [x] U3. **Auto-provisioning — descubrimiento y verificación automática de credenciales**

**Goal:** Descubrir todas las cámaras WiFi en la LAN y probar credenciales de fábrica por marca, de modo que el usuario vea una lista de cámaras listas para agregar con un click — sin configurar IP, usuario ni contraseña manualmente.

**Requirements:** R3, R8

**Dependencies:** Ninguna (aditivo al scan TCP existente)

**Files:**
- Create: `src/lib/camera-profiles.js` — base de datos de credenciales y RTSP paths por marca
- Create: `src/lib/camera-prober.js` — verificación de credenciales via RTSP con timeout corto
- Create: `src/lib/onvif-discovery.js` — ONVIF WS-Discovery UDP multicast + GetStreamUri
- Modify: `src/pages/api/cameras/scan.js` — orquestar los tres métodos y retornar estado de verificación por IP
- Modify: `src/components/CameraSetup.js` — mostrar indicadores ✅/⚠️/❌ por cámara y botón "Agregar todas las verificadas"

**Approach:**

`camera-profiles.js` — perfiles de marcas ordenados por prevalencia en el mercado:
```js
export const CAMERA_PROFILES = [
  { brand: 'iCSee/Geotek', credentials: [['admin','admin123']], rtspPaths: ['/live'] },
  { brand: 'Hikvision',    credentials: [['admin','12345'],['admin','admin']], rtspPaths: ['/Streaming/Channels/101','/h264/ch1/main/av_stream'] },
  { brand: 'Dahua',        credentials: [['admin','admin'],['admin','']], rtspPaths: ['/cam/realmonitor?channel=1&subtype=0'] },
  { brand: 'Reolink',      credentials: [['admin',''],['admin','admin']], rtspPaths: ['/h264Preview_01_main','/live'] },
  { brand: 'Foscam',       credentials: [['admin',''],['admin','admin']], rtspPaths: ['/videoMain'] },
  { brand: 'TP-Link',      credentials: [['admin','admin'],['admin','12345']], rtspPaths: ['/stream1','/live/main'] },
  { brand: 'Genérica',     credentials: [['admin','admin'],['admin','123456'],['admin','888888']], rtspPaths: ['/live','/stream','/ch0/0'] },
]
```

`camera-prober.js` — probar una IP contra todos los perfiles:
- Por cada combinación (brand, credential, rtspPath): intentar `ffprobe -v quiet -i rtsp://user:pass@ip:554/path -t 2` con timeout de 3s.
- Retornar el primer hit: `{ status: 'verified', brand, username, password, rtspUrl }`.
- Si ninguna combinación responde: `{ status: 'unknown' }`.
- Concurrencia máxima: 5 IPs en paralelo (evitar saturar la LAN o el router).

`onvif-discovery.js`:
- Usar `onvif.startProbe()` con timeout de 3s hacia `239.255.255.250:3702`.
- Para cada dispositivo ONVIF: intentar `GetStreamUri` con las credenciales del profile correspondiente a su marca (extraída del `Manufacturer` del device info, si está disponible).
- Si `GetStreamUri` responde: marcar como `{ status: 'verified', source: 'onvif', rtspUrl }` — sin necesidad de probing.
- Retornar IPs con sus datos; las que fallen `GetStreamUri` pasan al probing normal.

Flujo orquestado en `scan.js` (tres etapas):
1. **Descubrimiento en paralelo**: TCP port scan + ONVIF WS-Discovery simultáneos.
2. **Dedup por IP**: si ONVIF ya tiene RTSP URL verificada, marcar `verified` y excluir del probing.
3. **Probing en batches de 5**: para IPs sin RTSP URL confirmada, ejecutar `camera-prober.js`.

Response shape por IP:
```json
{ "ip": "192.168.68.106", "status": "verified", "brand": "iCSee/Geotek",
  "username": "admin", "password": "admin123",
  "rtspUrl": "rtsp://admin:admin123@192.168.68.106:554/live" }
{ "ip": "192.168.68.105", "status": "unknown", "rtspPort": 554 }
{ "ip": "192.168.68.200", "status": "already_registered" }
```

`CameraSetup.js` cambios:
- Cada resultado del scan muestra un indicador: ✅ verified, ⚠️ unknown (formulario manual expandible), ya registrada (deshabilitado).
- Botón "Agregar todas las verificadas" llama `registerCamera()` para cada ✅ con nombre auto-generado (`Cámara [ip_suffix]`).
- Las cámaras ⚠️ muestran el formulario de configuración manual colapsado, expandible al hacer click.

**Patterns to follow:** `src/pages/api/cameras/scan.js` estructura de scan TCP; `src/lib/camera-utils.js` `buildRtspUrl()` y `registerCamera()`

**Test scenarios:**
- Happy path: cámara Geotek en red → port scan encuentra IP → camera-prober prueba iCSee primero → RTSP responde → UI muestra ✅ con botón "Agregar"
- Happy path: cámara con ONVIF (Hikvision/Dahua) → ONVIF discovery retorna RTSP URL sin necesidad de probing → ✅ más rápido
- Happy path: click "Agregar todas las verificadas" → todas las ✅ se registran con nombre auto-generado → aparecen inmediatamente en tab de cámaras
- Happy path: cámara no reconocida → probing agota todos los perfiles → UI muestra ⚠️ con formulario manual expandible
- Edge case: misma IP en port scan y ONVIF → deduplicada, datos ONVIF tienen precedencia
- Edge case: cámara ya en cameras.json → aparece con indicador "Ya registrada", botón "Agregar" deshabilitado
- Error path: timeout de probing en IP con RTSP cerrado o filtrado → no crash, continúa con siguiente IP
- Error path: ONVIF probe lanza excepción de red → catcheada, log, port scan continúa normalmente

**Verification:**
- Conectar una cámara Geotek a la red → aparece como ✅ en el scan sin configurar nada manualmente
- La latencia total del scan (port scan + probing de todas las IPs) es < 20 segundos para una red /24
- Cámaras ya registradas no se ofrecen para agregar nuevamente
- Las cámaras desconocidas muestran ⚠️ con formulario manual funcional

---

- [x] U4. **Notificaciones Telegram al detectar objetos**

**Goal:** Enviar un mensaje Telegram con la captura automática + nombre del objeto + cámara cuando se detecta un objeto de interés (Persona, Auto, Camión, Moto), con cooldown configurable.

**Requirements:** R4

**Dependencies:** U2 (la detección debe estar funcionando correctamente)

**Files:**
- Create: `src/lib/notification-manager.js` — envío de notificaciones Telegram
- Modify: `src/lib/motion-detector.js` — llamar a notification-manager desde `_onMotion`
- Modify: `src/pages/api/cameras/[id]/motion.js` o una nueva ruta — guardar config Telegram
- Modify: `src/components/CameraSetup.js` — campos para bot token y chat ID
- Modify: `src/lib/camera-utils.js` — agregar campos `telegramBotToken`, `telegramChatId`, `notifyObjects` al schema de cámara

**Approach:**
- `notification-manager.js` expone `notify(cameraId, label, confidence, jpegBuffer)`.
- Usa la API de Telegram Bot (`https://api.telegram.org/bot{TOKEN}/sendPhoto`) con el frame capturado como foto.
- Caption: `🚨 [Nombre cámara] — [Label] ([conf]%) — [hora]`.
- Cooldown por cámara: no enviar más de una notificación por cámara cada 30 segundos (configurable, separado del cooldown de screenshot de 10s).
- Lista de objetos a notificar: configurable por cámara (`notifyObjects: ['Persona', 'Auto', 'Camión', 'Moto']`). Default: solo Persona.
- No enviar si no hay `telegramBotToken` y `telegramChatId` configurados — notificaciones son opt-in.
- Usar `fetch()` nativo de Node.js 18+ (sin axios).

**Patterns to follow:** `src/lib/motion-detector.js` patrón de cooldown para screenshots (`lastScreenshotAt`)

**Test scenarios:**
- Happy path: Persona detectada + config Telegram presente → mensaje enviado con foto en <2s
- Happy path: Pájaro detectado + lista de objetos no incluye Pájaro → no se envía notificación
- Edge case: segunda detección dentro del cooldown de 30s → no se envía segunda notificación
- Edge case: sin conexión a internet → fetch falla → error logeado, no crash del servidor
- Error path: token Telegram inválido → API retorna 401 → error logeado, no reintento infinito
- Edge case: jpegBuffer null (viewer no tiene frame todavía) → enviar solo texto sin foto

**Verification:**
- Poner la mano frente a la cámara → llega mensaje Telegram en < 15 segundos
- No llegan mensajes duplicados durante el cooldown
- Si Telegram no está configurado, el sistema funciona igual sin errores

---

- [x] U5. **Event log — historial de detecciones por cámara**

**Goal:** Guardar cada evento de detección (timestamp, cámara, objeto, confianza, path de captura) en SQLite y exponerlo en la UI como timeline por cámara.

**Requirements:** R5

**Dependencies:** U2, U4

**Files:**
- Create: `src/lib/event-store.js` — singleton SQLite con `better-sqlite3`
- Modify: `src/lib/motion-detector.js` — llamar a `eventStore.insert()` en `_onMotion`
- Create: `src/pages/api/events.js` — GET /api/events?cameraId=&limit=&offset=
- Modify: `src/components/FilesViewer.js` — agregar tab "Eventos" con timeline
- Modify: `package.json` — agregar `better-sqlite3`

**Approach:**
- Esquema: `events(id INTEGER PK, cameraId TEXT, timestamp INTEGER, label TEXT, confidence REAL, screenshotPath TEXT)`.
- DB file: `vigilancia.db` en la raíz del proyecto (git-ignored).
- `eventStore.js` crea la tabla si no existe al importarse (mismo patrón que `retention.js`).
- Insertar un evento por cada detección (no por cada frame — uno por llamada a `_onMotion` exitosa).
- API GET `/api/events?cameraId=cam106&limit=50&offset=0` retorna JSON con eventos ordenados por timestamp DESC.
- UI: nuevo tab "Eventos" en FilesViewer, lista de eventos con foto thumbnail clickeable (abre lightbox), label, cámara, hora. Filtrable por cámara (usa los mismos chips de cámara existentes).
- Retención: purgar eventos más viejos de `MAX_RECORDING_AGE_HOURS` (misma política que los archivos de video) via `retention.js`.

**Patterns to follow:** `src/components/FilesViewer.js` para el tab + chips de filtro por cámara; `src/lib/retention.js` para limpieza

**Test scenarios:**
- Happy path: detección ocurre → evento guardado en DB → aparece en tab Eventos en < 1s
- Happy path: filtrar por cámara 106 → solo muestra eventos de cam106
- Edge case: click en evento sin screenshot asociado (jpegBuffer era null) → muestra placeholder
- Edge case: 1000+ eventos → paginación funciona, primer page carga < 500ms
- Integration: después de reiniciar el servidor, los eventos previos siguen en la DB

**Verification:**
- Tab Eventos muestra los últimos 50 eventos con foto, label y hora
- Filtrar por cámara muestra solo los eventos de esa cámara
- La DB existe en el filesystem después del primer evento

---

- [x] U6. **Camera health monitoring — detección de cámara offline**

**Goal:** Detectar cuando una cámara se desconecta de la red y mostrar indicador visual en la UI. Reintentar la conexión automáticamente.

**Requirements:** R6

**Dependencies:** Ninguna

**Files:**
- Modify: `src/lib/stream-manager.js` — trackear estado de conexión del viewer FFmpeg
- Modify: `src/lib/camera-utils.js` — agregar campo runtime `isOnline: boolean` a la cámara
- Modify: `src/pages/api/cameras/index.js` — incluir `isOnline` en la respuesta
- Modify: `src/components/CameraStream.js` — mostrar badge "SIN SEÑAL" cuando `isOnline === false`

**Approach:**
- En `_spawn()`: cuando FFmpeg cierra con código de error (no señal) tres veces en menos de 30 segundos, marcar `camera.isOnline = false` en `cameraManager`.
- Reintentar la conexión con backoff exponencial: 5s → 10s → 30s → 60s (cap).
- Cuando FFmpeg arranca exitosamente y emite el primer frame, marcar `camera.isOnline = true`.
- El badge "EN VIVO" en la UI cambia a "SIN SEÑAL" (rojo, sin animate-pulse) cuando `isOnline === false`.
- `isOnline` nunca se persiste a `cameras.json` (campo runtime como `motionActive`).

**Patterns to follow:** `src/lib/motion-detector.js` patrón de restart con delay; `src/lib/camera-utils.js` runtime fields en `_load()` y `_save()`

**Test scenarios:**
- Happy path: desconectar cámara de la red → badge cambia a "SIN SEÑAL" en < 15s
- Happy path: reconectar cámara → badge vuelve a "EN VIVO" cuando stream se restablece
- Edge case: servidor reiniciado → `isOnline` empieza como `false`, se actualiza al conectarse
- Error path: cámara responde RTSP pero devuelve frames corruptos → FFmpeg crashea → detección de offline funciona igual

**Verification:**
- Desconectar cámara del router WiFi → UI muestra "SIN SEÑAL" en < 15 segundos
- Reconectar → UI muestra "EN VIVO" automáticamente

---

- [x] U7. **Production deployment hardening**

**Goal:** Hacer que el entorno de producción sea reproducible desde cero: requirements completo, ffmpeg-static como fallback, atomic writes para cameras.json, y cleanup de procesos orphan en restart.

**Requirements:** R7

**Dependencies:** Ninguna (puede ir en paralelo con U1–U6)

**Files:**
- Modify: `requirements.txt` — agregar `ultralytics>=8.4`, `torch>=2.0`, `torchvision>=0.15`; reemplazar `opencv-python` por `opencv-python-headless` exclusivamente
- Modify: `src/lib/stream-manager.js` — usar binary de `ffmpeg-static` si `ffmpeg` no está en PATH
- Modify: `src/lib/camera-utils.js` — atomic write en `_save()` (write to `.tmp` + rename)
- Create: `scripts/cleanup-orphans.sh` — mata procesos ffmpeg/python3 orphan del run anterior
- Modify: `ecosystem.config.cjs` — agregar `pre_stop` hook para cleanup; aumentar `max_memory_restart` a `1024M`
- Modify: `CLAUDE.md` — documentar el setup completo reproducible

**Approach:**
- `requirements.txt`: listar explícitamente todas las dependencias con versiones mínimas. Agregar `torch` con `--index-url https://download.pytorch.org/whl/cpu` en comentario para instalación CPU-only.
- ffmpeg-static: en `stream-manager.js` importar `ffmpegPath from 'ffmpeg-static'` y usar `spawn(process.env.FFMPEG_PATH || ffmpegPath || 'ffmpeg', ...)`.
- Atomic write: `fs.writeFileSync(CAMERAS_FILE + '.tmp', ...)` seguido de `fs.renameSync(CAMERAS_FILE + '.tmp', CAMERAS_FILE)`. `renameSync` es atómica en el mismo filesystem.
- Orphan cleanup: `scripts/cleanup-orphans.sh` usa `pkill -f motion_detector.py` y `pkill -f "rtsp://.*@192.168"` con `-TERM`. Llamar desde el `pre_stop` de pm2 y al inicio del servidor.
- `max_memory_restart: '1024M'` — el proceso con 4 cámaras activas y buffers MJPEG puede superar 512MB fácilmente.

**Test scenarios:**
- Happy path: setup en máquina nueva con solo `npm install` + `pip install -r requirements.txt` → servidor arranca correctamente con `npm run dev`
- Happy path: ffmpeg no en PATH → usa binary de ffmpeg-static → streams funcionan
- Edge case: write a cameras.json concurrente → atomic rename previene corrupción
- Integration: pm2 restart → no quedan procesos ffmpeg/python3 orphan (verificar con `ps aux`)

**Verification:**
- `pip install -r requirements.txt` en un venv limpio → `python3 -c "from ultralytics import YOLO; import cv2"` sin error
- `which ffmpeg` devuelve "not found" → servidor arranca y streams funcionan igual
- Después de `pm2 restart vigilancia` → `ps aux | grep ffmpeg` no muestra procesos del run anterior

---

- [x] U8. **Primera ejecución — wizard de auto-setup**

**Goal:** Cuando el usuario abre la app por primera vez (sin cámaras configuradas), el sistema escanea la LAN automáticamente y presenta las cámaras encontradas listas para agregar. El usuario no tiene que saber qué es RTSP ni una dirección IP.

**Requirements:** R3, R8

**Dependencies:** U3 (auto-provisioning backend debe estar completo)

**Files:**
- Modify: `src/pages/index.tsx` — detectar estado "sin cámaras" y mostrar onboarding en lugar del dashboard vacío
- Modify: `src/components/CameraSetup.js` — agregar modo `autoScan` que dispara el scan automáticamente al montar el componente
- Create: `src/components/OnboardingBanner.js` — banner con estado del scan y lista de cámaras encontradas

**Approach:**
- En `index.tsx`: si `cameras.length === 0` y el tab activo no es "setup", cambiar automáticamente al tab "setup" y pasar prop `autoScan={true}` a `CameraSetup`.
- En `CameraSetup.js` modo `autoScan`: en `useEffect` al montar, llamar automáticamente a `/api/cameras/scan` sin esperar que el usuario presione el botón. Mostrar spinner con texto "Buscando cámaras en tu red…" durante el scan.
- Una vez completado: si hay cámaras ✅, mostrar el banner de onboarding con "Encontramos [N] cámara(s) — ¿Agregar todas?" y botón primario.
- Si no se encuentra ninguna cámara: mostrar instrucciones de setup manual con el formulario normal.
- Después de agregar la primera cámara: `autoScan` no se vuelve a disparar (leer `cameras.length` actualizado).
- `OnboardingBanner.js`: componente visual separado con ilustración o ícono de cámara, contador, listado de cámaras encontradas (nombre/IP/marca), y botón "Agregar todas las verificadas". Incluye enlace "Configurar manualmente" que colapsa el banner y muestra el formulario.

**Patterns to follow:** `src/components/CameraSetup.js` lógica de scan existente; `src/pages/index.tsx` manejo de tabs con `activeTab` state

**Test scenarios:**
- Happy path: usuario abre app sin cámaras → tab setup activo automáticamente → scan arranca → banner muestra cámaras ✅ → click "Agregar todas" → cámaras aparecen en tab de cámaras
- Happy path: usuario tiene cámaras → app abre en tab de cámaras normalmente, sin auto-scan
- Edge case: scan no encuentra cámaras → muestra mensaje explicativo + formulario manual
- Edge case: usuario agrega una cámara manualmente primero → al volver a index, ya no hay auto-scan
- UX: el spinner de "Buscando…" dura máximo 20s; si el scan tarda más, muestra los resultados parciales disponibles

**Verification:**
- Borrar cameras.json → recargar app → scan arranca automáticamente → cámara Geotek aparece en el banner sin hacer nada
- Con cameras.json con cámaras → la app abre normalmente en el dashboard sin disparar ningún scan

---

## System-Wide Impact

- **Interaction graph**: U1 afecta todos los componentes que usan paths de archivos (`FilesViewer`, `CameraStream` download links, lightbox). U2 cambia el protocolo de stdout de Python (verificar que el parser JSON en `motion-detector.js` siga funcionando con `{"motion": false}`). U3 extiende la respuesta de `/api/cameras/scan` con campos nuevos (`status`, `brand`) — `CameraSetup.js` debe manejar tanto el formato viejo como el nuevo durante la transición. U5 agrega una dependencia nativa compilada (`better-sqlite3`) que requiere node-gyp. U8 depende de U3: el auto-scan en primera ejecución llama al mismo endpoint `/api/cameras/scan` extendido por U3.
- **Error propagation**: Las notificaciones Telegram (U4) no deben bloquear el flujo de detección si fallan. `_onMotion` debe llamar a `notify()` en un try-catch fire-and-forget.
- **State lifecycle risks**: El event log SQLite (U5) persiste entre reinicios — las políticas de retención de `retention.js` deben extenderse para purgar eventos viejos de la DB, o el archivo crece indefinidamente.
- **API surface parity**: Los URLs de `<video src>`, `<img src>`, y links de descarga en `FilesViewer.js` y `CameraStream.js` deben actualizarse todos en U1. Dejar uno sin actualizar causa que esa función específica rompa auth.
- **Unchanged invariants**: El protocolo JSON stdout de Python (`{"motion": true/false, "boxes": [...]}`) no cambia — el parser en `motion-detector.js` debe seguir funcionando igual. Solo se agrega `{"motion": false}` como caso nuevo (hoy solo se emite cuando hay boxes).

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| `better-sqlite3` falla al compilar en el entorno de producción (requiere node-gyp, compiladores C++) | Alternativa: `sql.js` (WASM, sin compilación). Evaluar en la máquina de producción antes de commitear la dependencia. |
| YOLO26n no está disponible en ultralytics pip | Fallback: YOLO11n confirmado disponible. El plan usa YOLO11n como referencia; actualizar a YOLO26n si disponible. |
| ONVIF WS-Discovery no funciona con las cámaras iCSee/Geotek | No es bloqueante: el port scan TCP sigue siendo el discovery principal. ONVIF es aditivo. |
| Coordenadas de boxes incorrectas al mapear crop→frame | Testear con múltiples posiciones de objeto (esquinas, borde) en U2 antes de liberar. |
| El rename atómico de cameras.json puede fallar en filesystems cross-device | En deployment estándar (mismo disco) no ocurre. Documentar el edge case. |
| `max_memory_restart: '1024M'` sigue siendo bajo en máquinas con 4+ cámaras activas | Si el proceso supera 1GB frecuentemente, aumentar o investigar leaks de buffer MJPEG. |

---

## Documentation / Operational Notes

- Documentar en `CLAUDE.md` la nueva ruta de setup completo: `pip install -r requirements.txt` como único comando para Python.
- Documentar la configuración de Telegram: cómo crear un bot en BotFather y obtener el chat ID.
- El archivo `vigilancia.db` debe ser excluido del git (agregar a `.gitignore`).
- El modelo `yolo11x.pt` existente puede eliminarse del proyecto una vez confirmado que `yolo11n.pt` funciona correctamente — ocupa 109 MB innecesarios.
- La primera vez que se activa detección con el modelo nuevo, hay un delay de ~5-15 segundos de warm-up (carga del modelo a memoria). Normal.

---

## Phased Delivery

### Fase 1 — Seguridad y fundación (U1, U7)
Bloqueos críticos para cualquier deployment en internet. U1 cierra la vulnerabilidad de seguridad. U7 hace el setup reproducible.

### Fase 2 — Detección y compatibilidad (U2, U3, U8)
Mejora el núcleo del producto: detección más rápida para multi-cámara, soporte de más marcas via auto-provisioning, y wizard de primera ejecución que hace el producto zero-config. U8 depende de U3; U2 y U3 pueden ir en paralelo.

### Fase 3 — Valor de producto (U4, U5, U6)
Features que un cliente paga por tener: notificaciones, historial, estado de cámaras.

---

## Sources & References

- Codebase: `src/lib/stream-manager.js`, `src/lib/motion-detector.js`, `scripts/motion_detector.py`
- Frigate NVR two-stage pipeline: https://docs.frigate.video/configuration/object_detectors/
- go2rtc (DVRIP support): https://github.com/AlexxIT/go2rtc
- YOLO11 benchmarks: https://docs.ultralytics.com/models/yolo11/
- ONVIF Node.js: https://github.com/agsh/onvif
- iCSee ONVIF notes: https://www.ispyconnect.com/camera/icsee
