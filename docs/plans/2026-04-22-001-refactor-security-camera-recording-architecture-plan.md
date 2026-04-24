---
title: "refactor: Security Camera System — Fix Recording Architecture & Reliability"
type: refactor
status: active
date: 2026-04-22
---

# refactor: Security Camera System — Fix Recording Architecture & Reliability

## Overview

The system has a fundamental architectural flaw: the recording pipeline opens a **second independent RTSP connection** to each camera, separate from the viewer stream. This wastes bandwidth, may hit camera connection limits (most cheap WiFi cameras cap at 1–2 concurrent streams), and adds 2–5 s of startup delay every time recording begins. The `StreamManager` already has a `state.recorder` slot intended to share the decoded frames, but it was never wired to the recording API.

This plan fixes the recording architecture, adds disk retention, introduces continuous-recording mode, and patches the most critical security gaps.

---

## Problem Frame

Target: WiFi IP security cameras (RTSP) running in a home/small-office LAN.

Known failure modes:
1. **Dual RTSP connections** — each recording starts its own FFmpeg against RTSP, doubling load while the viewer is open.
2. **Recording startup delay** — a new RTSP negotiation takes 2–5 s; footage from that window is lost.
3. **`state.recorder` dead code** — `stream-manager.js` has the frame-pipe hook (`state.recorder.stdin.write(frame)`) but `state.recorder` is always `null`; nothing sets it.
4. **Dead `stream.js`** — `src/pages/api/cameras/[id]/stream.js` re-encodes to `video/mp4` (actually MPEG-TS, wrong Content-Type) and spawns one FFmpeg per viewer; not used by the UI.
5. **No disk retention** — recordings accumulate forever; a running system will fill disk.
6. **No continuous recording** — must click manually; unsuitable for security use.
7. **`isRecording` state lost on restart** — in-memory Map; server restart orphans recording processes.
8. **Credential exposure** — presets in `CameraSetup.js` contain real credentials; `cameras.json` not in `.gitignore`.
9. **No app-level authentication** — the UI is accessible to anyone on the LAN with no login.

---

## Requirements Trace

- R1. A camera being watched and recorded must use a **single RTSP connection** (one FFmpeg decode process).
- R2. When recording starts, the first written frame must come from the **already-running stream** (≤1 keyframe interval delay, not 2–5 s RTSP startup).
- R3. `StreamManager.startRecorder` / `stopRecorder` must wire `state.recorder` so frames are piped from the shared decode loop.
- R4. Old recordings must be pruned automatically (configurable max age or max disk usage).
- R5. A "continuous recording" mode must keep each camera recording indefinitely without user interaction.
- R6. `isRecording` state must survive a server restart by persisting it in `cameras.json`.
- R7. `cameras.json` must be excluded from git; default preset credentials must be removed from source code.
- R8. The app must require a password (env-var configurable) before granting access to streams, recordings, and controls.

---

## Scope Boundaries

- No cloud storage integration (out of scope).
- No motion detection (separate future feature).
- No multi-user accounts — single shared password is sufficient for the stated use case.
- ONVIF-based PTZ remains as-is; only the recording/stream plumbing changes.
- Mobile-native app out of scope — the Next.js web UI is sufficient.

---

## Context & Research

### Relevant Code and Patterns

- `src/lib/stream-manager.js` — shared MJPEG decode loop; `state.recorder` slot already exists at line 67, never set.
- `src/lib/camera-utils.js:59–98` — `startRecording()` spawns independent FFmpeg directly to RTSP; this is the root cause.
- `src/pages/api/cameras/[id]/recording.js` — thin route that calls `cameraManager.startRecording(id)`.
- `src/pages/api/cameras/[id]/mjpeg.js` — correctly delegates to `streamManager.addClient()`; recording should follow the same pattern.
- `src/pages/api/cameras/[id]/stream.js` — dead code: separate FFmpeg per viewer, wrong Content-Type header, not wired in UI.
- `src/components/CameraSetup.js:68–97` — hardcoded presets with real IP and password (`mf6n5e`).

### Key Architectural Insight: The Right Recording Flow

```
RTSP camera
    │
    ▼
FFmpeg (stream-manager, one per camera)
    │  decodes MJPEG frames
    ├──► [MJPEG clients]  (unchanged)
    └──► recorder FFmpeg stdin  ← NEW: pipe frames here
              │
              ▼
         MP4 file on disk
```

