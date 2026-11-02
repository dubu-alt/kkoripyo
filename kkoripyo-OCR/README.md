# kkoripyo-OCR

SNS 프로필·게시글·댓글 텍스트와 사진에서 **개인정보를 찾아내고(OCR · Vision LLM · LLM)**, 
**유형·값·근거·출처로 구조화**한 뒤 **중복 제거 + 동일 정보 매칭**까지 해서 **JSON2**로 내보내는 모듈입니다.

```
크롤러 결과(JSON1: 프로필·캡션·댓글)  ─┐
게시물 이미지 ─────────────────────────┼─▶ kkoripyo ─▶ JSON2 ─▶ 교차 추론 · JSON3(다른 파트)
추가 텍스트 ───────────────────────────┘
```

## 담당 범위

| 항목 | 구현 위치 | 상태 |
|---|---|---|
| 개인정보 탐지·분류 기준 정의 (개인정보보호위원회·법령 참고) | `kkoripyo/schema.py` `TAXONOMY` | ✅ |
| 텍스트(프로필, 게시글, 댓글)에서 개인정보 추출 | `rules.py`(정규식) + `llm.py`(LLM) | ✅ |
| OCR로 사진 속 텍스트 추출 | GPU 서버 `server.py`: **PaddleOCR** `korean_PP-OCRv5_mobile_rec` / 로컬 테스트: Tesseract | ✅ (맥 CPU 실행 확인, GPU 서버 미검증) |
| Vision LLM으로 사진 속 개인정보·식별 단서 탐지 | `llm.py` `extract_image` (OpenAI) | ✅ 코드 / ⚠️ 실호출 미검증 |
| 유형·값·근거·출처로 구조화 (Structured Outputs) | `schema.py` (Pydantic → `chat.completions.parse`) | ✅ |
| 중복 제거 및 동일 정보 매칭 | `match.py` | ✅ |
| 탐지 정확도 / 매칭 정확도 평가 | `evaluate.py` | ✅ |

## 처리 흐름

```
1. 텍스트 소스 수집   profile.full_name / profile.biography / post:<코드>.caption / post:<코드>.commentN
2. 이미지 OCR        Tesseract psm 6 → 라인별 텍스트 + bbox (한글 글자단위 분리 → 간격 기준으로 다시 붙임)
3. 규칙 탐지          텍스트·OCR 라인에 정규식 적용 (주민번호, 전화, 이메일, 카드, 학번, 차량번호, 소속 …)
4. LLM 탐지 (선택)    · 텍스트: 모든 소스를 [source_id] 로 묶어 1회 호출
                     · 이미지: 이미지 + OCR 결과를 함께 보내 Vision LLM 1회 호출 (얼굴, 명찰, 교복, 장소 등)
                     · 응답은 Structured Outputs(LLMFindings 스키마)로 강제
5. 구조화            모든 탐지 결과 → PIIItem(유형·분류·값·정규화값·근거·출처·신뢰도)
6. 매칭              같은 유형 안에서 union-find 로 묶어 Entity 생성
```

규칙(3)은 API 없이도 돌아가는 **기준선**이고, LLM(4)은 규칙이 못 잡는 이름·얼굴·문맥 단서를 보강합니다. 둘의 결과는 6단계에서 합쳐집니다.

## 개인정보 분류 기준

| type | 분류 | 설명 | 근거 |
|---|---|---|---|
| `rrn` `passport` `driver_license` `alien_reg` | 고유식별정보 | 주민등록·여권·운전면허·외국인등록번호 | 개인정보 보호법 제24조, 시행령 제19조 |
| `sensitive` | 민감정보 | 사상·신념, 노조·정당, 정치적 견해, 건강, 성생활, 유전·범죄경력, 생체인식, 인종·민족 | 법 제23조, 시행령 제18조 |
| `card_number` `bank_account` | 금융정보 | 카드번호, 계좌번호 | 유출 시 직접 피해 |
| `name` `phone` `email` `address` `birth_date` `student_id` `vehicle_plate` `sns_account` `face` | 일반개인정보 | 그 자체로 개인을 알아볼 수 있는 정보 | 법 제2조 제1호 가목 |
| `affiliation` `location` `other_clue` | 준식별자 | 단독으론 약하지만 **결합하면** 식별 가능 (소속, 위치, 학년·재학상태, 교복·명찰 …) | 법 제2조 제1호 나목, 가명정보 처리 가이드라인의 식별자/준식별자 구분 |

