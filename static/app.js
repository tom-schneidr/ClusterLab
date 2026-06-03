const TOOL_IDS = [
  'web_search',
  'memory_search',
  'memory_write',
  'filesystem_read',
  'filesystem_write',
  'shell',
]

const NODE_TYPES = [
  { id: 'hat', label: 'Hat' },
  { id: 'store', label: 'Store' },
  { id: 'gate', label: 'Gate' },
  { id: 'tool', label: 'Tool' },
  { id: 'output', label: 'Output' },
]

const EDGE_TYPES = [
  { id: 'context', label: 'Context Flow' },
  { id: 'delegation', label: 'Delegation' },
  { id: 'review', label: 'Review Gate' },
  { id: 'state', label: 'State Read/Write' },
  { id: 'escalation', label: 'Escalation' },
  { id: 'approval', label: 'Approval' },
]

const AUTHORITY_IDS = [
  'route',
  'revise_plan',
  'delegate',
  'execute',
  'write_state',
  'interrupt',
  'request_revision',
  'request_evidence',
  'verify',
  'block',
  'final_approval',
  'write_memory',
]

const VISIBILITY_IDS = [
  'full_blackboard',
  'task_packet_and_blackboard',
  'work_product',
  'work_product_and_blackboard',
  'work_product_and_evidence',
  'trace_and_blackboard',
  'shared_state',
  'curated_state',
  'approved_result',
]

const STRUCTURAL_GROUPS = [
  {
    title: 'Stores',
    items: [
      {
        template_id: 'blackboard',
        type: 'store',
        name: 'Blackboard',
        role: 'Shared facts, assumptions, constraints, evidence, objections, and decisions.',
        color: '#9fb7ff',
        store_key: 'blackboard',
        visibility: 'shared_state',
        output_contract: 'Readable shared state snapshot.',
      },
      {
        template_id: 'task_ledger',
        type: 'store',
        name: 'Task Ledger',
        role: 'Task packets, dependencies, acceptance checks, and revision requests.',
        color: '#7ddc82',
        store_key: 'task_packets',
        visibility: 'shared_state',
        output_contract: 'Ordered task packet state.',
      },
      {
        template_id: 'evidence_store',
        type: 'store',
        name: 'Evidence Store',
        role: 'Artifacts, tests, citations, screenshots, logs, and proof material.',
        color: '#2bd9a3',
        store_key: 'evidence',
        visibility: 'shared_state',
        output_contract: 'Evidence items with provenance.',
      },
      {
        template_id: 'memory_store',
        type: 'store',
        name: 'Memory Store',
        role: 'Durable memory candidates and procedural improvements.',
        color: '#f78c6b',
        store_key: 'memory_candidates',
        visibility: 'curated_state',
        output_contract: 'Memory records with provenance and confidence.',
      },
    ],
  },
  {
    title: 'Gates',
    items: [
      {
        template_id: 'critic_gate',
        type: 'gate',
        name: 'Critic Gate',
        role: 'Blocks shallow completion by forcing adversarial review.',
        color: '#ff6b6b',
        authority: ['block', 'request_revision'],
        visibility: 'work_product',
        output_contract: 'Pass, revise, or escalate with concrete defects.',
      },
      {
        template_id: 'verifier_gate',
        type: 'gate',
        name: 'Verifier Gate',
        role: 'Requires evidence before final approval.',
        color: '#2bd9a3',
        authority: ['block', 'request_evidence'],
        visibility: 'work_product_and_evidence',
        output_contract: 'Pass/fail verdict and unresolved proof gaps.',
      },
      {
        template_id: 'approval_gate',
        type: 'gate',
        name: 'Approval Gate',
        role: 'Forces an explicit final decision before user-facing output.',
        color: '#42c6ff',
        authority: ['block', 'final_approval'],
        visibility: 'approved_result',
        output_contract: 'Approve, revise, or ask for more information.',
      },
    ],
  },
  {
    title: 'Tools',
    items: [
      {
        template_id: 'live_api_tool',
        type: 'tool',
        name: 'Live API Tool',
        role: 'Represents live external execution through the configured FreeRouter route.',
        color: '#ffd166',
        tools: ['web_search', 'shell'],
        visibility: 'task_packet_and_blackboard',
        output_contract: 'Tool result, error, or evidence item.',
      },
    ],
  },
  {
    title: 'Outputs',
    items: [
      {
        template_id: 'final_output',
        type: 'output',
        name: 'Final Output',
        role: 'User-facing result after review, verification, and executive approval.',
        color: '#42c6ff',
        visibility: 'approved_result',
        output_contract: 'Clean final answer without internal trace noise.',
      },
    ],
  },
]

