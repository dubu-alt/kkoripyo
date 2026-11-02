import { z } from 'zod'

const originSchema = z.url({ protocol: /^https?$/ }).refine((value) => {
  const url = new URL(value)
  return (
    url.pathname === '/' &&
    !url.search &&
    !url.hash &&
    !url.username &&
    !url.password
  )
})

export const apiOrigin = originSchema.parse(import.meta.env.VITE_API_ORIGIN)
