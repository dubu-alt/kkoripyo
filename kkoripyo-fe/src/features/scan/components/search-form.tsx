import { useState, type FormEvent } from 'react'
import { cn } from '@/lib/utils'
import { HANDLE_RE, normalizeHandle } from '../handle.ts'

type Props = {
  compact?: boolean
  running: boolean
  initial?: string
  onSubmit: (handle: string) => void
  onStop: () => void
}

export function SearchForm({
  compact = false,
  running,
  initial = '',
  onSubmit,
  onStop,
}: Props) {
  const [value, setValue] = useState(initial)
  const [invalid, setInvalid] = useState(false)

  function submit(event: FormEvent) {
    event.preventDefault()
    if (running) {
      onStop()
      return
    }
    const handle = normalizeHandle(value)
    if (!HANDLE_RE.test(handle)) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    setValue(handle)
    onSubmit(handle)
  }

  return (
    <form
      onSubmit={submit}
      role="search"
      className={cn(
        'flex w-full items-center gap-1.5 rounded-full border transition-[height,padding] duration-500 bg-[#141416]/90 shadow-[0_1px_0_rgb(255_255_255/0.06)_inset]',
        invalid ? 'border-alert-line' : 'border-line-2',
        compact ? 'h-11 p-1 pl-4' : 'h-14 p-1.5 pl-5 sm:h-16 sm:pl-6',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'font-medium text-muted',
          compact ? 'text-[15px]' : 'text-lg sm:text-xl',
        )}
      >
        @
      </span>
      <label
        htmlFor={compact ? 'handle-compact' : 'handle'}
        className="sr-only"
      >
        인스타그램 아이디
      </label>
      <input
        id={compact ? 'handle-compact' : 'handle'}
        value={value}
        onChange={(e) => {
          setValue(e.target.value)
          if (invalid) setInvalid(false)
        }}
        placeholder="instagram_id"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        enterKeyHint="search"
        readOnly={running}
        aria-invalid={invalid}
        className={cn(
          'min-w-0 flex-1 bg-transparent font-medium tracking-[-0.01em] text-fg outline-none placeholder:text-faint',
          compact ? 'text-[15px]' : 'text-lg sm:text-xl',
        )}
      />
      <button
        type="submit"
        className={cn(
          'shrink-0 rounded-full font-semibold transition-colors',
          running
            ? 'border border-line-2 bg-transparent text-fg-2 hover:bg-surface-2'
            : 'bg-fg text-bg hover:bg-white',
          compact
            ? 'h-9 px-4 text-[13px]'
            : 'h-11 px-5 text-[15px] sm:h-[52px] sm:px-7',
        )}
      >
        {running ? '중지' : compact ? '다시 추적' : '추적 시작'}
      </button>
    </form>
  )
}
