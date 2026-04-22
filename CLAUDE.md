# Vigilancia — Camera System

Next.js 15.5.3 (Pages Router), React 19, Tailwind CSS 4. Security camera dashboard for WiFi IP cameras.

## Camera Hardware

**Model**: Geotek dual-lens WiFi cameras (Tuya-based firmware V5.02.R02)
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
- **Config**: `cameras.json` (flat file, no database, git-ignored)
- **Auth**: HTTP Basic Auth via `src/middleware.ts` (APP_PASSWORD env var)

## Key Files

- `src/lib/stream-manager.js` — manages viewer streams and recorders
- `src/lib/camera-utils.js` — CameraManager (load/save cameras.json), PTZController, buildRtspUrl()
- `src/lib/retention.js` — disk cleanup by age (MAX_RECORDING_AGE_HOURS) and size (MAX_RECORDINGS_GB)
- `src/pages/api/cameras/scan.js` — TCP port scan to discover cameras on LAN
- `src/components/CameraStream.js` — live view card with recording and PTZ controls
- `src/components/CameraSetup.js` — camera registration form + scan results (stays mounted across tab switches)
- `src/components/FilesViewer.js` — recordings/screenshots browser with disk space panel

## Environment Variables (.env.local)

```
APP_PASSWORD=           # HTTP Basic Auth password (empty = no auth)
MAX_RECORDING_AGE_HOURS=72
MAX_RECORDINGS_GB=10
RECORDING_SEGMENT_MINUTES=30
```

## Important Behaviors

- The **setup tab stays mounted** (CSS hidden) so scan results survive tab switches
- The **cameras tab unmounts** on switch to stop MJPEG FFmpeg processes
- `buildRtspUrl()` omits credentials from URL when both username and password are empty
- Recorder restarts automatically after each segment when `continuousRecord: true`
- `forceStopAll(cameraId)` kills both viewer and recorder unconditionally (used on delete)
- Retention cleanup runs on server start and every hour

## PTZ — Not Supported (Geotek/XiongMai)

These cameras use the XiongMai Sofia binary protocol on **port 34567** for PTZ.
The HTTP API on port 80 requires an ActiveX/OCX plugin session (IE-only) — standard
fetch requests are rejected regardless of JSON format. PTZ panel was removed from the UI.

To add PTZ support: implement the XiongMai binary protocol (Sofia DVRIP) over TCP port 34567.
Reference: the protocol uses 20-byte binary headers + JSON payload, login message ID = 0x03E8.

## Network Scan

- Probes ports 554, 8554 (RTSP) and 80, 8080 (HTTP) per host
- Timeout: 800ms per connection
- Batch size: 30 hosts in parallel
- Only IPs with RTSP port open get the quick-connect "Agregar" button