- `face`: 얼굴 사진은 알아볼 수 있으면 개인정보. 특징을 추출해 식별에 쓰면 생체인식정보(민감정보)가 되지만, 이 모듈은 "노출 여부"만 판단하므로 일반개인정보로 둡니다.
- 서비스 목적이 "제3자가 무엇을 알아낼 수 있나"이므로 **준식별자도 적극적으로 수집**합니다. 정보 결합 추론은 다음 단계(JSON3)의 몫입니다.
- 표는 `TAXONOMY` 한 곳에서 관리하고, LLM 프롬프트도 이 표로 자동 생성됩니다.

## 동일 정보 매칭 규칙

같은 `type` 끼리만 비교하고, 하나라도 맞으면 같은 엔티티로 묶습니다(union-find).

| 규칙 | 예 | `match_reasons` |
|---|---|---|
| 정규화 값 일치 (숫자형은 숫자만, 이메일·계정은 소문자, 나머지는 공백·괄호 제거) | `010.1234.5678` = `010-1234-5678` | `normalized` |
| 이름 한글 ↔ 영문: 한글을 로마자로 바꾼 뒤 표기 흔들림(k/g, oo/u, ee/i, eo/u, r/l …)을 접어서 유사도 ≥ 0.8 | `홍길동` = `Hong Gildong` = `Gildong Hong` | `romanization` |
| 소속·주소 포함 관계 (짧은 쪽 4자 이상) | `컴퓨터공학과` ⊂ `한국대학교 컴퓨터공학과` | `contains` |
| 얼굴: 한 분석 안의 얼굴은 같은 사람으로 가정 | | `face` |

규칙으로 찾은 영문 이름(`Hong Gildong` 형태)은 오탐이 많아서 **한글 이름과 짝이 맞을 때만** 남깁니다(`Life Captured` 같은 캡션은 버려짐).

## 실행

```bash
# 1) Tesseract + 한국어 언어팩
brew install tesseract tesseract-lang          # macOS
# sudo apt install tesseract-ocr tesseract-ocr-kor   # Ubuntu (해커톤 서버)

# 2) 파이썬 패키지
pip install -r requirements.txt

# 3) API 키 (.env 는 커밋 금지)
cp .env.example .env    # OPENAI_API_KEY 입력, 모델 변경은 OPENAI_MODEL

# 4) 실행
python -m kkoripyo --profile samples/fake_profile.json --image samples/fake_card.png -o out.json
python -m kkoripyo --image some.jpg --text "댓글 내용" --no-llm      # OCR+정규식만
python -m kkoripyo --profile 크롤러응답.json -o private/out.json      # 크롤러 API 응답 그대로
```

### 크롤러 입력 형식

`--profile` 은 크롤러 API 응답(`results[]`)을 그대로 받습니다. 예시: `samples/fake_crawl.json`

| 크롤러 필드 | 사용처 | JSON2 출처(`input_id`) |
|---|---|---|
| `results[0].author_username` | 계정 (`sns_account`) | `profile.username` |
| `results[0].author_name` | 이름 (`name`) | `profile.full_name` |
| `results[].text` | 캡션 → 정규식 + LLM | `post:<post_id>.caption` |
| `results[].top_comments[].text` | 댓글 → 정규식 + LLM | `post:<post_id>.comment<N>` |
| `results[].image_url` | 임시 폴더에 내려받아 OCR + Vision LLM, 끝나면 삭제 | `image:<post_id>.jpg` |

- 이미지 다운로드는 파이프라인(맥/백엔드)이 하므로 **GPU 서버는 인터넷 불필요**. 받은 이미지는 base64 로 GPU 서버에 전달
- 만료된 `image_url`, 10MB 초과 이미지는 경고 후 건너뜀 (나머지는 계속 처리)
- `results` 는 한 계정의 게시물이라고 가정. 여러 계정이 섞이면 계정별로 나눠서 실행
- `billing`, `quota`, `like_count` 등 나머지 필드는 사용하지 않음. 댓글 작성자(`top_comments[].author_username`)도 아직 사용 안 함 → 주변 계정 선정 단계에서 활용 가능
- 기존 instaloader 형식(`samples/fake_profile.json`)도 계속 지원

