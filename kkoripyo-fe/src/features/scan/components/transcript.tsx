import Markdown from 'react-markdown'
import { analysisMarkdownOptions } from '@/lib/markdown'
import { cn } from '@/lib/utils'
import type { ScanState } from '../scan-state.ts'

export function Transcript({ state }: { state: ScanState }) {
  const running = state.phase === 'running'
  const narration = state.blocks.filter((b) => b.kind === 'narration')
  const report = state.blocks.find((b) => b.kind === 'report')
  const writingReport = running && Boolean(report)

  return (
    <>
      <section className="panel p-5 sm:p-7" aria-label="추적 기록">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="panel-title">추적 기록</h2>
          {running && !report && (
            <span className="text-[12px] text-faint">
              실시간으로 기록됩니다
            </span>
          )}
        </div>
        <div className="mt-2">
          {narration.length === 0 ? (
            <p className="py-6 text-[14px] text-faint">
              {running
                ? '계정을 읽는 중입니다. 찾아낸 사실이 여기에 기록됩니다.'
                : '기록이 없습니다.'}
            </p>
          ) : (
            narration.map((block, i) => (
              <div
                key={i}
                className={cn(
                  'prose-scan border-line',
                  i > 0 && 'mt-2 border-t pt-2',
                )}
              >
                <Markdown {...analysisMarkdownOptions}>{block.text}</Markdown>
              </div>
            ))
          )}
          {running && !report && <Caret />}
        </div>
      </section>

      {report && (
        <section
          className="panel border-line-2 bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-5 sm:p-8"
          aria-label="종합 리포트"
        >
          <div className="prose-scan">
            <Markdown {...analysisMarkdownOptions}>{report.text}</Markdown>
            {writingReport && <Caret />}
          </div>
        </section>
      )}
    </>
  )
}

function Caret() {
  return (
    <span
      aria-hidden
      className="ml-0.5 inline-block h-4 w-[7px] translate-y-0.5 animate-[caret_1s_step-end_infinite] bg-fg-2"
    />
  )
}
