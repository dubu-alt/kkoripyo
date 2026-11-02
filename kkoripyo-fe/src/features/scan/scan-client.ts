import { readSse } from '../../lib/sse.ts'
import { parseScanEvent, type ScanEvent } from './events.ts'

const HEADER_TIMEOUT_MS = 30_000
// 백엔드는 조용한 구간에도 15초마다 heartbeat를 보낸다
const IDLE_TIMEOUT_MS = 120_000

function httpError(status: number) {
  if (status === 422) return new Error('아이디를 다시 확인해 주세요.')
  if (status === 429)
    return new Error('요청이 많아요. 잠시 후 다시 시도해 주세요.')
  if (status === 503) return new Error('분석 서비스가 준비되지 않았어요.')
  return new Error('서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.')
}

/** 진단을 시작하고 이벤트를 하나씩 넘긴다. 완료(done)나 오류(error) 이벤트에서 끝난다. */
export async function streamScan(
  origin: string,
  handle: string,
  signal: AbortSignal,
  onEvent: (event: ScanEvent) => void,
  fetchImpl: typeof fetch = fetch,
) {
  const timeout = new AbortController()
  let timer = setTimeout(() => timeout.abort(), HEADER_TIMEOUT_MS)
  const keepAlive = () => {
    clearTimeout(timer)
    timer = setTimeout(() => timeout.abort(), IDLE_TIMEOUT_MS)
  }
  try {
    const response = await fetchImpl(new URL('/api/v1/agent/stream', origin), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({ handle }),
      signal: AbortSignal.any([signal, timeout.signal]),
    })
    if (!response.ok) throw httpError(response.status)
    if (!response.body) throw new Error('서버 응답이 비어 있어요.')
    keepAlive()
    for await (const sse of readSse(response.body, keepAlive)) {
      const event = parseScanEvent(sse.data)
      if (!event) continue
      onEvent(event)
      if (event.type === 'done' || event.type === 'error') return
    }
    throw new Error('분석이 끝나기 전에 연결이 끊겼어요.')
  } catch (error) {
    if (signal.aborted) throw error
    if (timeout.signal.aborted)
      throw new Error('서버 응답이 너무 오래 없어요.', { cause: error })
    if (error instanceof TypeError)
      throw new Error('서버에 연결하지 못했어요.', { cause: error })
    throw error
  } finally {
    clearTimeout(timer)
  }
}
