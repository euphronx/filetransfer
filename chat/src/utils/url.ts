/**
 * 图片地址的白名单。
 * 只放行 http(s) 与内联图片 data URL；其余协议（javascript:、file: 等）一律不渲染。
 */

/** 允许内联渲染的图片 MIME */
const INLINE_IMAGE = /^data:image\/(?:png|jpeg|jpg|gif|webp|avif|bmp);base64,/i

/** 是否为可安全渲染的图片地址 */
export const isSafeImageUrl = (url: string): boolean => {
  const value = url.trim()
  if (!value) {
    return false
  }
  if (INLINE_IMAGE.test(value)) {
    return true
  }
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

/** 是否为可安全打开的链接；没有协议的按 https 补全后再判断 */
export const isSafeLinkUrl = (url: string): boolean => {
  const value = url.trim()
  if (!value) {
    return false
  }
  if (value.startsWith('#')) {
    return true
  }
  const normalized = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value) ? value : `https://${value}`
  try {
    const parsed = new URL(normalized)
    return ['http:', 'https:', 'mailto:'].includes(parsed.protocol)
  } catch {
    return false
  }
}
