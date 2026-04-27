#!/usr/bin/env python3
"""
Object detector using YOLO11n with MOG2 pre-filter.

MOG2 (~1ms/frame) acts as a gate: when significant motion is found, YOLO runs
on both the motion crop and the full frame. Without motion, a periodic full-frame
scan runs every ~15 s to catch stationary objects (parked vehicles, etc.).

Emits one JSON line to stdout whenever objects are found:
  {"motion": true, "boxes": [...], "frame_b64": "<base64-jpeg>"}

Usage:
    .venv/bin/python3 scripts/motion_detector.py <rtsp_url> [confidence]
    confidence: float 0.0–1.0, default 0.12
"""

import os
import sys
import signal
import json
import base64

os.environ['YOLO_VERBOSE'] = 'False'

import cv2
from ultralytics import YOLO

# ── Spanish labels ────────────────────────────────────────────────────────────
LABELS_ES = {
    'person': 'Persona', 'bicycle': 'Bici', 'car': 'Auto',
    'motorcycle': 'Moto', 'airplane': 'Avión', 'bus': 'Colectivo',
    'truck': 'Camión', 'boat': 'Barco', 'cat': 'Gato', 'dog': 'Perro',
    'horse': 'Caballo', 'bird': 'Pájaro', 'backpack': 'Mochila',
    'umbrella': 'Paraguas', 'handbag': 'Cartera', 'suitcase': 'Valija',
}
VEHICLE_LABELS_ES = {'Auto', 'Camión', 'Colectivo', 'Moto', 'Bici', 'Barco', 'Avión'}
ANIMAL_LABELS_ES  = {'Perro', 'Gato', 'Pájaro', 'Caballo'}

# BGR colors matching the UI
def box_color(label):
    if label == 'Persona':           return (50, 115, 249)   # orange
    if label in VEHICLE_LABELS_ES:   return (250, 165, 96)   # blue
    if label in ANIMAL_LABELS_ES:    return (128, 222, 78)   # green
    return (226, 232, 226)                                    # slate

# ── Box helpers ───────────────────────────────────────────────────────────────
def parse_full(results, model, w, h):
    """Parse YOLO results from full-frame inference → normalized full-frame coords."""
    out = []
    for box in results.boxes:
        label = LABELS_ES.get(model.names[int(box.cls)], model.names[int(box.cls)].capitalize())
        fx1, fy1, fx2, fy2 = box.xyxyn[0].tolist()
        out.append({'x': round(fx1, 4), 'y': round(fy1, 4),
                    'w': round(fx2 - fx1, 4), 'h': round(fy2 - fy1, 4),
                    'label': label, 'conf': round(float(box.conf), 2)})
    return out


def parse_crop(results, model, x1, y1, x2, y2, w, h):
    """Parse YOLO results from a crop, remapping coords to full-frame normalized space."""
    out = []
    for box in results.boxes:
        label = LABELS_ES.get(model.names[int(box.cls)], model.names[int(box.cls)].capitalize())
        cx1, cy1, cx2, cy2 = box.xyxyn[0].tolist()
        ax1 = (x1 + cx1 * (x2 - x1)) / w
        ay1 = (y1 + cy1 * (y2 - y1)) / h
        ax2 = (x1 + cx2 * (x2 - x1)) / w
        ay2 = (y1 + cy2 * (y2 - y1)) / h
        out.append({'x': round(ax1, 4), 'y': round(ay1, 4),
                    'w': round(ax2 - ax1, 4), 'h': round(ay2 - ay1, 4),
                    'label': label, 'conf': round(float(box.conf), 2)})
    return out


def iou(a, b):
    ax2, ay2 = a['x'] + a['w'], a['y'] + a['h']
    bx2, by2 = b['x'] + b['w'], b['y'] + b['h']
    ix1, iy1 = max(a['x'], b['x']), max(a['y'], b['y'])
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
    if inter == 0:
        return 0.0
    return inter / (a['w'] * a['h'] + b['w'] * b['h'] - inter)


def merge_boxes(crop_boxes, full_boxes):
    """Full-frame boxes that don't overlap (IoU < 0.4) with any crop box are added."""
    result = list(crop_boxes)
    for fb in full_boxes:
        if not any(iou(fb, cb) >= 0.4 for cb in crop_boxes):
            result.append(fb)
    return result


