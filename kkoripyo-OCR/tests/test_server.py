"""OCR 서버 API 명세 테스트. 실행: python -m pytest tests (fastapi, httpx 필요)
요청 {"images": [{"image_id", "image_url"}]} → 응답 {"images": [{"image_id", "image_url", "isTextPresent", "data"}]}
"""
import base64
import io
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from fastapi.testclient import TestClient  # noqa: E402
from PIL import Image  # noqa: E402

from kkoripyo import server  # noqa: E402

client = TestClient(server.app)


def _png(color="white") -> str:
    buf = io.BytesIO()
    Image.new("RGB", (40, 20), color).save(buf, "PNG")
    return base64.b64encode(buf.getvalue()).decode()


def _post(images):
    return client.post("/ocr", json={"images": images})


def test_request_level_validation():
    assert _post([]).status_code == 422                        # 이미지 목록이 비어 있음
    assert client.post("/ocr", json={}).status_code == 422      # images 필드 없음
    assert _post([{"image_url": "https://x/y.jpg"}]).status_code == 422   # image_id 누락
    assert _post([{"image_id": str(i), "base64": _png()} for i in range(21)]).status_code == 422  # 개수 초과


def test_per_image_errors(monkeypatch):
    seen = []
    monkeypatch.setattr(server, "paddle_lines", lambda p: seen.append(p) or [])  # 글자 없음
    big = base64.b64encode(b"0" * (server.MAX_BYTES + 1)).decode()
    r = _post([
        {"image_id": "empty"},                                  # image_url/base64 둘 다 없음
        {"image_id": "bad64", "base64": "%%%"},
        {"image_id": "notimg", "base64": base64.b64encode(b"hello").decode()},
        {"image_id": "big", "base64": big},
        {"image_id": "ftp", "image_url": "ftp://x/y.png"},
        {"image_id": "blank", "base64": _png()},                # 글자 없는 정상 이미지
    ])
    assert r.status_code == 200
    got = {x["image_id"]: (x["isTextPresent"], x["data"], (x["error"] or "").split(":")[0]) for x in r.json()["images"]}
    assert got == {"empty": (False, "", "no_image"), "bad64": (False, "", "invalid_image"),
                   "notimg": (False, "", "invalid_image"), "big": (False, "", "too_large"),
                   "ftp": (False, "", "fetch_failed"), "blank": (False, "", "")}
    assert r.json()["images"][4]["image_url"] == "ftp://x/y.png"   # image_url 은 그대로 돌려줌
    assert _png() not in r.text                                     # 이미지 바이트는 돌려주지 않음
    assert all(not os.path.exists(p) for p in seen)                 # 임시 파일 삭제됨


def test_text_found(monkeypatch):
    monkeypatch.setattr(server, "paddle_lines", lambda p: [{"text": "Tuesdays with Morrie", "bbox": [1, 2, 3, 4]},
                                                           {"text": "learn how to give out love", "bbox": [1, 9, 3, 4]}])
    res = _post([{"image_id": "Ddtv14MGyhl_0", "base64": _png()}]).json()["images"][0]
    assert res == {"image_id": "Ddtv14MGyhl_0", "image_url": None, "isTextPresent": True,
                   "data": "Tuesdays with Morrie\nlearn how to give out love", "error": None}
