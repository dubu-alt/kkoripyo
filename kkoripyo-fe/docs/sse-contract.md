# 분석 답변 SSE 연동

프론트는 현재 백엔드의 `POST /api/v1/agent/stream`에 직접 연결합니다. 분석 기록을 만드는 `/api/v1/analyses`는 실제 분석 실행과 연결되어 있지 않으므로 이 화면에서 호출하지 않습니다.

## 요청

```http
POST /api/v1/agent/stream
Content-Type: application/json
Accept: text/event-stream

{"handle":"example_user"}
```

- `VITE_API_ORIGIN`은 `/api/v1` 경로가 없는 백엔드 오리진입니다.
- 서버에서 Instagram 데이터 수집, OCR, AI 분석을 실행합니다.
- `EVERYINFRA_API_KEY`, `OPENAI_API_KEY`는 백엔드에서 설정합니다. 프론트는 API 키를 요청하거나 전송하지 않습니다.
- 요청할 때마다 새 분석을 실행합니다. 자동 재요청이나 연결 복구는 하지 않습니다.

## 응답

응답은 `Content-Type: text/event-stream`이며, 이벤트마다 JSON `data:` 줄과 빈 줄을 보냅니다. 별도의 `event:` 이름 대신 JSON 내부 `type`으로 구분합니다.

```text
data: {"type":"stage","id":"collect:profile","text":"프로필 확인하는 중","state":"running"}

data: {"type":"stage","id":"collect:profile","text":"프로필 확인","state":"done"}

data: {"type":"status","text":"분석하는 중"}

data: {"type":"token","text":"## 개인정보 노출 분석\n\n"}

data: {"type":"token","text":"분석 답변의 추가 내용입니다."}

data: {"type":"done"}

```

| `type`    | 데이터                                                                               | 프론트 처리                                                                |
| --------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `token`   | `text`                                                                               | 추적 기록에 이어 붙임. `## 종합 리포트`로 시작하는 글은 리포트 카드로 분리 |
| `stage`   | `id`, `text`, `state: running / done / error`                                        | 진행 목록에서 같은 ID 줄을 갱신, 진행률 어림                               |
| `finding` | `category`, `label`, `value`, `evidence`, `certainty: confirmed / estimated`         | 찾는 즉시 항목 카드에 빨간 느낌표로 표시, 위험도·최근 발견 갱신            |
| `stats`   | `posts`, `comments`, `photos_with_text`, `followers`, `following`, `friends`         | 진행 패널의 숫자                                                           |
| `blur`    | `image_id`, `post_id`, `post_url`, `posted_at`, `reason`, `before`, `after`, `error` | "이 사진으로 교체하세요" 비포·애프터                                       |
| `status`  | `text`                                                                               | 무시                                                                       |
| `done`    | 없음                                                                                 | 완료. 리포트가 없으면 중단(비공개 계정 등)으로 표시                        |
| `error`   | `message`                                                                            | 내부 원문은 숨기고 안내 문구만 표시                                        |
| 그 외     | 자유 형식                                                                            | 무시                                                                       |

`category` 값: `name`, `birthday`, `age`, `school`, `region`, `close_friend`, `phone`, `email`, `workplace`, `family`, `blood_type`, `other`. 백엔드는 조용한 구간에 15초마다 `: ping` 주석을 보낸다.

프론트는 알려진 이벤트의 중요 필드를 Zod로 검증합니다. `done` 전에는 공백 이외의 답변이 최소 한 번 필요합니다. 완료 신호 없는 연결 종료, 빈 답변 완료, 잘못된 JSON이나 알려진 이벤트 형식, 실패 HTTP 응답은 오류로 처리합니다. 한 개의 `stage` 실패는 전체 분석 실패와 별개입니다.

## 중지·재실행·새로고침

- 분석은 사용자의 제출 동작으로만 시작합니다. 화면 진입, 새로고침, React StrictMode로 POST를 자동 실행하지 않습니다.
- 현재 백엔드에는 분석 ID 기반 스트림 구독, 완료 답변 저장·복원, 이어받기가 없습니다.
- 수신 중지는 HTTP 연결을 종료하고 현재까지 받은 내용을 남깁니다. 백엔드 작업 취소를 보장하지 않습니다.
- 새 분석은 상단 꼬리표 로고로 입력 화면에 돌아가 아이디를 제출해 시작합니다. 새 POST로 처음부터 실행하며, 이전 실행을 이어받는 기능이 아닙니다.
- 새로고침 이후에는 답변을 복원하지 않으며, 사용자가 다시 제출해야 합니다.
- 프론트는 응답 헤더를 30초, 연결 이후 새 데이터 수신을 5분까지 기다립니다. 전체 분석 시간 제한은 없습니다. 백엔드가 오래 조용한 경우 heartbeat를 추가해야 하며, 현재 구현은 주기적인 heartbeat를 보장하지 않습니다.
- SSE 파서는 UTF-8 분할, LF/CRLF/CR, 여러 `data:` 줄, 주석을 처리합니다. 한 이벤트는 8MiB 이하이어야 합니다.
- 백엔드 CORS에 실제 프론트 오리진을 허용해야 합니다. 로컬 기본값은 `http://localhost:3000`입니다. 다른 포트, `127.0.0.1`, 배포 도메인은 별도 오리진입니다.
- 리버스 프록시·터널은 응답 버퍼링과 캐시를 끄고 이벤트를 실시간 전달해야 합니다.

## 로컬 계약 테스트

`npm run dev:sse`는 실제 계정 조회나 AI 호출 없이 동일한 POST/SSE 형식을 반환하는 로컬 테스트 서버를 실행합니다. 기본 포트는 8000이며 `SSE_FIXTURE_PORT`로 변경할 수 있습니다. 배포 코드에는 포함되지 않습니다.

| 입력 아이디          | 테스트 동작                                      |
| -------------------- | ------------------------------------------------ |
| `fixture_ok`         | 진행 항목 갱신·일부 단계 실패·상태·Markdown·완료 |
| `fixture_error`      | 부분 답변 후 서버 오류                           |
| `fixture_disconnect` | 부분 답변 후 완료 신호 없이 연결 종료            |
| `fixture_empty`      | 답변 없는 완료                                   |
| `fixture_http`       | HTTP 503                                         |
| `fixture_pending`    | 응답 대기·중지                                   |
| `fixture_slow`       | 느린 답변 수신                                   |
