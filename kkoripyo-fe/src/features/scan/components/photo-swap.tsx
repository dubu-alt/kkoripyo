import { apiOrigin } from '@/lib/env'
import type { BlurEvent } from '../events.ts'

/** 백엔드가 준 상대 주소(/api/v1/...)는 백엔드 주소 기준으로 바꾼다 */
function fromApi(url: string) {
  try {
    return new URL(url, apiOrigin).href
  } catch {
    return url
  }
}

export function PhotoSwap({ photos }: { photos: BlurEvent[] }) {
  if (!photos.length) return null
  return (
    <section className="panel p-5 sm:p-7" aria-label="교체할 사진">
      <h2 className="text-[18px] font-bold tracking-[-0.02em] text-fg">
        이 사진으로 교체하세요
      </h2>
      <p className="mt-1 text-[13.5px] text-muted">
        지금 가장 시급한 사진입니다. 사진에 적힌 글자 중 개인정보가 보이는
        부분을 가렸습니다. 당신이 올린 사진은 원본을 내리고 오른쪽 사진으로 다시
        올리고, 다른 사람이 올린 사진은 그 사람에게 바꿔 달라고 요청하세요.
      </p>
      <ul className="mt-5 max-w-[760px] space-y-6">
        {photos.map((p) => (
          <li key={p.image_id}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <div className="min-w-0">
                {p.owner && (
                  <span className="mb-1 inline-block rounded-full border border-line-2 px-2 py-0.5 text-[11.5px] text-fg-2">
                    @{p.owner}이(가) 올린 사진 · 당신이 태그·언급됨
                  </span>
                )}
                <p className="text-[14px] font-semibold text-alert-2">
                  {p.reason || '개인정보가 보이는 사진'}
                </p>
              </div>
              <span className="text-[12px] text-muted">
                {p.posted_at?.slice(0, 10)}
                {p.post_url && (
                  <a
                    href={p.post_url}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-2 underline decoration-line-2 underline-offset-4 hover:text-fg"
                  >
                    게시물 보기
                  </a>
                )}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2.5 sm:gap-4">
              <figure className="min-w-0">
                <img
                  src={p.before}
                  alt="지금 올라가 있는 원본 사진"
                  referrerPolicy="no-referrer"
                  loading="lazy"
                  className="aspect-square w-full rounded-xl bg-surface-2 object-cover ring-1 ring-alert-line"
                />
                <figcaption className="mt-1.5 text-[12px] text-muted">
                  {p.owner
                    ? `@${p.owner}의 피드에 올라가 있는 사진`
                    : '지금 올라가 있는 사진'}
                </figcaption>
              </figure>
              <figure className="min-w-0">
                {p.after ? (
                  <img
                    src={fromApi(p.after)}
                    alt="개인정보를 가린 사진"
                    className="aspect-square w-full rounded-xl bg-surface-2 object-cover ring-1 ring-line-2"
                  />
                ) : (
                  <div className="flex aspect-square w-full items-center justify-center rounded-xl bg-surface-2 px-3 text-center text-[13px] text-muted">
                    이 사진은 가리지 못했습니다
                  </div>
                )}
                <figcaption className="mt-1.5 text-[12px] text-muted">
                  {p.owner ? `@${p.owner}에게 보낼 사진` : '바꿀 사진'}
                  {p.after && (
                    <a
                      href={fromApi(p.after)}
                      download={`${p.image_id}_kkoripyo.jpg`}
                      className="ml-2 text-fg underline decoration-line-2 underline-offset-4"
                    >
                      저장
                    </a>
                  )}
                </figcaption>
              </figure>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