const NODE_WIDTH = 156
const NODE_HEIGHT = 66
const GRAPH_MAX_X = 760
const GRAPH_MAX_Y = 580

const state = {
  hats: [],
  topologies: [],
  activeTopology: null,
  selectedHatId: null,
  selectedNodeId: null,
  selectedEdgeId: null,
  newEdgeType: 'context',
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

function nodeById(id) {
  return activeNodes().find((node) => node.id === id)
}

function edgeById(id) {
  return activeEdges().find((edge) => edge.id === id)
}

function hatForNode(node) {
  return node?.type === 'hat' ? hatById(node.hat_id) : null
}

function nodeName(node) {
  if (!node) return ''
  return node.name || hatForNode(node)?.name || node.id || 'Node'
}

function nodeRole(node) {
  if (!node) return ''
  return node.role || hatForNode(node)?.role || node.type || ''
}

function nodeColor(node) {
  if (node?.color) return node.color
  if (node?.type === 'hat') return hatForNode(node)?.color || '#42c6ff'
  if (node?.type === 'store') return '#9fb7ff'
  if (node?.type === 'gate') return '#ff6b6b'
  if (node?.type === 'tool') return '#ffd166'
  if (node?.type === 'output') return '#42c6ff'
  return '#42c6ff'
}

function typeLabel(type) {
  return NODE_TYPES.find((item) => item.id === type)?.label || type || 'Node'
}

function edgeTypeLabel(type) {
  return EDGE_TYPES.find((item) => item.id === type)?.label || type || 'Context Flow'
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
  state.topologies = data.topologies.filter((topology) => topology.schema_version === 2)
  state.activeTopology = JSON.parse(JSON.stringify(state.topologies[0] || blankTopology()))
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

function blankTopology() {
  return {
    schema_version: 2,
    id: null,
    name: 'New General Super Agent Cluster',
    nodes: [],
    edges: [],
  }
}

function renderTopologyControls() {
  if (!state.activeTopology && state.topologies.length) {
    state.activeTopology = JSON.parse(JSON.stringify(state.topologies[0]))
  }
  const topology = state.activeTopology || blankTopology()
  const unsavedOption = topology.id ? '' : '<option value="" selected>New unsaved preset</option>'
  qs('topologySelect').innerHTML = unsavedOption + state.topologies.map((top) => (
    `<option value="${escapeHtml(top.id)}" ${top.id === topology.id ? 'selected' : ''}>${escapeHtml(top.name)}</option>`
  )).join('')
  qs('topologyName').value = topology.name || ''
  qs('topologySavedState').textContent = state.dirtyTopology ? 'Unsaved changes' : 'Loaded'
  qs('newEdgeType').innerHTML = EDGE_TYPES.map((type) => (
    `<option value="${escapeHtml(type.id)}" ${type.id === state.newEdgeType ? 'selected' : ''}>${escapeHtml(type.label)}</option>`
  )).join('')
  renderNodePalette()
  renderSelectionInspector()
  renderValidation()
}

function renderNodePalette() {
  const hatItems = state.hats.map((hat) => ({
    kind: 'hat',
    hat_id: hat.id,
    name: hat.name,
    role: hat.role,
    color: hat.color || '#42c6ff',
  }))
  const groups = [
    { title: 'Hats', items: hatItems },
    ...STRUCTURAL_GROUPS.map((group) => ({
      title: group.title,
      items: group.items.map((item) => ({ kind: 'template', ...item })),
    })),
  ]
  qs('nodePalette').innerHTML = groups.map((group) => `
    <div class="palette-group">
      <h5>${escapeHtml(group.title)}</h5>
      ${group.items.map((item) => renderPaletteItem(item)).join('')}
    </div>
  `).join('')
  qs('nodePalette').querySelectorAll('.palette-node:not(.disabled)').forEach((item) => {
    item.addEventListener('dragstart', (event) => {
      const payload = JSON.parse(item.dataset.payload)
      event.dataTransfer.setData('application/json', JSON.stringify(payload))
      event.dataTransfer.setData('text/plain', JSON.stringify(payload))
      event.dataTransfer.effectAllowed = 'copy'
    })
  })
}

function renderPaletteItem(item) {
  const placed = paletteItemPlaced(item)
  const payload = item.kind === 'hat'
    ? { kind: 'hat', hat_id: item.hat_id }
    : { kind: 'template', template_id: item.template_id }
  return `
    <div class="palette-node ${placed ? 'disabled' : ''}" draggable="${placed ? 'false' : 'true'}" data-payload="${escapeHtml(JSON.stringify(payload))}">
      <span class="palette-dot" style="background:${escapeHtml(item.color || '#42c6ff')}"></span>
      <div>
        <strong>${escapeHtml(item.name)}</strong>
        <p>${escapeHtml(short(item.role || item.template_id || item.hat_id, 72))}</p>
      </div>
    </div>
  `
}

function paletteItemPlaced(item) {
  if (item.kind === 'hat') {
    return activeNodes().some((node) => node.type === 'hat' && node.hat_id === item.hat_id)
  }
  return activeNodes().some((node) => node.template_id === item.template_id || node.id === item.template_id)
}

function renderSelectionInspector() {
  const inspector = qs('selectionInspector')
  const edge = edgeById(state.selectedEdgeId)
  const node = nodeById(state.selectedNodeId)
  if (edge) {
    const source = nodeById(edge.source)
    const target = nodeById(edge.target)
    inspector.innerHTML = `
      <div class="selection-card">
        <strong>${escapeHtml(nodeName(source))} -> ${escapeHtml(nodeName(target))}</strong>
        <label>Type <select id="edgeInspectorType">
          ${EDGE_TYPES.map((type) => `<option value="${escapeHtml(type.id)}" ${type.id === edge.type ? 'selected' : ''}>${escapeHtml(type.label)}</option>`).join('')}
        </select></label>
        <label class="toggle"><input id="edgeInspectorBlocking" type="checkbox" ${edge.blocking ? 'checked' : ''}> Blocking gate</label>
        <label>Payload <textarea id="edgeInspectorPayload" rows="3">${escapeHtml(edge.payload || '')}</textarea></label>
      </div>
    `
    qs('edgeInspectorType').addEventListener('change', (event) => {
      edge.type = event.target.value
      topologyChanged()
    })
    qs('edgeInspectorBlocking').addEventListener('change', (event) => {
      edge.blocking = event.target.checked
      topologyChanged()
    })
    qs('edgeInspectorPayload').addEventListener('change', (event) => {
      edge.payload = event.target.value
      topologyChanged()
    })
    return
  }
  if (node) {
    const incoming = activeEdges().filter((item) => item.target === node.id).length
    const outgoing = activeEdges().filter((item) => item.source === node.id).length
    inspector.innerHTML = `
      <div class="selection-card">
        <strong>${escapeHtml(nodeName(node))}</strong>
        <p>${escapeHtml(typeLabel(node.type))} node</p>
        <p>${incoming} incoming / ${outgoing} outgoing edges</p>
        <p>${escapeHtml(short(nodeRole(node), 150))}</p>
      </div>
    `
    return
  }
  inspector.innerHTML = '<p class="muted">Select a node or edge to inspect it.</p>'
}

function renderValidation() {
  const warnings = validateTopology()
  qs('validationList').innerHTML = warnings.length
    ? warnings.map((warning) => `<div class="validation-item">${escapeHtml(warning)}</div>`).join('')
    : '<div class="validation-ok">Graph has the basic generalist cluster structure.</div>'
}

function validateTopology() {
  const warnings = []
  const nodes = activeNodes()
  const edges = activeEdges()
  const nodeIds = new Set(nodes.map((node) => node.id))
  const roleNode = (term) => nodes.find((node) => {
    const hat = hatForNode(node)
    return node.type === 'hat' && `${node.id} ${node.name || ''} ${node.role || ''} ${hat?.id || ''} ${hat?.name || ''}`.toLowerCase().includes(term)
  })
  const executive = roleNode('executive')
  const worker = roleNode('worker')
  const critic = roleNode('critic')
  const verifier = roleNode('verifier')
  const memory = roleNode('memory')
  const finalOutput = nodes.find((node) => node.type === 'output')

  if (!executive) warnings.push('No Executive hat node controls routing and final approval.')
  if (!worker) warnings.push('No Worker hat node can execute task packets.')
  if (!critic) warnings.push('No Critic hat node challenges the work.')
  if (!verifier) warnings.push('No Verifier hat node checks evidence.')
  if (!finalOutput) warnings.push('No Final Output node exists.')
  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) warnings.push(`Edge ${edge.id} points to a missing node.`)
    if (!EDGE_TYPES.some((type) => type.id === edge.type)) warnings.push(`Edge ${edge.id} has an unknown type.`)
  }
  if (worker && critic && !edgePathExists(worker.id, critic.id, new Set(['review']))) {
    warnings.push('Worker output does not pass through a Critic review path.')
  }
  if (worker && verifier && !edgePathExists(worker.id, verifier.id, new Set(['review']))) {
    warnings.push('Worker output does not pass through a Verifier review path.')
  }
  if (verifier && executive && !edgePathExists(verifier.id, executive.id, new Set(['approval']))) {
    warnings.push('Verifier has no approval path back to Executive.')
  }
  if (executive && finalOutput && !activeEdges().some((edge) => edge.source === executive.id && edge.target === finalOutput.id && edge.type === 'approval')) {
    warnings.push('Final Output has no approval edge from Executive.')
  }
  const memoryStore = nodes.find((node) => node.type === 'store' && String(node.id).toLowerCase().includes('memory'))
  if (memoryStore) {
    for (const edge of edges.filter((item) => item.target === memoryStore.id && item.type === 'state')) {
      if (edge.source !== memory?.id) warnings.push('Memory Store receives state writes from a non-curator node.')
    }
  }
  return [...new Set(warnings)]
}

