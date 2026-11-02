export type SseEvent = { event: string; data: string }

// Network chunks are unrelated to event, line, or UTF-8 character boundaries.
export function createSseParser(onEvent: (event: SseEvent) => void) {
  let line = ''
  let skipLf = false
  let event = ''
  let data: string[] = []
  let eventSize = 0

  function consumeLine() {
    if (line === '') {
      if (data.length > 0) {
        onEvent({ event: event || 'message', data: data.join('\n') })
      }
      event = ''
      data = []
      eventSize = 0
    } else if (!line.startsWith(':')) {
      const colon = line.indexOf(':')
      const field = colon < 0 ? line : line.slice(0, colon)
      let value = colon < 0 ? '' : line.slice(colon + 1)
      if (value.startsWith(' ')) value = value.slice(1)
      if (field === 'event') event = value
      if (field === 'data') data.push(value)
    }
    line = ''
  }

  return {
    feed(text: string) {
      for (const character of text) {
        if (skipLf) {
          skipLf = false
          if (character === '\n') continue
        }
        eventSize += character.length
        if (eventSize > 8 * 1024 * 1024) {
          throw new Error('분석 답변의 한 구간이 너무 커서 수신을 중단했어요.')
        }
        if (character === '\r' || character === '\n') {
          consumeLine()
          skipLf = character === '\r'
        } else {
          line += character
        }
      }
    },
  }
}

export async function* readSse(
  body: ReadableStream<Uint8Array>,
  onActivity: () => void = () => {},
): AsyncGenerator<SseEvent> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  const events: SseEvent[] = []
  const parser = createSseParser((event) => events.push(event))
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) {
        parser.feed(decoder.decode())
        break
      }
      onActivity()
      parser.feed(decoder.decode(value, { stream: true }))
      for (const event of events.splice(0)) yield event
    }
    // SSE requires a blank line to dispatch an event; an incomplete tail is lost.
    for (const event of events) yield event
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
