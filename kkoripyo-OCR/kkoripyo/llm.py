"""OpenAI Structured Outputs 로 텍스트·이미지에서 개인정보 추출."""
import base64
import mimetypes
import os

from .schema import TAXONOMY, LLMFinding, LLMFindings

SYSTEM = """너는 SNS 콘텐츠에서 개인정보 노출을 찾는 감사관이다. 제3자가 이 콘텐츠만 보고 알아낼 수 있는 정보를 찾는다.
규칙:
- 입력에 실제로 보이거나 적힌 것만 보고한다. 추측으로 값을 만들지 않는다.
- value 는 원문 그대로(OCR 오타는 이미지 기준으로 바로잡아도 됨). face/location/other_clue 처럼 텍스트가 아닌 단서는 짧은 설명을 value 로 쓴다.
- evidence 에는 어디서 무엇을 보고 판단했는지 한 문장으로 쓴다.
- source_id 는 입력에 표시된 [source_id] 중 하나를 그대로 쓴다.
- confidence 는 0~1. 개인정보가 아닐 수도 있으면 낮게 준다.
- 같은 값을 여러 번 보고하지 않는다(서로 다른 표기, 예: 한글 이름과 영문 이름은 각각 보고).
- 이미지에서는 글자 외의 시각 단서도 찾는다: 식별 가능한 얼굴(face), 장소를 특정할 수 있는 간판·상호·랜드마크·건물·역/도로 표지판·창밖 풍경(location, value 에 추정 장소와 단서를 함께), 교복·명찰·사원증·로고(affiliation 또는 other_clue), 차량번호판·택배 송장·우편물(해당 유형).
유형(type): """ + "; ".join(f"{k}={v[1]}({v[0]})" for k, v in TAXONOMY.items())


def _client():
    from openai import OpenAI
    return OpenAI()


def _call(content: list, client=None) -> list[LLMFinding]:
    client = client or _client()
    resp = client.chat.completions.parse(
        model=os.getenv("OPENAI_MODEL") or "gpt-4o-mini",
        messages=[{"role": "system", "content": SYSTEM}, {"role": "user", "content": content}],
        response_format=LLMFindings,  # temperature 생략: gpt-5/o 계열은 지정 시 거부
    )
    parsed = resp.choices[0].message.parsed
    return parsed.findings if parsed else []  # 거부(refusal) 시 빈 결과


def extract_text(sources: dict[str, str], client=None) -> list[LLMFinding]:
    """여러 텍스트 소스를 한 번에 보낸다. sources: {source_id: text}"""
    body = "\n\n".join(f"[{sid}]\n{text}" for sid, text in sources.items() if text.strip())
    return _call([{"type": "text", "text": body}], client) if body else []


def extract_image(path: str, source_id: str, ocr_text: str, client=None) -> list[LLMFinding]:
    mime = mimetypes.guess_type(path)[0] or "image/jpeg"
    b64 = base64.b64encode(open(path, "rb").read()).decode()
    return _call([
        {"type": "text", "text": f"[{source_id}] 이미지. 참고용 OCR 결과(오류 있을 수 있음):\n{ocr_text or '(없음)'}"},
        {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}},
    ], client)
