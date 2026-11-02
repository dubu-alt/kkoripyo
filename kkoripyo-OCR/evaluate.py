"""JSON2 예측 vs 정답셋 → 탐지 정확도 + 동일정보 매칭 정확도.

정답셋 형식: {"items": [{"type": "name", "value": "홍길동", "entity": "p1"}, ...]}
  - entity 가 같은 정답 항목끼리는 '동일 정보'(예: 한글 이름 ↔ 영문 이름). 생략하면 단독.

탐지: 예측 항목이 정답 항목과 "유형이 같고 정규화 값이 같거나 한쪽이 다른 쪽을 포함"하면 적중.
      face 는 값이 자유 서술이라 유형만 맞으면 적중.
      Precision 분모 = 예측 엔티티 수(중복 제거 후), Recall 분모 = 정답 항목 수.
매칭(쌍 단위): 정답에 적중한 예측 항목들의 모든 쌍에 대해
      "예측에서 같은 엔티티인가" vs "정답에서 같은 정보인가"를 비교.
      → 중복 제거(같은 값이 여러 출처에서 나온 것)와 동일 정보 연결을 함께 평가한다.
"""
import argparse
import glob
import json
import os
import sys
from itertools import combinations

from kkoripyo.match import normalize


def hit(gold: dict, item: dict) -> bool:
    if gold["type"] != item["type"]:
        return False
    if gold["type"] == "face":
        return True
    g, p = normalize(gold["type"], gold["value"]), item["normalized"]
    return bool(g and p) and (g == p or (min(len(g), len(p)) >= 2 and (g in p or p in g)))


def f1(p, r):
    return round(2 * p * r / (p + r), 3) if p + r else 0.0


def evaluate(pred: dict, gold: dict) -> dict:
    golds = gold["items"]
    for i, g in enumerate(golds):
        g.setdefault("entity", f"_g{i}")
    items = {it["id"]: it for it in pred["items"]}
    ent_of = {iid: e["entity_id"] for e in pred["entities"] for iid in e["item_ids"]}

    # 탐지
    gold_found = [any(hit(g, it) for it in items.values()) for g in golds]
    ent_ok = [any(hit(g, items[i]) for g in golds for i in e["item_ids"]) for e in pred["entities"]]
    P = sum(ent_ok) / len(ent_ok) if ent_ok else 0.0
    R = sum(gold_found) / len(golds)

    # 매칭: 예측 항목 → 처음 적중한 정답 항목의 entity
    gold_ent = {}
    for iid, it in items.items():
        for g in golds:
            if hit(g, it):
                gold_ent[iid] = g["entity"]
                break
    tp = fp = fn = 0
    for a, b in combinations(gold_ent, 2):
        same_pred, same_gold = ent_of[a] == ent_of[b], gold_ent[a] == gold_ent[b]
        tp += same_pred and same_gold
        fp += same_pred and not same_gold
        fn += same_gold and not same_pred
    mP = tp / (tp + fp) if tp + fp else 1.0
    mR = tp / (tp + fn) if tp + fn else 1.0

    return {
        "detection": {"precision": round(P, 3), "recall": round(R, 3), "f1": f1(P, R),
                      "missed": [f'{g["type"]}:{g["value"]}' for g, ok in zip(golds, gold_found) if not ok],
                      "false_positives": [f'{e["type"]}:{e["value"]}'
                                          for e, ok in zip(pred["entities"], ent_ok) if not ok]},
        "matching": {"pair_precision": round(mP, 3), "pair_recall": round(mR, 3), "f1": f1(mP, mR),
                     "pairs": {"tp": tp, "fp": fp, "fn": fn}},
    }


def evaluate_dir(folder: str, use_llm: bool) -> list[dict]:
    """folder 안의 <이름>.gold.json 마다 같은 이름의 이미지를 1장씩 따로 돌려 평가. 결과는 <이름>.out.json 저장."""
    from kkoripyo.pipeline import run
    rows = []
    for gold_path in sorted(glob.glob(os.path.join(folder, "*.gold.json"))):
        stem = gold_path[:-len(".gold.json")]
        img = next((stem + ext for ext in (".jpg", ".jpeg", ".png", ".webp") if os.path.exists(stem + ext)), None)
        if not img:
            print(f"[건너뜀] 이미지 없음: {gold_path}", file=sys.stderr)
            continue
        pred = json.loads(run([img], use_llm=use_llm).model_dump_json())
        open(stem + ".out.json", "w", encoding="utf-8").write(json.dumps(pred, ensure_ascii=False, indent=2))
        rows.append({"image": os.path.basename(img),
                     **evaluate(pred, json.load(open(gold_path, encoding="utf-8")))})
    return rows


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="단건: --pred --gold / 일괄: --dir private")
    ap.add_argument("--pred")
    ap.add_argument("--gold")
    ap.add_argument("--dir", help="이미지 + <이름>.gold.json 이 있는 폴더 일괄 평가")
    ap.add_argument("--no-llm", action="store_true")
    a = ap.parse_args()
    if a.dir:
        from kkoripyo.pipeline import load_dotenv
        load_dotenv()
        use_llm = not a.no_llm and bool(os.getenv("OPENAI_API_KEY"))
        rows = evaluate_dir(a.dir, use_llm)
        print(f"LLM {'사용' if use_llm else '미사용'} · OCR_ENGINE={os.getenv('OCR_ENGINE', 'tesseract')}")
        print(f"{'이미지':<28}{'탐지P':>7}{'탐지R':>7}{'탐지F1':>8}{'매칭F1':>8}  놓친 것")
        for r in rows:
            d, m = r["detection"], r["matching"]
            print(f"{r['image']:<30}{d['precision']:>7}{d['recall']:>7}{d['f1']:>8}{m['f1']:>8}  {', '.join(d['missed'])}")
        if rows:
            avg = lambda k, s: round(sum(r[k][s] for r in rows) / len(rows), 3)
            print(f"{'평균':<28}{avg('detection', 'precision'):>7}{avg('detection', 'recall'):>7}"
                  f"{avg('detection', 'f1'):>8}{avg('matching', 'f1'):>8}")
    elif a.pred and a.gold:
        report = evaluate(json.load(open(a.pred, encoding="utf-8")), json.load(open(a.gold, encoding="utf-8")))
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        ap.error("--dir 또는 --pred/--gold 를 지정하세요")
