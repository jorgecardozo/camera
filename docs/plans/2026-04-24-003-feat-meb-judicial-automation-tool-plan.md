---
title: "feat: MEB Judicial Automation Tool — Novedades y Exportación de PDFs"
type: feat
status: active
date: 2026-04-24
---

# feat: MEB Judicial Automation Tool — Novedades y Exportación de PDFs

## Overview

Herramienta Python standalone para automatizar dos flujos manuales repetitivos del abogado
Nicolás en el portal judicial MEB de Bahía Blanca:

1. **Reporte de novedades** — consultar las actualizaciones de las últimas N días en todas las
   causas agrupadas en sus sets, sin entrar causa por causa.
2. **Exportación batch de PDFs** — dado el nombre de una causa, navegar cada paso procesal y
   generar un PDF individual por paso (replicando lo que Nicolás hace manualmente con
   "Imprimir → Microsoft PDF Printer").

El acceso al sistema se hace vía **API directa**: se intercepta el tráfico con Chrome DevTools
para obtener el endpoint de login y el token de sesión, luego se llaman los endpoints JSON
directamente desde el script (más rápido, más barato, más robusto que browser automation).

---

## Problem Frame

Nicolás gestiona más de 100 causas activas en el sistema MEB (portal de gestión judicial de
los Tribunales de Trabajo de Bahía Blanca). Dos tareas le consumen tiempo innecesario:

- **Revisar novedades**: debe entrar tribunal por tribunal, set por set, para ver si salió
  alguna resolución, audiencia o notificación. Si no hay nada ese día, igual gastó el tiempo.
- **Exportar pasos procesales**: para preparar alegatos o armar el expediente digital, exporta
  cada paso a PDF uno a uno desde el navegador (imprimir → guardar). En causas complejas
  puede llevar 20+ minutos.

Un colega abogado ya implementó algo similar con Claude. El objetivo es que Nicolás tenga
una herramienta equivalente o mejor, con API directa en lugar de browser automation.

---

## Requirements Trace

- R1. Autenticarse en MEB con las credenciales de Nicolás y mantener el token válido durante
  la sesión.
- R2. Dado un rango de fechas (ej. últimos 4 días), recuperar todas las novedades de todos
  los juzgados disponibles y presentarlas agrupadas por causa, ordenadas por fecha.
- R3. Dado el nombre o ID de una causa, listar todos los pasos procesales disponibles.
- R4. Para cada paso procesal, generar un PDF individual que reproduzca fielmente el
  contenido HTML (incluyendo adjuntos descargados por separado si no pueden renderizarse).
- R5. Los PDFs deben guardarse en una carpeta con estructura `<causa>/<NNN>_<tipo_paso>.pdf`.
- R6. El reporte de novedades y los errores deben ser legibles por un humano no técnico.
- R7. La herramienta debe correr en la máquina de Nicolás sin dependencias complejas de
  servidor.

---

## Scope Boundaries

- No incluye búsqueda exhaustiva en causas ajenas (art. 247 LCT etc.) — costoso en tokens
  y tiempo, puede considerarse en iteración futura.
- No incluye redacción ni envío de emails (función separada de Gmail MCP).
- No incluye scheduling/cron automático — Nicolás ejecuta el script cuando quiere el reporte.
- No incluye interfaz web o GUI — solo CLI.
- No incluye análisis legal del contenido con IA — esto es extracción/exportación de datos.
- No reemplaza ni modifica el sistema MEB — solo lo lee.

### Deferred to Follow-Up Work

- Búsqueda fulltext dentro de causas ajenas (cuando se conozca si hay API de búsqueda).
- Envío automático del reporte diario por email (una vez validado el flujo base).
- Modo interactivo para elegir sets/juzgados específicos.

---

## Context & Research

### Relevant Code and Patterns

- Herramienta standalone — **no vive dentro del repo de cámaras**. Se crea como proyecto
  independiente en `~/Documents/development/meb-assistant/`.
- El patrón de `requests` + token header es estándar en cualquier API REST con auth Bearer.
- Playwright `page.pdf()` replica exactamente el "Imprimir → Guardar como PDF" del navegador.

### Institutional Learnings

- Ninguna (proyecto nuevo, sin historial en `docs/solutions/`).

### External References

- Playwright Python docs: `https://playwright.dev/python/docs/api/class-page#page-pdf`
- `typer` CLI framework: `https://typer.tiangolo.com/`
- `python-dotenv` para config local: `https://pypi.org/project/python-dotenv/`

