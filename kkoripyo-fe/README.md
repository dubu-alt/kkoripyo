# 꼬리표 (kkoripyo) 프론트엔드

인스타그램 아이디 하나로 낯선 사람이 알아낼 수 있는 개인정보를 실시간으로 추적해 보여주는 진단 화면입니다.
분석은 [kkoripyo-be](https://github.com/codyssey-hackathon/kkoripyo-be) 백엔드가 하고, 이 화면은 백엔드의 SSE 스트림을 받아 표시합니다.

- React 19 · Vite · TypeScript · Tailwind CSS · motion
- 화면: 아이디 입력 → 실시간 추적 상황(지금 하는 일·이유·유추) → 드러난 정보 카드·노출 위험도 → 추적 기록·종합 리포트 → 가린 사진 비포·애프터

## 실행 방법

### 1. 설치

필요: Node.js 24 (`.nvmrc`)

```sh
git clone https://github.com/codyssey-hackathon/kkoripyo-fe.git
cd kkoripyo-fe
npm ci
```

### 2. 환경설정

```sh
cp .env.example .env.local
```

| 변수              | 설명                                                                |
| ----------------- | ------------------------------------------------------------------- |
| `VITE_API_ORIGIN` | 필수. 백엔드 주소(경로 없이). 로컬 백엔드는 `http://localhost:8000` |

API 키는 프론트에 넣지 않습니다(백엔드에서만 사용). `VITE_` 값은 빌드 결과에 그대로 들어가는 공개 정보입니다.

### 3. 실행

백엔드([kkoripyo-be](https://github.com/codyssey-hackathon/kkoripyo-be))를 `http://localhost:8000`에 띄운 뒤:

```sh
npm run dev
```

http://localhost:3000 에서 인스타그램 아이디를 입력하면 진단이 시작됩니다.

백엔드 없이 화면만 확인할 때는 테스트용 SSE 서버를 씁니다 (실제 계정 조회·AI 호출 없음).

```sh
# 터미널 1
npm run dev:sse
# 터미널 2
VITE_API_ORIGIN=http://127.0.0.1:8000 npm run dev
```

아이디에 `fixture_ok`(정상), `fixture_slow`(느림), `fixture_error`(서버 오류), `fixture_disconnect`(연결 끊김), `fixture_empty`(빈 답변), `fixture_http`(HTTP 오류)를 넣으면 각 상황을 볼 수 있습니다.

### 검사·빌드

```sh
npm run check   # 타입·테스트·린트·포맷·빌드
npm run build   # dist/ 에 정적 파일 생성
```

백엔드 이벤트 형식은 [SSE 연동 문서](docs/sse-contract.md)에 정리했습니다.

## Docker Compose 실행 (권장)

Docker와 Docker Compose가 설치되어 실행 중인 서버에서 프로젝트 루트로 이동합니다.

```sh
cp .env.example .env
```

`.env`를 배포 환경에 맞게 수정합니다.

```dotenv
VITE_API_ORIGIN=https://kkoripyo.purplecodelabs.com
FRONTEND_PORT=3000
```

| 변수              | 용도                                         |
| ----------------- | -------------------------------------------- |
| `VITE_API_ORIGIN` | 필수. 브라우저에서 접근할 백엔드 오리진      |
| `FRONTEND_PORT`   | 서버에서 공개할 프론트엔드 포트. 기본 `3000` |

설정을 확인한 뒤 빌드하고 실행합니다.

```sh
docker compose -p kkoripyo-fe config --quiet
docker compose -p kkoripyo-fe up -d --build
```

로컬에서는 `http://localhost:3000`, 서버에 배포했다면 `http://서버주소:3000`으로 접속할 수 있습니다. 서버 포트에 접근할 수 있어야 하며, 포트를 변경했다면 해당 포트로 접속합니다. 리버스 프록시나 터널을 사용한다면 이 포트로 연결합니다.

프론트엔드 Compose 프로젝트명은 `kkoripyo-fe`로 유지합니다. 백엔드가 사용하는 `kkoripyo`와 같은 이름을 쓰면 백엔드 재배포 시 프론트엔드 컨테이너가 제거될 수 있습니다.

운영 명령은 다음과 같습니다.

```sh
# 상태 및 헬스체크 결과 확인
docker compose -p kkoripyo-fe ps

# 로그 확인
docker compose -p kkoripyo-fe logs -f --tail=100 frontend

# 코드 또는 백엔드 주소 변경 후 재빌드·배포
docker compose -p kkoripyo-fe up -d --build

# 종료 및 컨테이너 제거
docker compose -p kkoripyo-fe down
```

컨테이너는 `unless-stopped` 정책으로 재시작하며, Nginx의 HTTP 응답을 헬스체크합니다. 헬스체크 실패 자체가 재시작을 유발하지는 않습니다. 로그는 파일당 최대 10MB, 최대 3개로 순환합니다.

Compose는 기본적으로 `.env`를 읽어 백엔드 주소를 빌드 인자로 전달합니다. 로컬 개발용 `.env.local`은 Compose에서 자동으로 읽지 않습니다. 별도 환경 파일을 사용할 때는 모든 Compose 명령에 `--env-file`을 지정합니다. 자세한 동작은 [Docker의 환경 변수 안내](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/)를 참고하세요.

```sh
docker compose -p kkoripyo-fe --env-file .env.production up -d --build
```

## Docker 직접 실행

Docker가 실행 중인 상태에서 프로젝트 루트에서 이미지를 빌드하고 컨테이너를 실행합니다.

```sh
docker build --build-arg VITE_API_ORIGIN=http://localhost:8000 -t kkoripyo-fe .
docker run --rm -d --name kkoripyo-fe -p 3000:80 kkoripyo-fe
```

[http://localhost:3000](http://localhost:3000)에서 접속할 수 있습니다.

Node.js 24에서 `npm ci`와 `npm run build`를 실행한 뒤, Nginx가 빌드된 정적 파일을 제공합니다. `/streaming`처럼 클라이언트 라우팅을 사용하는 주소도 직접 접속하거나 새로고침할 수 있습니다.

컨테이너를 종료하려면 다음 명령을 실행합니다.

```sh
docker stop kkoripyo-fe
```

배포할 때는 `--build-arg VITE_API_ORIGIN=https://kkoripyo.purplecodelabs.com`처럼 실제 백엔드 오리진을 전달합니다. `localhost`는 접속한 사용자의 컴퓨터를 가리키므로 원격 배포에서는 사용하지 않습니다. 로컬 프론트엔드 주소 `http://localhost:3000`은 백엔드의 예시 CORS 허용 주소와 같습니다. 서버 IP나 외부 도메인으로 프론트엔드에 접속한다면, 포트가 같아도 다른 오리진이므로 백엔드의 `CORS_ORIGINS`에 그 접속 주소를 허용해야 합니다.

`.dockerignore`는 로컬 의존성, 빌드 결과, Git 정보와 `.env` 파일을 빌드 대상에서 제외합니다. Docker 빌드는 로컬 `.env.local`을 읽지 않으므로 위의 빌드 인자를 반드시 전달해야 합니다. `VITE_` 값은 빌드 시 정적 파일에 반영되며 공개 정보입니다. 비밀 키를 넣지 마세요. 실행 시 `docker run -e`로 바꿀 수 없으며, 주소 변경 시 이미지를 다시 빌드해야 합니다.
