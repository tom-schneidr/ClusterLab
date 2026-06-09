import { WIRE_CONTROL_OFFSET } from './constants.js'
import { getAbsolutePortPosition } from './ports.js'

export function wirePath(x1, y1, x2, y2) {
  const cx1 = x1 + WIRE_CONTROL_OFFSET
  const cx2 = x2 - WIRE_CONTROL_OFFSET
  return `M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}`
}

export function edgeWirePath(edge, sourceNode, targetNode) {
  const start = getAbsolutePortPosition(sourceNode, edge.type, 'out')
  const end = getAbsolutePortPosition(targetNode, edge.type, 'in')
  if (!start || !end) {
    const sx = Number(sourceNode.x) + 110
    const sy = Number(sourceNode.y) + 40
    const tx = Number(targetNode.x) + 110
    const ty = Number(targetNode.y) + 40
    return wirePath(sx, sy, tx, ty)
  }
  return wirePath(start.x, start.y, end.x, end.y)
}

export function wireMidpoint(pathD) {
  const match = pathD.match(/M\s*([\d.]+)\s*([\d.]+).*?,\s*([\d.]+)\s*([\d.]+),\s*([\d.]+)\s*([\d.]+)/)
  if (!match) return { x: 0, y: 0 }
  const x1 = Number(match[1])
  const y1 = Number(match[2])
  const x2 = Number(match[5])
  const y2 = Number(match[6])
  return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 - 6 }
}