---

## Key Technical Decisions

- **Python sobre Node/bash**: ecosistema rich para HTTP, PDF, CLI; fácil de instalar en
  Windows/Mac con un solo `pip install -r requirements.txt`.
- **API directa sobre browser automation**: más rápido, más barato en tokens, sin riesgo de
  que un captcha o redirección rompa el flujo. Requiere reverse-engineering manual de los
  endpoints una vez (U1).
- **Playwright para PDFs**: `page.pdf()` produce el mismo resultado que "Imprimir → PDF"
  en Chrome, incluyendo estilos CSS y layout correcto. Alternativa `weasyprint` descartada
  por inconsistencias de render con CSS moderno.
- **Token en `.env`**: las credenciales no van hardcodeadas; `.env` en la máquina de Nicolás.
  El `.gitignore` excluye `.env` del repositorio si lo hubiera.
- **Carpeta de salida configurable**: por defecto `~/Documents/MEB-Exports/`, configurable
  en `.env`.

---

## Open Questions

### Resolved During Planning

- **¿Playwright o weasyprint para PDFs?** Playwright — ver Key Technical Decisions.
- **¿Dónde vive el proyecto?** Directorio standalone `meb-assistant/`, no dentro del repo
  de cámaras.
- **¿Scheduling?** No en esta iteración — ejecución manual por Nicolás.

### Deferred to Implementation

- **Formato exacto del token MEB**: ¿Bearer JWT, cookie de sesión, o header custom?
  Se determinará en U1 (API discovery).
- **Estructura de la respuesta de novedades**: ¿viene paginada? ¿cuántos campos tiene?
  Se documentará en U1.
- **¿Los adjuntos de pasos procesales son URLs descargables o iframes embebidos?**
  Determina si se descargan por separado o se capturan con Playwright automáticamente.
- **¿El login expira durante una sesión larga?** (ej. al exportar 30+ pasos). Si sí,
  implementar refresh automático en el cliente.

---

## Output Structure

```
meb-assistant/
├── meb/
│   ├── __init__.py
│   ├── auth.py           # Login, token storage en memoria
│   ├── client.py         # MebClient: HTTP requests con auth header + retry 401
│   ├── cases.py          # list_cases(), get_novedades(days), list_pasos(case_id)
│   ├── exporter.py       # export_paso_as_pdf(url, output_path) via Playwright
│   └── formatter.py      # Formatea novedades como texto legible
├── cli.py                # Entry point: comandos `novedades` y `exportar`
├── config.py             # Carga .env: MEB_USER, MEB_PASS, OUTPUT_DIR
├── .env.example          # Plantilla de configuración
├── requirements.txt
├── docs/
│   └── meb_api.md        # Documentación de endpoints descubiertos en U1
└── README.md             # Instrucciones de uso para Nicolás
```

---

## High-Level Technical Design

> *Esto ilustra el enfoque previsto como guía de dirección para revisión, no como especificación de implementación.*

```
Nicolás ejecuta:
  $ python cli.py novedades --dias 4

  1. config.py carga .env → MEB_USER, MEB_PASS, OUTPUT_DIR
  2. auth.py  →  POST /api/login  →  { token }
  3. cases.py →  GET /api/sets    →  [ { set_id, set_name } ]
  4. Por cada set:
       GET /api/novedades?set_id=X&desde=2026-04-20  →  [ { causa, fecha, tipo, descripcion } ]
  5. formatter.py agrupa por causa, ordena por fecha
  6. Imprime reporte en terminal + guarda novedades_2026-04-24.txt

  ─────────────────────────────────────────────────────

  $ python cli.py exportar --causa "Álvarez Olga"

  1. auth (igual que arriba)
  2. cases.py → busca causa por nombre → case_id
  3. cases.py → GET /api/causa/{case_id}/pasos → [ { paso_id, tipo, url } ]
  4. Por cada paso:
       exporter.py:
         a. Playwright navega a paso.url con cookie/header de auth
         b. page.pdf() → guarda OUTPUT_DIR/Álvarez Olga/001_demanda.pdf
         c. Si hay adjunto descargable: descarga y copia como 001_demanda_adjunto.pdf
  5. Imprime resumen: "Exportados 7 pasos. Carpeta: ~/Documents/MEB-Exports/Álvarez Olga/"
```

