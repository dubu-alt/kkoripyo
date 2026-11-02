import assert from 'node:assert/strict'
import { test } from 'node:test'
import { maskValue } from '../src/features/scan/categories.ts'
import { parseScanEvent, type ScanEvent } from '../src/features/scan/events.ts'
import { streamScan } from '../src/features/scan/scan-client.ts'
import {
  exposedCount,
  initialScanState,
  scanReducer,
  severityCounts,
  type ScanState,
} from '../src/features/scan/scan-state.ts'
import { readSse } from '../src/lib/sse.ts'

function run(events: ScanEvent[]): ScanState {
  let state = scanReducer(initialScanState, {
    type: 'start',
    handle: 'tester',
    now: 0,
  })
  events.forEach((event, i) => {
    state = scanReducer(state, { type: 'event', event, now: i + 1 })
  })
  return state
}

const finding = (
  category: Extract<ScanEvent, { type: 'finding' }>['category'],
  value: string,
): ScanEvent => ({
  type: 'finding',
  category,
  label: category,
  value,
  evidence: '근거',
  certainty: 'confirmed',
})

test('parseScanEvent validates known events and ignores unknown ones', () => {
  assert.deepEqual(parseScanEvent('{"type":"token","text":"a"}'), {
    type: 'token',
    text: 'a',
  })
  assert.equal(parseScanEvent('{"type":"tool_call","name":"x"}'), null)
  assert.throws(() => parseScanEvent('{"type":"stage","id":"x"}'))
  assert.throws(() => parseScanEvent('not json'))
  const f = parseScanEvent(
    '{"type":"finding","category":"name","label":"이름","value":"김민지","certainty":"confirmed"}',
  )
  assert.equal(f?.type === 'finding' && f.evidence, '')
})

test('findings appear immediately; single items keep the latest value, multi items accumulate', () => {
  const state = run([
    finding('school', '대학생'),
    finding('school', '단국대 경영학과'),
    finding('close_friend', '@a'),
    finding('close_friend', '@b'),
    finding('close_friend', '@a'),
    finding('phone', '010-1234-5678'),
  ])
  assert.deepEqual(
    state.findings.school?.map((f) => f.value),
    ['단국대 경영학과'],
  )
  assert.deepEqual(
    state.findings.close_friend?.map((f) => f.value),
    ['@b', '@a'],
  )
  assert.equal(exposedCount(state), 3)
  assert.deepEqual(severityCounts(state), { high: 1, medium: 2, low: 0 })
  assert.equal(state.feed.length, 6)
})

test('text is split into paragraphs by stages and the report is kept apart', () => {
  const state = run([
    { type: 'token', text: '당신의 이름은 ' },
    { type: 'token', text: '김민지입니다.' },
    {
      type: 'stage',
      id: 'c1:get_user_posts',
      text: '친구 피드 읽는 중',
      state: 'running',
    },
    { type: 'token', text: '생일은 2월 5일입니다.' },
    { type: 'stage', id: 'report', text: '리포트 쓰는 중', state: 'running' },
    { type: 'token', text: '## 종합 ' },
    { type: 'token', text: '리포트\n\n표' },
    { type: 'done' },
  ])
  assert.deepEqual(
    state.blocks.map((b) => [b.kind, b.text]),
    [
      ['narration', '당신의 이름은 김민지입니다.'],
      ['narration', '생일은 2월 5일입니다.'],
      ['report', '## 종합 리포트\n\n표'],
    ],
  )
  assert.equal(state.phase, 'done')
  assert.equal(state.progress, 100)
  assert.ok(state.stages.every((s) => s.state !== 'running'))
})

test('a run that ends without a report is shown as stopped (private account)', () => {
  const state = run([
    { type: 'token', text: '비공개 계정입니다.' },
    { type: 'done' },
  ])
  assert.equal(state.phase, 'stopped')
})

