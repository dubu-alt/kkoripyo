import { createElement, type ComponentProps, type MouseEvent } from 'react'
import type { ExtraProps, Options } from 'react-markdown'
import remarkGfm from 'remark-gfm'

function followFragment(event: MouseEvent<HTMLAnchorElement>, href?: string) {
  if (
    !href?.startsWith('#') ||
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  )
    return

  // Native hash navigation changes React Router's location key and would
  // unmount the in-memory analysis session, even when the target is missing.
  event.preventDefault()
  let id: string
  try {
    id = decodeURIComponent(href.slice(1))
  } catch {
    return
  }
  const ownerDocument = event.currentTarget.ownerDocument
  // GFM keeps percent-encoded characters in IDs for non-ASCII footnote names.
  const target =
    ownerDocument.getElementById(id) ||
    (id !== href.slice(1) ? ownerDocument.getElementById(href.slice(1)) : null)
  if (!target) return

  if (target.tabIndex < 0 && !target.hasAttribute('tabindex')) {
    target.setAttribute('tabindex', '-1')
    target.addEventListener('blur', () => target.removeAttribute('tabindex'), {
      once: true,
    })
  }
  target.focus({ preventScroll: true })
  target.scrollIntoView({ block: 'start', behavior: 'instant' })
}

export const analysisMarkdownOptions = {
  remarkPlugins: [remarkGfm],
  skipHtml: true,
  components: {
    a: (props: ComponentProps<'a'> & ExtraProps) => {
      const anchorProps = { ...props }
      delete anchorProps.node
      return createElement('a', {
        ...anchorProps,
        target: props.href?.startsWith('#') ? undefined : '_blank',
        rel: 'noreferrer',
        onClick: (event) => {
          props.onClick?.(event)
          followFragment(event, props.href)
        },
      })
    },
  },
} satisfies Options
