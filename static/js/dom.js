export const qs = (id) => document.getElementById(id)

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

export function short(value, n = 170) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  return text.length > n ? `${text.slice(0, n)}...` : text
}

export function pretty(value) {
  return JSON.stringify(value ?? {}, null, 2)
}
