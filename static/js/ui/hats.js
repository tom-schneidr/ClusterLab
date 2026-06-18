import { api } from '../api.js'
import { TOOL_IDS } from '../constants.js'
import { escapeHtml, qs, short } from '../dom.js'
import { hatById } from '../selectors.js'
import { state } from '../state.js'

let onChange = () => {}

export function initHatUi(callbacks) {
  onChange = callbacks.onChange
  qs('hatForm').addEventListener('submit', saveHat)
  qs('newHatBtn').addEventListener('click', () => {
    state.selectedHatId = null
    renderHats()
    renderHatForm()
  })
  qs('deleteHatBtn').addEventListener('click', deleteHat)
}

export function renderHats() {
  qs('hatCount').textContent = `${state.hats.length} hats`
  qs('hatList').innerHTML = state.hats.map((hat) => `
    <article class="hat-row ${hat.id === state.selectedHatId ? 'active' : ''}" data-hat-id="${escapeHtml(hat.id)}">
      <div class="hat-strip" style="background:${escapeHtml(hat.color || '#42c6ff')}"></div>
      <div class="hat-row-body">
        <strong>${escapeHtml(hat.name)}</strong>
        <p>${escapeHtml(short(hat.role, 150))}</p>
      </div>
    </article>
  `).join('')
  document.querySelectorAll('.hat-row').forEach((row) => {
    row.addEventListener('click', () => {
      state.selectedHatId = row.dataset.hatId
      renderHats()
      renderHatForm()
    })
  })
}

export function blankHat() {
  return {
    id: '',
    name: 'New Hat',
    role: '',
    system_prompt: '',
    model: 'auto',
    temperature: 0.2,
    tools: [],
    color: '#42c6ff',
    icon: 'spark',
    can_write_blackboard: true,
    can_prompt_hats: false,
  }
}

export function renderHatForm() {
  const hat = hatById(state.selectedHatId) || blankHat()
  qs('hatFormMode').textContent = hat.id ? `Editing ${hat.id}` : 'New hat'
  qs('hatId').value = hat.id || ''
  qs('hatName').value = hat.name || ''
  qs('hatColor').value = hat.color || '#42c6ff'
  qs('hatRole').value = hat.role || ''
  qs('hatSystem').value = hat.system_prompt || ''
  qs('hatCanWrite').checked = Boolean(hat.can_write_blackboard)
  qs('hatCanPrompt').checked = Boolean(hat.can_prompt_hats)
  qs('toolChecks').innerHTML = TOOL_IDS.map((tool) => `
    <label><input type="checkbox" value="${tool}" ${hat.tools?.includes(tool) ? 'checked' : ''}> ${tool}</label>
  `).join('')
}

async function saveHat(event) {
  event.preventDefault()
  const tools = [...qs('toolChecks').querySelectorAll('input:checked')].map((input) => input.value)
  const id = qs('hatId').value.trim()
  const body = {
    id: id || null,
    name: qs('hatName').value.trim(),
    role: qs('hatRole').value.trim(),
    system_prompt: qs('hatSystem').value.trim(),
    model: 'auto',
    temperature: 0.2,
    tools,
    color: qs('hatColor').value,
    icon: 'spark',
    can_write_blackboard: qs('hatCanWrite').checked,
    can_prompt_hats: qs('hatCanPrompt').checked,
  }
  const saved = id
    ? await api(`/api/hats/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(body) })
    : await api('/api/hats', { method: 'POST', body: JSON.stringify(body) })
  const idx = state.hats.findIndex((hat) => hat.id === saved.id)
  if (idx >= 0) state.hats[idx] = saved
  else state.hats.push(saved)
  state.selectedHatId = saved.id
  onChange()
}

async function deleteHat() {
  const id = qs('hatId').value.trim()
  if (!id) return
  await api(`/api/hats/${encodeURIComponent(id)}`, { method: 'DELETE' })
  state.hats = state.hats.filter((hat) => hat.id !== id)
  state.selectedHatId = state.hats[0]?.id || null
  onChange()
}
