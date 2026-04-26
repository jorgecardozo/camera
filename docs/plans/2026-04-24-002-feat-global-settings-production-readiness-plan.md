---
title: "feat: Settings globales, seguridad de archivos y producción"
type: feat
status: active
date: 2026-04-24
---

# feat: Settings globales, seguridad de archivos y producción

## Overview

Tres cambios necesarios para pasar de "funciona en mi máquina" a "listo para usuarios":

1. **Seguridad crítica**: las grabaciones y capturas en `public/recordings/` y `public/screenshots/` son accesibles sin autenticación — Next.js sirve archivos estáticos *antes* del middleware. Cualquiera que adivine un nombre de archivo puede descargarlos aunque `APP_PASSWORD` esté configurado.

2. **Telegram global**: el token y chatId de Telegram se configuran hoy *por cámara*, en el panel de cada `CameraStream`. El usuario tiene que repetir la configuración para cada cámara nueva y no hay un lugar centralizado para gestionar las notificaciones.

3. **Settings persistentes**: no existe un storage de configuración global. El `settings.json` propuesto almacena la config de Telegram y otros parámetros globales (objetos a notificar) de forma atómica, se mantiene entre reinicios del servidor, y se carga automáticamente sin intervención del usuario.

---

## Problem Frame

Un usuario que instala Vigilancia en un servidor ve dos problemas inmediatos:

- **Privacidad**: sus grabaciones están en `http://servidor/recordings/nombrearchivo.mp4`. Si alguien adivina o guessa el nombre (basado en timestamps), puede ver el video sin login. El middleware de auth no protege archivos en `public/`.
- **Configuración repetitiva**: tiene que ingresar el mismo Bot Token de Telegram en cada cámara que agrega. Si borra una cámara y la vuelve a agregar, pierde la configuración.

---

## Requirements Trace

- R1. Grabaciones y capturas solo accesibles a usuarios autenticados — sin excepción por acceso estático directo
- R2. El usuario configura el Bot Token y Chat ID de Telegram una sola vez y aplica a todas las cámaras
- R3. La configuración de Telegram persiste entre reinicios del servidor y sesiones del usuario
- R4. El toggle de notificaciones por cámara (activar/desactivar) se mantiene independiente del token global
- R5. El token no se muestra en `cameras.json` (limpieza de datos sensibles por cámara)

---

## Scope Boundaries

- No incluye multi-usuario / roles (v2)
- No incluye cifrado del token en el storage (el servidor ya es privado via HTTP Basic Auth + Cloudflare Tunnel; el .env.local sigue siendo el modelo de seguridad)
- No incluye notificaciones por canales alternativos (email, push, WhatsApp) — Telegram es suficiente para v1
- No migra `cameras.json` a SQLite — sigue siendo JSON plano
- No incluye UI de preview de notificación (el botón "Probar" envía un mensaje de test real)

---

## Context & Research

### Patrones relevantes del codebase

- `src/lib/camera-utils.js` — `CameraManager`: patrón de load/save atómico con `.tmp` + rename. Seguir este patrón para `SettingsManager`.
- `src/lib/stream-manager.js:184` — `path.join(process.cwd(), 'public', 'recordings')` — path a cambiar
- `src/lib/camera-utils.js:138` — `saveFrame()` usa `public/screenshots/` — path a cambiar
- `src/lib/retention.js:5` — `RECORDINGS_DIR` apunta a `public/recordings/` — path a cambiar
- `src/pages/api/recordings/[...path].js` — ya sirve grabaciones via API con soporte Range; solo cambiar el directorio base
- `src/pages/api/screenshots/[...path].js` — idem para capturas
- `src/pages/api/files/thumbnail.js` — `THUMBNAILS_DIR` apunta a `public/thumbnails/` — mover a `data/thumbnails/`
- `src/lib/notification-manager.js` — lee `camera.telegramBotToken` y `camera.telegramChatId` por cámara; cambiar a leer de `settingsManager`
- `src/components/CameraStream.js` — tiene inputs para token y chatId; eliminar, dejar solo el toggle