function edgePathExists(sourceId, targetId, types) {
  const queue = [{ id: sourceId, depth: 0 }]
  const seen = new Set([sourceId])
  while (queue.length) {
    const current = queue.shift()
    if (current.depth > 6) continue
    for (const edge of activeEdges().filter((item) => item.source === current.id && types.has(item.type))) {
      if (edge.target === targetId) return true
      if (!seen.has(edge.target)) {
        seen.add(edge.target)
        queue.push({ id: edge.target, depth: current.depth + 1 })
      }
    }
  }
  return false
}

function topologyChanged() {
  state.dirtyTopology = true
  renderTopologyControls()
  renderGraph()
}

function newTopology() {
  state.activeTopology = blankTopology()
  state.selectedNodeId = null
  state.selectedEdgeId = null
  state.dirtyTopology = true
  renderAll()
}

async function saveTopology() {
  const topology = state.activeTopology
  if (!topology) return
  topology.schema_version = 2
  topology.name = qs('topologyName').value.trim() || 'Untitled topology'
  const saved = topology.id
    ? await api(`/api/topologies/${encodeURIComponent(topology.id)}`, { method: 'PUT', body: JSON.stringify(topology) })
    : await api('/api/topologies', { method: 'POST', body: JSON.stringify(topology) })
  const idx = state.topologies.findIndex((top) => top.id === saved.id)
  if (idx >= 0) state.topologies[idx] = saved
  else state.topologies.unshift(saved)
  state.activeTopology = JSON.parse(JSON.stringify(saved))
  state.dirtyTopology = false
  renderAll()
}

