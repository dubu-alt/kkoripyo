import { AnimatePresence, LayoutGroup, motion } from 'motion/react'
import { useRef } from 'react'
import { FindingsBoard } from '@/features/scan/components/findings-board'
import { LiveToast } from '@/features/scan/components/live-toast'
import { PhotoSwap } from '@/features/scan/components/photo-swap'
import { ProgressPanel } from '@/features/scan/components/progress-panel'
import { RiskPanel } from '@/features/scan/components/risk-panel'
import { SearchForm } from '@/features/scan/components/search-form'
import { Transcript } from '@/features/scan/components/transcript'
import { useScan } from '@/features/scan/use-scan'

const ease = [0.16, 1, 0.3, 1] as const

function Brand({ small = false }: { small?: boolean }) {
  return (
    <a
      href="/"
      className="flex shrink-0 items-center"
      aria-label="꼬리표 처음 화면"
    >
      <img
        src="/logo.png"
        alt="꼬리표"
        width={1390}
        height={383}
        className={small ? 'h-7 w-auto' : 'h-9 w-auto sm:h-10'}
      />
    </a>
  )
}

const spring = {
  type: 'spring',
  stiffness: 170,
  damping: 26,
  mass: 0.9,
} as const

function HomePage() {
  const { state, start, stop } = useScan()
  const idle = state.phase === 'idle'
  const running = state.phase === 'running'
  const dashboardRef = useRef<HTMLDivElement>(null)
  const riskNumberRef = useRef<HTMLDivElement>(null)

  return (
    <LayoutGroup>
      {/* 입력창은 처음 화면과 진단 화면에서 같은 요소다. 위치만 바뀌어 위로 미끄러져 올라간다 */}
      <header
        className={
          idle
            ? ''
            : 'sticky top-0 z-20 border-b border-line bg-bg/75 backdrop-blur-xl'
        }
      >
        <div
          className={
            idle
              ? 'mx-auto flex min-h-dvh w-full max-w-[720px] flex-col px-4 sm:px-6'
              : 'mx-auto flex max-w-[1440px] flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-6 sm:px-6'
          }
        >
          <motion.div
            layout="position"
            transition={spring}
            className={idle ? 'flex h-16 items-center' : ''}
          >
            <Brand small={!idle} />
          </motion.div>
          <div
            className={
              idle
                ? 'flex flex-1 flex-col justify-center pb-[12vh]'
                : 'contents'
            }
          >
            <AnimatePresence mode="popLayout">
              {idle && (
                <motion.div
                  key="hero"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -40, filter: 'blur(6px)' }}
                  transition={{ duration: 0.45, ease }}
                >
                  <h1 className="text-[34px] leading-[1.2] font-extrabold tracking-[-0.035em] text-fg sm:text-[52px]">
                    아이디 하나면
                    <br />
                    <span className="bg-gradient-to-b from-white to-[#8a8a92] bg-clip-text text-transparent">
                      당신이 누군지 압니다.
                    </span>
                  </h1>
                  <p className="mt-5 max-w-[34rem] text-[15.5px] leading-relaxed text-fg-2 sm:text-[17px]">
                    이름, 생일, 학교, 사는 동네, 가장 친한 친구까지. 낯선 사람이
                    당신의 공개 계정과 친구들의 피드만으로 알아낼 수 있는 것을
                    직접 추적해 보여드립니다.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
            <motion.div
              layout="position"
              transition={spring}
              className={idle ? 'mt-9' : 'w-full sm:max-w-[560px]'}
            >
              <SearchForm
                compact={!idle}
                running={running}
                onSubmit={start}
                onStop={stop}
              />
            </motion.div>
            <AnimatePresence mode="popLayout">
              {idle && (
                <motion.p
                  key="note"
                  exit={{ opacity: 0 }}
                  className="mt-4 text-[12.5px] leading-relaxed text-faint"
                >
                  누구나 볼 수 있는 공개 정보만 확인합니다. 비공개 계정은
                  분석하지 않습니다.
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>

      {!idle && (
        <main className="mx-auto flex max-w-[1440px] flex-col gap-4 px-4 pt-5 pb-24 sm:gap-5 sm:px-6 sm:pt-8">
          {state.error && (
            <div
              role="alert"
              className="rounded-xl border border-alert-line bg-alert-soft px-4 py-3 text-[14px] text-alert-2"
            >
              {state.error}
            </div>
          )}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease, delay: 0.25 }}
          >
            <ProgressPanel state={state} />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease, delay: 0.38 }}
            ref={dashboardRef}
            className="grid scroll-mt-24 gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]"
          >
            <FindingsBoard state={state} />
            <RiskPanel state={state} numberRef={riskNumberRef} />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease, delay: 0.5 }}
            className="flex flex-col gap-4 sm:gap-5"
          >
            <Transcript state={state} />
            <PhotoSwap photos={state.photos} />
          </motion.div>
        </main>
      )}
      {!idle && (
        <LiveToast
          state={state}
          watchRef={riskNumberRef}
          onJump={() =>
            dashboardRef.current?.scrollIntoView({
              behavior: 'smooth',
              block: 'start',
            })
          }
        />
      )}
    </LayoutGroup>
  )
}

export default HomePage