### Estado actual de seguridad

El middleware `src/middleware.ts` protege `/((?!_next/static|_next/image|favicon.ico).*)` — cubre `/api/*` pero **no** protege archivos en `public/`. Next.js sirve el contenido de `public/` directamente via el servidor estático de Node, sin pasar por el middleware de Edge. La solución es mover los archivos fuera de `public/`.

### Estructura objetivo de directorios

```
data/               ← nuevo, git-ignorado
  recordings/
  screenshots/
  thumbnails/
settings.json       ← nuevo, git-ignorado
cameras.json        ← existente, git-ignorado
```

---

## Key Technical Decisions

- **`data/` en lugar de reorganizar rutas API**: mover los archivos a `data/recordings/`, `data/screenshots/`, `data/thumbnails/`. Las rutas API (`/api/recordings/`, `/api/screenshots/`) no cambian — solo el path interno que usan para leer del filesystem. Cero impacto en el frontend.

- **`settings.json` como store global independiente**: no mezclar settings con `cameras.json`. `SettingsManager` sigue el mismo patrón de load/save atómico que `CameraManager`. El archivo es git-ignorado.

- **Migración automática one-time**: en el arranque, si `settings.json` no existe y alguna cámara tiene `telegramBotToken` no vacío, copiar ese token al settings global y limpiar los campos de todas las cámaras. Esto garantiza cero pérdida de datos para usuarios existentes.

- **`telegramEnabled` permanece por cámara**: el toggle silenciar/activar sigue siendo por cámara. Solo el token y chatId se globalizan.

- **`notifyObjects` también global**: la lista de clases que disparan notificación (Persona, Auto, etc.) pasa también al settings global. Simplifica la UI y tiene sentido que sea una política uniforme.

---

## Open Questions

### Resolved During Planning

- **¿`settings.json` o variable de entorno para el token?**: `settings.json` — permite edición via UI sin tocar archivos del servidor. Las variables de entorno son más difíciles de editar remotamente y no tienen UI.
- **¿Eliminar los campos de token de `cameras.json` inmediatamente o deprecar gradualmente?**: Eliminar en la migración automática — mantener campos sensibles en dos lugares es peor que migrar limpio.
- **¿Dónde mostrar la config global de Telegram?**: En la pestaña "Config" (tab de setup), como una nueva sección "Notificaciones" separada de la lista de cámaras.

### Deferred to Implementation

- ¿El botón "Probar" debe enviar una imagen o solo texto? Texto es más simple y suficiente para verificar que el token funciona.

---

## Implementation Units

- [ ] U1. **Mover grabaciones, capturas y thumbnails fuera de `public/`**

**Goal:** Cerrar el acceso sin autenticación a archivos de grabación y captura moviéndolos de `public/` a `data/`, que no es servido estáticamente por Next.js.

**Requirements:** R1

**Dependencies:** Ninguna

**Files:**
- Modify: `src/lib/stream-manager.js` — `RECORDINGS_DIR` → `data/recordings/`
- Modify: `src/lib/camera-utils.js` — `saveFrame()` → `data/screenshots/`; `getRecordings()` y `getScreenshots()` → `data/`
- Modify: `src/lib/retention.js` — `RECORDINGS_DIR` → `data/recordings/`; `SCREENSHOTS_DIR` → `data/screenshots/`
- Modify: `src/pages/api/recordings/[...path].js` — `recordingsDir` → `data/recordings/`
- Modify: `src/pages/api/screenshots/[...path].js` — `screenshotsDir` → `data/screenshots/`
- Modify: `src/pages/api/files/thumbnail.js` — `THUMBNAILS_DIR` → `data/thumbnails/`
- Modify: `src/pages/api/files.js` — si usa paths de `public/`, actualizar
- Modify: `.gitignore` — agregar `/data/`

