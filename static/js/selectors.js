import {
  EDGE_TYPES,
  NODE_TYPES,
} from './constants.js'
import { state } from './state.js'


export function hatById(id) {
  return state.hats.find((hat) => hat.id === id)
}


export function activeNodes() {
  return state.activeTopology?.nodes || []
}


export function activeEdges() {
  return state.activeTopology?.edges || []
}


export function nodeById(id) {
  return activeNodes().find((node) => node.id === id)
}


export function edgeById(id) {
  return activeEdges().find((edge) => edge.id === id)
}


export function hatForNode(node) {
  return node?.type === 'hat' ? hatById(node.hat_id) : null
}


export function nodeName(node) {
  if (!node) return ''
  return node.name || hatForNode(node)?.name || node.id || 'Node'
}


export function nodeRole(node) {
  if (!node) return ''
  return node.role || hatForNode(node)?.role || node.type || ''
}


export function nodeColor(node) {
  if (node?.color) return node.color
  if (node?.type === 'hat') return hatForNode(node)?.color || '#42c6ff'
  if (node?.type === 'store') return '#9fb7ff'
  if (node?.type === 'gate') return '#ff6b6b'
  if (node?.type === 'tool') return '#ffd166'
  if (node?.type === 'output') return '#42c6ff'
  return '#42c6ff'
}


export function typeLabel(type) {
  return NODE_TYPES.find((item) => item.id === type)?.label || type || 'Node'
}


export function edgeTypeLabel(type) {
  return EDGE_TYPES.find((item) => item.id === type)?.label || type || 'Context Flow'
}