function loadTopology(id) {
  const topology = state.topologies.find((top) => top.id === id)
  if (!topology) return
  state.activeTopology = JSON.parse(JSON.stringify(topology))
  state.selectedNodeId = null
  state.selectedEdgeId = null
  state.dirtyTopology = false
  renderAll()
}

function svgPointFromClient(clientX, clientY) {
  const svg = qs('graphSvg')
  const point = svg.createSVGPoint()
  point.x = clientX
  point.y = clientY
  return point.matrixTransform(svg.getScreenCTM().inverse())
}

function addNodeAt(payload, x, y) {
  if (!payload || !state.activeTopology) return
  const node = nodeFromPayload(payload)
  if (!node || paletteItemPlaced({ ...payload, kind: payload.kind, template_id: payload.template_id })) return
  node.x = Math.max(20, Math.min(GRAPH_MAX_X, x - NODE_WIDTH / 2))
  node.y = Math.max(20, Math.min(GRAPH_MAX_Y, y - NODE_HEIGHT / 2))
  state.activeTopology.nodes.push(node)
  selectNode(node.id)
  topologyChanged()
}

function nodeFromPayload(payload) {
  if (payload.kind === 'hat') {
    const hat = hatById(payload.hat_id)
    if (!hat) return null
    return {
      id: uniqueNodeId(hat.id),
      type: 'hat',
      hat_id: hat.id,
      name: hat.name,
      role: hat.role || '',
      color: hat.color || '#42c6ff',
      authority: authorityForHat(hat),
      visibility: 'full_blackboard',
      output_contract: contractForHat(hat),
      tools: hat.tools || [],
    }
  }
  const template = STRUCTURAL_GROUPS.flatMap((group) => group.items).find((item) => item.template_id === payload.template_id)
  if (!template) return null
  return {
    id: uniqueNodeId(template.template_id),
    template_id: template.template_id,
    type: template.type,
    name: template.name,
    role: template.role || '',
    color: template.color || '#42c6ff',
    authority: template.authority || [],
    visibility: template.visibility || 'full_blackboard',
    output_contract: template.output_contract || '',
    tools: template.tools || [],
    store_key: template.store_key || '',
  }
}