**Approach:**
- Centralizar las constantes de directorio en cada archivo. Donde hay `path.join(process.cwd(), 'public', 'recordings')`, cambiar a `path.join(process.cwd(), 'data', 'recordings')`. El directorio se crea automáticamente con `fs.mkdirSync(..., { recursive: true })` — ya está implementado en todos los lugares.
- Las rutas de las API ya son las únicas rutas que el frontend usa (`/api/recordings/`, `/api/screenshots/`). El cambio es transparente para el cliente.
- Agregar script de migración one-shot en un comentario en CLAUDE.md para que el operador mueva los archivos existentes: `mv public/recordings/* data/recordings/`, etc.

**Patterns to follow:** `src/pages/api/recordings/[...path].js` — guard de path traversal ya implementado, seguir el mismo patrón

**Test scenarios:**
- Happy path: usuario autenticado accede a `/api/recordings/cam_xxx.mp4` → 200 con video
- Error path: acceso directo a `/recordings/cam_xxx.mp4` → 404 (archivo ya no está en `public/`)
- Error path: request sin auth a `/api/recordings/cam_xxx.mp4` → 401
- Edge case: path traversal (`../cameras.json`) → 400 rechazado por el guard existente
- Happy path: thumbnail se genera y sirve desde `data/thumbnails/` → imagen correcta

**Verification:**
- `curl -I http://localhost:3000/recordings/cam_xxx.mp4` retorna 404
- `curl -I -u :password http://localhost:3000/api/recordings/cam_xxx.mp4` retorna 200 o 206
- `curl -I http://localhost:3000/api/recordings/cam_xxx.mp4` (sin auth) retorna 401

---

- [ ] U2. **`SettingsManager` — storage global de configuración**

**Goal:** Crear un módulo de settings globales que persiste en `settings.json` y que expone una API REST para leer y modificar la configuración desde la UI.

**Requirements:** R2, R3

**Dependencies:** Ninguna

**Files:**
- Create: `src/lib/settings-manager.js` — clase `SettingsManager` con get/patch/migrate
- Create: `src/pages/api/settings.js` — GET retorna settings actuales; PATCH actualiza campos permitidos
- Modify: `.gitignore` — agregar `settings.json`

**Approach:**
- `SettingsManager` sigue el patrón de `CameraManager`: carga `settings.json` en el constructor, escribe con `writeFileSync(tmp) + renameSync` para atomicidad.
- Campos del settings:
  ```
  telegramBotToken: string
  telegramChatId: string
  notifyObjects: string[] | null   (null = defaults internos)
  ```
- `migrate(cameras)`: si `settings.json` no existe y alguna cámara tiene `telegramBotToken` no vacío, copiar el primer token encontrado al settings y retornar `true` para indicar que las cámaras deben limpiarse.
- API `GET /api/settings` → `{ telegramBotToken, telegramChatId, notifyObjects }` (no exponer otros campos que puedan agregarse en el futuro sin revisión de seguridad)
- API `PATCH /api/settings` → acepta solo `telegramBotToken`, `telegramChatId`, `notifyObjects`
- Singleton exportado: `export const settingsManager = new SettingsManager()`

**Patterns to follow:** `src/lib/camera-utils.js` — `CameraManager._load()`, `CameraManager._save()` (patrón de write atómico)

**Test scenarios:**
- Happy path: `GET /api/settings` sin settings.json → retorna defaults (campos vacíos)
- Happy path: `PATCH /api/settings` con token válido → settings.json actualizado, GET siguiente retorna nuevo valor
- Edge case: `PATCH` con campo no permitido (e.g., `{ admin: true }`) → campo ignorado, no guardado
- Error path: settings.json corrupto → `_load()` retorna defaults sin crashear el servidor
- Integration: migración automática — cámara existente con token → `settings.json` creado, cámara limpiada

**Verification:**
- `cat settings.json` muestra el token después de un PATCH
- `GET /api/settings` retorna el token guardado después de reiniciar el servidor (persistencia verificada)
- Campos no permitidos en PATCH no aparecen en settings.json

