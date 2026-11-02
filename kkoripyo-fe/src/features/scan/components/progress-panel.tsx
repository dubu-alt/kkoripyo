import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { maskValue } from '../categories.ts'
import {
  exposedCount,
  type Finding,
  type ScanState,
  type Stage,
} from '../scan-state.ts'

function useElapsed(start: number, end: number | null) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (end) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [end])
  return Math.max(0, Math.floor(((end ?? now) - start) / 1000))
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m ? `${m}분 ${String(s).padStart(2, '0')}초` : `${s}초`
}

function clock(ms: number, start: number) {
  const s = Math.max(0, Math.floor((ms - start) / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block animate-spin rounded-full border-2 border-fg-2 border-t-transparent',
        className,
      )}
    />
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[12px] text-muted">{label}</div>
      <div className="tabular mt-0.5 truncate text-[17px] font-semibold tracking-[-0.01em] text-fg">
        {value}
      </div>
    </div>
  )
}

type Entry =
  | { kind: 'stage'; at: number; stage: Stage }
  | { kind: 'finding'; at: number; finding: Finding }

/** 진행 단계와 유추(발견)를 시간 순서로 섞는다 */
function timeline(state: ScanState): Entry[] {
  const entries: Entry[] = [
    ...state.stages.map((stage) => ({
      kind: 'stage' as const,
      at: stage.at,
      stage,
    })),
    ...state.feed.map((finding) => ({
      kind: 'finding' as const,
      at: finding.at,
      finding,
    })),
  ]
  return entries.sort((a, b) => a.at - b.at)
}

