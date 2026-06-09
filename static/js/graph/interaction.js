import { qs } from '../dom.js'
import { activeEdges } from '../selectors.js'
import { state } from '../state.js'
import { NODE_WIDTH } from './constants.js'
import { graphMaxX, graphMaxY } from './viewport.js'
import { getAbsolutePortPosition, nodeHeight } from './ports.js'
import { wirePath } from './layout.js'
import { refreshEdges } from './render.js'
import { graphPointFromClient, zoomAt } from './viewport.js'

let nodeDrag = null
let connectionDrag = null

export function bindGraphCanvas(callbacks) {
  const svg = qs('graphSvg')
  if (!svg) return

  svg.addEventListener('wheel', (event) => {
    event.preventDefault()
    zoomAt(event.clientX, event.clientY, event.deltaY)
  }, { passive: false })

  svg.addEventListener('dragover', (event) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  })

  svg.addEventListener('drop', (event) => {
    event.preventDefault()
    const raw = event.dataTransfer.getData('application/json') || event.dataTransfer.getData('text/plain')
    if (!raw) return
    const payload = JSON.parse(raw)
    const point = graphPointFromClient(event.clientX, event.clientY)
    callbacks.onDropNode(payload, point.x, point.y)
  })
}

export function handleNodePointerDown(event, nodeId, node, callbacks) {
  if (event.target.closest?.('.port')) return
  event.preventDefault()
  const start = graphPointFromClient(event.clientX, event.clientY)
  nodeDrag = {
    node,
    moved: false,
    startX: Number(node.x),
    startY: Number(node.y),
    startGraphX: start.x,
    startGraphY: start.y,
    onMoved: callbacks.onNodeMoved,
  }
  document.addEventListener('pointermove', onNodeDragMove)
  document.addEventListener('pointerup', onNodeDragEnd, { once: true })
}

function onNodeDragMove(event) {
  if (!nodeDrag) return
  const current = graphPointFromClient(event.clientX, event.clientY)
  const dx = current.x - nodeDrag.startGraphX
  const dy = current.y - nodeDrag.startGraphY
  if (Math.abs(dx) > 1 || Math.abs(dy) > 1) nodeDrag.moved = true
  const { node } = nodeDrag
  const h = nodeHeight(node)
  node.x = Math.max(0, Math.min(graphMaxX(), nodeDrag.startX + dx))
  node.y = Math.max(0, Math.min(graphMaxY(h), nodeDrag.startY + dy))
  const el = document.querySelector(`#graphNodes [data-node-id="${node.id}"]`)
  if (el) el.setAttribute('transform', `translate(${node.x}, ${node.y})`)
  refreshEdges(activeEdges(), state.activeTopology?.nodes || [])
  nodeDrag.onMoved(false)
}

function onNodeDragEnd(event) {
  document.removeEventListener('pointermove', onNodeDragMove)
  if (nodeDrag) {
    nodeDrag.onMoved(true)
    if (!nodeDrag.moved && event?.target?.closest?.('.graph-node')) {
      // Click without drag — selection handled by click listener on the node.
    }
  }
  nodeDrag = null
}

export function handlePortPointerDown(event, sourceNodeId, portType, side, sourceNode, callbacks) {
  if (side !== 'out') return
  const start = getAbsolutePortPosition(sourceNode, portType, 'out')
  if (!start) return
  const edgesLayer = qs('graphEdges')
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('class', `graph-edge preview edge-${portType}`)
  path.setAttribute('d', `M ${start.x} ${start.y} L ${start.x} ${start.y}`)
  edgesLayer.appendChild(path)
  connectionDrag = { sourceNodeId, portType, start, path, callbacks }
  document.addEventListener('pointermove', onConnectionMove)
  document.addEventListener('pointerup', onConnectionEnd, { once: true })
}

function onConnectionMove(event) {
  if (!connectionDrag) return
  const point = graphPointFromClient(event.clientX, event.clientY)
  connectionDrag.path.setAttribute(
    'd',
    wirePath(connectionDrag.start.x, connectionDrag.start.y, point.x, point.y),
  )
}

function onConnectionEnd(event) {
  document.removeEventListener('pointermove', onConnectionMove)
  if (!connectionDrag) return
  connectionDrag.path.remove()
  const port = event.target.closest?.('.port')
  const targetNode = event.target.closest?.('.graph-node')
  const targetNodeId = targetNode?.dataset?.nodeId
  const portType = port?.dataset?.portType
  const portSide = port?.dataset?.portSide
  const { sourceNodeId, portType: sourceType, callbacks } = connectionDrag
  connectionDrag = null
  if (targetNodeId && portSide === 'in' && portType === sourceType) {
    callbacks.onCreateEdge(sourceNodeId, targetNodeId, sourceType)
  }
}

export function dropNodePosition(x, y, node) {
  const h = nodeHeight(node)
  return {
    x: Math.max(0, Math.min(graphMaxX(), x - NODE_WIDTH / 2)),
    y: Math.max(0, Math.min(graphMaxY(h), y - h / 2)),
  }
}
