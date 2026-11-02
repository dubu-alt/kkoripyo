"""정규식 기반 1차 탐지. LLM 없이도 돌고, LLM 결과의 기준선(baseline) 역할."""
import re

# (유형, 패턴, 신뢰도). 그룹 1이 있으면 그룹 1을 값으로 쓴다.
PATTERNS = [
    # 외국인등록번호도 형식이 같아 rrn으로 잡힘(뒷자리 5~8로 구분은 LLM 몫)
    ("rrn", r"\b\d{6}\s?-\s?[1-8]\d{6}\b", 0.95),
    # 뒷자리 가린 주민번호(020119-3******, 020119-3): 생년월일+성별 노출
    ("rrn", r"\b\d{6}\s?-\s?[1-8](?:[*xX●]{6})?(?![\d*xX●])", 0.7),
    ("phone", r"(?<!\d)01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}(?!\d)", 0.9),
    ("phone", r"(?<!\d)0(?:2|[3-6][1-5])[-.\s]?\d{3,4}[-.\s]?\d{4}(?!\d)", 0.7),
    ("email", r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+", 0.95),
    ("card_number", r"(?<!\d)\d{4}[- ]\d{4}[- ]\d{4}[- ]\d{4}(?!\d)", 0.85),
    ("passport", r"\b[MSRODG]\d{3}[A-Z]?\d{4,5}\b", 0.6),
    ("vehicle_plate", r"(?<!\d)\d{2,3}\s?[가-힣]\s?\d{4}(?!\d)", 0.8),
    ("student_id", r"(?:학번|사번)\s*[:：]?\s*(\d{6,10})", 0.9),
    ("student_id", r"\[(\d{6,10})\]", 0.6),
    ("birth_date", r"(?:생년월일|생일|DOB)\s*[:：]?\s*((?:19|20)\d{2}[./-]\d{1,2}[./-]\d{1,2})", 0.9),
    ("affiliation", r"[가-힣A-Za-z]+(?:대학교|대학|고등학교|중학교|초등학교|학과|학부)(?:\s+[가-힣]+(?:학과|학부|전공))?", 0.7),
    ("other_clue", r"(?:재학|휴학|졸업)(?:생|중)?|[1-6]\s?학년", 0.5),
]
PATTERNS = [(t, re.compile(p), c) for t, p, c in PATTERNS]

# 흔한 성씨. shortcut: 3음절 + 성씨 휴리스틱이라 오탐/미탐 있음 → 이름은 LLM 결과를 우선.
SURNAMES = set("김이박최정강조윤장임한오서신권황안송류전홍고문양손배백허유남심노하곽성차주우구민진나지엄채원천방공현함변염여추도소석선설마길연위표명기반왕금옥육인맹제모")
KOR_NAME = re.compile(r"(?<![가-힣])([가-힣]{3})(?![가-힣])")
ENG_NAME = re.compile(r"\b([A-Z][a-z]{1,10} [A-Z][a-z]{1,12})\b")


def find(text: str) -> list[dict]:
    """text에서 개인정보 후보를 찾는다. 반환: [{type, value, evidence, confidence}]"""
    out, taken = [], []
    for typ, pat, conf in PATTERNS:
        for m in pat.finditer(text):
            span = m.span(1) if m.re.groups else m.span()
            if any(s <= span[0] < e for s, e in taken):  # 앞 패턴이 이미 잡은 구간(예: 카드번호 속 전화번호)
                continue
            taken.append(span)
            out.append(_hit(typ, text[span[0]:span[1]], text, m.span(), conf))
    for m in KOR_NAME.finditer(text):
        if m.group(1)[0] in SURNAMES and not any(s <= m.start() < e for s, e in taken):
            out.append(_hit("name", m.group(1), text, m.span(), 0.5))
    # 영문 이름은 한글 이름과 로마자 매칭될 때만 채택(match.py에서 판정)
    for m in ENG_NAME.finditer(text):
        out.append(_hit("name", m.group(1), text, m.span(), 0.3) | {"needs_korean_pair": True})
    return out


def _hit(typ, value, text, span, conf):
    s, e = max(0, span[0] - 15), span[1] + 15
    return {"type": typ, "value": value.strip(), "evidence": text[s:e].strip(), "confidence": conf}