### OCR 엔진 선택

| `OCR_ENGINE` | 모델 | 설치 |
|---|---|---|
| `tesseract` (기본) | Tesseract 5 `kor+eng` | 위 1) |
| `none` | OCR 생략, Vision LLM 만 사용 (지연·설치 최소화) | - |
| `paddle` | PaddleOCR PP-OCRv5 검출 + [`korean_PP-OCRv5_mobile_rec`](https://aistudio.baidu.com/modelsdetail/31927/intro) 인식 | `pip install paddlepaddle paddleocr` (첫 실행 때 가중치 자동 다운로드) |
| `remote` | 분리된 GPU 서버의 OCR API 호출 (`OCR_SERVER_URL`) | 아래 "GPU OCR 서버" |

```bash
OCR_ENGINE=paddle python -m kkoripyo --image private/student_card.jpg --no-llm -o private/out_paddle.json
python evaluate.py --pred private/out_paddle.json --gold private/student_card.gold.json
```

### GPU OCR 서버 (분리 배포)

```bash
# GPU 서버에서
pip install -r requirements.txt fastapi uvicorn paddleocr paddlepaddle-gpu   # CUDA 버전에 맞는 휠
uvicorn kkoripyo.server:app --host 0.0.0.0 --port 8000   # 서버는 항상 PaddleOCR (OCR_ENGINE 설정 불필요)
curl http://localhost:8000/health   # "cuda_build": true 여야 GPU 사용. false 면 paddlepaddle-gpu 재설치

# 파이프라인 쪽에서
OCR_ENGINE=remote OCR_SERVER_URL=http://<GPU서버>:8000 python -m kkoripyo --image a.jpg
```

API 요청·응답 형식은 아래 [OCR 서버 API 명세](#ocr-서버-api-명세) 참고.

장소·얼굴·간판·교복 같은 **글자가 아닌 단서는 OCR로는 못 잡고** Vision LLM 단계(`llm.py`)에서 `location` / `face` / `other_clue` 로 찾습니다.

`OPENAI_API_KEY` 가 없으면 경고를 띄우고 OCR+정규식만으로 돌며, 출력의 `llm_used` 가 `false` 가 됩니다.

## 개인정보 추출 API (JSON2)

크롤러 응답 JSON 을 그대로 보내면 JSON2 를 돌려준다. **OpenAI 를 호출하므로 외부 인터넷이 되는 서버**(일반/백엔드 서버)에서 띄운다.

```bash
pip install -r requirements.txt fastapi uvicorn
# .env: OPENAI_API_KEY, OCR_ENGINE=remote, OCR_SERVER_URL=http://<GPU서버 사설IP>:8000
uvicorn kkoripyo.api:app --host 0.0.0.0 --port 8001
```

- Base URL: `http://<서버IP>:8001`
- 문서: `http://<서버IP>:8001/docs`

| 메서드 | 경로 | 용도 |
|---|---|---|
| GET | `/health` | 상태 확인 → `{"ok": true, "ocr_engine": "remote", "llm_available": true}` |
| POST | `/analyze` | 크롤러 응답 → JSON2 |
| POST | `/analyze?llm=false` | OpenAI 없이 OCR+정규식만 (테스트·비용 절약용) |

**요청** — 크롤러 응답 그대로 (`samples/fake_crawl.json` 참고)
```json
{"results": [{"post_id": "FAKE001", "text": "캡션", "author_username": "gildong_hong", "author_name": "홍길동",
              "image_url": "https://...", "top_comments": [{"text": "댓글", "author_username": "friend"}]}]}
```

**응답 (200)** — JSON2 (`samples/fake.json2.json` 참고)
```json
{"schema_version": "json2/v1", "subject": "gildong_hong", "llm_used": true, "items": [...], "entities": [...]}
```

| 상태 코드 | 의미 |
|---|---|
| 200 | 성공. `OPENAI_API_KEY` 가 없으면 OCR+정규식만 돌고 `llm_used: false` |
| 422 | 크롤러 응답 형식이 아님 (`results` 배열 없음) |
| 502 | 분석 중 실패 (OCR 서버 연결 실패, OpenAI 오류 등). `detail` 에 사유 |

- `image_url` 은 이 서버가 내려받아 OCR 서버에 base64 로 보낸다 → **GPU 서버는 인터넷 불필요**
- 만료된 `image_url` 은 건너뛰고 나머지로 분석 (서버 로그에 경고)
- 받은 이미지는 임시 폴더에서 처리 후 즉시 삭제, 결과는 저장하지 않음
- 소요 시간: 이미지 수 × (다운로드 + OCR 약 0.2초 + OpenAI 수 초) → 백엔드 타임아웃은 넉넉히 (예: 120초)

## OCR 서버 API 명세

- Base URL: `http://<GPU서버 사설IP>:8000` (해커톤 SSL-VPN 연결 필요)
- 문서: `http://<GPU서버 사설IP>:8000/docs` (FastAPI 자동 문서, 브라우저에서 바로 테스트 가능)
- 엔진: PaddleOCR (PP-OCRv5 검출 + `korean_PP-OCRv5_mobile_rec` 인식)
- 속도: 이미지 1장 약 0.2초 (서버 기동 후 첫 요청만 약 5초, 이미지 다운로드 시간 별도)

### GET /health
```json
{"ok": true, "engine": "paddle", "device": "gpu", "cuda_build": true}
```
`device` 기본값은 `gpu` (GPU 를 못 쓰면 CPU 로 넘어가지 않고 에러). `cuda_build: false` 면 CPU 전용 paddle 이 설치된 것. 맥 등 GPU 없는 곳에서 PaddleOCR 을 직접 돌릴 땐 `.env` 에 `OCR_DEVICE=cpu`.

### POST /ocr
이미지 URL 을 보내면 서버가 내려받아 글자를 인식한다. 한 번에 1~20장.

**요청**
```json
{
  "images": [
    {"image_id": "DeNP20OktEn_0", "image_url": "https://instagram....jpg"},
    {"image_id": "Ddtv14MGyhl_0", "image_url": "https://instagram....jpg"}
  ]
}
```
| 필드 | 필수 | 설명 |
|---|---|---|
| `image_id` | O | 이미지 구분값. 응답에 그대로 돌아옴 |
| `image_url` | △ | 이미지 URL (http/https) |
| `base64` | △ | **(확장)** URL 대신 이미지 바이트를 base64 로 직접 전송. 있으면 우선 사용 (파이프라인 `remote` 모드가 사용) |

`image_url` 과 `base64` 중 하나는 필수.

**응답 (200)**
```json
{
  "images": [
    {
      "image_id": "DeNP20OktEn_0",
      "image_url": "https://instagram....jpg",
      "isTextPresent": false,
      "data": "",
      "error": null
    },
    {
      "image_id": "Ddtv14MGyhl_0",
      "image_url": "https://instagram....jpg",
      "isTextPresent": true,
      "data": "Tuesdays with Morrie\nThe most important thing in life is to learn how to give out love",
      "error": null
    }
  ]
}
```
| 필드 | 설명 |
|---|---|
| `image_id` | 요청 값 그대로 |
| `image_url` | 요청 값 그대로 |
| `isTextPresent` | 글자가 있으면 `true` (검출 단계에서 글자 영역이 없으면 `false`) |
| `data` | 인식한 글자. 줄마다 `\n` 으로 구분. 글자 없거나 실패하면 `""` |
| `error` | **(확장)** 실패 사유 (`"코드: 설명"`). 성공·글자 없음은 `null` |

- 결과 순서 = 요청 순서
- 일부 이미지가 실패해도 응답은 **200**, 해당 이미지의 `error` 에만 표시
- 요청 형식이 잘못되면 **422** (빈 `images`, 21장 이상, `image_id` 누락)
- 받은 이미지는 저장하지 않음 (처리 후 임시 파일 즉시 삭제)

**error 코드** — `isTextPresent: false` 일 때 `error` 가 `null` 이면 글자 없는 정상 이미지, 값이 있으면 실패.

| 코드 | 의미 | 할 일 |
|---|---|---|
| `no_image` | `image_url`·`base64` 둘 다 없음 / 빈 데이터 | 크롤러 데이터 확인 |
| `invalid_image` | base64 깨짐 / 이미지가 아님 | 크롤러 데이터 확인 |
| `too_large` | 10MB 초과 | 리사이즈 후 재요청 |
| `fetch_failed` | URL 다운로드 실패 (만료된 인스타 URL, 서버 외부 인터넷 차단 등) / http(s) 아님 | 재수집 또는 `base64` 로 전송 |

### 참고 사항
- **확장 필드**: `error`(응답), `base64`(요청)는 팀 명세에 추가한 필드. 쓰지 않으면 무시해도 기존 형식과 동일
- **위치 정보 없음**: 응답에 글자 위치(`bbox`)가 없어서, GPU 서버를 거친 JSON2 항목의 `source.bbox` 는 `null`. 사진 위에 위치를 표시하려면 응답에 `lines: [{"text", "bbox"}]` 추가 필요
- **외부 인터넷 필요**: `image_url` 방식은 GPU 서버가 인스타그램 CDN 에 접속할 수 있어야 함. 서버에서 `curl -sI "<image_url>" | head -1` 로 `200` 확인. 막혀 있으면 백엔드가 이미지를 받아 `base64` 로 전송
- **URL 만료**: 인스타 이미지 URL 은 시간이 지나면 만료되므로 크롤링 직후 바로 요청

### 호출 예시
```bash
curl -X POST http://<GPU서버 사설IP>:8000/ocr -H 'Content-Type: application/json' \
  -d '{"images":[{"image_id":"t1","image_url":"https://..."}]}'
```
```python
import json, urllib.request

body = {"images": [{"image_id": "t1", "image_url": "https://..."}]}
req = urllib.request.Request("http://<GPU서버 사설IP>:8000/ocr", data=json.dumps(body).encode(),
                             headers={"Content-Type": "application/json"})
res = json.load(urllib.request.urlopen(req, timeout=60))
for img in res["images"]:
    print(img["image_id"], img["isTextPresent"], img["data"], img["error"])
```

## 평가

```bash
python evaluate.py --pred out.json --gold samples/fake.gold.json
python -m pytest tests          # 또는 python tests/test_pipeline.py
```

### 테스트 이미지 바꿔가며 일괄 평가

`private/` 에 **이미지와 같은 이름의 정답셋**을 넣고 한 번에 돌립니다. 이미지는 1장씩 따로 분석되고, 결과는 `<이름>.out.json` 으로 저장됩니다.

```
private/
├── student_card.jpg
├── student_card.gold.json
├── baby_record.jpg
└── baby_record.gold.json      ← 정답셋 없는 이미지는 평가에서 빠짐
```

```bash
python evaluate.py --dir private                        # .env 에 키 있으면 LLM 포함
OCR_ENGINE=none python evaluate.py --dir private        # Vision LLM 만
python evaluate.py --dir private --no-llm               # OCR+정규식만 (기준선)
```

출력: 이미지별 탐지 P/R/F1 · 매칭 F1 · 놓친 항목 + 평균. 세 설정을 비교하면 OCR 이 LLM 에 도움이 되는지 바로 보입니다.

정답셋 형식: `{"items": [{"type": "name", "value": "홍길동", "entity": "p1"}, ...]}` — `entity` 가 같은 항목은 동일 정보.

| 지표 | 정의 |
|---|---|
| 탐지 Precision | 정답과 맞는 예측 엔티티 / 전체 예측 엔티티 (중복 제거 후 기준) |
| 탐지 Recall | 예측에 잡힌 정답 항목 / 전체 정답 항목 |
| 매칭 Pair P/R/F1 | 정답에 적중한 예측 항목들의 모든 쌍에 대해 "예측에서 같은 엔티티인가" vs "정답에서 같은 정보인가" 비교 → 중복 제거와 동일 정보 연결을 함께 평가 |

적중 조건: 유형이 같고 정규화 값이 같거나 한쪽이 다른 쪽을 포함(`1학년` ↔ `1학년(기)`). `face` 는 유형만 맞으면 적중.

### 현재 결과 (OCR + 정규식만, LLM 미사용)

| 데이터 | 탐지 P | 탐지 R | 탐지 F1 | 매칭 F1 | 놓친 것 / 오탐 |
|---|---|---|---|---|---|
| `samples/` 가상 인물 (프로필 + 학생증 이미지) | 0.80 | 0.90 | 0.85 | 1.00 | 놓침: `26학번` / 오탐: `연락처`·`길동아`(이름 휴리스틱) |
| 실제 학생증 캡처 1장 (비공개, `private/`) | 1.00 | 0.71 | 0.83 | 1.00 | 놓침: `재학`(흰 글씨/파란 배경 OCR 실패), 얼굴 |
| 실제 손글씨 육아수첩 사진 1장 (비공개) | - | 0.00 | 0.00 | - | Tesseract가 손글씨를 거의 못 읽음 → 이름·생년월일·주민번호 앞자리·혈액형 9개 전부 놓침 |

**손글씨는 Tesseract로 불가능**합니다. 그래서 GPU 서버는 PaddleOCR 을 씁니다.

PaddleOCR 글자 판독 결과 (맥 CPU 실행, 항목 단위): 포털 캡처 **100%** (Tesseract 가 놓친 `재학`·`소속` 포함) / 손글씨 육아수첩 **약 60~70%** (주민번호 앞자리·어머니 이름·동그라미 친 성별 놓침).

놓친 항목은 모두 Vision LLM 이 맡을 영역(얼굴, 배경색 위 글자, 문맥 단서)입니다. **LLM 포함 수치는 API 키로 직접 돌려서 이 표에 추가해야 합니다** (아래 "남은 문제").

## 개인정보 취급 주의

- 실제 사람의 사진·정답셋·출력물은 **`private/` 에만** 두세요. `.gitignore` 로 제외되어 있습니다. 커밋 전 `git status` 로 다시 확인.
- `samples/` 는 전부 **가상 인물**(홍길동, `example.com`)입니다. 실데이터를 여기에 넣지 마세요.
- `.env`, API 키는 커밋 금지. 필요한 키 이름은 `.env.example` 에만.
- OpenAI 로 이미지를 보내면 외부 전송입니다. 시연·테스트는 본인 동의를 받은 데이터로만.

## 남은 문제

- **Vision LLM 실호출 미검증**: 개발 환경에서 `api.openai.com` 접근이 막혀 있어, LLM 단계는 대역(stub) 클라이언트로 병합 로직만 테스트했습니다. 키를 넣고 `private/` 데이터로 한 번 돌려 위 표를 채워주세요. 기본 모델은 `gpt-4o-mini`, `.env` 의 `OPENAI_MODEL` 로 변경.
- **GPU 서버 PaddleOCR 미검증**: 맥(CPU)에서는 정상 동작 확인. GPU 서버에서 `paddlepaddle-gpu` 로 실제 GPU 를 쓰는지 `nvidia-smi` 로 확인 필요.
- 규칙 기반 이름 탐지는 "3음절 + 흔한 성씨" 휴리스틱이라 오탐(`연락처`)이 납니다. LLM 사용 시 LLM 결과를 우선 보세요.
- 얼굴 매칭은 "한 분석 = 한 사람" 가정. 여러 사진에 여러 얼굴이면 얼굴 임베딩 비교가 필요합니다.
- 서로 다른 유형 간 연결(이 이름 ↔ 이 학번이 같은 사람)은 하지 않습니다. 관계 그래프 파트에서 `entities` 를 노드로 쓰면 됩니다.
- 정답셋이 아직 2건뿐이라 수치는 참고용입니다. 팀 테스트 데이터를 `private/` 에 모아 늘려야 합니다.

## 참고

- 개인정보 보호법 제2조(정의), 제23조(민감정보), 제24조(고유식별정보), 제24조의2(주민등록번호 처리 제한)
- 개인정보보호위원회, 가명정보 처리 가이드라인 — 식별자·준식별자 구분
- 개인정보보호위원회, 인공지능(AI) 개발·서비스를 위한 공개된 개인정보 처리 안내서 — 공개 SNS 데이터 수집·활용 시 참고
- OpenAI Structured Outputs — Pydantic 모델로 응답 형식 강제
