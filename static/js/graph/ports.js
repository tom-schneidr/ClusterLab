import {
  NODE_BODY_PAD,
  NODE_BODY_TEXT_H,
  NODE_HEADER_H,
  NODE_WIDTH,
  PORT_PROFILES,
  PORT_ROW_H,
} from './constants.js'

export function getPortProfile(node) {
  const type = node?.type || 'hat'
  return PORT_PROFILES[type] || PORT_PROFILES.hat
}

export function portCountForNode(node) {
  const profile = getPortProfile(node)
  return Math.max(profile.inputs.length, profile.outputs.length)
}

export function portsTopY() {
  return NODE_HEADER_H + NODE_BODY_PAD + NODE_BODY_TEXT_H + NODE_BODY_PAD
}

export function nodeHeight(node) {
  const count = portCountForNode(node)
  return portsTopY() + count * PORT_ROW_H + 4
}

export function portIndex(profile, portType, side) {
  const list = side === 'in' ? profile.inputs : profile.outputs
  return list.indexOf(portType)
}

export function getPortPosition(node, portType, side) {
  const profile = getPortProfile(node)
  const index = portIndex(profile, portType, side)
  if (index < 0) return null
  const top = portsTopY()
  const y = top + index * PORT_ROW_H + PORT_ROW_H / 2
  const x = side === 'in' ? 0 : NODE_WIDTH
  return { x, y }
}

export function getAbsolutePortPosition(node, portType, side) {
  const local = getPortPosition(node, portType, side)
  if (!local) return null
  return {
    x: Number(node.x) + local.x,
    y: Number(node.y) + local.y,
  }
}

export function isPortConnected(node, portType, side, edges) {
  const nodeId = node.id
  if (side === 'out') {
    return edges.some((edge) => edge.source === nodeId && edge.type === portType)
  }
  return edges.some((edge) => edge.target === nodeId && edge.type === portType)
}
