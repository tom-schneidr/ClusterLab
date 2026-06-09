import { qs } from '../dom.js'
import { state } from '../state.js'
import {
  NODE_WIDTH,
  VIEWPORT_MAX_SCALE,
  VIEWPORT_MIN_SCALE,
  VIEWPORT_ZOOM_STEP,
  WORLD_MIN_H,
  WORLD_MIN_W,
  WORLD_VIEW_MULTIPLIER,
} from './constants.js'

const MIN_NODE_HEIGHT = 180

export function graphMaxX() {
  return Math.max(0, state.graphWorld.w - NODE_WIDTH)
}

export function graphMaxY(nodeHeight = MIN_NODE_HEIGHT) {
  return Math.max(0, state.graphWorld.h - nodeHeight)
}

function measureViewSize() {
  const svg = qs('graphSvg')
  if (!svg) return null
  const rect = svg.getBoundingClientRect()
  if (rect.width < 20 || rect.height < 20) return null
  return { w: Math.round(rect.width), h: Math.round(rect.height) }
}

function worldSizeForView(viewW, viewH) {
  return {
    w: Math.max(Math.round(viewW * WORLD_VIEW_MULTIPLIER), WORLD_MIN_W),
    h: Math.max(Math.round(viewH * WORLD_VIEW_MULTIPLIER), WORLD_MIN_H),
  }
}

function applyWorldLayers(worldW, worldH) {
  const panLayer = qs('graphPanLayer')
  const grid = qs('graphGrid')
  if (panLayer) {
    panLayer.setAttribute('width', String(worldW))
    panLayer.setAttribute('height', String(worldH))
  }
  if (grid) {
    grid.setAttribute('width', String(worldW))
    grid.setAttribute('height', String(worldH))
  }
}

export function syncCanvasSize() {
  const svg = qs('graphSvg')
  if (!svg) return false

  const measured = measureViewSize()
  const viewW = measured?.w ?? state.graphView.w
  const viewH = measured?.h ?? state.graphView.h
  const world = worldSizeForView(viewW, viewH)

  const viewChanged = state.graphView.w !== viewW || state.graphView.h !== viewH
  const worldChanged = state.graphWorld.w !== world.w || state.graphWorld.h !== world.h
  if (!viewChanged && !worldChanged) return false

  state.graphView = { w: viewW, h: viewH }
  state.graphWorld = { w: world.w, h: world.h }
  svg.setAttribute('viewBox', `0 0 ${viewW} ${viewH}`)
  applyWorldLayers(world.w, world.h)
  return true
}

let resizeObserver = null

export function bindCanvasResize(onResize) {
  const svg = qs('graphSvg')
  if (!svg || typeof ResizeObserver === 'undefined') return
  resizeObserver?.disconnect()
  resizeObserver = new ResizeObserver(() => {
    if (syncCanvasSize()) onResize?.()
  })
  syncCanvasSize()
  resizeObserver.observe(svg)
}

export function resetViewport() {
  state.viewport = { x: 0, y: 0, scale: 1 }
  applyViewportTransform()
}

export function applyViewportTransform() {
  const viewport = qs('graphViewport')
  if (!viewport) return
  const { x, y, scale } = state.viewport
  viewport.setAttribute('transform', `translate(${x}, ${y}) scale(${scale})`)
}

export function graphPointFromClient(clientX, clientY) {
  const viewport = qs('graphViewport')
  const svg = qs('graphSvg')
  if (!svg) return { x: 0, y: 0 }
  const point = svg.createSVGPoint()
  point.x = clientX
  point.y = clientY
  const ctm = viewport?.getScreenCTM?.()
  if (!ctm) {
    const fallback = svg.getScreenCTM()
    if (!fallback) return { x: 0, y: 0 }
    return point.matrixTransform(fallback.inverse())
  }
  return point.matrixTransform(ctm.inverse())
}

export function zoomAt(clientX, clientY, deltaY) {
  const graph = graphPointFromClient(clientX, clientY)
  const oldScale = state.viewport.scale
  const factor = 1 - deltaY * VIEWPORT_ZOOM_STEP
  const newScale = Math.max(VIEWPORT_MIN_SCALE, Math.min(VIEWPORT_MAX_SCALE, oldScale * factor))
  if (newScale === oldScale) return
  state.viewport.x += graph.x * (oldScale - newScale)
  state.viewport.y += graph.y * (oldScale - newScale)
  state.viewport.scale = newScale
  applyViewportTransform()
}