---

## Implementation Units

- [ ] U1. **Descubrimiento de la API MEB**

**Goal:** Documentar todos los endpoints necesarios para las dos funcionalidades antes de
escribir código. Sin esto, ninguna unidad posterior puede ser precisa.

**Requirements:** R1, R2, R3

**Dependencies:** None (trabajo manual previo al código)

**Files:**
- Create: `meb-assistant/docs/meb_api.md`

**Approach:**
- Con Chrome DevTools (tab Network) abierto, Nicolás (o Jorge con las credenciales de Nicolás)
  navega el sistema MEB realizando las acciones de login, consulta de novedades, y click en
  un paso procesal.
- Registrar para cada acción: URL, método HTTP, headers de request (especialmente el de auth),
  body del request, estructura del response JSON.
- Endpoints mínimos a documentar: login, list sets, novedades por set y rango de fechas,
  list casos/causas, detail de causa, list pasos procesales, detail de paso (URL del
  contenido HTML), descarga de adjunto.
- Documentar si el token es Bearer JWT (decodificable), cookie, o header custom.
- Documentar si el login retorna el token una sola vez o si hay refresh.

**Test scenarios:**
- Test expectation: none — esta unidad produce documentación, no código.

**Verification:**
- `docs/meb_api.md` tiene al menos 6 endpoints documentados con URL, método, auth format,
  y ejemplo de response.
- Se puede hacer un `curl` manual de cada endpoint con el token capturado y obtener 200.

---

- [ ] U2. **Auth + HTTP client**

**Goal:** Módulo de autenticación y cliente HTTP que todas las demás unidades usan para
hacer requests autenticados al sistema MEB.

**Requirements:** R1

**Dependencies:** U1 (conocer el endpoint de login y el formato del token)

**Files:**
- Create: `meb-assistant/meb/auth.py`
- Create: `meb-assistant/meb/client.py`
- Create: `meb-assistant/config.py`
- Create: `meb-assistant/.env.example`
- Create: `meb-assistant/requirements.txt`
- Test: `meb-assistant/tests/test_auth.py`

**Approach:**
- `auth.py`: función `login(username, password) → token`; el token se guarda en memoria
  (variable de módulo), no en disco.
- `client.py`: clase `MebClient` con método `get(path, params)` que inyecta el auth header
  automáticamente. Si recibe 401, hace re-login una vez y reintenta (maneja token expirado).
- `config.py`: carga `MEB_USER`, `MEB_PASS`, `MEB_BASE_URL`, `OUTPUT_DIR` desde `.env`
  usando `python-dotenv`. Falla rápido con mensaje claro si faltan.
- `requirements.txt` mínimo: `requests`, `playwright`, `typer`, `python-dotenv`.

**Patterns to follow:**
- Patron singleton para el token: no re-login en cada request, solo si el anterior falló.

**Test scenarios:**
- Happy path: `login()` con credenciales válidas mockeadas retorna token no-vacío.
- Error path: `login()` con password incorrecto (mock 401) levanta `AuthError` con mensaje
  claro "Credenciales incorrectas — verificar MEB_USER y MEB_PASS en .env".
- Edge case: `MebClient.get()` recibe 401 → reintenta con login fresco → si el segundo
  intento también falla, levanta excepción (no loop infinito).
- Edge case: faltan variables de entorno → `config.py` imprime cuáles faltan y sale con
  código 1.

**Verification:**
- `pytest tests/test_auth.py` pasa con mocks de `requests`.
- `python -c "from meb.client import MebClient"` no falla con import errors.

---

- [ ] U3. **Fetcher de casos y novedades**

**Goal:** Consultar los sets del usuario, recuperar las novedades de los últimos N días, y
devolver una estructura lista para formatear.

**Requirements:** R2

**Dependencies:** U2

**Files:**
- Create: `meb-assistant/meb/cases.py`
- Create: `meb-assistant/meb/formatter.py`
- Test: `meb-assistant/tests/test_cases.py`

**Approach:**
- `cases.py`:
  - `list_sets() → list[Set]`
  - `get_novedades(set_id, desde_dias=4) → list[Novedad]`
  - Itera todos los sets automáticamente para dar una vista unificada.
  - `Novedad` tiene campos: `causa_nombre`, `juzgado`, `fecha`, `tipo`, `descripcion`.
