import { CATEGORY_META, type Category, type Severity } from './categories.ts'
import type {
  BlurEvent,
  FindingEvent,
  ScanEvent,
  StatsEvent,
} from './events.ts'

export const REPORT_MARK = '## 종합 리포트'

export type Stage = {
  id: string
  text: string
  state: 'running' | 'done' | 'error'
  /** 왜 이 단계를 하는지 (진행 중에 받은 설명을 끝까지 유지) */
  detail?: string
  at: number
  /** 마지막으로 바뀐 시각 */
  updatedAt: number
}

export type Finding = Omit<FindingEvent, 'type'> & { at: number; seq: number }

export type TextBlock = { kind: 'narration' | 'report'; text: string }

export type Phase = 'idle' | 'running' | 'done' | 'stopped' | 'error'

export type ScanState = {
  phase: Phase
  handle: string
  startedAt: number
  finishedAt: number | null
  stages: Stage[]
  /** 항목별 발견. 단일 항목은 마지막 값, 여러 값 항목은 값마다 하나 */
  findings: Partial<Record<Category, Finding[]>>
  /** 발견 순서 (최근 발견 목록용) */
  feed: Finding[]
  stats: Omit<StatsEvent, 'type'> | null
  blocks: TextBlock[]
  /** 마지막 이벤트가 글이었는지. 진행 줄이 끼면 다음 글은 새 문단으로 */
  textOpen: boolean
  photos: BlurEvent[]
  progress: number
  error: string | null
}

export type ScanAction =
  | { type: 'start'; handle: string; now: number }
  | { type: 'event'; event: ScanEvent; now: number }
  | { type: 'fail'; message: string; now: number }
  | { type: 'abort'; now: number }

export const initialScanState: ScanState = {
  phase: 'idle',
  handle: '',
  startedAt: 0,
  finishedAt: null,
  stages: [],
  findings: {},
  feed: [],
  stats: null,
  blocks: [],
  textOpen: false,
  photos: [],
  progress: 0,
  error: null,
}

function omitType<T extends { type: string }>(event: T): Omit<T, 'type'> {
  const copy: Partial<T> = { ...event }
  delete copy.type
  return copy as Omit<T, 'type'>
}

const COLLECT_STEPS = 7 // 프로필·팔로워·팔로잉·게시물·댓글·사진 글자·친구 피드

/** 진행률은 전체 길이를 알 수 없어서 단계로 어림한다. 뒤로 가지 않는다. */
export function estimateProgress(stages: Stage[], prev: number) {
  let value = 2
  const collectDone = stages.filter(
    (s) => s.id.startsWith('collect:') && s.state !== 'running',
  ).length
  value = Math.max(
    value,
    (Math.min(collectDone, COLLECT_STEPS) / COLLECT_STEPS) * 40,
  )
  const rounds = stages.filter(
    (s) =>
      !s.id.startsWith('collect:') &&
      s.id !== 'report' &&
      s.id !== 'blur' &&
      s.id !== 'pick' &&
      s.state !== 'running',
  ).length
  if (rounds > 0 || stages.some((s) => !s.id.startsWith('collect:'))) {
    value = Math.max(value, 40 + 45 * (1 - 0.82 ** rounds))
  }
  const report = stages.find((s) => s.id === 'report')
  if (report) value = Math.max(value, report.state === 'running' ? 93 : 97)
  if (stages.some((s) => s.id === 'pick')) value = Math.max(value, 86)
  if (stages.some((s) => s.id === 'blur')) value = Math.max(value, 89)
  return Math.max(prev, Math.min(99, Math.round(value)))
}

function addFinding(
  state: ScanState,
  event: FindingEvent,
  now: number,
): ScanState {
  const seq = state.feed.length + 1
  const finding: Finding = { ...omitType(event), at: now, seq }
  const meta = CATEGORY_META[event.category]
  const current = state.findings[event.category] ?? []
  const next = meta.multiple
    ? [...current.filter((f) => f.value !== event.value), finding]
    : [finding]
  return {
    ...state,
    findings: { ...state.findings, [event.category]: next },
    feed: [...state.feed, finding],
  }
}

function addText(state: ScanState, text: string): ScanState {
  if (!text) return state
  const blocks = [...state.blocks]
  const last = blocks.at(-1)
  if (state.textOpen && last) {
    blocks[blocks.length - 1] = { ...last, text: last.text + text }
  } else {
    blocks.push({ kind: 'narration', text })
  }
  const tail = blocks[blocks.length - 1]
  if (
    tail.kind === 'narration' &&
    tail.text.trimStart().startsWith(REPORT_MARK)
  ) {
    blocks[blocks.length - 1] = { ...tail, kind: 'report' }
  }
  return { ...state, blocks, textOpen: true }
}

function applyEvent(
  state: ScanState,
  event: ScanEvent,
  now: number,
): ScanState {
  switch (event.type) {
    case 'token':
      return addText(state, event.text)
    case 'stage': {
      const exists = state.stages.some((s) => s.id === event.id)
      const stage: Stage = {
        id: event.id,
        text: event.text,
        state: event.state,
        detail: event.detail,
        at: now,
        updatedAt: now,
      }
      const stages = exists
        ? state.stages.map((s) =>
            s.id === event.id
              ? { ...stage, at: s.at, detail: event.detail || s.detail }
              : s,
          )
        : [...state.stages, stage]
      return {
        ...state,
        stages,
        textOpen: false,
        progress: estimateProgress(stages, state.progress),
      }
    }
    case 'finding':
      return addFinding(state, event, now)
    case 'stats': {
      return { ...state, stats: omitType(event) }
    }
    case 'blur':
      return { ...state, photos: [...state.photos, event], textOpen: false }
    case 'status':
      return state
    case 'done': {
      const hasReport = state.blocks.some((b) => b.kind === 'report')
      return {
        ...state,
        phase: hasReport ? 'done' : 'stopped',
        finishedAt: now,
        progress: 100,
        stages: state.stages.map((s) =>
          s.state === 'running' ? { ...s, state: 'done' } : s,
        ),
      }
    }
    case 'error':
      return {
        ...state,
        phase: 'error',
        finishedAt: now,
        error: '분석 중 문제가 생겨 멈췄어요. 잠시 후 다시 시도해 주세요.',
      }
  }
}

export function scanReducer(state: ScanState, action: ScanAction): ScanState {
  switch (action.type) {
    case 'start':
      return {
        ...initialScanState,
        phase: 'running',
        handle: action.handle,
        startedAt: action.now,
        progress: 1,
      }
    case 'event':
      if (state.phase !== 'running') return state
      return applyEvent(state, action.event, action.now)
    case 'fail':
      if (state.phase !== 'running') return state
      return {
        ...state,
        phase: 'error',
        error: action.message,
        finishedAt: action.now,
      }
    case 'abort':
      if (state.phase !== 'running') return state
      return { ...state, phase: 'stopped', finishedAt: action.now }
  }
}

export function severityCounts(state: ScanState): Record<Severity, number> {
  const counts: Record<Severity, number> = { high: 0, medium: 0, low: 0 }
  for (const [category, list] of Object.entries(state.findings)) {
    if (list?.length) counts[CATEGORY_META[category as Category].severity] += 1
  }
  return counts
}

export function exposedCount(state: ScanState) {
  return Object.values(state.findings).filter((list) => list?.length).length
}