The recorder FFmpeg reads raw JPEG frames on stdin (`-f image2pipe -vcodec mjpeg -i pipe:0`) and muxes them into an MP4. This is the pattern the existing `state.recorder.stdin.write(frame)` hook was built for — it just needs to be activated.

### Institutional Learnings

- No `docs/solutions/` directory exists yet — this is a greenfield project.

---

## Key Technical Decisions

- **Recorder takes frames from stream-manager, not RTSP directly**: eliminates the dual-connection problem and startup delay.
- **Recorder FFmpeg command**: `ffmpeg -f image2pipe -vcodec mjpeg -framerate 25 -i pipe:0 -c:v copy -movflags +frag_keyframe+empty_moov+default_base_moof -f mp4 <output>`. `-c:v copy` avoids re-encoding (MJPEG → MJPEG in MP4 container). If H.264 output is required, change to `-c:v libx264 -preset ultrafast`.
- **Disk retention**: cron-style cleanup on startup and every hour; configurable via env vars `MAX_RECORDING_AGE_HOURS` (default 72) and `MAX_RECORDINGS_GB` (default 10).
- **Continuous recording**: flag per camera in `cameras.json` (`continuousRecord: true`); `StreamManager` restarts the recorder automatically on stream reconnect if the flag is set.
- **App authentication**: Next.js middleware (`src/middleware.ts`) with HTTP Basic Auth using env var `APP_PASSWORD`. Stateless — no sessions, no DB.
- **Credentials in presets**: replace with placeholder values; instruct user to fill in via `.env.local`.
- **`cameras.json` in `.gitignore`**: add immediately.
- **`stream.js` removal**: delete; it was never used and creates confusion.

---

## Open Questions

### Resolved During Planning

- **Should the recorder use MJPEG-in-MP4 or re-encode to H.264?**: MJPEG-in-MP4 is chosen for zero CPU overhead; `c:v copy` passes frames through directly. H.264 re-encoding can be added as an option later.
- **Audio in recordings?**: The shared stream-manager decode path is video-only (MJPEG). Audio requires a separate RTSP audio track or a second lightweight FFmpeg for audio only. Defer — video-only recordings are acceptable for now; the current implementation already drops audio anyway.
- **Where to persist recording state?**: Extend `cameras.json` with `isRecording` and `continuousRecord` flags. Simpler than a separate state file.

### Deferred to Implementation

- **Exact MP4 fragment size tuning**: depends on observed playback buffering in the browser; start with `frag_keyframe` and adjust.
- **Whether to tombstone orphaned recording files on startup**: check for `.mp4` files with 0 bytes or very small size (incomplete recordings) and either delete or rename them.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification.*

```
Recording start request (POST /api/cameras/:id/recording)
    │
    ▼
streamManager.startRecorder(cameraId, camera)
    │   spawns recorder FFmpeg reading from stdin
    │   sets state.recorder = ffmpegProcess
    │   returns { filename }
    │
    ▼  (frame loop in stream-manager.js already pipes here at line 67)
recorder FFmpeg stdin ← JPEG frames
    │
    ▼
MP4 file in public/recordings/

Recording stop request (DELETE /api/cameras/:id/recording)
    │
    ▼
streamManager.stopRecorder(cameraId)
    │   sends SIGTERM to state.recorder
    │   state.recorder = null
```

State transitions for a camera:

```
IDLE ──startViewer──► STREAMING
                          │
                    startRecorder
                          ▼
                   STREAMING+RECORDING
                          │
                    stopRecorder
                          │
                          ▼
                       STREAMING
```

Continuous mode: when `continuousRecord: true`, `stopRecorder` is not called; `_spawn` restart loop calls `startRecorder` automatically after reconnect.

---

## Implementation Units

- [ ] U1. **Wire `state.recorder` in StreamManager — eliminate dual RTSP connection**

**Goal:** Move recording control into `StreamManager` so the recorder piggybacks on the existing MJPEG decode loop, eliminating the second RTSP connection and the startup delay.

**Requirements:** R1, R2, R3

**Dependencies:** None

**Files:**
- Modify: `src/lib/stream-manager.js`
- Modify: `src/lib/camera-utils.js` (remove `startRecording` / `stopRecording`, or thin them to delegate)
- Modify: `src/pages/api/cameras/[id]/recording.js`

