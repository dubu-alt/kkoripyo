import type { Ref } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { cn } from '@/lib/utils'
import {
  CATEGORIES,
  CATEGORY_META,
  maskValue,
  SEVERITY_LABEL,
  type Severity,
} from '../categories.ts'
import { exposedCount, severityCounts, type ScanState } from '../scan-state.ts'

const SEVERITY_COLOR: Record<Severity, string> = {
  high: 'bg-alert',
  medium: 'bg-warn',
  low: 'bg-low',
}

function verdict(high: number, total: number) {
  if (high >= 3) return '신원을 특정할 수 있는 수준입니다'
  if (high >= 1) return '당신을 찾아낼 단서가 이미 공개돼 있습니다'
  if (total > 0) return '주변 정보가 새고 있습니다'
  return '아직 드러난 정보가 없습니다'
}

export function RiskPanel({
  state,
  numberRef,
}: {
  state: ScanState
  /** 노출 위험도 숫자. 화면 밖으로 나가면 오른쪽 아래 알림을 띄우는 기준 */
  numberRef?: Ref<HTMLDivElement>
}) {
  const counts = severityCounts(state)
  const total = exposedCount(state)
  const recent = [...state.feed].reverse().slice(0, 5)
  const severities: Severity[] = ['high', 'medium', 'low']

  return (
    <section
      className="panel flex flex-col p-5 sm:p-6"
      aria-label="노출 위험도"
    >
      <h2 className="panel-title">노출 위험도</h2>
      <div ref={numberRef} className="mt-3 flex items-end gap-2">
        <span
          className={cn(
            'tabular text-[44px] leading-none font-bold tracking-[-0.04em]',
            total ? 'text-fg' : 'text-faint',
          )}
        >
          {total}
        </span>
        <span className="tabular pb-1 text-[14px] text-muted">
          / {CATEGORIES.length} 항목 노출
        </span>
      </div>
      <p
        className={cn(
          'mt-2 text-[14px] font-medium',
          counts.high ? 'text-alert-2' : 'text-fg-2',
        )}
      >
        {verdict(counts.high, total)}
      </p>

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-muted">
        {severities.map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className={cn('size-2 rounded-full', SEVERITY_COLOR[s])} />
            {SEVERITY_LABEL[s]}{' '}
            <b className="tabular font-semibold text-fg-2">{counts[s]}</b>
          </span>
        ))}
      </div>
      <div className="mt-2.5 flex h-7 overflow-hidden rounded-md bg-surface-2">
        {severities.map((s) =>
          counts[s] ? (
            <motion.div
              key={s}
              layout
              initial={{ flexGrow: 0 }}
              animate={{ flexGrow: counts[s] }}
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              className={cn('h-full basis-0', SEVERITY_COLOR[s])}
            />
          ) : null,
        )}
      </div>

      <h3 className="panel-title mt-6">방금 드러난 것</h3>
      <ol className="mt-2 flex-1 divide-y divide-line">
        <AnimatePresence initial={false}>
          {recent.length === 0 && (
            <li className="py-3 text-[13px] text-faint">
              발견하는 대로 여기에 쌓입니다.
            </li>
          )}
          {recent.map((f) => (
            <motion.li
              key={f.seq}
              layout
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-3 py-2.5"
            >
              <span
                className={cn(
                  'size-1.5 shrink-0 rounded-full',
                  SEVERITY_COLOR[CATEGORY_META[f.category].severity],
                )}
              />
              <span className="shrink-0 text-[13px] text-muted">
                {f.label} 발견됨
              </span>
              <span className="min-w-0 flex-1 truncate text-right text-[13.5px] font-medium text-fg">
                {maskValue(f.category, f.value)}
              </span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>
    </section>
  )
}