function uniqueNodeId(base) {
  const clean = String(base || 'node').replace(/[^a-zA-Z0-9_]+/g, '_').toLowerCase()
  let candidate = clean
  let index = 2
  const ids = new Set(activeNodes().map((node) => node.id))
  while (ids.has(candidate)) {
    candidate = `${clean}_${index}`
    index += 1
  }
  return candidate
}

function authorityForHat(hat) {
  const text = `${hat.id} ${hat.name}`.toLowerCase()
  if (text.includes('executive')) return ['route', 'revise_plan', 'final_approval']
  if (text.includes('planner')) return ['delegate', 'write_state']
  if (text.includes('worker')) return ['execute', 'write_state']
  if (text.includes('critic')) return ['interrupt', 'request_revision']
  if (text.includes('verifier')) return ['verify', 'request_evidence']
  if (text.includes('memory')) return ['write_memory']
  return hat.can_write_blackboard ? ['write_state'] : []
}

function contractForHat(hat) {
  const text = `${hat.id} ${hat.name}`.toLowerCase()
  if (text.includes('executive')) return 'Decision, routing choice, or approved final answer.'
  if (text.includes('planner')) return 'Task packet, dependencies, and acceptance checks.'
  if (text.includes('worker')) return 'Direct answer or artifact with supporting evidence.'
  if (text.includes('critic')) return 'Specific defects and required revisions.'
  if (text.includes('verifier')) return 'Verification verdict with evidence and gaps.'
  if (text.includes('memory')) return 'Durable memory candidates with provenance.'
  return 'Structured contribution to the cluster blackboard.'
}

function removeNode() {
  if (!state.selectedNodeId || !state.activeTopology) return
  state.activeTopology.nodes = activeNodes().filter((node) => node.id !== state.selectedNodeId)
  state.activeTopology.edges = activeEdges().filter((edge) => edge.source !== state.selectedNodeId && edge.target !== state.selectedNodeId)
  state.selectedNodeId = null
  state.selectedEdgeId = null
  topologyChanged()
}

function createEdge(source, target) {
  if (!source || !target || source === target || !state.activeTopology) return
  const exists = activeEdges().some((edge) => edge.source === source && edge.target === target && edge.type === state.newEdgeType)
  if (exists) return
  state.activeTopology.edges.push({
    id: uniqueEdgeId(),
    source,
    target,
    type: state.newEdgeType,
    blocking: ['delegation', 'review', 'escalation', 'approval'].includes(state.newEdgeType),
    payload: defaultPayloadForEdge(state.newEdgeType),
  })
  state.selectedNodeId = null
  state.selectedEdgeId = state.activeTopology.edges[state.activeTopology.edges.length - 1].id
  topologyChanged()
}

function uniqueEdgeId() {
  let candidate = `e_${Date.now().toString(36)}`
  let index = 2
  const ids = new Set(activeEdges().map((edge) => edge.id))
  while (ids.has(candidate)) {
    candidate = `e_${Date.now().toString(36)}_${index}`
    index += 1
  }
  return candidate
}

function defaultPayloadForEdge(type) {
  if (type === 'context') return 'Context available to target node.'
  if (type === 'delegation') return 'Task packet or instruction for execution.'
  if (type === 'review') return 'Work product must be reviewed before proceeding.'
  if (type === 'state') return 'Structured state written or read.'
  if (type === 'escalation') return 'Revision, objection, interrupt, or escalation.'
  if (type === 'approval') return 'Approval decision or final verdict.'
  return ''
}