---

- [ ] U3. **Actualizar `notificationManager` para leer de settings globales**

**Goal:** Desacoplar el token y chatId de Telegram de los datos de cámara. El `notificationManager` lee las credenciales del `settingsManager` en lugar de `camera.telegramBotToken`.

**Requirements:** R2, R4, R5

**Dependencies:** U2

**Files:**
- Modify: `src/lib/notification-manager.js` — usar `settingsManager.get()` para token y chatId
- Modify: `src/lib/camera-utils.js` — eliminar `telegramBotToken` y `telegramChatId` de `_load()`, `registerCamera()`, y `_save()`
- Modify: `src/pages/api/cameras/[id]/index.js` — eliminar `telegramBotToken` y `telegramChatId` de `ALLOWED` en PATCH

**Approach:**
- En `notify()`, reemplazar `camera.telegramBotToken` → `settingsManager.get().telegramBotToken` y análogo para chatId.
- La condición de early return queda: `if (!camera.telegramEnabled) return` + `if (!settings.telegramBotToken || !settings.telegramChatId) return`.
- `notifyObjects` también pasa a settings: `const allowedObjects = new Set(settings.notifyObjects || DEFAULT_OBJECTS)`.
- En `CameraManager._load()`, conservar `telegramEnabled` por cámara pero eliminar `telegramBotToken` y `telegramChatId`. La migración (U2) ya movió el token antes de que esto se aplique.
- En `_save()`, `telegramBotToken` y `telegramChatId` no se serializan → se limpian de `cameras.json` automáticamente en el próximo save.

**Patterns to follow:** `src/lib/notification-manager.js` estructura actual

**Test scenarios:**
- Happy path: settings tiene token válido + cámara con `telegramEnabled: true` + objeto detectado → notificación enviada
- Error path: settings sin token → `notify()` retorna sin enviar, sin error
- Happy path: cámara con `telegramEnabled: false` → no notifica aunque settings tenga token
- Integration: cambiar token via `PATCH /api/settings` → siguiente detección usa el nuevo token (sin reiniciar)

**Verification:**
- `cameras.json` no contiene `telegramBotToken` ni `telegramChatId` después de un ciclo de save
- Las notificaciones de Telegram siguen llegando con el token movido a `settings.json`
- Deshabilitar `telegramEnabled` en una cámara suprime las notificaciones de esa cámara

---

- [ ] U4. **UI de configuración global — pestaña Config**

**Goal:** Exponer los settings globales (Telegram) en la pestaña "Config" de la UI. Eliminar los campos de token y chatId del panel de cámara individual.

**Requirements:** R2, R3, R4

**Dependencies:** U2, U3

**Files:**
- Modify: `src/components/CameraSetup.js` — agregar sección "Notificaciones" con inputs de token, chatId, botón Probar, y selector de clases
- Modify: `src/components/CameraStream.js` — eliminar inputs de `tgToken` y `tgChatId`; mantener solo el toggle `telegramEnabled` (ya está como botón Bell/BellOff en la action bar)

**Approach:**
- En `CameraSetup`, agregar un bloque "Notificaciones" al final del formulario (o como sección separada). Fetch `GET /api/settings` al montar. Guardar con `PATCH /api/settings` en el evento de submit o con debounce.
- Campos del bloque:
  - Input texto: Bot Token (tipo `password` para ocultarlo)
  - Input texto: Chat ID
  - Botón "Probar": llama a `/api/settings/test` (nuevo sub-endpoint) que envía un mensaje de texto de prueba al chat configurado
  - Checkboxes: clases a notificar (Persona, Auto, Camión, Moto, Colectivo) — con defaults pre-marcados
- En `CameraStream.js`, eliminar los estados `tgToken`, `tgChatId` y sus inputs del panel de settings. El `handleToggleTelegram()` y el `Bell`/`BellOff` en la action bar se mantienen sin cambios.
- Crear sub-endpoint `POST /api/settings/test` que lee el token/chatId actual del settings y envía `"🔔 Vigilancia — test de notificación"` al chat.

