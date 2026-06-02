const TOOL_IDS = [
  'web_search',
  'memory_search',
  'memory_write',
  'filesystem_read',
  'filesystem_write',
  'shell',
]

const state = {
  hats: [],
  topologies: [],
  activeTopology: null,
  selectedHatId: null,
  selectedNodeId: null,
  currentRun: null,
  selectedEventSeq: null,
  view: 'hats',
  dirtyTopology: false,
  editingNodeId: null,
}

const qs = (id) => document.getElementById(id)

async function api(path, options = {}) {
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

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function short(value, n = 170) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  return text.length > n ? `${text.slice(0, n)}...` : text
}

function pretty(value) {
  return JSON.stringify(value ?? {}, null, 2)
}

function hatById(id) {
  return state.hats.find((hat) => hat.id === id)
}

function activeNodes() {
  return state.activeTopology?.nodes || []
}

function activeEdges() {
  return state.activeTopology?.edges || []
}

function setView(name) {
  state.view = name
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === name)
  })
  document.querySelectorAll('.view').forEach((view) => {
    view.classList.toggle('active', view.id === `view-${name}`)
  })
}

function bindNav() {
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => setView(btn.dataset.view))
  })
}

async function bootstrap() {
  const data = await api('/api/bootstrap')
  state.hats = data.hats
  state.topologies = data.topologies
  state.activeTopology = data.topologies[0]
  state.selectedHatId = state.hats[0]?.id || null
  qs('llmRoute').textContent = `${data.llm.default_model} @ ${data.llm.base_url}`
  renderAll()
}

function renderAll() {
  renderHats()
  renderHatForm()
  renderTopologyControls()
  renderGraph()
  renderRun()
}

