export const TOOL_IDS = [
  'web_search',
  'memory_search',
  'memory_write',
  'filesystem_read',
  'filesystem_write',
  'shell',
]

export const NODE_TYPES = [
  { id: 'hat', label: 'Hat' },
  { id: 'store', label: 'Store' },
  { id: 'gate', label: 'Gate' },
  { id: 'tool', label: 'Tool' },
  { id: 'output', label: 'Output' },
]

export const EDGE_TYPES = [
  { id: 'context', label: 'Context Flow' },
  { id: 'delegation', label: 'Delegation' },
  { id: 'review', label: 'Review Gate' },
  { id: 'state', label: 'State Read/Write' },
  { id: 'escalation', label: 'Escalation' },
  { id: 'approval', label: 'Approval' },
]

export const AUTHORITY_IDS = [
  'route',
  'revise_plan',
  'delegate',
  'execute',
  'write_state',
  'interrupt',
  'request_revision',
  'request_evidence',
  'verify',
  'block',
  'final_approval',
  'write_memory',
]

export const VISIBILITY_IDS = [
  'full_blackboard',
  'task_packet_and_blackboard',
  'work_product',
  'work_product_and_blackboard',
  'work_product_and_evidence',
  'trace_and_blackboard',
  'shared_state',
  'curated_state',
  'approved_result',
]

export const STRUCTURAL_GROUPS = [
  {
    title: 'Stores',
    items: [
      {
        template_id: 'blackboard',
        type: 'store',
        name: 'Blackboard',
        role: 'Shared facts, assumptions, constraints, evidence, objections, and decisions.',
        color: '#9fb7ff',
        store_key: 'blackboard',
        visibility: 'shared_state',
        output_contract: 'Readable shared state snapshot.',
      },
      {
        template_id: 'task_ledger',
        type: 'store',
        name: 'Task Ledger',
        role: 'Task packets, dependencies, acceptance checks, and revision requests.',
        color: '#7ddc82',
        store_key: 'task_packets',
        visibility: 'shared_state',
        output_contract: 'Ordered task packet state.',
      },
      {
        template_id: 'evidence_store',
        type: 'store',
        name: 'Evidence Store',
        role: 'Artifacts, tests, citations, screenshots, logs, and proof material.',
        color: '#2bd9a3',
        store_key: 'evidence',
        visibility: 'shared_state',
        output_contract: 'Evidence items with provenance.',
      },
      {
        template_id: 'memory_store',
        type: 'store',
        name: 'Memory Store',
        role: 'Durable memory candidates and procedural improvements.',
        color: '#f78c6b',
        store_key: 'memory_candidates',
        visibility: 'curated_state',
        output_contract: 'Memory records with provenance and confidence.',
      },
    ],
  },
  {
    title: 'Gates',
    items: [
      {
        template_id: 'critic_gate',
        type: 'gate',
        name: 'Critic Gate',
        role: 'Blocks shallow completion by forcing adversarial review.',
        color: '#ff6b6b',
        authority: ['block', 'request_revision'],
        visibility: 'work_product',
        output_contract: 'Pass, revise, or escalate with concrete defects.',
      },
      {
        template_id: 'verifier_gate',
        type: 'gate',
        name: 'Verifier Gate',
        role: 'Requires evidence before final approval.',
        color: '#2bd9a3',
        authority: ['block', 'request_evidence'],
        visibility: 'work_product_and_evidence',
        output_contract: 'Pass/fail verdict and unresolved proof gaps.',
      },
      {
        template_id: 'approval_gate',
        type: 'gate',
        name: 'Approval Gate',
        role: 'Forces an explicit final decision before user-facing output.',
        color: '#42c6ff',
        authority: ['block', 'final_approval'],
        visibility: 'approved_result',
        output_contract: 'Approve, revise, or ask for more information.',
      },
    ],
  },
  {
    title: 'Tools',
    items: [
      {
        template_id: 'live_api_tool',
        type: 'tool',
        name: 'Live API Tool',
        role: 'Represents live external execution through the configured FreeRouter route.',
        color: '#ffd166',
        tools: ['web_search', 'shell'],
        visibility: 'task_packet_and_blackboard',
        output_contract: 'Tool result, error, or evidence item.',
      },
    ],
  },
  {
    title: 'Outputs',
    items: [
      {
        template_id: 'final_output',
        type: 'output',
        name: 'Final Output',
        role: 'User-facing result after review, verification, and executive approval.',
        color: '#42c6ff',
        visibility: 'approved_result',
        output_contract: 'Clean final answer without internal trace noise.',
      },
    ],
  },
]

export const NODE_WIDTH = 156
export const NODE_HEIGHT = 66
export const GRAPH_MAX_X = 760
export const GRAPH_MAX_Y = 580
