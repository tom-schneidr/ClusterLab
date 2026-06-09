import { escapeHtml, qs, short } from '../dom.js'
import { edgeTypeLabel, nodeColor, nodeName, nodeRole, typeLabel } from '../selectors.js'
import { state } from '../state.js'
import { NODE_HEADER_H, NODE_WIDTH, PORT_ROW_H } from './constants.js'
import { applyExecutionState } from './execution.js'
import { edgeWirePath, wireMidpoint } from './layout.js'
import {
  getPortProfile,
  isPortConnected,
  nodeHeight,
  portCountForNode,
  portsTopY,
} from './ports.js'
import { ensureGraphShell } from './viewport.js'

const SVG_NS = 'http://www.w3.org/2000/svg'

function svgFragment(markup) {
  const box = document.createElementNS(SVG_NS, 'svg')
  box.innerHTML = markup
  return [...box.childNodes]
}

function nodeClasses(node) {
  const parts = [
    'graph-node',
    `node-${node.type || 'hat'}`,
  ]
  if (state.selectedNodeId === node.id) parts.push('selected')
  if (state.execution?.activeNodeId === node.id) parts.push('executing')
  if (state.execution?.completedNodeIds?.includes(node.id)) parts.push('completed')
  return parts.join(' ')
}

function edgeClasses(edge) {
  const parts = [
    'graph-edge',
    `edge-${edge.type || 'context'}`,
  ]
  if (edge.blocking) parts.push('blocking')
  if (state.selectedEdgeId === edge.id) parts.push('selected')
  if (state.execution?.activeEdgeIds?.includes(edge.id)) parts.push('active')
  return parts.join(' ')
}

function renderPort(node, portType, side, index, edges) {
  const top = portsTopY()
  const y = top + index * PORT_ROW_H + PORT_ROW_H / 2
  const x = side === 'in' ? 0 : NODE_WIDTH
  const connected = isPortConnected(node, portType, side, edges)
  const labelX = side === 'in' ? 12 : NODE_WIDTH - 12
  const anchor = side === 'in' ? 'start' : 'end'
  return `
    <g class="port port-${side} port-${portType} ${connected ? 'connected' : ''}"
       data-port-type="${escapeHtml(portType)}"
       data-port-side="${side}">
      <circle class="port-dot" cx="${x}" cy="${y}" r="5"></circle>
      <text class="port-label" x="${labelX}" y="${y + 4}" text-anchor="${anchor}">${escapeHtml(portType)}</text>
    </g>
  `
}

function nodeMarkup(node, edges) {
  const profile = getPortProfile(node)
  const height = nodeHeight(node)
  const count = portCountForNode(node)
  const color = nodeColor(node)
  const ports = []
  for (let i = 0; i < count; i += 1) {
    if (profile.inputs[i]) ports.push(renderPort(node, profile.inputs[i], 'in', i, edges))
    if (profile.outputs[i]) ports.push(renderPort(node, profile.outputs[i], 'out', i, edges))
  }
  return `
    <rect class="node-bg" width="${NODE_WIDTH}" height="${height}" rx="6"></rect>
    <rect class="node-header" width="${NODE_WIDTH}" height="${NODE_HEADER_H}" rx="6" style="fill:${escapeHtml(color)}"></rect>
    <rect class="node-header-fade" x="0" y="${NODE_HEADER_H - 6}" width="${NODE_WIDTH}" height="6" style="fill:${escapeHtml(color)}"></rect>
    <circle class="node-accent" cx="14" cy="14" r="5" fill="rgba(255,255,255,0.9)"></circle>
    <text class="node-title" x="26" y="19">${escapeHtml(short(nodeName(node), 22))}</text>
    <text class="node-kind" x="${NODE_WIDTH - 10}" y="19" text-anchor="end">${escapeHtml(typeLabel(node.type))}</text>
    <text class="node-subtitle" x="10" y="${NODE_HEADER_H + 16}">${escapeHtml(short(nodeRole(node), 36))}</text>
    ${ports.join('')}
  `
}

