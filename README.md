# kkoripyo

| 폴더 | 내용 | 로컬 포트 |
|---|---|---|
| `kkoripyo-fe` | 프론트엔드 (Vite) | 3000 |
| `kkoripyo-be` | 백엔드 API (FastAPI) | 8000 |
| `kkoripyo-OCR` | OCR 서버 (PaddleOCR, 맥은 CPU) | 8100 |
| `kkoripyo-blur` | 블러 서버 (ComfyUI + Florence-2, 맥은 MPS/CPU라 느림) | 8190 |

## 로컬 실행

처음 한 번:

```bash
(cd kkoripyo-be && uv venv -p 3.12 .venv && uv pip install -p .venv -r requirements.txt && cp -n .env.example .env)
(cd kkoripyo-OCR && uv venv -p 3.12 .venv && uv pip install -p .venv -r requirements.txt fastapi uvicorn paddlepaddle paddleocr)
(cd kkoripyo-fe && npm install && cp -n .env.example .env)
(cd kkoripyo-blur && TORCH_INDEX=https://pypi.org/simple PYTHON=python3.12 bash setup_linux.sh)
```

`kkoripyo-be/.env`에서 `OCR_SERVER_URL=http://localhost:8100`, `BLUR_SERVER_URL=http://localhost:8190`, `BLUR_TIMEOUT=120`으로 바꾸고 `EVERYINFRA_API_KEY`, `OPENAI_API_KEY`를 채운다.

실행:

```bash
./dev.sh
```

http://localhost:3000 접속. 블러가 `BLUR_TIMEOUT`초 안에 안 끝나면 블러를 건너뛰고 진단을 계속한다. `BLUR_SERVER_URL`을 비우면 블러 없이 분석한다.
