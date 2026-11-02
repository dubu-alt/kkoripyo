// Local backend-contract fixture only. No account lookup, database, or AI calls.
import { createServer } from 'node:http'

const port = Number(process.env.SSE_FIXTURE_PORT ?? 8000)
let requestCount = 0
const server = createServer(async (req, res) => {
  const allowedOrigins = [
    'http://localhost:3011',
    'http://127.0.0.1:3011',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ]
  if (allowedOrigins.includes(req.headers.origin))
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin)
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept')
  if (req.method === 'OPTIONS') {
    res.writeHead(204).end()
    return
  }
  const path = new URL(req.url, `http://localhost:${port}`).pathname
  const json = (status, data) => {
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(data))
  }
  if (req.method !== 'POST' || path !== '/api/v1/agent/stream') {
    json(404, {})
    return
  }
  let handle
  try {
    let body = ''
    for await (const chunk of req) {
      body += chunk
      if (body.length > 1024) {
        json(413, {})
        return
      }
    }
    handle = JSON.parse(body).handle
    if (typeof handle !== 'string' || !/^[A-Za-z0-9._]{1,30}$/.test(handle)) {
      json(422, {})
      return
    }
    handle = handle.toLowerCase()
  } catch {
    json(400, {})
    return
  }
  requestCount += 1
  console.log(`Analysis request ${requestCount}: ${handle} (fixture only)`)
  if (handle === 'fixture_http') {
    json(503, {})
    return
  }
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'X-Accel-Buffering': 'no',
  })
  res.flushHeaders()
  const send = (data) => res.write(`data: ${JSON.stringify(data)}\r\n\r\n`)
  res.write(': connected\r\n\r\n')
  // 실제 진단과 같은 순서의 테스트 타임라인 [지연(ms), 이벤트]. 이름·계정은 모두 가상
  const stage = (id, text, state = 'running', detail) => ({
    type: 'stage',
    id,
    text,
    state,
    ...(detail ? { detail } : {}),
  })
  const token = (text) => ({ type: 'token', text })
  const finding = (
    category,
    label,
    value,
    evidence,
    certainty = 'confirmed',
    postIds = ['FIXTURE1', 'FIXTURE2'],
  ) => ({
    type: 'finding',
    category,
    label,
    value,
    evidence,
    certainty,
    links: postIds.map((id) => ({
      post_id: id,
      url: `https://www.instagram.com/p/${id}/`,
    })),
  })
  const report = [
    '## 종합 리포트\n\n낯선 사람은 당신의 공개 계정만으로 이름, 생일, 나이, 학교, 사는 곳, 가장 친한 친구까지 **6가지**를 알아낼 수 있습니다.\n\n',
    '### 노출된 정보\n\n| 항목 | 노출된 내용 | 확실성 | 근거 |\n| --- | --- | --- | --- |\n',
    '| 이름 | 김민지 | 확인됨 | 프로필 이름, 친구 댓글 "민지야" |\n',
    '| 생일 | 2월 5일 | 확인됨 | 2024-02-05 @sohee_0205 생일 축하 게시물 |\n',
    '| 나이 | 2003년생 | 추정 | 동갑 친구 소개글 "03" |\n',
    '| 학교·학과 | 단국대 경영학과 | 확인됨 | 가까운 친구 3명이 같은 학과 계정 팔로우 |\n',
    '| 사는 곳 | 경기 남부(용인 수지 인근) | 추정 | 위치태그 4회 |\n',
    '| 전화번호 | 못 찾음 | - | - |\n\n',
    '### 가장 위험한 조합\n\n- **이름 + 생일 + 학교**: 학교 커뮤니티와 졸업앨범으로 당신을 특정할 수 있습니다.\n- **친한 친구 + 생활권**: 사칭범이 소희인 척 접근할 수 있습니다.\n\n',
    '### 지금 바로 해야 할 일\n\n1. 2024-02-05 생일 게시물을 보관 처리하세요.\n2. 태그 승인 설정을 켜고 소희에게 게시물 수정을 요청하세요.\n3. 위치 정보를 끄고 위치태그가 있는 게시물 4개를 수정하세요.\n4. 리포트 아래의 가린 사진으로 교체하세요.\n',
  ]
  const timeline = [
    [300, stage('collect:profile', '프로필 확인하는 중')],
    [0, stage('collect:followers', '팔로워 목록 받아오는 중')],
    [0, stage('collect:following', '팔로잉 목록 받아오는 중')],
    [0, stage('collect:posts', '게시물 피드 읽는 중')],
    [900, stage('collect:profile', '프로필 확인: 김민지', 'done')],
    [700, stage('collect:followers', '팔로워 263명 확인', 'done')],
    [300, stage('collect:following', '팔로잉 294명 확인', 'done')],
    [900, stage('collect:posts', '피드 24개 확인', 'done')],
    [0, stage('collect:ocr', '사진 속 글자 읽는 중')],
    [
      0,
      stage(
        'collect:comments',
        '댓글 읽는 중 (0/14)',
        'running',
        '누가 당신에게 자주 말을 거는지, 어떤 말로 당신을 부르는지 읽습니다',
      ),
    ],
    [
      0,
      stage('collect:friends', '가까운 친구들의 피드에서 당신의 흔적 찾는 중'),
    ],
    [900, stage('collect:comments', '댓글 읽는 중 (9/14)')],
    [900, stage('collect:comments', '댓글 61개 확인', 'done')],
    [400, stage('collect:ocr', '사진 24장 중 7장에서 글자 발견', 'done')],
    [500, stage('collect:friends', '가까운 친구 3명의 피드 확인', 'done')],
    [
      0,
      {
        type: 'stats',
        posts: 24,
        comments: 61,
        photos_with_text: 7,
        followers: 263,
        following: 294,
        friends: 3,
      },
    ],
    [
      500,
      token(
        '당신의 이름은 **김민지**입니다. (프로필 이름, 친구 댓글 "민지야 ㅋㅋ") 낯선 사람이 가장 먼저 보는 정보입니다.\n\n',
      ),
    ],
    [
      200,
      finding('name', '이름', '김민지', '프로필 이름 + 친구 댓글 "민지야"'),
    ],
    [
      900,
      token(
        '@sohee_0205는 당신과 가장 가까운 사람입니다. (당신 게시물에 댓글 11회) 사칭범은 이 사람인 척 당신에게 접근합니다.\n\n',
      ),
    ],
    [
      200,
      finding(
        'close_friend',
        '친한 친구',
        '@sohee_0205 (소희)',
        '댓글 11회, 맞팔',
      ),
    ],
    [
      1000,
      token(
        '당신의 생일은 **2월 5일**입니다. (2024-02-05 @sohee_0205의 "생일 축하해 민지야" 게시물) 이름과 생일만 있으면 비밀번호 찾기 질문을 뚫을 수 있습니다.\n\n',
      ),
    ],
    [
      200,
      finding(
        'birthday',
        '생일',
        '2월 5일',
        '2024-02-05 친구의 생일 축하 게시물',
      ),
    ],
    [
      700,
      token(
        '당신의 학교를 확인하기 위해 가장 가까운 친구들이 팔로우하는 계정을 거꾸로 훑습니다.\n\n',
      ),
    ],
    [
      0,
      stage(
        'call_1:get_following',
        '@sohee_0205, @jiwoo.03 외 1명의 팔로잉 목록 뒤지는 중',
        'running',
        "@sohee_0205가 당신의 3월 2일 벚꽃 사진과 4월 18일 과제 사진에 모두 7번 댓글을 남겼고, 그중 하나가 '목요일 마케팅원론 수강신청 했어?'입니다. 같은 수업을 듣는 사이라, 이 친구들이 함께 팔로우하는 학과 계정에서 당신의 학교를 확인합니다",
      ),
    ],
    [
      handle === 'fixture_slow' ? 6000 : 1600,
      stage(
        'call_1:get_following',
        '친구 계정의 팔로잉 목록 확인 (3개 계정)',
        'done',
      ),
    ],
    [
      500,
      token(
        '당신은 **단국대학교 경영학과**에 다닙니다. (가까운 친구 3명이 모두 @dku_business를 팔로우) 학교를 알면 오프라인에서 당신을 찾아갈 수 있습니다.\n\n',
      ),
    ],
    [
      200,
      finding(
        'school',
        '학교·학과',
        '단국대 경영학과',
        '친구 3명이 같은 학과 계정 팔로우',
      ),
    ],
    [
      800,
      token(
        '당신은 **경기 남부, 용인 수지 인근**에 삽니다. (위치태그 "수지구청역" 4회) 생활권이 좁혀지면 마주칠 수 있습니다.\n\n',
      ),
    ],
    [
      200,
      finding(
        'region',
        '사는 곳',
        '경기 남부(용인 수지 인근)',
        '위치태그 "수지구청역" 4회',
        'estimated',
      ),
    ],
    [600, stage('gate:0', '아직 드러나지 않은 정보를 더 깊이 찾는 중')],
    [0, stage('call_2:get_profile', '친구 계정 프로필 살펴보는 중 (2개 계정)')],
    [
      1500,
      stage('call_2:get_profile', '친구 계정 프로필 확인 (2개 계정)', 'done'),
    ],
    [0, stage('gate:0', '빠진 정보 다시 확인', 'done')],
    [
      400,
      token(
        '당신은 **2003년생**입니다. (동갑 친구 @jiwoo.03 소개글 "DKU 22 · 03") 나이와 생일이 합쳐지면 생년월일이 완성됩니다.\n\n',
      ),
    ],
    [
      200,
      finding('age', '나이', '2003년생', '동갑 친구 소개글 "03"', 'estimated'),
    ],
    [
      500,
      finding(
        'phone',
        '전화번호',
        '010-2958-1043',
        '2023-11-02 게시물 사진 속 명함',
      ),
    ],
    [700, stage('report', '리포트 쓰는 중')],
    ...report.map((t) => [380, token(t)]),
    [200, stage('report', '리포트 완성', 'done')],
    [500, stage('blur', '개인정보가 보이는 사진 1장 가리는 중')],
    [
      900,
      {
        type: 'blur',
        image_id: 'FIXTURE1_0',
        post_id: 'FIXTURE1',
        post_url: 'https://www.instagram.com/p/FIXTURE1/',
        posted_at: '2023-11-02T09:00:00+00:00',
        reason: '명함에 전화번호가 그대로 보입니다',
        before: '/images/mock-coffee.jpg',
        after: '/images/mock-coffee.jpg',
        error: null,
      },
    ],
    [0, stage('blur', '사진 1장 가림', 'done')],
    [200, { type: 'done' }],
  ]
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 10_000)
  let closed = false
  res.on('close', () => {
    closed = true
    clearInterval(heartbeat)
  })
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  if (handle === 'fixture_pending') return
  if (handle === 'fixture_empty') {
    send({ type: 'done' })
    res.end()
    return
  }
  for (const [i, [delay, event]] of timeline.entries()) {
    await sleep(handle === 'fixture_slow' ? delay * 2 : delay)
    if (closed) return
    if (i === 20 && handle === 'fixture_error') {
      send({ type: 'error', message: 'RuntimeError: fixture-internal-details' })
      res.end()
      return
    }
    if (i === 20 && handle === 'fixture_disconnect') {
      res.end()
      return
    }
    send(event)
  }
  res.end()
})
server.listen(port, '127.0.0.1', () =>
  console.log(`SSE fixture: http://127.0.0.1:${port} (local test data only)`),
)
