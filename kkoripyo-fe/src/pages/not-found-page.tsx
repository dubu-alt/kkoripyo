import { Link } from 'react-router'

function NotFoundPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[720px] flex-col justify-center px-4 sm:px-6">
      <h1 className="text-[28px] font-bold tracking-[-0.03em] text-fg">
        페이지를 찾을 수 없습니다
      </h1>
      <p className="mt-2 text-fg-2">
        주소를 확인하거나 처음 화면으로 돌아가 주세요.
      </p>
      <Link
        className="mt-6 text-fg underline decoration-line-2 underline-offset-4"
        to="/"
      >
        처음 화면으로
      </Link>
    </main>
  )
}

export default NotFoundPage