function renderHats() {
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

function blankHat() {
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

function renderHatForm() {
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
  renderAll()
}

async function deleteHat() {
  const id = qs('hatId').value.trim()
  if (!id) return
  await api(`/api/hats/${encodeURIComponent(id)}`, { method: 'DELETE' })
  state.hats = state.hats.filter((hat) => hat.id !== id)
  state.selectedHatId = state.hats[0]?.id || null
  renderAll()
}

function renderTopologyControls() {
  if (!state.activeTopology && state.topologies.length) state.activeTopology = state.topologies[0]
  const topology = state.activeTopology || { id: '', name: 'Untitled topology', nodes: [], edges: [] }
  qs('topologySelect').innerHTML = state.topologies.map((top) => (
    `<option value="${escapeHtml(top.id)}" ${top.id === topology.id ? 'selected' : ''}>${escapeHtml(top.name)}</option>`
  )).join('')
  qs('topologyName').value = topology.name || ''
  qs('topologySavedState').textContent = state.dirtyTopology ? 'Unsaved changes' : 'Loaded'

  const existing = new Set(activeNodes().map((node) => node.hat_id))
  qs('addHatSelect').innerHTML = state.hats
    .filter((hat) => !existing.has(hat.id))
    .map((hat) => `<option value="${escapeHtml(hat.id)}">${escapeHtml(hat.name)}</option>`)
    .join('')

  const nodeOptions = activeNodes().map((node) => {
    const hat = hatById(node.hat_id)
    return `<option value="${escapeHtml(node.hat_id)}">${escapeHtml(hat?.name || node.hat_id)}</option>`
  }).join('')
  qs('edgeSource').innerHTML = nodeOptions
  qs('edgeTarget').innerHTML = nodeOptions
  qs('edgeList').innerHTML = activeEdges().map((edge) => {
    const source = hatById(edge.source)?.name || edge.source
    const target = hatById(edge.target)?.name || edge.target
    return `
      <div class="edge-item">
        <span>${escapeHtml(source)} -> ${escapeHtml(target)}</span>
        <button data-edge-id="${escapeHtml(edge.id)}">Remove</button>
      </div>
    `
  }).join('')
  qs('edgeList').querySelectorAll('button').forEach((button) => {
    button.addEventListener('click', () => removeEdge(button.dataset.edgeId))
  })
}

function topologyChanged() {
  state.dirtyTopology = true
  renderTopologyControls()
  renderGraph()
}

function newTopology() {
  state.activeTopology = {
    id: null,
    name: 'New Cognitive Cluster',
    nodes: [],
    edges: [],
  }
  state.selectedNodeId = null
  state.dirtyTopology = true
  renderAll()
}

async function saveTopology() {
  const topology = state.activeTopology
  if (!topology) return
  topology.name = qs('topologyName').value.trim() || 'Untitled topology'
  const saved = topology.id
    ? await api(`/api/topologies/${encodeURIComponent(topology.id)}`, { method: 'PUT', body: JSON.stringify(topology) })
    : await api('/api/topologies', { method: 'POST', body: JSON.stringify(topology) })
  const idx = state.topologies.findIndex((top) => top.id === saved.id)
  if (idx >= 0) state.topologies[idx] = saved
  else state.topologies.unshift(saved)
  state.activeTopology = saved
  state.dirtyTopology = false
  renderAll()
}

function loadTopology(id) {
  const topology = state.topologies.find((top) => top.id === id)
  if (!topology) return
  state.activeTopology = JSON.parse(JSON.stringify(topology))
  state.selectedNodeId = null
  state.dirtyTopology = false
  renderAll()
}

function addNode() {
  const hatId = qs('addHatSelect').value
  if (!hatId || !state.activeTopology) return
  const count = activeNodes().length
  state.activeTopology.nodes.push({
    hat_id: hatId,
    x: 130 + (count % 3) * 240,
    y: 130 + Math.floor(count / 3) * 150,
  })
  state.selectedNodeId = hatId
  topologyChanged()
}

function removeNode() {
  if (!state.selectedNodeId || !state.activeTopology) return
  state.activeTopology.nodes = activeNodes().filter((node) => node.hat_id !== state.selectedNodeId)
  state.activeTopology.edges = activeEdges().filter((edge) => edge.source !== state.selectedNodeId && edge.target !== state.selectedNodeId)
  state.selectedNodeId = null
  topologyChanged()
}

function addEdge() {
  const source = qs('edgeSource').value
  const target = qs('edgeTarget').value
  if (!source || !target || source === target || !state.activeTopology) return
  const exists = activeEdges().some((edge) => edge.source === source && edge.target === target)
  if (exists) return
  state.activeTopology.edges.push({
    id: `e_${Date.now().toString(36)}`,
    source,
    target,
  })
  topologyChanged()
}

function removeEdge(edgeId) {
  if (!state.activeTopology) return
  state.activeTopology.edges = activeEdges().filter((edge) => edge.id !== edgeId)
  topologyChanged()
}

function selectNode(hatId) {
  state.selectedNodeId = hatId
  state.selectedHatId = hatId
  document.querySelectorAll('.graph-node').forEach((item) => {
    item.classList.toggle('selected', item.dataset.hatId === hatId)
  })
  const label = hatId ? (hatById(hatId)?.name || hatId) : 'No node selected'
  qs('selectedNodeLabel').textContent = label
  qs('openNodeDetailBtn').disabled = !hatId
}

function nodeByHatId(hatId) {
  return activeNodes().find((node) => node.hat_id === hatId)
}

function openNodeDetail(hatId) {
  const node = nodeByHatId(hatId)
  const hat = hatById(hatId)
  if (!node || !hat) return
  selectNode(hatId)
  state.editingNodeId = hatId

  qs('nodeDetailTitle').textContent = hat.name || hat.id
  qs('nodeDetailMeta').textContent = `Node ${hat.id}`
  qs('nodeDetailHatId').value = hat.id
  qs('nodeDetailName').value = hat.name || ''
  qs('nodeDetailColor').value = hat.color || '#42c6ff'
  qs('nodeDetailX').value = Math.round(Number(node.x) || 20)
  qs('nodeDetailY').value = Math.round(Number(node.y) || 20)
  qs('nodeDetailRole').value = hat.role || ''
  qs('nodeDetailSystem').value = hat.system_prompt || ''
  qs('nodeDetailCanWrite').checked = Boolean(hat.can_write_blackboard)
  qs('nodeDetailCanPrompt').checked = Boolean(hat.can_prompt_hats)
  qs('nodeDetailTools').innerHTML = TOOL_IDS.map((tool) => `
    <label><input type="checkbox" value="${tool}" ${hat.tools?.includes(tool) ? 'checked' : ''}> ${tool}</label>
  `).join('')

  const dialog = qs('nodeDetailDialog')
  if (!dialog.open) dialog.showModal()
  qs('nodeDetailName').focus()
}

function closeNodeDetail() {
  state.editingNodeId = null
  const dialog = qs('nodeDetailDialog')
  if (dialog.open) dialog.close()
}

async function saveNodeDetail(event) {
  event.preventDefault()
  const id = qs('nodeDetailHatId').value.trim()
  const node = nodeByHatId(id)
  if (!id || !node) return
  const tools = [...qs('nodeDetailTools').querySelectorAll('input:checked')].map((input) => input.value)
  const body = {
    id,
    name: qs('nodeDetailName').value.trim(),
    role: qs('nodeDetailRole').value.trim(),
    system_prompt: qs('nodeDetailSystem').value.trim(),
    model: 'auto',
    temperature: 0.2,
    tools,
    color: qs('nodeDetailColor').value,
    icon: 'spark',
    can_write_blackboard: qs('nodeDetailCanWrite').checked,
    can_prompt_hats: qs('nodeDetailCanPrompt').checked,
  }
  node.x = Math.max(20, Math.min(760, Number(qs('nodeDetailX').value || node.x)))
  node.y = Math.max(20, Math.min(580, Number(qs('nodeDetailY').value || node.y)))

  const saved = await api(`/api/hats/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(body) })
  const idx = state.hats.findIndex((item) => item.id === saved.id)
  if (idx >= 0) state.hats[idx] = saved
  state.selectedHatId = saved.id
  state.selectedNodeId = saved.id
  state.dirtyTopology = true
  closeNodeDetail()
  renderAll()
}

function renderGraph() {
  const svg = qs('graphSvg')
  const marker = svg.querySelector('defs')?.outerHTML || ''
  svg.innerHTML = marker
  const nodes = activeNodes()
  const nodeById = Object.fromEntries(nodes.map((node) => [node.hat_id, node]))
  for (const edge of activeEdges()) {
    const source = nodeById[edge.source]
    const target = nodeById[edge.target]
    if (!source || !target) continue
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    const x1 = Number(source.x) + 78
    const y1 = Number(source.y) + 32
    const x2 = Number(target.x) + 78
    const y2 = Number(target.y) + 32
    const mid = (y1 + y2) / 2
    path.setAttribute('d', `M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`)
    path.setAttribute('class', 'graph-edge')
    svg.appendChild(path)
  }
  for (const node of nodes) {
    const hat = hatById(node.hat_id)
    if (!hat) continue
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    g.setAttribute('class', `graph-node ${state.selectedNodeId === node.hat_id ? 'selected' : ''}`)
    g.setAttribute('transform', `translate(${node.x}, ${node.y})`)
    g.dataset.hatId = node.hat_id
    g.innerHTML = `
      <rect width="156" height="66"></rect>
      <circle cx="18" cy="22" r="8" fill="${escapeHtml(hat.color || '#42c6ff')}"></circle>
      <text x="33" y="25">${escapeHtml(hat.name)}</text>
      <text class="role" x="14" y="48">${escapeHtml(short(hat.role || hat.id, 24))}</text>
    `
    g.addEventListener('pointerdown', startDrag)
    g.addEventListener('click', (event) => {
      if (event.detail >= 2) {
        event.preventDefault()
        openNodeDetail(node.hat_id)
        return
      }
      selectNode(node.hat_id)
    })
    g.addEventListener('dblclick', (event) => {
      event.preventDefault()
      event.stopPropagation()
      openNodeDetail(node.hat_id)
    })
    svg.appendChild(g)
  }
  const label = state.selectedNodeId ? (hatById(state.selectedNodeId)?.name || state.selectedNodeId) : 'No node selected'
  qs('selectedNodeLabel').textContent = label
  qs('openNodeDetailBtn').disabled = !state.selectedNodeId
}

let drag = null

function startDrag(event) {
  event.preventDefault()
  const hatId = event.currentTarget.dataset.hatId
  const node = activeNodes().find((item) => item.hat_id === hatId)
  if (!node) return
  selectNode(hatId)
  drag = {
    hatId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startX: Number(node.x),
    startY: Number(node.y),
  }
  document.addEventListener('pointermove', onDrag)
  document.addEventListener('pointerup', endDrag, { once: true })
}

function onDrag(event) {
  if (!drag) return
  const node = activeNodes().find((item) => item.hat_id === drag.hatId)
  if (!node) return
  node.x = Math.max(20, Math.min(760, drag.startX + (event.clientX - drag.startClientX)))
  node.y = Math.max(20, Math.min(580, drag.startY + (event.clientY - drag.startClientY)))
  state.dirtyTopology = true
  renderGraph()
}

function endDrag() {
  document.removeEventListener('pointermove', onDrag)
  drag = null
  renderTopologyControls()
}

async function runCluster() {
  if (!state.activeTopology) return
  await saveTopology()
  const task = qs('taskInput').value.trim()
  if (!task) return
  const body = {
    topology_id: state.activeTopology.id,
    task,
    max_turns: 12,
  }
  qs('runBtn').textContent = 'Running...'
  qs('runBtn').disabled = true
  try {
    state.currentRun = await api('/api/runs/start', { method: 'POST', body: JSON.stringify(body) })
    state.selectedEventSeq = state.currentRun.events?.[0]?.seq ?? null
    setView('analysis')
    renderRun()
  } finally {
    qs('runBtn').textContent = 'Run Cluster'
    qs('runBtn').disabled = false
  }
}

async function stopRun() {
  if (!state.currentRun) return
  await api(`/api/runs/${encodeURIComponent(state.currentRun.id)}/stop`, { method: 'POST' })
  state.currentRun.status = 'stopped'
  renderRun()
}

function resetRun() {
  state.currentRun = null
  state.selectedEventSeq = null
  renderRun()
}

function renderRun() {
  const run = state.currentRun
  qs('runStatus').textContent = run ? `${run.status} / ${run.id}` : 'No run yet'
  qs('detailStatus').textContent = run ? run.status : 'Idle'
  const events = run?.events || []
  qs('eventCount').textContent = `${events.length} events`
  qs('traceList').innerHTML = events.length ? events.map((event) => `
    <article class="trace-event ${event.seq === state.selectedEventSeq ? 'active' : ''}" data-seq="${event.seq}">
      <div class="trace-event-head">
        <strong>${event.seq}. ${escapeHtml(event.hat_name || event.event_type)}</strong>
        <span>${escapeHtml(event.event_type)}</span>
      </div>
      <p>${escapeHtml(short(event.output, 210))}</p>
    </article>
  `).join('') : '<p class="muted">No run events yet.</p>'
  qs('traceList').querySelectorAll('.trace-event').forEach((item) => {
    item.addEventListener('click', () => {
      state.selectedEventSeq = Number(item.dataset.seq)
      renderRun()
    })
  })
  renderRunSummary(run, events)
  const selected = events.find((event) => event.seq === state.selectedEventSeq) || events[0]
  qs('eventDetail').textContent = selected ? eventDetailText(selected) : 'Run the cluster to inspect prompts, outputs, blackboard changes, decisions, objections, and checks.'
  qs('finalResult').textContent = run?.final_result || 'No result yet.'
}

function renderRunSummary(run, events) {
  if (!run) {
    qs('runSummary').innerHTML = `
      <div class="metric"><span>Status</span><strong>Idle</strong></div>
      <div class="metric"><span>Events</span><strong>0</strong></div>
      <div class="metric"><span>Cost</span><strong>$0 placeholder</strong></div>
    `
    return
  }
  const totalTokens = events.reduce((sum, event) => sum + Number(event.metadata?.usage?.total_tokens || 0), 0)
  const totalCost = events.reduce((sum, event) => sum + Number(event.metadata?.estimated_cost_usd || 0), 0)
  qs('runSummary').innerHTML = `
    <div class="metric"><span>Status</span><strong>${escapeHtml(run.status)}</strong></div>
    <div class="metric"><span>Events</span><strong>${events.length}</strong></div>
    <div class="metric"><span>Tokens</span><strong>${totalTokens || '0 placeholder'}</strong></div>
    <div class="metric"><span>Cost</span><strong>$${totalCost.toFixed(4)} placeholder</strong></div>
  `
}

function eventDetailText(event) {
  const delta = event.metadata?.blackboard_delta || {}
  return [
    `Event: ${event.seq} / ${event.event_type}`,
    `Hat: ${event.hat_name || event.hat_id || 'system'}`,
    '',
    'Prompt / input:',
    event.prompt || '(none)',
    '',
    'Output:',
    event.output || '(none)',
    '',
    'Blackboard changes:',
    pretty(delta),
    '',
    'Usage / cost placeholder:',
    pretty({
      usage: event.metadata?.usage || {},
      estimated_cost_usd: event.metadata?.estimated_cost_usd || 0,
      provider_status: event.metadata?.provider_status || 'n/a',
      llm_error: event.metadata?.llm_error || '',
    }),
  ].join('\n')
}

function bindControls() {
  bindNav()
  qs('hatForm').addEventListener('submit', saveHat)
  qs('newHatBtn').addEventListener('click', () => {
    state.selectedHatId = null
    renderHats()
    renderHatForm()
  })
  qs('deleteHatBtn').addEventListener('click', deleteHat)
  qs('topologySelect').addEventListener('change', (event) => loadTopology(event.target.value))
  qs('topologyName').addEventListener('input', () => {
    if (!state.activeTopology) return
    state.activeTopology.name = qs('topologyName').value
    state.dirtyTopology = true
    renderTopologyControls()
  })
  qs('saveTopologyBtn').addEventListener('click', saveTopology)
  qs('newTopologyBtn').addEventListener('click', newTopology)
  qs('addNodeBtn').addEventListener('click', addNode)
  qs('removeNodeBtn').addEventListener('click', removeNode)
  qs('addEdgeBtn').addEventListener('click', addEdge)
  qs('openNodeDetailBtn').addEventListener('click', () => {
    if (state.selectedNodeId) openNodeDetail(state.selectedNodeId)
  })
  qs('nodeDetailForm').addEventListener('submit', saveNodeDetail)
  qs('closeNodeDetailBtn').addEventListener('click', closeNodeDetail)
  qs('cancelNodeDetailBtn').addEventListener('click', closeNodeDetail)
  qs('nodeDetailDialog').addEventListener('click', (event) => {
    if (event.target === qs('nodeDetailDialog')) closeNodeDetail()
  })
  qs('runBtn').addEventListener('click', runCluster)
  qs('stopBtn').addEventListener('click', stopRun)
  qs('resetRunBtn').addEventListener('click', resetRun)
}

bindControls()
bootstrap().catch((err) => {
  console.error(err)
  qs('runStatus').textContent = `Load error: ${err.message}`
})
