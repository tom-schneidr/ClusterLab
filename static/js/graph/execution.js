import { api } from '../api.js'
import { qs } from '../dom.js'
import { state } from '../state.js'

let pollTimer = null

export function deriveExecutionFromEvents(events) {
  const execution = {
    activeNodeId: null,
    completedNodeIds: [],
    activeEdgeIds: [],
    stepLabel: '',
    stepIndex: 0,
    stepTotal: 0,
  }
  if (!events?.length) return execution

  const plan = events.find((e) => e.event_type === 'run_started')?.metadata?.execution_plan || []
  execution.stepTotal = plan.length

  const nodeEvents = events.filter((e) => e.event_type !== 'run_started' && e.event_type !== 'final_result')

  const lastNodeEvent = [...nodeEvents].reverse().find((e) => e.metadata?.node_id)
  const allNodeIds = nodeEvents.map((e) => e.metadata?.node_id).filter(Boolean)
  const uniqueCompleted = [...new Set(allNodeIds)]

  if (lastNodeEvent) {
    execution.stepIndex = Number(lastNodeEvent.metadata?.step_index || uniqueCompleted.length)
    execution.stepLabel = lastNodeEvent.hat_name || lastNodeEvent.event_type
    const incoming = lastNodeEvent.metadata?.edge_context?.incoming || []
    execution.activeEdgeIds = incoming.map((edge) => edge.id).filter(Boolean)
  }

  execution.completedNodeIds = uniqueCompleted
  execution.activeNodeId = lastNodeEvent?.metadata?.node_id || null
  return execution
}

export function applyExecutionState() {
  const activeNodeId = state.execution?.activeNodeId ?? null
  const completedNodeIds = state.execution?.completedNodeIds ?? []
  const activeEdgeIds = state.execution?.activeEdgeIds ?? []
  document.querySelectorAll('.graph-node').forEach((el) => {
    const id = el.dataset.nodeId
    el.classList.toggle('executing', id === activeNodeId)
    el.classList.toggle('completed', completedNodeIds.includes(id))
  })
  document.querySelectorAll('.graph-edge').forEach((el) => {
    el.classList.toggle('active', activeEdgeIds.includes(el.dataset.edgeId))
  })
}

export function setExecutionFromRun(run) {
  if (!run) {
    state.execution = {
      runId: null,
      activeNodeId: null,
      completedNodeIds: [],
      activeEdgeIds: [],
      stepLabel: '',
      stepIndex: 0,
      stepTotal: 0,
    }
    updateRunStatusStrip(null)
    applyExecutionState()
    return
  }

  const derived = deriveExecutionFromEvents(run.events || [])
  if (run.status === 'completed' || run.status === 'stopped' || run.status === 'failed') {
    derived.activeNodeId = null
    derived.activeEdgeIds = []
  }
  state.execution = { runId: run.id, ...derived }
  applyExecutionState()
  updateRunStatusStrip(run)
}

export function updateRunStatusStrip(run) {
  const el = qs('graphRunStatus')
  if (!el) return
  if (!run) {
    el.innerHTML = ''
    el.classList.remove('visible')
    return
  }

  const { stepIndex, stepTotal, stepLabel } = state.execution
  const status = run.status || 'unknown'
  if (status === 'running') {
    el.innerHTML = `
      <span class="run-status-text">Running · step ${stepIndex}/${stepTotal || '?'} · ${stepLabel || '…'}</span>
      <button type="button" class="run-status-link" id="openTraceFromGraph">Open trace →</button>
    `
    el.classList.add('visible')
    qs('openTraceFromGraph')?.addEventListener('click', () => {
      document.querySelector('[data-view="analysis"]')?.click()
    })
    return
  }

  if (status === 'completed') {
    el.innerHTML = `
      <span class="run-status-text">Completed · ${run.events?.length || 0} events</span>
      <button type="button" class="run-status-link" id="openTraceFromGraph">Open trace →</button>
    `
    el.classList.add('visible')
    qs('openTraceFromGraph')?.addEventListener('click', () => {
      document.querySelector('[data-view="analysis"]')?.click()
    })
    return
  }

  if (status === 'failed' || status === 'stopped') {
    el.innerHTML = `<span class="run-status-text">${status}</span>`
    el.classList.add('visible')
    return
  }

  el.innerHTML = ''
  el.classList.remove('visible')
}

export function stopRunPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

export function startRunPolling(runId, onUpdate) {
  stopRunPolling()
  pollTimer = setInterval(async () => {
    try {
      const run = await api(`/api/runs/${encodeURIComponent(runId)}`)
      onUpdate(run)
      if (run.status !== 'running') stopRunPolling()
    } catch (err) {
      console.error(err)
      stopRunPolling()
    }
  }, 400)
}

export function clearExecution() {
  stopRunPolling()
  setExecutionFromRun(null)
}