**Patterns to follow:**
- `src/components/CameraSetup.js` — estructura de formulario y fetch pattern existentes
- `src/components/CameraStream.js` — `handleToggleTelegram` como ejemplo de PATCH optimístico

**Test scenarios:**
- Happy path: usuario ingresa token y chatId → hace click "Probar" → recibe mensaje en Telegram
- Error path: token inválido → botón "Probar" muestra error inline ("Token inválido o chat no encontrado")
- Happy path: usuario desmarca "Persona" de notifyObjects → detecciones de persona no notifican
- Happy path: cámara con Bell activo + settings con token → notificación llega (integración completa)
- Edge case: settings vacíos → botón "Probar" deshabilitado o muestra "Primero ingresá el token"

**Verification:**
- La pestaña Config muestra la sección Notificaciones con el token guardado pre-relleno
- El token no aparece en el panel de configuración individual de la cámara
- El botón "Probar" envía un mensaje real a Telegram
- Recargar la página no pierde el token (persistencia)

---

## System-Wide Impact

- **Rutas de archivo**: cambiar `public/recordings/` → `data/recordings/` requiere que el operador migre los archivos existentes con un `mv`. Si no se hace, las grabaciones anteriores quedan inaccesibles via la nueva ruta. Documentar en CLAUDE.md.
- **`cameras.json` existente**: los campos `telegramBotToken` y `telegramChatId` se eliminan del schema. Al primer save tras el deploy, desaparecen del archivo. Si el deployment falla a mitad, los tokens se habrán copiado a `settings.json` pero también pueden seguir en `cameras.json` — no es un estado peligroso, la migración es idempotente.
- **Sin cambio en API pública**: las rutas `/api/recordings/`, `/api/screenshots/`, `/api/cameras/` no cambian. Los clientes (mobile, browser) no se ven afectados.
- **Thumbnails en `data/`**: los thumbnails generados en sesiones anteriores están en `public/thumbnails/` — ya no se encontrarán. Se regenerarán automáticamente al primer request de cada video.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Operador no migra archivos en `mv public/recordings/* data/recordings/` — grabaciones previas inaccesibles | Documentar el paso en CLAUDE.md como parte del deploy; el servidor no crashea, solo los archivos previos no aparecen |
| `settings.json` con token en texto plano en el servidor | Igual que `cameras.json` con contraseñas de cámaras — el modelo de seguridad es el servidor privado + Cloudflare Tunnel; no cifrar en v1 |
| Token de Telegram filtrado en logs | `notificationManager` no loguea el token; asegurarse de que los console.error tampoco lo incluyan |
| Dos cámaras con `telegramEnabled: true` durante el periodo de migración — posible envío duplicado | La migración copia el token *antes* de que el servidor empiece a servir requests; no hay ventana de duplicación |

---

## Documentation / Operational Notes

Al hacer deploy de esta versión en el servidor de producción, ejecutar en orden:

```bash
# 1. Migrar archivos al nuevo directorio
mkdir -p data/recordings data/screenshots data/thumbnails
mv public/recordings/* data/recordings/ 2>/dev/null || true
mv public/screenshots/* data/screenshots/ 2>/dev/null || true
mv public/thumbnails/* data/thumbnails/ 2>/dev/null || true

# 2. Pull y build
git pull origin main
npm run build
pm2 restart vigilancia
```

La migración de `settings.json` y limpieza de `cameras.json` ocurre automáticamente en el primer arranque del servidor.

---

## Sources & References

- Related code: `src/lib/camera-utils.js` (CameraManager pattern)
- Related code: `src/lib/notification-manager.js`
- Related code: `src/middleware.ts`
- Related plan: `docs/plans/2026-04-24-001-feat-commercial-product-upgrade-plan.md` (U1 auth fix)