function removeEdge(edgeId) {
  if (!state.activeTopology) return
  state.activeTopology.edges = activeEdges().filter((edge) => edge.id !== edgeId)
  state.selectedEdgeId = null
  state.selectedNodeId = null
  topologyChanged()
}

function removeSelected() {
  if (state.selectedEdgeId) {
    removeEdge(state.selectedEdgeId)
    return
  }
  removeNode()
}

function selectNode(nodeId) {
  const node = nodeById(nodeId)
  state.selectedNodeId = nodeId
  state.selectedHatId = node?.hat_id || state.selectedHatId
  state.selectedEdgeId = null
  document.querySelectorAll('.graph-node').forEach((item) => {
    item.classList.toggle('selected', item.dataset.nodeId === nodeId)
  })
  document.querySelectorAll('.graph-edge').forEach((item) => {
    item.classList.remove('selected')
  })
  updateSelectionLabel()
  renderSelectionInspector()
}

function selectEdge(edgeId) {
  const edge = edgeById(edgeId)
  if (!edge) return
  state.selectedNodeId = null
  state.selectedEdgeId = edgeId
  document.querySelectorAll('.graph-node').forEach((item) => {
    item.classList.remove('selected')
  })
  document.querySelectorAll('.graph-edge').forEach((item) => {
    item.classList.toggle('selected', item.dataset.edgeId === edgeId)
  })
  updateSelectionLabel()
  renderSelectionInspector()
}

function updateSelectionLabel() {
  const edge = edgeById(state.selectedEdgeId)
  if (edge) {
    qs('selectedNodeLabel').textContent = `${nodeName(nodeById(edge.source))} -> ${nodeName(nodeById(edge.target))}`
    qs('openNodeDetailBtn').disabled = true
    return
  }
  const node = nodeById(state.selectedNodeId)
  qs('selectedNodeLabel').textContent = node ? nodeName(node) : 'No node selected'
  qs('openNodeDetailBtn').disabled = !node
}

