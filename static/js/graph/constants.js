export const VIEWPORT_MIN_SCALE = 0.08
export const VIEWPORT_MAX_SCALE = 3
export const VIEWPORT_ZOOM_STEP = 0.001

/** Minimum graph world size (graph coordinates). */
export const WORLD_MIN_W = 4800
export const WORLD_MIN_H = 3600
/** World is at least this multiple of the visible canvas. */
export const WORLD_VIEW_MULTIPLIER = 5

export const NODE_WIDTH = 220
export const NODE_HEADER_H = 28
export const NODE_BODY_PAD = 10
export const NODE_BODY_TEXT_H = 18
export const PORT_ROW_H = 18
export const PORT_RADIUS = 5
export const WIRE_CONTROL_OFFSET = 80

export const ALL_EDGE_TYPES = [
  'context',
  'delegation',
  'review',
  'state',
  'escalation',
  'approval',
]

export const EDGE_TYPE_COLORS = {
  context: '#8fb7ff',
  delegation: '#ffd166',
  review: '#ff6b6b',
  state: '#2bd9a3',
  escalation: '#f78c6b',
  approval: '#42c6ff',
}

export const PORT_PROFILES = {
  hat: {
    inputs: ['context', 'delegation', 'review', 'state', 'escalation', 'approval'],
    outputs: ['context', 'delegation', 'review', 'state', 'escalation', 'approval'],
  },
  store: {
    inputs: ['context', 'state'],
    outputs: ['context', 'state'],
  },
  gate: {
    inputs: ['review', 'escalation', 'approval'],
    outputs: ['review', 'escalation', 'approval'],
  },
  tool: {
    inputs: ['delegation', 'context'],
    outputs: ['state', 'context'],
  },
  output: {
    inputs: ['approval', 'context'],
    outputs: [],
  },
}