def annotate_and_encode(frame, boxes, w, h):
    """Draw bounding boxes on frame, return base64-encoded JPEG string."""
    annotated = frame.copy()
    for b in boxes:
        color = box_color(b['label'])
        bx1, by1 = int(b['x'] * w), int(b['y'] * h)
        bx2, by2 = int((b['x'] + b['w']) * w), int((b['y'] + b['h']) * h)
        cv2.rectangle(annotated, (bx1, by1), (bx2, by2), color, 2)
        tag = f"{b['label']} {int(b['conf'] * 100)}%"
        ty = by1 - 6 if by1 > 20 else by1 + 16
        cv2.putText(annotated, tag, (bx1, ty),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, color, 2, cv2.LINE_AA)
    ok, buf = cv2.imencode('.jpg', annotated, [cv2.IMWRITE_JPEG_QUALITY, 85])
    return base64.b64encode(buf.tobytes()).decode() if ok else None


def emit(boxes, frame, w, h):
    frame_b64 = annotate_and_encode(frame, boxes, w, h)
    print(json.dumps({'motion': True, 'boxes': boxes, 'frame_b64': frame_b64}), flush=True)


# ── Signal handling ───────────────────────────────────────────────────────────
running = True

def handle_exit(signum, frame):
    global running
    running = False

signal.signal(signal.SIGTERM, handle_exit)
signal.signal(signal.SIGINT,  handle_exit)


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    if len(sys.argv) < 2:
        print("Uso: motion_detector.py <rtsp_url> [confidence]", file=sys.stderr)
        sys.exit(1)

    rtsp_url   = sys.argv[1]
    conf_thres = float(sys.argv[2]) if len(sys.argv) > 2 else 0.12

    model = YOLO('yolo11n.pt')

    cap = cv2.VideoCapture(rtsp_url)
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    if not cap.isOpened():
        print(f"Error: no se pudo conectar a {rtsp_url}", file=sys.stderr)
        sys.exit(1)

    mog2 = cv2.createBackgroundSubtractorMOG2(history=500, varThreshold=16, detectShadows=False)
    MIN_CONTOUR_AREA   = 800    # px² — catch smaller/slower animals
    PERIODIC_FRAMES    = 50     # full-frame YOLO every ~5 s to catch stationary animals
    frame_count        = 0

    while running:
        ret, frame = cap.read()
        if not ret:
            break

        h, w = frame.shape[:2]
        frame_count += 1

        # ── MOG2 pre-filter ───────────────────────────────────────────────────
        mask      = mog2.apply(frame)
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        significant = [c for c in contours if cv2.contourArea(c) > MIN_CONTOUR_AREA]

        if not significant:
            # No motion — periodic full-frame scan to catch stationary objects
            if frame_count % PERIODIC_FRAMES != 0:
                continue
            results = model(frame, imgsz=640, conf=conf_thres, verbose=False)[0]
            boxes   = parse_full(results, model, w, h)
            if boxes:
                emit(boxes, frame, w, h)
            continue

        # ── Motion detected: build crop ───────────────────────────────────────
        rects = [cv2.boundingRect(c) for c in significant]
        mx    = min(r[0] for r in rects)
        my    = min(r[1] for r in rects)
        mw    = max(r[0] + r[2] for r in rects) - mx
        mh    = max(r[1] + r[3] for r in rects) - my
        pad_x = int(mw * 0.2);  pad_y = int(mh * 0.2)
        x1    = max(0, mx - pad_x);   y1 = max(0, my - pad_y)
        x2    = min(w, mx + mw + pad_x); y2 = min(h, my + mh + pad_y)
        crop  = frame[y1:y2, x1:x2]

        # ── YOLO on crop + full frame (catches objects outside motion zone) ────
        r_crop = model(crop,  imgsz=640, conf=conf_thres, verbose=False)[0]
        r_full = model(frame, imgsz=640, conf=conf_thres, verbose=False)[0]

        crop_boxes = parse_crop(r_crop, model, x1, y1, x2, y2, w, h)
        full_boxes = parse_full(r_full, model, w, h)
        boxes      = merge_boxes(crop_boxes, full_boxes)

        if boxes:
            emit(boxes, frame, w, h)

    cap.release()
    sys.exit(0)


if __name__ == '__main__':
    main()
