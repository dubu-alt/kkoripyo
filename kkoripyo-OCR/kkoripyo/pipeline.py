"""입력(크롤러 JSON + 이미지 + 텍스트) → JSON2."""
import os
import sys
import tempfile

from . import llm, rules
from .match import build_entities, normalize
from .ocr import ocr_lines
from .schema import TAXONOMY, PIIItem, Result, Source


def profile_texts(profile: dict) -> dict[str, str]:
    """instaloader 크롤러 결과(JSON1)에서 텍스트 소스 추출."""
    out = {"profile.full_name": profile.get("full_name") or "",
           "profile.biography": profile.get("biography") or ""}
    for p in profile.get("recent_posts", []):
        out[f"post:{p.get('shortcode')}.caption"] = p.get("caption") or ""
        for i, c in enumerate(p.get("comment_texts", [])):  # 크롤러가 댓글을 넣으면 같이 본다
            out[f"post:{p.get('shortcode')}.comment{i}"] = c
    return {k: v for k, v in out.items() if v.strip()}


def from_crawler(data: dict) -> tuple[dict, list[tuple[str, str]]]:
    """크롤러 API 응답({"results": [...]}) → 내부 프로필 형식 + [(post_id, image_url)].
    instaloader 형식(results 없음)은 그대로 통과."""
    if "results" not in data:
        return data, []
    posts = data["results"] or []
    # shortcut: results 가 모두 같은 계정의 게시물이라고 가정, 여러 계정 섞이면 계정별로 나눠서 run
    first = posts[0] if posts else {}
    profile = {"username": first.get("author_username"), "full_name": first.get("author_name"),
               "recent_posts": [{"shortcode": p.get("post_id"), "caption": p.get("text"),
                                 "comment_texts": [c.get("text") or "" for c in p.get("top_comments") or []]}
                                for p in posts]}
    return profile, [(p["post_id"], p["image_url"]) for p in posts if p.get("image_url") and p.get("post_id")]


def download_images(urls: list[tuple[str, str]], folder: str, max_bytes: int = 10 * 1024 * 1024) -> list[str]:
    """이미지 URL → folder/<post_id>.jpg. 실패(만료된 CDN URL 등)는 경고 후 건너뜀."""
    import urllib.request
    paths = []
    for post_id, url in urls:
        if not url.startswith(("http://", "https://")):
            print(f"[경고] 이미지 건너뜀: {post_id} (http(s) URL 아님)", file=sys.stderr)
            continue
        try:
            with urllib.request.urlopen(url, timeout=15) as r:
                data = r.read(max_bytes + 1)
        except Exception as e:
            print(f"[경고] 이미지 다운로드 실패: {post_id} ({type(e).__name__})", file=sys.stderr)
            continue
        if not data or len(data) > max_bytes:
            print(f"[경고] 이미지 건너뜀: {post_id} (비었거나 10MB 초과)", file=sys.stderr)
            continue
        path = os.path.join(folder, f"{post_id}.jpg")
        open(path, "wb").write(data)
        paths.append(path)
    return paths


def run(images=(), profile=None, texts=None, use_llm=True, client=None) -> Result:
    raw: list[tuple[dict, Source]] = []   # (hit, source)
    tentative: set[int] = set()
    texts = {**(profile_texts(profile) if profile else {}), **(texts or {})}

    def add(hit, src):
        if hit.pop("needs_korean_pair", False):
            tentative.add(len(raw))
        raw.append((hit, src))

    if profile:
        if profile.get("username"):
            add({"type": "sns_account", "value": profile["username"], "evidence": "인스타그램 사용자명",
                 "confidence": 1.0}, Source(input_id="profile.username", modality="text", method="profile_field"))
        if profile.get("full_name"):
            add({"type": "name", "value": profile["full_name"], "evidence": "프로필 이름 필드",
                 "confidence": 0.7}, Source(input_id="profile.full_name", modality="text", method="profile_field"))
    for sid, text in texts.items():
        for h in rules.find(text):
            add(h, Source(input_id=sid, modality="text", method="regex"))

    ocr_by_image = {}
    for path in images:
        sid = f"image:{os.path.basename(path)}"
        lines = ocr_lines(path)
        ocr_by_image[path] = (sid, "\n".join(l["text"] for l in lines))
        for line in lines:
            for h in rules.find(line["text"]):
                add(h, Source(input_id=sid, modality="image", method="ocr+regex", bbox=line["bbox"]))

    if use_llm:
        for f in llm.extract_text(texts, client) if texts else []:
            sid = f.source_id if f.source_id in texts else next(iter(texts))
            add(f.model_dump(exclude={"source_id"}), Source(input_id=sid, modality="text", method="llm"))
        for path, (sid, ocr_text) in ocr_by_image.items():
            for f in llm.extract_image(path, sid, ocr_text, client):
                add(f.model_dump(exclude={"source_id"}), Source(input_id=sid, modality="image", method="vision_llm"))

    items = []
    for n, (h, src) in enumerate(raw, 1):
        items.append(PIIItem(id=f"I{n}", type=h["type"], category=TAXONOMY[h["type"]][0], value=h["value"],
                             normalized=normalize(h["type"], h["value"]), evidence=h["evidence"],
                             source=src, confidence=round(float(h["confidence"]), 2)))
    items, entities = build_entities(items, {f"I{i + 1}" for i in tentative})
    return Result(subject=(profile or {}).get("username"), llm_used=use_llm, items=items, entities=entities)


def load_dotenv(path=".env"):
    if os.path.exists(path):
        for line in open(path, encoding="utf-8"):
            k, sep, v = line.strip().partition("=")
            if sep and v.strip() and not k.startswith("#"):  # 빈 값(KEY=)은 미설정으로 취급
                os.environ.setdefault(k.strip(), v.strip().strip("'\""))


def main(argv=None):
    import argparse
    import json
    ap = argparse.ArgumentParser(prog="python -m kkoripyo", description="OCR·Vision LLM 개인정보 추출 → JSON2")
    ap.add_argument("--image", action="append", default=[], help="이미지 경로(여러 번 가능)")
    ap.add_argument("--profile", help="크롤러 결과 JSON (크롤러 API results[] 형식 또는 instaloader 형식)")
    ap.add_argument("--text", action="append", default=[], help="추가 텍스트(여러 번 가능)")
    ap.add_argument("--no-llm", action="store_true", help="OCR+정규식만 사용")
    ap.add_argument("-o", "--out", help="출력 JSON 경로(없으면 stdout)")
    a = ap.parse_args(argv)

    load_dotenv()
    use_llm = not a.no_llm
    if use_llm and not os.getenv("OPENAI_API_KEY"):
        print("[경고] OPENAI_API_KEY 없음 → OCR+정규식만 실행합니다 (.env 확인)", file=sys.stderr)
        use_llm = False
    profile = json.load(open(a.profile, encoding="utf-8")) if a.profile else None
    texts = {f"text:{i}": t for i, t in enumerate(a.text)}
    # 크롤러 JSON 의 image_url 은 임시 폴더에 받아서 분석하고, 끝나면 폴더째 삭제(개인정보)
    with tempfile.TemporaryDirectory() as tmp:
        images = list(a.image)
        if profile:
            profile, urls = from_crawler(profile)
            images += download_images(urls, tmp)
        res = run(images, profile, texts, use_llm).model_dump_json(indent=2)
    if a.out:
        open(a.out, "w", encoding="utf-8").write(res)
    else:
        print(res)