- `formatter.py`:
  - `format_novedades_report(novedades: list[Novedad], dias: int) → str`
  - Agrupa por causa, ordena cronológicamente, indica cuando una causa no tuvo novedades
    solo si el usuario la pidió explícitamente (no spam vacío).
  - Genera también archivo `novedades_YYYY-MM-DD.txt` en `OUTPUT_DIR`.

**Patterns to follow:**
- Usar dataclasses o named tuples para `Novedad` y `Set` — sin ORM, sin clases complejas.

**Test scenarios:**
- Happy path: response mock con 3 sets y 5 novedades → `get_novedades()` retorna lista
  correcta; `format_novedades_report()` agrupa por causa y las imprime ordenadas.
- Edge case: ninguna novedad en los últimos 4 días → reporte dice "Sin novedades en los
  últimos 4 días." (no lista vacía silenciosa).
- Edge case: una causa tiene 2 novedades el mismo día → ambas aparecen en el reporte.
- Error path: endpoint de novedades retorna 500 → se loguea el error con el nombre del
  set afectado y continúa con los demás sets (no aborta todo).

**Verification:**
- `pytest tests/test_cases.py` pasa con datos mockeados.
- El output de `formatter.py` es legible sin conocimiento técnico (sin JSON crudo, sin IDs).

---

- [ ] U4. **Exportador batch de PDFs via Playwright**

**Goal:** Dado el identificador de una causa, descargar cada paso procesal como PDF
individual usando Playwright, replicando el resultado del "Imprimir → PDF" del navegador.

**Requirements:** R3, R4, R5

**Dependencies:** U2, U1 (conocer la URL de cada paso procesal y cómo pasar la auth)

**Files:**
- Create: `meb-assistant/meb/exporter.py`
- Test: `meb-assistant/tests/test_exporter.py`

**Approach:**
- `cases.py` (extender): agregar `find_case_by_name(name) → Case`, `list_pasos(case_id)
  → list[Paso]`. `Paso` tiene `numero`, `tipo`, `url_html`, `url_adjunto` (puede ser None).
- `exporter.py`:
  - Lanza un browser Playwright en modo headless.
  - Para cada paso: navega a `paso.url_html` inyectando el auth header/cookie de la
    sesión activa; llama `page.pdf(path=output_path, format='A4', print_background=True)`.
  - Nombre de archivo: `NNN_tipo_paso.pdf` con padding de ceros (001, 002, …).
  - Si `paso.url_adjunto` existe: descarga el PDF adjunto con `requests` y lo guarda como
    `NNN_tipo_paso_adjunto.pdf`.
  - Crea la carpeta `OUTPUT_DIR/<causa_nombre>/` si no existe.
- Imprime barra de progreso simple (`[3/7] Exportando: demanda traslado...`).

**Patterns to follow:**
- `playwright.sync_api` (no async) para simplicidad en script secuencial.
- Inyectar auth como cookie de browser: `context.add_cookies([{...}])` si el sistema
  usa cookies; como extra HTTP header si usa Bearer.

**Test scenarios:**
- Happy path: mock de lista de pasos con 3 items → se crean 3 PDFs en la carpeta correcta.
- Edge case: paso sin adjunto → solo se genera `001_demanda.pdf`, no falla buscando adjunto.
- Edge case: paso con adjunto → se generan `001_demanda.pdf` + `001_demanda_adjunto.pdf`.
- Edge case: nombre de causa con caracteres especiales (`/`, `:`) → se sanitiza para nombre
  de carpeta válido en Windows y macOS.
- Error path: Playwright no puede navegar a la URL del paso (timeout) → se loguea el error
  con el número de paso y continúa con los demás (no aborta la exportación completa).
- Integration: con credenciales reales y un caso de prueba real → los PDFs generados son
  visualmente idénticos al resultado manual de "Imprimir → PDF".

**Verification:**
- `pytest tests/test_exporter.py` pasa con Playwright en modo mock/stubbed.
- Test manual con una causa real produce PDFs abribles y con el contenido correcto.
- La carpeta de salida tiene el nombre de la causa y los PDFs numerados en orden.

---

- [ ] U5. **CLI interface + setup de instalación**

**Goal:** Interface de línea de comandos simple que Nicolás pueda usar sin conocimiento
técnico, más documentación de instalación.

**Requirements:** R6, R7

**Dependencies:** U3, U4

