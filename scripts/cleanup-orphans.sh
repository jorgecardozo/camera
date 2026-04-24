#!/usr/bin/env bash
# Kill orphan processes from previous vigilancia server runs
pkill -TERM -f 'motion_detector.py' 2>/dev/null || true
pkill -TERM -f 'ffmpeg.*rtsp://' 2>/dev/null || true
echo "[cleanup] Orphan processes terminated"
