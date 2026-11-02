import { z } from 'zod'
import { CATEGORIES } from './categories.ts'

// 백엔드 POST /api/v1/agent/stream 이 보내는 SSE 이벤트 (data 줄의 JSON)
const text = z.string().max(20_000)

export const scanEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('token'), text }),
  z.object({
    type: z.literal('stage'),
    id: z.string().min(1).max(300),
    text: z.string().min(1).max(2000),
    state: z.enum(['running', 'done', 'error']),
    detail: z.string().max(2000).optional(),
  }),
  z.object({ type: z.literal('status'), text: z.string().max(2000) }),
  z.object({
    type: z.literal('finding'),
    category: z.enum(CATEGORIES),
    label: z.string().max(40),
    value: z.string().min(1).max(200),
    evidence: z.string().max(300).default(''),
    links: z
      .array(
        z.object({
          post_id: z.string().max(60),
          url: z.url({
            protocol: /^https$/,
            hostname: /^www\.instagram\.com$/,
          }),
        }),
      )
      .max(5)
      .default([]),
    certainty: z.enum(['confirmed', 'estimated']),
  }),
  z.object({
    type: z.literal('stats'),
    posts: z.number().int().nonnegative(),
    comments: z.number().int().nonnegative(),
    photos_with_text: z.number().int().nonnegative(),
    followers: z.number().int().nonnegative(),
    following: z.number().int().nonnegative(),
    friends: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal('blur'),
    image_id: z.string(),
    post_id: z.string(),
    post_url: z.string().nullish(),
    posted_at: z.string().nullish(),
    reason: z.string().max(300),
    before: z.string(),
    after: z.string().nullish(),
    error: z.string().nullish(),
    /** 다른 사람이 올린 사진이면 그 계정 (없으면 본인 사진) */
    owner: z.string().nullish(),
  }),
  z.object({ type: z.literal('done') }),
  z.object({
    type: z.literal('error'),
    message: z.string().max(5000).default(''),
  }),
])

export type ScanEvent = z.infer<typeof scanEventSchema>
export type FindingEvent = Extract<ScanEvent, { type: 'finding' }>
export type StatsEvent = Extract<ScanEvent, { type: 'stats' }>
export type BlurEvent = Extract<ScanEvent, { type: 'blur' }>

const KNOWN = new Set(scanEventSchema.options.map((o) => o.shape.type.value))

/**
 * data 줄 하나를 이벤트로 바꾼다. 모르는 type은 무시(null)하고,
 * 아는 type인데 형식이 틀리면 오류를 던진다.
 */
export function parseScanEvent(data: string): ScanEvent | null {
  let raw: unknown
  try {
    raw = JSON.parse(data)
  } catch {
    throw new Error('서버 응답을 읽지 못했어요.')
  }
  const type = (raw as { type?: unknown } | null)?.type
  if (typeof type !== 'string' || !KNOWN.has(type as ScanEvent['type']))
    return null
  const result = scanEventSchema.safeParse(raw)
  if (!result.success) throw new Error('서버 응답 형식이 올바르지 않아요.')
  return result.data
}
