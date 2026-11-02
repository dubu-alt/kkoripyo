import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState, type RefObject } from 'react'
import { maskValue } from '../categories.ts'
import { exposedCount, type ScanState } from '../scan-state.ts'

const SHOW_MS = 5000

/** 대상 요소가 화면에 보이는지 */
function useInView(ref: RefObject<HTMLElement | null>) {
  const [inView, setInView] = useState(true)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      // 숫자가 반 이상 가려지면(상단바 아래로 숨거나 화면 밖) 바로 안 보이는 것으로 친다
      { rootMargin: '-90px 0px 0px 0px', threshold: 0.5 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])
  return inView
}

/**
 * 노출 위험도 숫자가 스크롤로 화면 밖에 있을 때, 새 발견이나 단계 변화가 생긴 순간에만
 * 오른쪽 아래에 작게 띄운다.
 */
export function LiveToast({
  state,
  watchRef,
  onJump,
}: {
  state: ScanState
  watchRef: RefObject<HTMLElement | null>
  onJump: () => void
}) {
  const inView = useInView(watchRef)
  const current = [...state.stages]
    .filter((s) => s.state === 'running')
    .sort((a, b) => b.updatedAt - a.updatedAt)[0]
  const latest = state.feed.at(-1)
  const exposed = exposedCount(state)
  const changeKey = `${state.feed.length}|${current?.id ?? ''}|${current?.text ?? ''}|${state.phase}`
  const [shownKey, setShownKey] = useState<string | null>(null)

  useEffect(() => {
    if (inView || state.phase === 'idle') return
    // 바뀐 순간에만 잠깐 보여준다
    const show = setTimeout(() => setShownKey(changeKey), 0)
    const hide = setTimeout(() => setShownKey(null), SHOW_MS)
    return () => {
      clearTimeout(show)
      clearTimeout(hide)
    }
  }, [changeKey, inView, state.phase])

  const visible = !inView && shownKey === changeKey
  // 진행 단계보다 나중에 생긴 발견이면 방금 드러난 것으로 강조
  const fresh = Boolean(latest && (!current || latest.at >= current.updatedAt))
  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          type="button"
          onClick={onJump}
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          aria-live="polite"
          className="fixed right-4 bottom-4 z-30 w-[min(340px,calc(100vw-2rem))] rounded-xl border border-line-2 bg-[#141416]/95 p-3.5 text-left shadow-[0_20px_50px_-20px_rgb(0_0_0/0.8)] backdrop-blur-xl"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-[12px] text-muted">노출 위험도</span>
            <span className="tabular text-[13px] text-muted">
              <b className="text-[20px] leading-none font-bold text-fg">
                {exposed}
              </b>{' '}
              / 12
            </span>
          </div>
          {latest && (
            <div
              className={
                fresh
                  ? 'mt-2 rounded-lg border border-alert-line bg-alert-soft px-2.5 py-1.5'
                  : 'mt-2 px-0.5'
              }
            >
              <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-alert-2">
                <span className="flex size-3.5 items-center justify-center rounded-full bg-alert text-[9px] font-black text-white">
                  !
                </span>
                {latest.label} 발견됨
              </div>
              <div className="mt-0.5 truncate text-[13.5px] font-semibold text-fg">
                {maskValue(latest.category, latest.value)}
              </div>
            </div>
          )}
          {current && (
            <div className="mt-2 flex items-start gap-2 text-[12.5px] leading-snug text-fg-2">
              <span
                aria-hidden
                className="mt-[3px] size-2.5 shrink-0 animate-spin rounded-full border-[1.5px] border-fg-2 border-t-transparent"
              />
              <span className="line-clamp-2">{current.text}</span>
            </div>
          )}
        </motion.button>
      )}
    </AnimatePresence>
  )
}
