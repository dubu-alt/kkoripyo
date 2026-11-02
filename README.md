# kkoripyo

| 폴더 | 내용 | 로컬 포트 |
|---|---|---|
| `kkoripyo-fe` | 프론트엔드 (Vite) | 3000 |
| `kkoripyo-be` | 백엔드 API (FastAPI) | 8000 |
| `kkoripyo-OCR` | OCR 서버 (PaddleOCR, 맥은 CPU) | 8100 |
| `kkoripyo-blur` | 블러 서버 (NVIDIA GPU 필요, 로컬 실행 안 함) | - |

## 로컬 실행

처음 한 번:

```bash
(cd kkoripyo-be && uv venv -p 3.12 .venv && uv pip install -p .venv -r requirements.txt && cp -n .env.example .env)
(cd kkoripyo-OCR && uv venv -p 3.12 .venv && uv pip install -p .venv -r requirements.txt fastapi uvicorn paddlepaddle paddleocr)
(cd kkoripyo-fe && npm install && cp -n .env.example .env)
```

`kkoripyo-be/.env`에서 `OCR_SERVER_URL=http://localhost:8100`으로 바꾸고 `EVERYINFRA_API_KEY`, `OPENAI_API_KEY`를 채운다.

실행:

```bash
./dev.sh
```

http://localhost:3000 접속. 블러는 `BLUR_SERVER_URL`(원격 서버)을 쓰고, 비우면 블러 없이 분석한다.
