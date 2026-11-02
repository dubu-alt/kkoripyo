"""JSON2 출력 스키마 + 개인정보 분류 기준(taxonomy).

분류 근거: 개인정보 보호법 제2조(개인정보 정의), 제23조(민감정보),
제24조·시행령 제19조(고유식별정보), 개인정보보호위원회 가명정보 처리 가이드라인의
식별자/준식별자 구분. 상세 표는 README 참고.
"""
from typing import Literal, Optional

from pydantic import BaseModel

PIIType = Literal[
    "name", "rrn", "passport", "driver_license", "alien_reg",
    "phone", "email", "address", "birth_date", "student_id",
    "card_number", "bank_account", "vehicle_plate", "sns_account",
    "affiliation", "location", "face", "sensitive", "other_clue",
]

# 유형 → (분류, 한국어 설명). LLM 프롬프트와 README가 같은 표를 쓴다.
TAXONOMY: dict[str, tuple[str, str]] = {
    "name": ("일반개인정보", "성명(한글·영문)"),
    "rrn": ("고유식별정보", "주민등록번호"),
    "passport": ("고유식별정보", "여권번호"),
    "driver_license": ("고유식별정보", "운전면허번호"),
    "alien_reg": ("고유식별정보", "외국인등록번호"),
    "phone": ("일반개인정보", "휴대폰·전화번호"),
    "email": ("일반개인정보", "이메일 주소"),
    "address": ("일반개인정보", "주소(도로명·지번·동호수)"),
    "birth_date": ("일반개인정보", "생년월일"),
    "student_id": ("일반개인정보", "학번·사번 등 기관 내 식별번호"),
    "card_number": ("금융정보", "신용·체크카드 번호"),
    "bank_account": ("금융정보", "계좌번호"),
    "vehicle_plate": ("일반개인정보", "차량번호"),
    "sns_account": ("일반개인정보", "SNS 계정·아이디"),
    "affiliation": ("준식별자", "소속(학교·학과·회사·부서)"),
    "location": ("준식별자", "위치·장소·랜드마크·GPS"),
    "face": ("일반개인정보", "식별 가능한 얼굴 이미지"),
    "sensitive": ("민감정보", "건강·종교·정치·노조·성생활·인종 등(법 제23조)"),
    "other_clue": ("준식별자", "기타 결합 시 식별 단서(학년·재학상태·교복·명찰 등)"),
}

Method = Literal["regex", "ocr+regex", "profile_field", "llm", "vision_llm"]


class Source(BaseModel):
    input_id: str                     # 예: "profile.biography", "post:ABC.caption", "image:card.jpg"
    modality: Literal["text", "image"]
    method: Method
    bbox: Optional[list[int]] = None  # OCR 라인 박스 [x, y, w, h]


class PIIItem(BaseModel):
    id: str
    type: PIIType
    category: str
    value: str
    normalized: str
    evidence: str
    source: Source
    confidence: float


class Entity(BaseModel):
    entity_id: str
    type: PIIType
    value: str              # 대표값(신뢰도 최고 항목)
    item_ids: list[str]
    sources: list[str]      # 이 정보가 발견된 입력들
    match_reasons: list[str]
    confidence: float


class Result(BaseModel):
    schema_version: str = "json2/v1"
    subject: Optional[str] = None
    llm_used: bool
    items: list[PIIItem]
    entities: list[Entity]


# --- OpenAI Structured Outputs용 (strict: 모든 필드 필수, 기본값 없음) ---
class LLMFinding(BaseModel):
    source_id: str
    type: PIIType
    value: str
    evidence: str
    confidence: float


class LLMFindings(BaseModel):
    findings: list[LLMFinding]
