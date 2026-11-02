"""GPU 서버용 OCR API (PaddleOCR 고정). 실행: uvicorn kkoripyo.server:app --host 0.0.0.0 --port 8000

요청: {"images": [{"image_id", "image_url"}]} → 응답: {"images": [{"image_id", "image_url", "isTextPresent", "data"}]}
이미지마다 검증 → 글자 유무 판단 → 인식. 이미지 바이트는 응답에 싣지 않고, 임시 파일은 처리 직후 지운다(개인정보).
"""
import base64
import binascii
import io
import os
import tempfile
import urllib.request
from typing import Optional

from fastapi import FastAPI
from PIL import Image
from pydantic import BaseModel, Field

from .ocr import paddle_lines

MAX_BYTES = 10 * 1024 * 1024
MAX_IMAGES = 20
FETCH_TIMEOUT = 10

class ImageIn(BaseModel):
    image_id: str = Field(min_length=1)      # 예: "DeNP20OktEn_0"
    image_url: Optional[str] = None          # 크롤러가 준 이미지 URL → 서버가 직접 다운로드
    base64: Optional[str] = None             # 확장: URL 대신 이미지 바이트 직접 전송 (있으면 우선)


class OcrRequest(BaseModel):
    images: list[ImageIn] = Field(min_length=1, max_length=MAX_IMAGES)


class ImageOut(BaseModel):
    image_id: str
    image_url: Optional[str] = None
    isTextPresent: bool
    data: str                                # 인식한 글자, 줄마다 "\n" 으로 구분. 없으면 ""
    error: Optional[str] = None              # 확장: 실패 사유 ("코드: 설명"), 성공·글자없음은 null


class OcrResponse(BaseModel):
    images: list[ImageOut]


app = FastAPI(title="kkoripyo OCR")


@app.get("/health")
def health():
    import paddle
    return {"ok": True, "engine": "paddle", "device": os.getenv("OCR_DEVICE") or "gpu",
            "cuda_build": paddle.device.is_compiled_with_cuda()}  # false 면 CPU 전용 paddle 이 설치된 것


@app.post("/ocr", response_model=OcrResponse)
def ocr(req: OcrRequest) -> OcrResponse:
    # 한 장이 실패해도 나머지는 처리한다
    return OcrResponse(images=[_one(i) for i in req.images])


def _one(img: ImageIn) -> ImageOut:
    out = lambda text="", error=None: ImageOut(image_id=img.image_id, image_url=img.image_url,
                                               isTextPresent=bool(text), data=text, error=error)

    data, err = _load(img)
    if err:
        return out(error=f"{err[0]}: {err[1]}")
    try:
        im = Image.open(io.BytesIO(data))
        fmt = (im.format or "png").lower()
        im.verify()
    except Exception:
        return out(error="invalid_image: 이미지로 열 수 없는 데이터")

    # OCR 엔진이 확장자로 형식을 판단하므로 실제 형식으로 저장
    with tempfile.NamedTemporaryFile(suffix=f".{fmt}") as f:
        f.write(data)
        f.flush()
        lines = paddle_lines(f.name)
    # 검출 단계에서 글자 영역이 하나도 없으면 인식 결과도 비어 있다 → isTextPresent false
    return out("\n".join(l["text"] for l in lines))


def _load(img: ImageIn) -> tuple[bytes, Optional[tuple[str, str]]]:
    if img.base64:
        try:
            data = base64.b64decode(img.base64, validate=True)
        except (binascii.Error, ValueError):
            return b"", ("invalid_image", "base64 디코딩 실패")
    elif img.image_url:
        if not img.image_url.startswith(("http://", "https://")):
            return b"", ("fetch_failed", "http(s) URL만 허용")
        try:
            with urllib.request.urlopen(img.image_url, timeout=FETCH_TIMEOUT) as r:
                data = r.read(MAX_BYTES + 1)
        except Exception as e:
            return b"", ("fetch_failed", f"이미지 다운로드 실패: {type(e).__name__}")
    else:
        return b"", ("no_image", "image_url 또는 base64 가 없음")
    if not data:
        return b"", ("no_image", "빈 이미지")
    if len(data) > MAX_BYTES:
        return b"", ("too_large", f"{MAX_BYTES // 1024 // 1024}MB 초과")
    return data, None