**Files:**
- Create: `meb-assistant/cli.py`
- Create: `meb-assistant/README.md`
- Modify: `meb-assistant/requirements.txt` (validar que está completo)

**Approach:**
- `cli.py` con `typer`:
  - Comando `novedades` con opción `--dias` (default 4).
    Llama U3, imprime el reporte en terminal y guarda el `.txt`.
  - Comando `exportar` con opción `--causa` (nombre parcial, case-insensitive).
    Llama U4, muestra progreso, imprime resumen final con ruta de la carpeta.
  - Manejo de errores global: si algo falla, mensaje claro en español sin stack trace
    (a menos que se use `--debug`).
- `README.md` con secciones: Requisitos, Instalación (paso a paso), Configuración (.env),
  Uso (ejemplos concretos de los dos comandos), Problemas comunes.
- Instrucciones de instalación de Playwright browsers: `playwright install chromium`.

**Test scenarios:**
- Happy path: `python cli.py novedades --dias 4` con mocks → imprime reporte y retorna
  código de salida 0.
- Happy path: `python cli.py exportar --causa "alvarez"` (minúsculas, parcial) → encuentra
  la causa y comienza exportación.
- Edge case: `--causa` con un nombre que matchea 0 causas → mensaje "No se encontró ninguna
  causa con ese nombre. Causas disponibles: [lista]".
- Edge case: `--causa` con un nombre que matchea 2+ causas → pide al usuario que sea más
  específico y lista los matches.
- Error path: `.env` no existe → mensaje "No se encontró el archivo .env. Copiá .env.example
  a .env y completá tus credenciales."

**Verification:**
- `python cli.py --help` muestra los dos comandos con sus opciones.
- Un abogado sin conocimiento técnico puede instalar y usar la herramienta siguiendo solo
  el README.

---

## System-Wide Impact

- **Interaction graph:** Herramienta standalone — no modifica ningún sistema. Solo consume
  la API de MEB en modo lectura. No hay callbacks ni middlewares.
- **Error propagation:** Errores de red o de auth se capturan en `MebClient` y se propagan
  como excepciones tipadas (`AuthError`, `ApiError`). La CLI los convierte a mensajes en
  español legibles.
- **State lifecycle risks:** El token MEB expira; si una exportación de 30+ pasos dura más
  que el TTL del token, el re-login automático en `MebClient` cubre este caso.
- **API surface parity:** N/A — no hay otras interfaces.
- **Integration coverage:** El test de integración real (U4 Verification) contra una causa
  real es el único que puede validar que el render de PDFs es correcto — los unit tests con
  mocks no lo prueban.
- **Unchanged invariants:** El sistema MEB no se modifica; esta herramienta es puramente
  de lectura.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| La API de MEB no está documentada y puede cambiar sin aviso | Los endpoints se concentran en `meb/client.py`; si cambia una URL, se actualiza en un lugar. El README documenta cómo re-descubrir endpoints. |
| El sistema MEB usa captcha o bloqueo por IP ante muchos requests | Agregar `time.sleep(1)` entre requests de exportación; no paralelizar. Si hay captcha, caer a browser automation como plan B. |
| Playwright no inyecta bien la auth en el render del paso procesal | Verificar en U1 si el sistema usa cookies o Bearer. Si usa cookies, `context.add_cookies()` funciona. Si usa Bearer en header, se necesita `page.set_extra_http_headers()`. |
| El sistema MEB solo está disponible en horario judicial (potencial) | Sin mitigación en esta iteración — Nicolás ejecuta el script cuando lo necesita. |
| Credenciales de Nicolás en `.env` en su máquina | Aceptable para uso personal. `.gitignore` incluye `.env`. No se sube a ningún repositorio público. |

---

## Documentation / Operational Notes

- `README.md` en el proyecto incluye instrucciones de instalación en Windows (Python.org,
  `pip`, `playwright install chromium`).
- La primera ejecución requiere que Nicolás corra `playwright install chromium` (descarga
  ~150 MB). Mencionar en README.
- Si el token cambia de formato en el futuro, la sección "Problemas comunes" del README
  explica cómo usar DevTools para re-capturar el endpoint de login.

---

## Sources & References

- Playwright Python PDF: `https://playwright.dev/python/docs/api/class-page#page-pdf`
- typer CLI: `https://typer.tiangolo.com/`
- Sistema MEB (portal judicial Bahía Blanca): URL a confirmar en U1