let pan = null

export function startPan(event) {
  if (event.target.closest?.('.graph-node, .graph-edge, .port-dot, .edge-label')) return
  pan = {
    startClientX: event.clientX,
    startClientY: event.clientY,
    startX: state.viewport.x,
    startY: state.viewport.y,
  }
  qs('graphPanLayer')?.classList.add('panning')
  document.addEventListener('pointermove', onPanMove)
  document.addEventListener('pointerup', endPan, { once: true })
}

function onPanMove(event) {
  if (!pan) return
  const start = graphPointFromClient(pan.startClientX, pan.startClientY)
  const current = graphPointFromClient(event.clientX, event.clientY)
  const scale = state.viewport.scale
  state.viewport.x = pan.startX + (current.x - start.x) * scale
  state.viewport.y = pan.startY + (current.y - start.y) * scale
  applyViewportTransform()
}

function endPan() {
  document.removeEventListener('pointermove', onPanMove)
  qs('graphPanLayer')?.classList.remove('panning')
  pan = null
}

export function ensureGraphDefs() {
  const svg = qs('graphSvg')
  if (!svg) return
  let defs = svg.querySelector('defs')
  if (!defs) {
    defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs')
    svg.prepend(defs)
  }
  if (!defs.querySelector('#graphDots')) {
    defs.innerHTML = `
      <pattern id="graphDots" width="20" height="20" patternUnits="userSpaceOnUse">
        <circle cx="1" cy="1" r="1" fill="#2a2a2a"/>
      </pattern>
      <filter id="nodeGlow" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="0" stdDeviation="4" flood-color="#42c6ff" flood-opacity="0.85"/>
      </filter>
      <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z"></path>
      </marker>
    `
  }
}

export function ensureGraphShell() {
  const svg = qs('graphSvg')
  if (!svg) return { edges: null, nodes: null }
  syncCanvasSize()
  ensureGraphDefs()

  const legacyBackground = svg.querySelector(':scope > #graphBackground')
  if (legacyBackground) legacyBackground.remove()

  const { w, h } = state.graphWorld

  let viewport = qs('graphViewport')
  if (!viewport) {
    viewport = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    viewport.id = 'graphViewport'
    svg.appendChild(viewport)
  }

  if (!qs('graphPanLayer')) {
    const panLayer = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    panLayer.id = 'graphPanLayer'
    panLayer.setAttribute('class', 'graph-background')
    panLayer.setAttribute('x', '0')
    panLayer.setAttribute('y', '0')
    panLayer.setAttribute('width', String(w))
    panLayer.setAttribute('height', String(h))
    panLayer.setAttribute('fill', '#1e1e1e')
    viewport.insertBefore(panLayer, viewport.firstChild)
    panLayer.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return
      event.preventDefault()
      startPan(event)
    })
  }

  if (!qs('graphGrid')) {
    const grid = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    grid.id = 'graphGrid'
    grid.setAttribute('class', 'graph-grid')
    grid.setAttribute('x', '0')
    grid.setAttribute('y', '0')
    grid.setAttribute('width', String(w))
    grid.setAttribute('height', String(h))
    grid.setAttribute('fill', 'url(#graphDots)')
    grid.setAttribute('pointer-events', 'none')
    const panLayer = qs('graphPanLayer')
    if (panLayer?.nextSibling) viewport.insertBefore(grid, panLayer.nextSibling)
    else viewport.appendChild(grid)
  }

  applyWorldLayers(w, h)

  let edges = qs('graphEdges')
  if (!edges) {
    edges = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    edges.id = 'graphEdges'
    viewport.appendChild(edges)
  }

  let nodes = qs('graphNodes')
  if (!nodes) {
    nodes = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    nodes.id = 'graphNodes'
    viewport.appendChild(nodes)
  }

  const panLayer = qs('graphPanLayer')
  if (panLayer && viewport.firstChild !== panLayer) {
    viewport.insertBefore(panLayer, viewport.firstChild)
  }

  applyViewportTransform()
  return { edges, nodes }
}
