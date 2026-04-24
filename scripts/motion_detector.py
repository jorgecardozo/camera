#!/usr/bin/env python3
"""
Object detector using YOLO11n with MOG2 pre-filter.

Applies background subtraction (MOG2, ~1ms/frame) first; only runs YOLO when
significant motion is detected in the frame. YOLO runs on the motion crop only,
which is much faster than the full frame.

Emits one JSON line to stdout whenever objects are found:
  {"motion": true, "boxes": [{"x":0.1,"y":0.2,"w":0.3,"h":0.4,"label":"Persona","conf":0.87}]}

Coordinates are normalized 0.0–1.0 (top-left origin), remapped to full-frame space.

Usage:
    .venv/bin/python3 scripts/motion_detector.py <rtsp_url> [confidence]
    confidence: float 0.0–1.0, default 0.20
"""

import os
import sys
import signal
import json

# Suppress ultralytics/YOLO verbose output
os.environ['YOLO_VERBOSE'] = 'False'

import cv2
from ultralytics import YOLO

# ── Spanish labels for COCO classes ──────────────────────────────────────────
LABELS_ES = {
    'person':     'Persona',
    'bicycle':    'Bici',
    'car':        'Auto',
    'motorcycle': 'Moto',
    'airplane':   'Avión',
    'bus':        'Colectivo',
    'truck':      'Camión',
    'boat':       'Barco',
    'cat':        'Gato',
    'dog':        'Perro',
    'horse':      'Caballo',
    'bird':       'Pájaro',
    'backpack':   'Mochila',
    'umbrella':   'Paraguas',
    'handbag':    'Cartera',
    'suitcase':   'Valija',
}

running = True


def handle_exit(signum, frame):
    global running
    running = False


signal.signal(signal.SIGTERM, handle_exit)
signal.signal(signal.SIGINT,  handle_exit)


def main():
    if len(sys.argv) < 2:
        print("Uso: motion_detector.py <rtsp_url> [confidence]", file=sys.stderr)
        sys.exit(1)

    rtsp_url   = sys.argv[1]
    conf_thres = float(sys.argv[2]) if len(sys.argv) > 2 else 0.12

    # yolo11n.pt (~5.4 MB) downloads automatically on first run.
    # Fast enough for CPU inference when combined with the MOG2 pre-filter.
    model = YOLO('yolo11n.pt')

    cap = cv2.VideoCapture(rtsp_url)
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

    if not cap.isOpened():
        print(f"Error: no se pudo conectar a {rtsp_url}", file=sys.stderr)
        sys.exit(1)

    # MOG2 background subtractor — the core pre-filter.
    # history=500: frames to build background model
    # varThreshold=16: sensitivity to pixel change (lower = more sensitive)
    # detectShadows=False: skip shadow detection (saves CPU)
    mog2 = cv2.createBackgroundSubtractorMOG2(history=500, varThreshold=16, detectShadows=False)
    MIN_CONTOUR_AREA = 1500  # px²; tune to reduce false triggers from lighting changes

    while running:
        ret, frame = cap.read()
        if not ret:
            break

        h, w = frame.shape[:2]

        # ── MOG2 pre-filter (~1ms) ────────────────────────────────────────────
        mask = mog2.apply(frame)
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        significant = [c for c in contours if cv2.contourArea(c) > MIN_CONTOUR_AREA]

        if not significant:
            # No meaningful movement — skip YOLO entirely
            continue

        # ── Build motion crop expanded 20% on each side ───────────────────────
        rects = [cv2.boundingRect(c) for c in significant]
        mx = min(r[0] for r in rects)
        my = min(r[1] for r in rects)
        mw = max(r[0] + r[2] for r in rects) - mx
        mh = max(r[1] + r[3] for r in rects) - my

        pad_x = int(mw * 0.2)
        pad_y = int(mh * 0.2)
        x1 = max(0, mx - pad_x)
        y1 = max(0, my - pad_y)
        x2 = min(w, mx + mw + pad_x)
        y2 = min(h, my + mh + pad_y)

        crop = frame[y1:y2, x1:x2]

        # ── YOLO on crop only ─────────────────────────────────────────────────
        results = model(crop, imgsz=480, conf=conf_thres, verbose=False)[0]

        boxes = []
        for box in results.boxes:
            cls_name = model.names[int(box.cls)]
            label_es = LABELS_ES.get(cls_name, cls_name.capitalize())

            # xyxyn is normalized to the crop; remap to full-frame normalized coords
            cx1, cy1, cx2, cy2 = box.xyxyn[0].tolist()

            # Convert normalized crop coords → absolute full-frame coords
            abs_x1 = x1 + cx1 * (x2 - x1)
            abs_y1 = y1 + cy1 * (y2 - y1)
            abs_x2 = x1 + cx2 * (x2 - x1)
            abs_y2 = y1 + cy2 * (y2 - y1)

            # Normalize to full frame
            fx1 = abs_x1 / w
            fy1 = abs_y1 / h
            fw  = (abs_x2 - abs_x1) / w
            fh  = (abs_y2 - abs_y1) / h

            boxes.append({
                'x':     round(fx1, 4),
                'y':     round(fy1, 4),
                'w':     round(fw,  4),
                'h':     round(fh,  4),
                'label': label_es,
                'conf':  round(float(box.conf), 2),
            })

        if boxes:
            print(json.dumps({'motion': True, 'boxes': boxes}), flush=True)

    cap.release()
    sys.exit(0)


if __name__ == '__main__':
    main()
