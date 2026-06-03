export async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(txt || `${res.status} ${res.statusText}`)
  }
  return res.json()
}