test('progress only moves forward and never reaches 100 before done', () => {
  let state = run([])
  const steps: ScanEvent[] = [
    { type: 'stage', id: 'collect:profile', text: 'a', state: 'done' },
    { type: 'stage', id: 'collect:posts', text: 'a', state: 'done' },
    { type: 'stage', id: 'c1:get_profile', text: 'a', state: 'done' },
    { type: 'stage', id: 'report', text: 'a', state: 'running' },
  ]
  let last = state.progress
  for (const event of steps) {
    state = scanReducer(state, { type: 'event', event, now: 1 })
    assert.ok(state.progress >= last)
    last = state.progress
  }
  assert.ok(state.progress < 100 && state.progress >= 88)
})

test('error event hides internal details', () => {
  const state = run([{ type: 'error', message: 'RuntimeError: secret stack' }])
  assert.equal(state.phase, 'error')
  assert.ok(!state.error?.includes('RuntimeError'))
})

test('phone and email values are partly masked', () => {
  assert.equal(maskValue('phone', '010-2958-1043'), '010-****-1043')
  assert.equal(maskValue('email', 'minji.kim@gmail.com'), 'mi***@gmail.com')
  assert.equal(maskValue('name', '김민지'), '김민지')
})

function sseResponse(text: string) {
  const bytes = new TextEncoder().encode(text)
  let offset = 0
  return new Response(
    new ReadableStream<Uint8Array>({
      pull(controller) {
        // 한 바이트씩 끊어 보내 한글·CRLF 경계를 확인한다
        if (offset === bytes.length) controller.close()
        else controller.enqueue(bytes.slice(offset, ++offset))
      },
    }),
    { headers: { 'Content-Type': 'text/event-stream' } },
  )
}

test('SSE parser handles comments, CRLF and split UTF-8', async () => {
  const events = []
  for await (const e of readSse(
    sseResponse(
      ': ping\r\n\r\ndata: {"type":"token","text":"한글"}\r\n\r\ndata: a\ndata: b\n\n',
    ).body!,
  ))
    events.push(e.data)
  assert.deepEqual(events, ['{"type":"token","text":"한글"}', 'a\nb'])
})

test('streamScan posts the handle and forwards events until done', async () => {
  let body = ''
  const fakeFetch = (async (_url: URL, init?: RequestInit) => {
    body = String(init?.body)
    return sseResponse(
      ': ping\n\ndata: {"type":"stage","id":"collect:profile","text":"프로필","state":"done"}\n\n' +
        'data: {"type":"unknown"}\n\ndata: {"type":"done"}\n\n',
    )
  }) as typeof fetch
  const seen: string[] = []
  await streamScan(
    'http://localhost:8000',
    'tester',
    new AbortController().signal,
    (e) => seen.push(e.type),
    fakeFetch,
  )
  assert.equal(body, '{"handle":"tester"}')
  assert.deepEqual(seen, ['stage', 'done'])
})

test('streamScan fails when the stream ends before done', async () => {
  const fakeFetch = (async () =>
    sseResponse(
      'data: {"type":"token","text":"a"}\n\n',
    )) as unknown as typeof fetch
  await assert.rejects(
    streamScan(
      'http://localhost:8000',
      'tester',
      new AbortController().signal,
      () => {},
      fakeFetch,
    ),
    /연결이 끊겼어요/,
  )
})

test('streamScan maps HTTP errors to friendly messages', async () => {
  const fakeFetch = (async () =>
    new Response('', { status: 503 })) as unknown as typeof fetch
  await assert.rejects(
    streamScan(
      'http://localhost:8000',
      'tester',
      new AbortController().signal,
      () => {},
      fakeFetch,
    ),
    /준비되지 않았어요/,
  )
})

test('finding links must point to instagram posts', () => {
  const ok = parseScanEvent(
    '{"type":"finding","category":"name","label":"이름","value":"a","certainty":"confirmed","links":[{"post_id":"Abc12","url":"https://www.instagram.com/p/Abc12/"}]}',
  )
  assert.equal(ok?.type === 'finding' && ok.links[0].post_id, 'Abc12')
  assert.throws(() =>
    parseScanEvent(
      '{"type":"finding","category":"name","label":"이름","value":"a","certainty":"confirmed","links":[{"post_id":"x","url":"javascript:alert(1)"}]}',
    ),
  )
})