function appendSvgFragment(parent, markup) {
  for (const child of svgFragment(markup)) {
    parent.appendChild(child)
  }
}

export function refreshEdges(edges, nodes) {
  const edgesLayer = qs('graphEdges')
  if (!edgesLayer) return
  const nodeMap = Object.fromEntries(nodes.map((node) => [node.id, node]))
  edgesLayer.replaceChildren()
  for (const edge of edges) {
    const source = nodeMap[edge.source]
    const target = nodeMap[edge.target]
    if (!source || !target) continue
    const pathD = edgeWirePath(edge, source, target)
    const path = document.createElementNS(SVG_NS, 'path')
    path.setAttribute('d', pathD)
    path.setAttribute('class', edgeClasses(edge))
    path.dataset.edgeId = edge.id
    edgesLayer.appendChild(path)
    const mid = wireMidpoint(pathD)
    const label = document.createElementNS(SVG_NS, 'text')
    label.setAttribute('x', String(mid.x))
    label.setAttribute('y', String(mid.y))
    label.setAttribute('class', 'edge-label')
    label.dataset.edgeId = edge.id
    label.textContent = edgeTypeLabel(edge.type)
    edgesLayer.appendChild(label)
  }
}

export function renderGraph(handlers) {
  const { edges: edgesLayer, nodes: nodesLayer } = ensureGraphShell()
  if (!edgesLayer || !nodesLayer) return

  const nodes = state.activeTopology?.nodes || []
  const edges = state.activeTopology?.edges || []
  const nodeMap = Object.fromEntries(nodes.map((node) => [node.id, node]))

  edgesLayer.replaceChildren()
  for (const edge of edges) {
    const source = nodeMap[edge.source]
    const target = nodeMap[edge.target]
    if (!source || !target) continue

    const pathD = edgeWirePath(edge, source, target)
    const path = document.createElementNS(SVG_NS, 'path')
    path.setAttribute('d', pathD)
    path.setAttribute('class', edgeClasses(edge))
    path.dataset.edgeId = edge.id
    path.addEventListener('click', (event) => {
      event.stopPropagation()
      handlers.onSelectEdge(edge.id)
    })
    edgesLayer.appendChild(path)

    const mid = wireMidpoint(pathD)
    const label = document.createElementNS(SVG_NS, 'text')
    label.setAttribute('x', String(mid.x))
    label.setAttribute('y', String(mid.y))
    label.setAttribute('class', 'edge-label')
    label.dataset.edgeId = edge.id
    label.textContent = edgeTypeLabel(edge.type)
    label.addEventListener('click', (event) => {
      event.stopPropagation()
      handlers.onSelectEdge(edge.id)
    })
    edgesLayer.appendChild(label)
  }

  nodesLayer.replaceChildren()
  for (const node of nodes) {
    const g = document.createElementNS(SVG_NS, 'g')
    g.setAttribute('class', nodeClasses(node))
    g.setAttribute('transform', `translate(${Number(node.x) || 0}, ${Number(node.y) || 0})`)
    g.dataset.nodeId = node.id
    appendSvgFragment(g, nodeMarkup(node, edges))

    g.addEventListener('pointerdown', (event) => handlers.onNodePointerDown(event, node.id))
    g.addEventListener('click', (event) => {
      if (event.detail >= 2) {
        event.preventDefault()
        handlers.onOpenNodeDetail(node.id)
        return
      }
      handlers.onSelectNode(node.id)
    })
    g.addEventListener('dblclick', (event) => {
      event.preventDefault()
      event.stopPropagation()
      handlers.onOpenNodeDetail(node.id)
    })

    g.querySelectorAll('.port-out .port-dot').forEach((portEl) => {
      portEl.addEventListener('pointerdown', (event) => {
        event.preventDefault()
        event.stopPropagation()
        const port = portEl.closest('.port')
        handlers.onPortPointerDown(event, node.id, port.dataset.portType, 'out')
      })
    })

    nodesLayer.appendChild(g)
  }

  applyExecutionState()
}
