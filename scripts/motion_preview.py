#!/usr/bin/env python3
"""
Vista previa visual de detección de movimiento.

Muestra dos ventanas:
  1. Video en vivo con rectángulos de color sobre zonas en movimiento
  2. Máscara de MOG2 (blanco = movimiento detectado por OpenCV)

Uso:
    .venv/bin/python3 scripts/motion_preview.py <rtsp_url> [min_area]

Controles:
    Q o ESC  → cerrar
    +        → aumentar min_area (menos sensible)
    -        → disminuir min_area (más sensible)
"""

import sys
import cv2

ANALYSIS_WIDTH  = 320
ANALYSIS_HEIGHT = 240

GREEN  = (0, 255,   0)
ORANGE = (0, 165, 255)
RED    = (0,   0, 255)
WHITE  = (255, 255, 255)
BLACK  = (0, 0, 0)


def draw_label(frame, text, pos, fg=WHITE, bg=BLACK):
    font = cv2.FONT_HERSHEY_SIMPLEX
    scale, thickness = 0.55, 1
    (tw, th), _ = cv2.getTextSize(text, font, scale, thickness)
    x, y = pos
    cv2.rectangle(frame, (x - 2, y - th - 4), (x + tw + 2, y + 4), bg, -1)
    cv2.putText(frame, text, (x, y), font, scale, fg, thickness, cv2.LINE_AA)


def main():
    if len(sys.argv) < 2:
        print("Uso: motion_preview.py <rtsp_url> [min_area]", file=sys.stderr)
        sys.exit(1)

    rtsp_url = sys.argv[1]
    min_area = int(sys.argv[2]) if len(sys.argv) > 2 else 200  # más bajo para ver algo

    cap = cv2.VideoCapture(rtsp_url)
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

    if not cap.isOpened():
        print(f"Error: no se pudo conectar a {rtsp_url}", file=sys.stderr)
        sys.exit(1)

    mog2 = cv2.createBackgroundSubtractorMOG2(
        history=200,       # menos historia → aprende el fondo más rápido
        varThreshold=40,   # más alto → más tolerante al ruido, menos falsos positivos
        detectShadows=False,
    )

    print(f"Iniciando... min_area={min_area}  |  +/- ajustar  |  Q salir")
    print("Esperá 2-3 segundos para que OpenCV aprenda el fondo.")
    print()

    frame_count = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            print("Stream perdido, reintentando...")
            cap.open(rtsp_url)
            continue

        frame_count += 1
        h, w = frame.shape[:2]
        scale_x = w / ANALYSIS_WIDTH
        scale_y = h / ANALYSIS_HEIGHT

        small = cv2.resize(frame, (ANALYSIS_WIDTH, ANALYSIS_HEIGHT))
        fg_mask = mog2.apply(small)

        # Morphological open para reducir ruido puntual
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
        fg_clean = cv2.morphologyEx(fg_mask, cv2.MORPH_OPEN, kernel)

        contours, _ = cv2.findContours(fg_clean, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        # Imprimir info de contornos cada 30 frames para no saturar la terminal
        if frame_count % 30 == 0:
            areas = sorted([int(cv2.contourArea(c)) for c in contours], reverse=True)
            if areas:
                print(f"Frame {frame_count} — contornos detectados: {areas[:5]}  (min_area={min_area})")
            else:
                print(f"Frame {frame_count} — sin contornos (máscara muy oscura? — revisá ventana Mask)")

        motion_detected = False
        for contour in contours:
            area = cv2.contourArea(contour)
            if area < min_area:
                continue

            motion_detected = True
            x, y, cw, ch = cv2.boundingRect(contour)

            rx = int(x * scale_x)
            ry = int(y * scale_y)
            rw = int(cw * scale_x)
            rh = int(ch * scale_y)

            color = RED if area >= min_area * 4 else ORANGE if area >= min_area * 2 else GREEN
            cv2.rectangle(frame, (rx, ry), (rx + rw, ry + rh), color, 2)
            draw_label(frame, f"{int(area)}px", (rx, ry - 6 if ry > 20 else ry + rh + 14), fg=color)

        status_text = "MOVIMIENTO DETECTADO" if motion_detected else "Sin movimiento"
        status_color = RED if motion_detected else GREEN
        draw_label(frame, status_text, (10, 30), fg=status_color)
        draw_label(frame, f"min_area: {min_area}px  (+/- ajustar)", (10, h - 10))

        # Ventana 1: video con rectángulos
        cv2.imshow("Video", frame)

        # Ventana 2: máscara (blanco = lo que OpenCV ve como movimiento)
        mask_display = cv2.resize(fg_clean, (ANALYSIS_WIDTH * 2, ANALYSIS_HEIGHT * 2))
        draw_label(mask_display, "Blanco = movimiento detectado por OpenCV", (5, 20))
        cv2.imshow("Mask (mov. crudo)", mask_display)

        key = cv2.waitKey(1) & 0xFF
        if key in (ord('q'), ord('Q'), 27):
            break
        elif key in (ord('+'), ord('=')):
            min_area = min(min_area + 50, 5000)
            print(f"min_area → {min_area}")
        elif key == ord('-'):
            min_area = max(min_area - 50, 10)
            print(f"min_area → {min_area}")

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
