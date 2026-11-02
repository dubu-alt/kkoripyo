#!/usr/bin/env bash
# 로컬에서 한 번에 실행: 블러(8190) + OCR(8100) + 백엔드(8000) + 프론트(3000). Ctrl+C로 모두 종료
# 맥 블러는 느리다 → kkoripyo-be/.env 의 BLUR_TIMEOUT초를 넘기면 블러 없이 진단을 계속한다
set -e
cd "$(dirname "$0")"
trap 'kill 0' EXIT

(cd kkoripyo-blur && bash run_linux.sh) &
(cd kkoripyo-OCR && OCR_DEVICE=cpu .venv/bin/python -m uvicorn kkoripyo.server:app --port 8100) &
(cd kkoripyo-be && .venv/bin/python -m uvicorn app.main:app --port 8000 --reload) &
(cd kkoripyo-fe && npm run dev) &
wait
