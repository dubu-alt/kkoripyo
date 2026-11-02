"""실행: python -m pytest tests  (또는 python tests/test_pipeline.py). 가상 인물 데이터만 사용."""
import json
import os
import sys
from types import SimpleNamespace

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import pytesseract  # noqa: E402

from evaluate import evaluate  # noqa: E402
from kkoripyo import rules  # noqa: E402
from kkoripyo.match import normalize, same_name  # noqa: E402
from kkoripyo.pipeline import run  # noqa: E402
from kkoripyo.schema import LLMFinding, LLMFindings  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), "..", "samples")
HAS_KOR = "kor" in pytesseract.get_languages()


def test_normalize():
    assert normalize("phone", "010.1234.5678") == normalize("phone", "010-1234-5678") == "01012345678"
    assert normalize("email", "A.B@Example.com") == "a.b@example.com"


def test_romanization():
    assert same_name("홍길동", "Hong Gildong")
    assert same_name("홍길동", "Gildong Hong")
    assert same_name("이민호", "Lee Minho")
    assert same_name("박지성", "Park Jisung")
    assert not same_name("홍길동", "Kim Minsu")
    assert not same_name("Hong Gildong", "Hong Gildong")  # 같은 문자 체계끼리는 normalize 로 처리


def test_rules_no_overlap():
    types = [h["type"] for h in rules.find("카드 1234-5678-9012-3456 결제")]
    assert types == ["card_number"]  # 카드번호 일부가 전화번호로 중복 탐지되지 않음
    assert [h["type"] for h in rules.find("주민번호 900101-1234567")] == ["rrn"]
    assert [h["value"] for h in rules.find("900101-1****** 이고 900101-2")] == ["900101-1******", "900101-2"]


def _stub(responses):
    """OpenAI 클라이언트 대역: 호출 순서대로 LLMFindings 를 돌려준다."""
    it = iter(responses)
    parse = lambda **_: SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(parsed=next(it)))])
    return SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(parse=parse)))


def test_llm_merge():
    client = _stub([LLMFindings(findings=[
        LLMFinding(source_id="profile.biography", type="other_clue", value="26학번", evidence="바이오", confidence=0.8),
        LLMFinding(source_id="없는소스", type="name", value="홍길동", evidence="이름", confidence=0.9),
    ])])
    res = run(profile=json.load(open(os.path.join(ROOT, "fake_profile.json"), encoding="utf-8")), client=client)
    by_val = {e.value: e for e in res.entities}
    assert "26학번" in by_val
    name = next(e for e in res.entities if e.type == "name" and "홍길동" in e.value)
    methods = {i.source.method for i in res.items if i.id in name.item_ids}
    assert {"llm", "profile_field"} <= methods  # LLM 결과가 기존 이름 엔티티로 합쳐짐


def test_paddle_result_conversion():
    """PaddleOCR 결과(rec_texts, rec_boxes=[x0,y0,x1,y1]) → 라인 형식. 가중치 없이 대역으로 확인."""
    from kkoripyo import ocr
    fake = SimpleNamespace(predict=lambda _: [{"rec_texts": ["홍길동 [20261234]", " "],
                                               "rec_boxes": [[10, 20, 110, 60], [0, 0, 1, 1]]}])
    orig, ocr._paddle = ocr._paddle, lambda: fake
    os.environ["OCR_ENGINE"] = "paddle"
    try:
        assert ocr.ocr_lines("x.png") == [{"text": "홍길동 [20261234]", "bbox": [10, 20, 100, 40]}]
    finally:
        ocr._paddle = orig
        del os.environ["OCR_ENGINE"]


def test_evaluate_dir(tmp_path=None):
    """폴더 일괄 평가: <이름>.gold.json 과 같은 이름 이미지 쌍을 찾아 돌린다."""
    import shutil
    import tempfile
    from evaluate import evaluate_dir
    if not HAS_KOR:
        return
    d = tempfile.mkdtemp()
    shutil.copy(os.path.join(ROOT, "fake_card.png"), os.path.join(d, "card.png"))
    json.dump({"items": [{"type": "student_id", "value": "20261234"},
                         {"type": "phone", "value": "010-1234-5678"}]},
              open(os.path.join(d, "card.gold.json"), "w", encoding="utf-8"))
    open(os.path.join(d, "orphan.gold.json"), "w").write('{"items": []}')  # 이미지 없는 정답셋은 건너뜀
    rows = evaluate_dir(d, use_llm=False)
    assert [r["image"] for r in rows] == ["card.png"]
    assert rows[0]["detection"]["recall"] == 1.0
    assert os.path.exists(os.path.join(d, "card.out.json"))


def test_from_crawler_format():
    profile, urls = __import__("kkoripyo.pipeline", fromlist=["x"]).from_crawler(
        json.load(open(os.path.join(ROOT, "fake_crawl.json"), encoding="utf-8")))
    assert profile["username"] == "gildong_hong" and profile["full_name"] == "홍길동"
    assert profile["recent_posts"][0]["comment_texts"][0].startswith("길동아")
    assert urls == [("FAKE001", "https://example.com/fake_card.png")]


def test_crawler_json_with_image_url(tmp_path=None):
    """크롤러 JSON 의 image_url 을 내려받아 OCR 까지 도는지 (로컬 HTTP 서버로 확인). 깨진 URL 은 건너뜀."""
    import functools
    import http.server
    import tempfile
    import threading
    from kkoripyo.pipeline import main
    if not HAS_KOR:
        return
    srv = http.server.ThreadingHTTPServer(
        ("127.0.0.1", 0), functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        d = tempfile.mkdtemp()
        crawl = json.load(open(os.path.join(ROOT, "fake_crawl.json"), encoding="utf-8"))
        crawl["results"][0]["image_url"] = f"http://127.0.0.1:{srv.server_port}/fake_card.png"
        crawl["results"].append({"post_id": "BROKEN", "text": "", "image_url": f"http://127.0.0.1:{srv.server_port}/none.png"})
        json.dump(crawl, open(os.path.join(d, "crawl.json"), "w", encoding="utf-8"))
        out = os.path.join(d, "out.json")
        prev = os.environ.get("OCR_ENGINE")
        os.environ["OCR_ENGINE"] = "tesseract"  # .env 의 remote 설정과 무관하게 로컬에서 확인
        try:
            main(["--profile", os.path.join(d, "crawl.json"), "--no-llm", "-o", out])
        finally:
            os.environ.pop("OCR_ENGINE") if prev is None else os.environ.__setitem__("OCR_ENGINE", prev)
        res = json.load(open(out, encoding="utf-8"))
    finally:
        srv.shutdown()
    assert res["subject"] == "gildong_hong"
    by_type = {e["type"]: e for e in res["entities"]}
    assert "image:FAKE001.jpg" in by_type["student_id"]["sources"]           # 사진에서만 나오는 학번
    assert len(by_type["phone"]["sources"]) == 3                             # 캡션 + 댓글 + 사진 → 한 엔티티


def test_fake_sample_end_to_end():
    if not HAS_KOR:
        print("skip: tesseract kor 언어팩 없음")
        return
    res = run(images=[os.path.join(ROOT, "fake_card.png")],
              profile=json.load(open(os.path.join(ROOT, "fake_profile.json"), encoding="utf-8")), use_llm=False)
    rep = evaluate(json.loads(res.model_dump_json()), json.load(open(os.path.join(ROOT, "fake.gold.json"), encoding="utf-8")))
    assert rep["detection"]["recall"] >= 0.8, rep
    assert rep["matching"]["f1"] == 1.0, rep


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
