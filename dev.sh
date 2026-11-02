#!/usr/bin/env bash
# 로컬에서 한 번에 실행: OCR(8100) + 백엔드(8000) + 프론트(3000). Ctrl+C로 모두 종료
# 블러는 NVIDIA GPU가 필요해 로컬에서 못 돌린다 → kkoripyo-be/.env 의 BLUR_SERVER_URL(원격) 사용, 비우면 블러 없이 분석
set -e
cd "$(dirname "$0")"
trap 'kill 0' EXIT

(cd kkoripyo-OCR && OCR_DEVICE=cpu .venv/bin/python -m uvicorn kkoripyo.server:app --port 8100) &
(cd kkoripyo-be && .venv/bin/python -m uvicorn app.main:app --port 8000 --reload) &
(cd kkoripyo-fe && npm run dev) &
wait
