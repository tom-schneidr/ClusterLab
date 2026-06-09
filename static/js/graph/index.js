import {
  bindGraphCanvas,
  dropNodePosition,
  handleNodePointerDown,
  handlePortPointerDown,
} from './interaction.js'
import { renderGraph } from './render.js'
import { bindCanvasResize, resetViewport, syncCanvasSize } from './viewport.js'

export {
  clearExecution,
  setExecutionFromRun,
  startRunPolling,
  stopRunPolling,
  updateRunStatusStrip,
} from './execution.js'
export { dropNodePosition } from './interaction.js'
export { graphMaxX, graphMaxY, resetViewport, syncCanvasSize } from './viewport.js'

let graphCallbacks = null

export function initGraph(callbacks) {
  graphCallbacks = callbacks
  bindGraphCanvas(callbacks)
  bindCanvasResize(() => paintGraph())
}

export function paintGraph() {
  if (!graphCallbacks) return
  syncCanvasSize()
  const handlers = {
    onSelectNode: graphCallbacks.onSelectNode,
    onSelectEdge: graphCallbacks.onSelectEdge,
    onOpenNodeDetail: graphCallbacks.onOpenNodeDetail,
    onNodePointerDown: (event, nodeId) => {
      const node = graphCallbacks.getNode(nodeId)
      if (!node) return
      handleNodePointerDown(event, nodeId, node, {
        onSelectNode: graphCallbacks.onSelectNode,
        onNodeMoved: (finished) => graphCallbacks.onNodeMoved(finished),
      })
    },
    onPortPointerDown: (event, nodeId, portType, side) => {
      const node = graphCallbacks.getNode(nodeId)
      if (!node) return
      handlePortPointerDown(event, nodeId, portType, side, node, graphCallbacks)
    },
  }
  renderGraph(handlers)
}
