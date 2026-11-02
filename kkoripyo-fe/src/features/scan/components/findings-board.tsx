import { AnimatePresence, motion } from 'motion/react'
import { cn } from '@/lib/utils'
import {
  CATEGORIES,
  CATEGORY_META,
  maskValue,
  type Category,
} from '../categories.ts'
import type { Finding, ScanState } from '../scan-state.ts'

function AlertMark() {
  return (
    <span
      aria-hidden
      className="flex size-[18px] shrink-0 items-center justify-center rounded-full bg-alert text-[11px] font-black text-white shadow-[0_0_0_4px_rgb(255_59_48/0.15)]"
    >
      !
    </span>
  )
}

/** 근거 문장. 근거 게시물이 있으면 문장 자체가 첫 게시물 링크가 되고, 나머지는 번호 링크로 붙는다 */
function Evidence({
  finding,
  estimated,
}: {
  finding: Finding
  estimated: boolean
}) {
  const [first, ...rest] = finding.links
  const text = finding.evidence || (first ? '근거 게시물' : '')
  return (
    <div className="mt-1 text-[12px] leading-snug text-fg-2/70">
      {estimated && <span className="mr-1 text-warn">추정</span>}
      {first ? (
        <a
          href={first.url}
          target="_blank"
          rel="noreferrer"
          title="근거 게시물 열기"
          className="underline decoration-alert-line decoration-1 underline-offset-[3px] hover:text-fg hover:decoration-alert"
        >
          {text}
          <span aria-hidden className="ml-0.5 text-[10px]">
            ↗
          </span>
        </a>
      ) : (
        text
      )}
      {rest.map((link, i) => (
        <a
          key={link.post_id}
          href={link.url}
          target="_blank"
          rel="noreferrer"
          aria-label={`근거 게시물 ${i + 2}`}
          className="ml-1.5 rounded border border-line-2 px-1 text-[11px] text-fg-2 hover:border-alert-line hover:text-fg"
        >
          {i + 2}
        </a>
      ))}
    </div>
  )
}

function Tile({
  category,
  list,
  running,
}: {
  category: Category
  list: Finding[]
  running: boolean
}) {
  const meta = CATEGORY_META[category]
  const found = list.length > 0
  const latest = list.at(-1)
  const estimatedOnly = found && list.every((f) => f.certainty === 'estimated')

  return (
    <motion.li
      layout
      className={cn(
        'relative min-w-0 overflow-hidden rounded-xl border px-3.5 py-3 transition-colors duration-500',
        found ? 'border-alert-line bg-alert-soft' : 'border-line bg-black/20',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            'text-[12.5px] font-medium',
            found ? 'text-alert-2' : 'text-muted',
          )}
        >
          {meta.label}
        </span>
        {found ? (
          <AlertMark />
        ) : (
          <span className="text-[11px] text-faint">
            {running ? '찾는 중' : '못 찾음'}
          </span>
        )}
      </div>
      <AnimatePresence mode="popLayout" initial={false}>
        {found && latest ? (
          <motion.div
            key={latest.seq}
            initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="mt-1.5"
          >
            <div className="text-[15px] leading-snug font-semibold tracking-[-0.01em] text-fg">
              {meta.multiple
                ? list.map((f) => maskValue(category, f.value)).join(', ')
                : maskValue(category, latest.value)}
            </div>
            <Evidence finding={latest} estimated={estimatedOnly} />
          </motion.div>
        ) : (
          <motion.div
            key="empty"
            className="mt-1.5 text-[15px] font-semibold text-faint"
          >
            —
          </motion.div>
        )}
      </AnimatePresence>
      {found && (
        <motion.span
          aria-hidden
          initial={{ opacity: 0.55 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 1.4 }}
          key={`flash-${latest?.seq}`}
          className="pointer-events-none absolute inset-0 bg-alert/30"
        />
      )}
    </motion.li>
  )
}

export function FindingsBoard({ state }: { state: ScanState }) {
  const running = state.phase === 'running'
  // 찾은 항목을 앞으로
  const ordered = [...CATEGORIES].sort(
    (a, b) =>
      Number(Boolean(state.findings[b]?.length)) -
      Number(Boolean(state.findings[a]?.length)),
  )
  return (
    <section className="panel p-5 sm:p-6" aria-label="드러난 정보">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="panel-title">낯선 사람이 알아낸 것</h2>
        <span className="text-[12px] text-faint">찾는 즉시 표시</span>
      </div>
      <ul className="mt-4 grid grid-cols-2 gap-2.5 lg:grid-cols-3">
        {ordered.map((category) => (
          <Tile
            key={category}
            category={category}
            list={state.findings[category] ?? []}
            running={running}
          />
        ))}
      </ul>
    </section>
  )
}
