import { useCallback, useEffect, useReducer, useRef } from 'react'
import { apiOrigin } from '@/lib/env'
import { streamScan } from './scan-client.ts'
import { initialScanState, scanReducer } from './scan-state.ts'

export function useScan() {
  const [state, dispatch] = useReducer(scanReducer, initialScanState)
  const controller = useRef<AbortController | null>(null)

  const start = useCallback((handle: string) => {
    controller.current?.abort()
    const current = new AbortController()
    controller.current = current
    dispatch({ type: 'start', handle, now: Date.now() })
    streamScan(apiOrigin, handle, current.signal, (event) =>
      dispatch({ type: 'event', event, now: Date.now() }),
    ).catch((error: unknown) => {
      if (current.signal.aborted) return
      const message =
        error instanceof Error ? error.message : '알 수 없는 문제가 생겼어요.'
      dispatch({ type: 'fail', message, now: Date.now() })
    })
  }, [])

  const stop = useCallback(() => {
    controller.current?.abort()
    dispatch({ type: 'abort', now: Date.now() })
  }, [])

  useEffect(() => () => controller.current?.abort(), [])

  return { state, start, stop }
}