function openNodeDetail(nodeId) {
  const node = nodeById(nodeId)
  if (!node) return
  const hat = hatForNode(node)
  selectNode(nodeId)
  state.editingNodeId = nodeId

  qs('nodeDetailTitle').textContent = nodeName(node)
  qs('nodeDetailMeta').textContent = `${typeLabel(node.type)} node ${node.id}`
  qs('nodeDetailNodeId').value = node.id
  qs('nodeDetailHatId').value = node.hat_id || ''
  qs('nodeDetailName').value = nodeName(node)
  qs('nodeDetailType').innerHTML = NODE_TYPES.map((type) => (
    `<option value="${escapeHtml(type.id)}" ${type.id === node.type ? 'selected' : ''}>${escapeHtml(type.label)}</option>`
  )).join('')
  qs('nodeDetailColor').value = nodeColor(node)
  qs('nodeDetailX').value = Math.round(Number(node.x) || 20)
  qs('nodeDetailY').value = Math.round(Number(node.y) || 20)
  qs('nodeDetailRole').value = nodeRole(node)
  qs('nodeDetailSystem').value = node.system_prompt || hat?.system_prompt || ''
  qs('nodeDetailOutputContract').value = node.output_contract || ''
  qs('nodeDetailVisibility').innerHTML = VISIBILITY_IDS.map((visibility) => (
    `<option value="${escapeHtml(visibility)}" ${visibility === (node.visibility || 'full_blackboard') ? 'selected' : ''}>${escapeHtml(visibility)}</option>`
  )).join('')
  qs('nodeDetailStoreKey').value = node.store_key || ''
  qs('nodeDetailAuthority').innerHTML = AUTHORITY_IDS.map((authority) => `
    <label><input type="checkbox" value="${authority}" ${(node.authority || []).includes(authority) ? 'checked' : ''}> ${authority}</label>
  `).join('')
  const tools = node.tools || hat?.tools || []
  qs('nodeDetailTools').innerHTML = TOOL_IDS.map((tool) => `
    <label><input type="checkbox" value="${tool}" ${tools.includes(tool) ? 'checked' : ''}> ${tool}</label>
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

function saveNodeDetail(event) {
  event.preventDefault()
  const id = qs('nodeDetailNodeId').value.trim()
  const node = nodeById(id)
  if (!id || !node) return
  node.type = qs('nodeDetailType').value
  node.name = qs('nodeDetailName').value.trim()
  node.color = qs('nodeDetailColor').value
  node.x = Math.max(20, Math.min(GRAPH_MAX_X, Number(qs('nodeDetailX').value || node.x)))
  node.y = Math.max(20, Math.min(GRAPH_MAX_Y, Number(qs('nodeDetailY').value || node.y)))
  node.role = qs('nodeDetailRole').value.trim()
  node.system_prompt = qs('nodeDetailSystem').value.trim()
  node.output_contract = qs('nodeDetailOutputContract').value.trim()
  node.visibility = qs('nodeDetailVisibility').value
  node.store_key = qs('nodeDetailStoreKey').value.trim()
  node.authority = [...qs('nodeDetailAuthority').querySelectorAll('input:checked')].map((input) => input.value)
  node.tools = [...qs('nodeDetailTools').querySelectorAll('input:checked')].map((input) => input.value)
  state.selectedNodeId = node.id
  state.dirtyTopology = true
  closeNodeDetail()
  renderAll()
}

function renderGraph() {
  const svg = qs('graphSvg')
  const marker = svg.querySelector('defs')?.outerHTML || ''
  svg.innerHTML = marker
  const nodes = activeNodes()
  const nodeMap = Object.fromEntries(nodes.map((node) => [node.id, node]))
  for (const edge of activeEdges()) {
    const source = nodeMap[edge.source]
    const target = nodeMap[edge.target]
    if (!source || !target) continue
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    const x1 = Number(source.x) + NODE_WIDTH / 2
    const y1 = Number(source.y) + NODE_HEIGHT / 2
    const x2 = Number(target.x) + NODE_WIDTH / 2
    const y2 = Number(target.y) + NODE_HEIGHT / 2
    const mid = (y1 + y2) / 2
    path.setAttribute('d', `M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`)
    path.setAttribute('class', `graph-edge edge-${edge.type || 'context'} ${edge.blocking ? 'blocking' : ''} ${state.selectedEdgeId === edge.id ? 'selected' : ''}`)
    path.dataset.edgeId = edge.id
    path.addEventListener('click', (event) => {
      event.stopPropagation()
      selectEdge(edge.id)
    })
    svg.appendChild(path)

    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    label.setAttribute('x', String((x1 + x2) / 2))
    label.setAttribute('y', String((y1 + y2) / 2 - 5))
    label.setAttribute('class', 'edge-label')
    label.dataset.edgeId = edge.id
    label.textContent = edgeTypeLabel(edge.type)
    label.addEventListener('click', (event) => {
      event.stopPropagation()
      selectEdge(edge.id)
    })
    svg.appendChild(label)
  }
  for (const node of nodes) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    g.setAttribute('class', `graph-node node-${node.type || 'hat'} ${state.selectedNodeId === node.id ? 'selected' : ''}`)
    g.setAttribute('transform', `translate(${node.x}, ${node.y})`)
    g.dataset.nodeId = node.id
    g.innerHTML = nodeMarkup(node)
    g.addEventListener('pointerdown', startDrag)
    g.addEventListener('click', (event) => {
      if (event.detail >= 2) {
        event.preventDefault()
        openNodeDetail(node.id)
        return
      }
      selectNode(node.id)
    })
    g.addEventListener('dblclick', (event) => {
      event.preventDefault()
      event.stopPropagation()
      openNodeDetail(node.id)
    })
    g.querySelector('.edge-handle').addEventListener('pointerdown', (event) => {
      event.preventDefault()
      event.stopPropagation()
      startConnection(event, node.id)
    })
    svg.appendChild(g)
  }
  updateSelectionLabel()
}

function nodeMarkup(node) {
  const shape = node.type === 'gate'
    ? `<path class="node-shape" d="M 78 2 L 154 33 L 78 64 L 2 33 Z"></path>`
    : `<rect class="node-shape" width="${NODE_WIDTH}" height="${NODE_HEIGHT}"></rect>`
  return `
    ${shape}
    <circle cx="18" cy="22" r="8" fill="${escapeHtml(nodeColor(node))}"></circle>
    <text x="33" y="25">${escapeHtml(short(nodeName(node), 20))}</text>
    <text class="role" x="14" y="48">${escapeHtml(short(nodeRole(node), 24))}</text>
    <text class="node-kind" x="116" y="14">${escapeHtml(typeLabel(node.type))}</text>
    <circle class="edge-handle" cx="150" cy="33" r="7"></circle>
  `
}

let drag = null
let connectionDrag = null

function startDrag(event) {
  if (event.target.classList?.contains('edge-handle')) return
  event.preventDefault()
  const nodeId = event.currentTarget.dataset.nodeId
  const node = nodeById(nodeId)
  if (!node) return
  selectNode(nodeId)
  drag = {
    nodeId,
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
  const node = nodeById(drag.nodeId)
  if (!node) return
  node.x = Math.max(20, Math.min(GRAPH_MAX_X, drag.startX + (event.clientX - drag.startClientX)))
  node.y = Math.max(20, Math.min(GRAPH_MAX_Y, drag.startY + (event.clientY - drag.startClientY)))
  state.dirtyTopology = true
  renderGraph()
}

function endDrag() {
  document.removeEventListener('pointermove', onDrag)
  drag = null
  renderTopologyControls()
}

function startConnection(event, sourceNodeId) {
  const sourceNode = nodeById(sourceNodeId)
  if (!sourceNode) return
  const svg = qs('graphSvg')
  const start = {
    x: Number(sourceNode.x) + NODE_WIDTH - 6,
    y: Number(sourceNode.y) + NODE_HEIGHT / 2,
  }
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('class', `graph-edge preview edge-${state.newEdgeType}`)
  path.setAttribute('d', `M ${start.x} ${start.y} L ${start.x} ${start.y}`)
  svg.appendChild(path)
  connectionDrag = { sourceNodeId, start, path }
  document.addEventListener('pointermove', onConnectionMove)
  document.addEventListener('pointerup', endConnection, { once: true })
}

function onConnectionMove(event) {
  if (!connectionDrag) return
  const point = svgPointFromClient(event.clientX, event.clientY)
  const mid = (connectionDrag.start.y + point.y) / 2
  connectionDrag.path.setAttribute(
    'd',
    `M ${connectionDrag.start.x} ${connectionDrag.start.y} C ${connectionDrag.start.x} ${mid}, ${point.x} ${mid}, ${point.x} ${point.y}`
  )
}

function endConnection(event) {
  document.removeEventListener('pointermove', onConnectionMove)
  if (!connectionDrag) return
  const targetNode = event.target.closest?.('.graph-node')
  const targetNodeId = targetNode?.dataset?.nodeId
  connectionDrag.path.remove()
  const sourceNodeId = connectionDrag.sourceNodeId
  connectionDrag = null
  if (targetNodeId) createEdge(sourceNodeId, targetNodeId)
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
    `Stage: ${event.metadata?.stage || 'n/a'}`,
    `Node: ${event.metadata?.node_id || 'n/a'} (${event.metadata?.node_type || 'n/a'})`,
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
    'Edge context:',
    pretty(event.metadata?.edge_context || {}),
    '',
    'Usage / cost:',
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
  qs('newEdgeType').addEventListener('change', (event) => {
    state.newEdgeType = event.target.value
  })
  qs('saveTopologyBtn').addEventListener('click', saveTopology)
  qs('newTopologyBtn').addEventListener('click', newTopology)
  qs('removeNodeBtn').addEventListener('click', removeSelected)
  qs('graphSvg').addEventListener('dragover', (event) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  })
  qs('graphSvg').addEventListener('drop', (event) => {
    event.preventDefault()
    const raw = event.dataTransfer.getData('application/json') || event.dataTransfer.getData('text/plain')
    if (!raw) return
    const payload = JSON.parse(raw)
    const point = svgPointFromClient(event.clientX, event.clientY)
    addNodeAt(payload, point.x, point.y)
  })
  qs('openNodeDetailBtn').addEventListener('click', () => {
    if (state.selectedNodeId) openNodeDetail(state.selectedNodeId)
  })
  qs('nodeDetailForm').addEventListener('submit', saveNodeDetail)
  qs('closeNodeDetailBtn').addEventListener('click', closeNodeDetail)
  qs('cancelNodeDetailBtn').addEventListener('click', closeNodeDetail)
  qs('nodeDetailDialog').addEventListener('click', (event) => {
    if (event.target === qs('nodeDetailDialog')) closeNodeDetail()
  })
  document.addEventListener('keydown', (event) => {
    if (qs('nodeDetailDialog').open) return
    if (event.key === 'Delete' || event.key === 'Backspace') {
      removeSelected()
    }
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