function Now({ state }: { state: ScanState }) {
  const running = state.phase === 'running'
  const current = [...state.stages]
    .filter((s) => s.state === 'running')
    .sort((a, b) => b.updatedAt - a.updatedAt)[0]
  const lastFinding = state.feed.at(-1)
  const exposed = exposedCount(state)

  let title: string
  let detail: string | undefined
  if (!running) {
    title =
      state.phase === 'done'
        ? `추적 완료 — 낯선 사람이 알아낼 수 있는 정보 ${exposed}가지`
        : state.phase === 'error'
          ? '추적이 중단됐습니다'
          : '추적을 멈췄습니다'
    detail =
      state.phase === 'done'
        ? '아래 리포트에서 지금 바로 해야 할 일을 확인하세요.'
        : undefined
  } else if (current) {
    title = current.text
    detail = current.detail
  } else if (state.stages.length === 0) {
    title = `@${state.handle} 계정에 접근하는 중`
    detail = '공개된 프로필부터 열어 봅니다.'
  } else {
    title = '지금까지 모은 단서를 엮는 중'
    detail = lastFinding
      ? `방금 드러난 ${lastFinding.label}(${maskValue(lastFinding.category, lastFinding.value)})을(를) 다른 단서와 맞춰 보고, 다음에 뒤질 계정을 고르고 있습니다.`
      : '게시물·댓글·친구 관계를 맞춰 보며 다음에 뒤질 계정을 고르고 있습니다.'
  }

  return (
    <div className="px-5 pt-5 sm:px-7">
      <div className="flex items-center gap-2 text-[12px] font-semibold tracking-[0.12em] text-alert-2">
        {running ? (
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-alert opacity-70" />
            <span className="relative inline-flex size-2 rounded-full bg-alert" />
          </span>
        ) : (
          <span className="size-2 rounded-full bg-faint" />
        )}
        {running ? 'NOW' : 'STATUS'}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={title}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.25 }}
          aria-live="polite"
        >
          <p className="mt-2 flex items-start gap-3 text-[19px] leading-snug font-bold tracking-[-0.02em] text-fg sm:text-[22px]">
            {running && current && (
              <Spinner className="mt-1.5 size-4 shrink-0" />
            )}
            <span>{title}</span>
          </p>
          {detail && (
            <p className="mt-2 text-[14.5px] leading-relaxed whitespace-pre-line text-fg-2 sm:text-[15.5px]">
              {detail}
            </p>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

function StageRow({
  stage,
  n,
  start,
}: {
  stage: Stage
  n: number
  start: number
}) {
  return (
    <div className="flex gap-3">
      <span className="tabular w-7 shrink-0 pt-0.5 text-right text-[12px] text-faint">
        {n}
      </span>
      <div className="min-w-0 flex-1 border-l border-line pb-3 pl-3.5">
        <div
          className={cn(
            'flex items-start gap-2 text-[14.5px] font-medium',
            stage.state === 'running' ? 'text-fg' : 'text-fg-2',
            stage.state === 'error' && 'text-alert-2',
          )}
        >
          <span className="mt-[5px] flex size-3 shrink-0 items-center justify-center">
            {stage.state === 'running' ? (
              <Spinner className="size-3 border-[1.5px]" />
            ) : stage.state === 'error' ? (
              <span className="text-[12px] font-bold">×</span>
            ) : (
              <svg
                viewBox="0 0 12 12"
                className="size-3 text-muted"
                aria-hidden
              >
                <path
                  d="M2.5 6.2 5 8.5l4.5-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                />
              </svg>
            )}
          </span>
          <span className="min-w-0 flex-1">{stage.text}</span>
          <span className="tabular shrink-0 pt-0.5 text-[11.5px] font-normal text-faint">
            {clock(stage.at, start)}
          </span>
        </div>
        {stage.detail && (
          <p className="mt-1 pl-5 text-[13.5px] leading-relaxed whitespace-pre-line text-muted">
            {stage.detail}
          </p>
        )}
      </div>
    </div>
  )
}

function FindingRow({ finding, start }: { finding: Finding; start: number }) {
  return (
    <div className="flex gap-3">
      <span className="w-7 shrink-0" />
      <div className="min-w-0 flex-1 border-l border-alert-line pb-3 pl-3.5">
        <div className="rounded-lg border border-alert-line bg-alert-soft px-3 py-2">
          <div className="flex items-start gap-2 text-[14.5px]">
            <span className="mt-[3px] flex size-4 shrink-0 items-center justify-center rounded-full bg-alert text-[10px] font-black text-white">
              !
            </span>
            <span className="min-w-0 flex-1 font-semibold text-fg">
              <span className="text-alert-2">유추 · {finding.label}</span>{' '}
              {maskValue(finding.category, finding.value)}
              {finding.certainty === 'estimated' && (
                <span className="ml-1.5 text-[12px] font-medium text-warn">
                  추정
                </span>
              )}
            </span>
            <span className="tabular shrink-0 pt-0.5 text-[11.5px] text-faint">
              {clock(finding.at, start)}
            </span>
          </div>
          {finding.evidence && (
            <p className="mt-1 pl-6 text-[13px] leading-relaxed text-fg-2/80">
              {finding.links[0] ? (
                <a
                  href={finding.links[0].url}
                  target="_blank"
                  rel="noreferrer"
                  className="underline decoration-alert-line underline-offset-[3px] hover:text-fg"
                >
                  {finding.evidence} ↗
                </a>
              ) : (
                finding.evidence
              )}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export function ProgressPanel({ state }: { state: ScanState }) {
  const elapsed = useElapsed(state.startedAt, state.finishedAt)
  const running = state.phase === 'running'
  const exposed = exposedCount(state)
  const logRef = useRef<HTMLDivElement>(null)
  const entries = timeline(state)

  useEffect(() => {
    const el = logRef.current
    if (!el) return
    // 사용자가 위로 올려 보는 중이 아니면 맨 아래(최신)로 따라간다
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 160)
      el.scrollTop = el.scrollHeight
  }, [entries.length, state.stages])

  const friends =
    (state.stats?.friends ?? 0) +
    state.stages.filter((s) => s.id.includes(':get_') && s.state === 'done')
      .length
  let n = 0

  return (
    <section
      className={cn(
        'panel overflow-hidden',
        running &&
          'border-line-2 shadow-[0_0_0_1px_rgb(255_59_48/0.08),0_24px_60px_-30px_rgb(255_59_48/0.35)]',
      )}
      aria-label="추적 진행 상황"
    >
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3 sm:px-7">
        <h2 className="truncate text-[14px] font-semibold text-fg-2">
          <span className="text-fg">@{state.handle}</span> 실시간 추적
        </h2>
        <span
          className={cn(
            'tabular shrink-0 rounded-full border px-2.5 py-0.5 text-[12px] font-medium',
            exposed
              ? 'border-alert-line bg-alert-soft text-alert-2'
              : 'border-line text-muted',
          )}
        >
          노출 {exposed}건
        </span>
      </div>

      <Now state={state} />

      <div className="px-5 pt-5 sm:px-7">
        <div
          className="relative h-1.5 overflow-hidden rounded-full bg-surface-3"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={state.progress}
          aria-label="진행률"
        >
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-[#6b6b74] via-[#c9c9cf] to-white"
            initial={false}
            animate={{ width: `${state.progress}%` }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          />
          {running && (
            <div className="pointer-events-none absolute inset-y-0 left-0 w-1/3 animate-[scan-sweep_2.2s_linear_infinite] bg-gradient-to-r from-transparent via-white/25 to-transparent" />
          )}
        </div>
        <div className="tabular mt-2 flex justify-between text-[12px] text-muted">
          <span>{state.progress}%</span>
          <span>경과 {formatTime(elapsed)}</span>
        </div>
      </div>

      <div
        ref={logRef}
        className="mx-5 mt-4 max-h-[420px] overflow-y-auto rounded-xl border border-line bg-black/30 py-4 pr-4 sm:mx-7"
        aria-label="추적 과정"
      >
        {entries.length === 0 && (
          <p className="px-5 text-[14px] text-muted">
            대상 계정에 접근하는 중…
          </p>
        )}
        <AnimatePresence initial={false}>
          {entries.map((entry) => (
            <motion.div
              key={
                entry.kind === 'stage'
                  ? `s-${entry.stage.id}`
                  : `f-${entry.finding.seq}`
              }
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              {entry.kind === 'stage' ? (
                <StageRow stage={entry.stage} n={++n} start={state.startedAt} />
              ) : (
                <FindingRow finding={entry.finding} start={state.startedAt} />
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4 border-t border-line px-5 py-4 sm:grid-cols-4 sm:px-7">
        <Metric label="읽은 게시물" value={`${state.stats?.posts ?? 0}개`} />
        <Metric label="읽은 댓글" value={`${state.stats?.comments ?? 0}개`} />
        <Metric
          label="글자를 읽은 사진"
          value={`${state.stats?.photos_with_text ?? 0}장`}
        />
        <Metric label="뒤져 본 주변 계정" value={`${friends}곳`} />
      </div>
    </section>
  )
}
