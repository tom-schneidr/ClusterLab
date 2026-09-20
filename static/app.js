import { api } from './js/api.js'
import { UI_COPY } from './js/config.js'
import {
  AUTHORITY_IDS,
  EDGE_TYPES,
  NODE_TYPES,
  STRUCTURAL_GROUPS,
  TOOL_IDS,
  VISIBILITY_IDS,
} from './js/constants.js'
import {
  clearExecution,
  dropNodePosition,
  graphMaxX,
  graphMaxY,
  initGraph,
  paintGraph,
  resetViewport,
  setExecutionFromRun,
  startRunPolling,
  stopRunPolling,
  syncCanvasSize,
} from './js/graph/index.js?v=20260920-offline-demo-poll2'
import { nodeHeight } from './js/graph/ports.js'
import { escapeHtml, pretty, qs, short } from './js/dom.js'
import {
  activeEdges,
  activeNodes,
  edgeById,
  hatForNode,
  nodeById,
  nodeColor,
  nodeName,
  nodeRole,
  typeLabel,
} from './js/selectors.js'
import { state } from './js/state.js'
import { initHatUi, renderHatForm, renderHats } from './js/ui/hats.js'

function setView(name) {
  state.view = name
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === name)
  })
  document.querySelectorAll('.view').forEach((view) => {
    view.classList.toggle('active', view.id === `view-${name}`)
  })
  if (name === 'topology') {
    syncCanvasSize()
    paintGraph()
  }
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
  qs('llmRoute').textContent = data.llm.mode === 'offline-demo'
    ? 'offline-demo · no provider calls'
    : `${data.llm.default_model} @ ${data.llm.base_url}`
  renderAll()
}

function renderAll() {
  renderHats()
  renderHatForm()
  renderTopologyControls()
  paintGraph()
  renderRun()
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
  paintGraph()
}

function newTopology() {
  state.activeTopology = blankTopology()
  state.selectedNodeId = null
  state.selectedEdgeId = null
  state.dirtyTopology = true
  resetViewport()
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
  resetViewport()
  renderAll()
}

function addNodeAt(payload, x, y) {
  if (!payload || !state.activeTopology) return
  const node = nodeFromPayload(payload)
  if (!node || paletteItemPlaced({ ...payload, kind: payload.kind, template_id: payload.template_id })) return
  const pos = dropNodePosition(x, y, node)
  node.x = pos.x
  node.y = pos.y
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

function createEdge(source, target, edgeType) {
  if (!source || !target || source === target || !state.activeTopology) return
  const type = edgeType || state.newEdgeType
  const exists = activeEdges().some((edge) => edge.source === source && edge.target === target && edge.type === type)
  if (exists) return
  state.activeTopology.edges.push({
    id: uniqueEdgeId(),
    source,
    target,
    type,
    blocking: ['delegation', 'review', 'escalation', 'approval'].includes(type),
    payload: defaultPayloadForEdge(type),
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
  const changed = state.selectedNodeId !== nodeId || state.selectedEdgeId !== null
  state.selectedNodeId = nodeId
  state.selectedHatId = node?.hat_id || state.selectedHatId
  state.selectedEdgeId = null
  updateSelectionLabel()
  renderSelectionInspector()
  if (changed) paintGraph()
}

function selectEdge(edgeId) {
  const edge = edgeById(edgeId)
  if (!edge) return
  const changed = state.selectedEdgeId !== edgeId || state.selectedNodeId !== null
  state.selectedNodeId = null
  state.selectedEdgeId = edgeId
  updateSelectionLabel()
  renderSelectionInspector()
  if (changed) paintGraph()
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
  syncCanvasSize()
  qs('nodeDetailX').max = String(graphMaxX())
  qs('nodeDetailY').max = String(graphMaxY(nodeHeight(node)))
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
  node.x = Math.max(0, Math.min(graphMaxX(), Number(qs('nodeDetailX').value || node.x)))
  node.y = Math.max(0, Math.min(graphMaxY(nodeHeight(node)), Number(qs('nodeDetailY').value || node.y)))
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
  stopRunPolling()
  clearExecution()
  try {
    state.currentRun = await api('/api/runs/start', { method: 'POST', body: JSON.stringify(body) })
    state.selectedEventSeq = state.currentRun.events?.[0]?.seq ?? null
    setExecutionFromRun(state.currentRun)
    if (['queued', 'running'].includes(state.currentRun.status)) {
      startRunPolling(state.currentRun.id, (run) => {
        state.currentRun = run
        setExecutionFromRun(run)
        paintGraph()
        renderRun()
      })
    }
    renderRun()
  } finally {
    qs('runBtn').textContent = 'Run Cluster'
    qs('runBtn').disabled = false
  }
}

async function stopRun() {
  if (!state.currentRun) return
  await api(`/api/runs/${encodeURIComponent(state.currentRun.id)}/stop`, { method: 'POST' })
  stopRunPolling()
  const run = await api(`/api/runs/${encodeURIComponent(state.currentRun.id)}`)
  state.currentRun = run
  setExecutionFromRun(run)
  paintGraph()
  renderRun()
}

function resetRun() {
  stopRunPolling()
  clearExecution()
  state.currentRun = null
  state.selectedEventSeq = null
  paintGraph()
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
      <div class="metric"><span>Cost</span><strong>${UI_COPY.noCost}</strong></div>
    `
    return
  }
  const totalTokens = events.reduce((sum, event) => sum + Number(event.metadata?.usage?.total_tokens || 0), 0)
  const totalCost = events.reduce((sum, event) => sum + Number(event.metadata?.estimated_cost_usd || 0), 0)
  qs('runSummary').innerHTML = `
    <div class="metric"><span>Status</span><strong>${escapeHtml(run.status)}</strong></div>
    <div class="metric"><span>Events</span><strong>${events.length}</strong></div>
    <div class="metric"><span>Tokens</span><strong>${totalTokens || UI_COPY.noTokens}</strong></div>
    <div class="metric"><span>Cost</span><strong>$${totalCost.toFixed(4)}</strong></div>
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
  initGraph({
    getNode: nodeById,
    onSelectNode: selectNode,
    onSelectEdge: selectEdge,
    onOpenNodeDetail: openNodeDetail,
    onCreateEdge: createEdge,
    onDropNode: addNodeAt,
    onNodeMoved: (finished) => {
      state.dirtyTopology = true
      paintGraph()
      if (finished) renderTopologyControls()
    },
  })
  bindNav()
  initHatUi({ onChange: renderAll })
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
