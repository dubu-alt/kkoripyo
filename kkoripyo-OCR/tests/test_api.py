"""개인정보 추출 API 테스트 (네트워크·OpenAI 없이). 실행: python -m pytest tests"""
import json
import os
import shutil
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from fastapi.testclient import TestClient  # noqa: E402

from kkoripyo import api  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), "..", "samples")
client = TestClient(api.app)
CRAWL = json.load(open(os.path.join(ROOT, "fake_crawl.json"), encoding="utf-8"))


def test_rejects_non_crawler_body():
    assert client.post("/analyze", json={"foo": 1}).status_code == 422
    assert client.post("/analyze", json=[1, 2]).status_code == 422


def test_analyze_text_only(monkeypatch):
    monkeypatch.setattr(api, "download_images", lambda urls, tmp: [])   # 이미지 다운로드 생략
    r = client.post("/analyze?llm=false", json=CRAWL)
    assert r.status_code == 200
    d = r.json()
    assert d["schema_version"] == "json2/v1" and d["subject"] == "gildong_hong" and d["llm_used"] is False
    phone = next(e for e in d["entities"] if e["type"] == "phone")
    assert set(phone["sources"]) == {"post:FAKE001.caption", "post:FAKE001.comment0"}  # 캡션+댓글 → 한 엔티티


def test_analyze_with_image(monkeypatch):
    if "kor" not in __import__("pytesseract").get_languages():
        return
    monkeypatch.setenv("OCR_ENGINE", "tesseract")

    def fake_download(urls, tmp):  # image_url 대신 샘플 이미지를 받은 것으로
        dst = os.path.join(tmp, f"{urls[0][0]}.jpg")
        shutil.copy(os.path.join(ROOT, "fake_card.png"), dst)
        return [dst]
    monkeypatch.setattr(api, "download_images", fake_download)
    d = client.post("/analyze?llm=false", json=CRAWL).json()
    sid = next(e for e in d["entities"] if e["type"] == "student_id")
    assert sid["value"] == "20261234" and sid["sources"] == ["image:FAKE001.jpg"]
