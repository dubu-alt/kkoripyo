export const HANDLE_RE = /^[A-Za-z0-9._]{1,30}$/

export function normalizeHandle(raw: string) {
  const value = raw.trim()
  const fromUrl = value.match(/instagram\.com\/([A-Za-z0-9._]+)/i)?.[1]
  return (fromUrl ?? value).replace(/^@/, '').toLowerCase()
}