**Approach:**
- Add `startRecorder(cameraId, camera)` to `StreamManager`: spawns a recorder FFmpeg process reading from `stdin` (`-f image2pipe -vcodec mjpeg -i pipe:0`), sets `state.recorder`, returns `{ filename }`.
- Add `stopRecorder(cameraId)` to `StreamManager`: sends SIGTERM, clears `state.recorder`.
- The existing frame-pipe hook at `stream-manager.js:67` already does `state.recorder.stdin.write(frame)` — activating `state.recorder` is the only change needed in the loop.
- Update `recording.js` API route to call `streamManager.startRecorder` / `streamManager.stopRecorder` instead of `cameraManager`.
- If no viewer is currently connected when recording starts, `startRecorder` must still call `_getOrCreate` to ensure the decode process is running.
- On recorder FFmpeg close event: clear `state.recorder`, update camera `isRecording` flag; if `continuousRecord` is set, schedule restart.
- Remove `startRecording` and `stopRecording` from `CameraManager` in `camera-utils.js` (or keep thin stubs that delegate to `streamManager` for backward compat — prefer removal).

**Patterns to follow:**
- `streamManager.addClient` pattern — `_getOrCreate` to ensure the stream is live, then attach.

**Test scenarios:**
- Happy path: Start recording while viewer is open → single FFmpeg process in `streamManager.streams` for that camera, `state.recorder` is non-null, frames are written to the MP4 within 1 keyframe interval (≤1 s at 25 fps).
- Happy path: Start recording without viewer open → `_getOrCreate` spawns the decode process, recorder attaches and receives frames.
- Happy path: Stop recording → `state.recorder` is null, file is complete and playable.
- Edge case: Viewer disconnects while recording → recording continues uninterrupted, decode process stays alive.
- Edge case: Camera goes offline while recording → FFmpeg close event clears `state.recorder`, recorder reconnects when stream recovers.
- Edge case: `startRecorder` called while already recording → return 409 or no-op with existing filename.
- Integration: Verify only one RTSP connection is open (check process list — only one `ffmpeg -i rtsp://...` for that camera).

**Verification:**
- `ps aux | grep ffmpeg | grep rtsp` shows exactly one process per camera regardless of viewer+recorder being active.
- Recorded file is valid MP4 (playable in browser, non-zero duration).
- First frame timestamp in recorded file is within 1 s of recording start.

---

- [ ] U2. **Remove dead `stream.js` and fix `CameraStream` to use MJPEG only**

**Goal:** Delete the unused H.264/MPEG-TS stream endpoint to eliminate architectural confusion and unused FFmpeg-per-viewer risk.

**Requirements:** R1 (indirect — removes competing architecture)

**Dependencies:** None (can run in parallel with U1)

**Files:**
- Delete: `src/pages/api/cameras/[id]/stream.js`
- Verify no import: `src/components/CameraStream.js` (already uses `/mjpeg`, confirmed)

**Approach:**
- Delete the file. No UI code references it.
- If `stream.js` is referenced anywhere (grep first), update those references to `/mjpeg` before deleting.

**Test scenarios:**
- Test expectation: none — pure deletion of unused file, no behavioral change.

**Verification:**
- `grep -r "cameras/.*stream" src/` returns no results referencing the stream route (MJPEG references are fine).

---

- [ ] U3. **Add disk retention / automatic cleanup**

**Goal:** Prevent disk exhaustion by pruning recordings older than a configurable age or when total size exceeds a threshold.

**Requirements:** R4

**Dependencies:** U1 (recordings must use the new path before cleaning them)

**Files:**
- Create: `src/lib/retention.js`
- Modify: `src/pages/api/cameras/[id]/recording.js` (or a new route) to call cleanup on start
- Modify: `src/lib/camera-utils.js` — call retention on `CameraManager` init

**Approach:**
- `cleanOldRecordings(opts)`: reads `public/recordings/`, sorts by `mtime`, removes files older than `MAX_RECORDING_AGE_HOURS` env var (default 72 h) OR removes oldest files until total size is under `MAX_RECORDINGS_GB` env var (default 10 GB). Age check runs first.
- Run on server startup and every hour (use `setInterval` in the module singleton — acceptable since Next.js runs as a long-lived Node process in dev/production; for serverless, defer).
- Log which files are removed and why (to stdout, no library needed).
- Expose a `GET /api/files/retention-status` endpoint returning `{ totalGB, maxGB, oldestFile, newestFile, count }` for the UI to display.

