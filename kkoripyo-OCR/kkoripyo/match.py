"""중복 제거 + 동일 정보 매칭.

같은 유형 안에서만 묶는다:
  1) 정규화 값이 같으면 동일 (010-1234-5678 == 010.1234.5678)
  2) 이름: 한글 ↔ 영문 로마자 유사도 >= 0.8 이면 동일 (김민구 ↔ Kim Mingoo)
  3) 소속/주소: 한쪽이 다른 쪽을 포함하면 동일 (컴퓨터공학과 ⊂ 한국대학교 컴퓨터공학과)
"""
import re
from difflib import SequenceMatcher

from .schema import Entity, PIIItem

DIGIT_TYPES = {"rrn", "alien_reg", "phone", "card_number", "bank_account", "student_id", "driver_license"}

_L = "g kk n d tt r m b pp s ss  j jj ch k t p h".split(" ")
_V = "a ae ya yae eo e yeo ye o wa wae oe yo u wo we wi yu eu ui i".split(" ")
_T = ["", "k", "k", "k", "n", "n", "n", "t", "l", "k", "m", "l", "l", "l", "p", "l", "m", "p", "p",
      "t", "t", "ng", "t", "t", "k", "t", "p", "t"]
# 표기 흔들림 접기: Kim/Gim, Park/Bak, Lee/I, Mingoo/Mingu, Jeong/Jung/Chung ...
_FOLD = [("ch", "j"), ("k", "g"), ("t", "d"), ("p", "b"), ("r", "l"), ("oo", "u"), ("ee", "i"), ("eo", "u")]


def normalize(typ: str, value: str) -> str:
    if typ in DIGIT_TYPES:
        return re.sub(r"\D", "", value)
    if typ in ("email", "sns_account"):  # 점·밑줄이 의미 있는 값
        return value.strip().lstrip("@").lower()
    if typ in ("passport", "vehicle_plate"):
        return re.sub(r"\s", "", value).upper()
    return re.sub(r"[\s\[\]()<>.,·:：\-_'\"]", "", value).lower()


def romanize(hangul: str) -> str:
    out = []
    for ch in hangul:
        c = ord(ch) - 0xAC00
        out.append(_L[c // 588] + _V[c % 588 // 28] + _T[c % 28] if 0 <= c < 11172 else ch)
    return "".join(out)


def _fold(s: str) -> str:
    s = re.sub(r"[^a-z]", "", s.lower())
    for a, b in _FOLD:
        s = s.replace(a, b)
    return s


def same_name(a: str, b: str) -> bool:
    ko, en = (a, b) if re.search("[가-힣]", a) else (b, a)
    if not re.search("[가-힣]", ko) or re.search("[가-힣]", en):
        return False
    target = _fold(romanize(ko.replace(" ", "")))
    parts = en.split()
    variants = {en, " ".join(parts[-1:] + parts[:-1])}  # "Gildong Hong" → "Hong Gildong"
    return max(SequenceMatcher(None, target, _fold(v)).ratio() for v in variants) >= 0.8


def _same(a: PIIItem, b: PIIItem) -> str | None:
    if a.type != b.type:
        return None
    if a.normalized == b.normalized:
        return "normalized"
    if a.type == "face":
        return "face"  # shortcut: 사진 1장=1명 가정. 여러 얼굴/여러 사진이면 얼굴 임베딩 비교로 교체
    if a.type == "name" and same_name(a.value, b.value):
        return "romanization"
    if a.type in ("affiliation", "address") and min(len(a.normalized), len(b.normalized)) >= 4 \
            and (a.normalized in b.normalized or b.normalized in a.normalized):
        return "contains"
    return None


def build_entities(items: list[PIIItem], tentative: set[str] = frozenset()):
    """union-find로 묶는다. tentative(짝이 있어야 채택되는 항목)가 혼자 남으면 버린다."""
    parent = {it.id: it.id for it in items}
    reasons: dict[str, set] = {}

    def root(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for i, a in enumerate(items):
        for b in items[i + 1:]:
            r = _same(a, b)
            if r and root(a.id) != root(b.id):
                ra, rb = root(a.id), root(b.id)
                parent[rb] = ra
                reasons.setdefault(ra, set()).update({r} | reasons.pop(rb, set()))
            elif r:
                reasons.setdefault(root(a.id), set()).add(r)

    groups: dict[str, list[PIIItem]] = {}
    for it in items:
        groups.setdefault(root(it.id), []).append(it)
    groups = {k: g for k, g in groups.items() if not all(it.id in tentative for it in g)}

    kept = {it.id for g in groups.values() for it in g}
    entities = []
    for n, (k, g) in enumerate(groups.items(), 1):
        best = max(g, key=lambda it: it.confidence)
        entities.append(Entity(
            entity_id=f"E{n}", type=best.type, value=best.value,
            item_ids=[it.id for it in g],
            sources=list(dict.fromkeys(it.source.input_id for it in g)),
            match_reasons=sorted(reasons.get(k, set())) or ["single"],
            confidence=max(it.confidence for it in g),
        ))
    return [it for it in items if it.id in kept], entities
