"""개인정보 추출 API: 크롤러 응답 JSON → JSON2.
실행: uvicorn kkoripyo.api:app --host 0.0.0.0 --port 8001

OpenAI 를 호출하므로 외부 인터넷이 되는 서버에서 띄운다.
OCR 은 .env 의 OCR_ENGINE 을 따른다 (GPU OCR 서버를 쓰려면 OCR_ENGINE=remote, OCR_SERVER_URL=...).
"""
import os
import tempfile

from fastapi import Body, FastAPI, HTTPException

from .pipeline import download_images, from_crawler, load_dotenv, run
from .schema import Result

load_dotenv()
app = FastAPI(title="kkoripyo 개인정보 추출 API")


@app.get("/health")
def health():
    return {"ok": True, "ocr_engine": os.getenv("OCR_ENGINE") or "tesseract",
            "llm_available": bool(os.getenv("OPENAI_API_KEY"))}


@app.post("/analyze", response_model=Result)
def analyze(crawl: dict = Body(...), llm: bool = True) -> Result:
    """크롤러 응답({"results": [...]}) 을 그대로 받아 JSON2 를 돌려준다. ?llm=false 면 OCR+정규식만."""
    if not isinstance(crawl.get("results"), list) and not crawl.get("username"):
        raise HTTPException(422, "크롤러 응답 형식이 아님: results 배열(또는 username)이 필요")
    use_llm = llm and bool(os.getenv("OPENAI_API_KEY"))  # 키 없으면 llm_used=false 로 응답
    profile, urls = from_crawler(crawl)
    # 이미지는 임시 폴더에 받아 분석하고, 끝나면 폴더째 삭제(개인정보)
    with tempfile.TemporaryDirectory() as tmp:
        images = download_images(urls, tmp)
        try:
            return run(images, profile, None, use_llm)
        except Exception as e:  # OCR 서버·OpenAI 호출 실패 등
            raise HTTPException(502, f"분석 실패: {type(e).__name__}: {e}")