**Test scenarios:**
- Happy path: 5 recordings, 3 older than 72 h → those 3 are deleted, 2 remain.
- Edge case: Total size is 12 GB, max is 10 GB → oldest files deleted until under 10 GB.
- Edge case: No recordings directory → function returns without error.
- Edge case: `MAX_RECORDING_AGE_HOURS=0` (disabled) → age-based deletion skipped, size check still applies.
- Error path: File deletion fails (permissions) → log error, continue with next file, do not crash.

**Verification:**
- After seeding `public/recordings/` with dummy files of known ages, running `cleanOldRecordings` removes the expected files and leaves the rest.

---

- [ ] U4. **Continuous recording mode**

**Goal:** Each camera can be flagged `continuousRecord: true`; the system keeps it recording at all times, restarting the recorder automatically after stream recovery.

**Requirements:** R5

**Dependencies:** U1 (recorder wired into StreamManager)

**Files:**
- Modify: `src/lib/stream-manager.js` — auto-restart recorder on reconnect if `camera.continuousRecord`
- Modify: `src/lib/camera-utils.js` — `registerCamera` accepts `continuousRecord` flag; save to `cameras.json`
- Modify: `src/pages/api/cameras/index.js` — pass `continuousRecord` from POST body
- Modify: `src/components/CameraSetup.js` — add "Grabación continua" toggle in the form
- Modify: `src/components/CameraStream.js` — show lock icon when `continuousRecord` is true (can't manually stop)

**Approach:**
- After `_spawn` restarts (the `close` handler's `setTimeout` callback), check `state.camera.continuousRecord`; if true, call `this.startRecorder(state.cameraId, state.camera)` automatically.
- On stream-manager init, iterate cameras from `cameraManager` that have `continuousRecord: true` and call `_getOrCreate` + `startRecorder` for each.
- Segment continuous recordings by time: start a new file every N minutes (configurable via `RECORDING_SEGMENT_MINUTES`, default 30). Implemented by: stopping the current recorder and starting a new one on a timer within `startRecorder`.

**Test scenarios:**
- Happy path: Camera with `continuousRecord: true` starts recording on server boot.
- Happy path: Camera stream drops and reconnects → recorder restarts automatically, new file started.
- Edge case: Manual "Stop" button when `continuousRecord: true` → button is disabled or absent; API returns 409.
- Edge case: Segment timer fires → current recording stops cleanly, new file starts without gap > 1 s.

**Verification:**
- After server restart with `continuousRecord: true`, a new recording file appears in `public/recordings/` within 10 s without any user action.

---

- [ ] U5. **Persist `isRecording` and recording state across restarts**

**Goal:** `cameras.json` reflects the actual recording state so the UI shows correct status after a server restart.

**Requirements:** R6

**Dependencies:** U1

**Files:**
- Modify: `src/lib/camera-utils.js` — `_save()` already strips `isRecording` before writing; change it to include `isRecording` and `continuousRecord`.
- Modify: `src/lib/stream-manager.js` — call `cameraManager` to update `isRecording` when recorder starts/stops.

**Approach:**
- `_save()`: include `isRecording` and `continuousRecord` in the JSON (currently excluded via destructuring).
- On server startup, `StreamManager` reads cameras, finds any with `isRecording: true`, and resumes recording via `startRecorder`.
- Accept that recordings in progress at crash time will produce an incomplete file — tombstone recovery (rename `.mp4` to `.mp4.incomplete`) is a nice-to-have, deferred.

**Test scenarios:**
- Happy path: Recording is active, server restarts → `cameras.json` shows `isRecording: true`, recording resumes on startup.
- Edge case: Camera is unreachable at startup despite `isRecording: true` → FFmpeg fails, retry loop handles it, state stays `isRecording: true` until successful.
- Edge case: `continuousRecord: true` and `isRecording: true` in JSON → only one recorder started, not two.

**Verification:**
- After a forced server restart (`kill -9` the Node process), a new recording file appears within 10 s for cameras that were recording before the restart.

---

- [ ] U6. **Security hardening — auth middleware and credential hygiene**

**Goal:** Protect the app with a single shared password; remove real credentials from source code; exclude `cameras.json` from git.

**Requirements:** R7, R8

**Dependencies:** None (can run in parallel with all other units)

**Files:**
- Create: `src/middleware.ts`
- Create: `.env.local.example`
- Modify: `.gitignore` — add `cameras.json`, `.env.local`
- Modify: `src/components/CameraSetup.js` — replace real credentials in presets with placeholder values
- Modify: `next.config.ts` — ensure `APP_PASSWORD` env var is accessible server-side only (not `NEXT_PUBLIC_`)

**Approach:**
- `src/middleware.ts`: intercept all requests; if `APP_PASSWORD` env var is set and the request doesn't carry a valid `Authorization: Basic ...` header matching `APP_PASSWORD`, respond `401 WWW-Authenticate: Basic realm="Vigilancia"`.
- Skip auth for static Next.js internals (`/_next/`).
- Browser will prompt for password automatically via HTTP Basic Auth.
- Presets in `CameraSetup.js`: replace `password: 'mf6n5e'` and real IPs with `password: ''` and example IPs (`192.168.1.x`). The user fills in their own cameras.
- `.gitignore`: add `cameras.json` and `.env.local`.
- `.env.local.example`: document `APP_PASSWORD`, `MAX_RECORDING_AGE_HOURS`, `MAX_RECORDINGS_GB`, `RECORDING_SEGMENT_MINUTES`.

**Test scenarios:**
- Happy path: `APP_PASSWORD` not set → auth middleware skips (open access, local dev default).
- Happy path: `APP_PASSWORD=secret`, request without auth header → 401 with `WWW-Authenticate` header.
- Happy path: `APP_PASSWORD=secret`, request with correct Basic Auth → passes through.
- Edge case: `/_next/static/` requests → never blocked (middleware matcher excludes them).
- Error path: Malformed Base64 in auth header → treated as no-auth → 401.

**Verification:**
- With `APP_PASSWORD=test` set: `curl http://localhost:3000/api/cameras` returns 401; `curl -u :test http://localhost:3000/api/cameras` returns 200.
- `cameras.json` is listed in `.gitignore`; `git status` does not show it as a new untracked file to commit.

---

## System-Wide Impact

- **Interaction graph:** `StreamManager` becomes the single authority over both viewing and recording for a camera. `CameraManager.startRecording()` must be removed or fully delegated; any direct caller (if any) must be updated.
- **Error propagation:** If the recorder FFmpeg crashes, the decode/viewer loop is unaffected — they are separate processes. The recorder's `close` event clears `state.recorder` and optionally restarts.
- **State lifecycle risks:** Two potential duplicate-recorder scenarios: (a) caller invokes `startRecorder` twice — guard with early return if `state.recorder` is already set; (b) `continuousRecord` restart races with a manual start — same guard.
- **API surface parity:** `POST /api/cameras/:id/recording` and `DELETE /api/cameras/:id/recording` keep the same HTTP shape; only the internal implementation changes. `CameraStream.js` UI code needs no changes.
- **Integration coverage:** Viewer + recorder running simultaneously is the critical integration test — unit tests of `StreamManager` alone will not prove the RTSP connection count.
- **Unchanged invariants:** The MJPEG viewer endpoint (`/api/cameras/:id/mjpeg`) and its multipart streaming protocol remain unchanged.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| MJPEG-in-MP4 container may not be supported in all browsers for playback | Test in Chrome/Firefox/Safari before shipping; if needed, add a re-encode option to H.264 |
| Camera sends variable-framerate MJPEG; recorder FFmpeg may not handle it cleanly | Set `-use_wallclock_as_timestamps 1` or `-vsync vfr` in recorder command to absorb gaps |
| `setInterval`-based hourly cleanup doesn't run in Next.js serverless deployments | Note in docs; for Vercel/serverless, use an external cron or a background API route triggered by a cron URL |
| Deleting `stream.js` breaks something not visible in the codebase | Grep for all imports/references before deleting |
| HTTP Basic Auth is sent in plaintext over HTTP | Acceptable for LAN-only use; document that HTTPS reverse proxy (nginx/Caddy) is recommended for remote access |

---

## Documentation / Operational Notes

- Create `.env.local.example` documenting all env vars with defaults.
- Add a brief `README.md` section on: running in production, setting `APP_PASSWORD`, expected disk usage per camera-day.
- For remote access outside the LAN, recommend a reverse proxy with HTTPS (e.g., Caddy with auto-TLS) rather than exposing the Next.js dev server directly.

---

## Sources & References

- Related code: `src/lib/stream-manager.js` — existing frame-pipe hook
- Related code: `src/lib/camera-utils.js` — current (flawed) recording implementation
- FFmpeg MJPEG pipe recording: `ffmpeg -f image2pipe -vcodec mjpeg -i pipe:0 -c:v copy -f mp4 out.mp4`
- Next.js middleware docs: https://nextjs.org/docs/app/building-your-application/routing/middleware
