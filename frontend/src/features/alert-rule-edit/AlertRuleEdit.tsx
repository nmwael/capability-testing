import { createContext, useContext, useMemo, useState, useEffect, useRef, useCallback } from 'react'
import { ReactFlow, Background, Controls, MiniMap, useNodesState, useEdgesState, addEdge, useReactFlow, type Node, type Edge, type ReactFlowInstance, type NodeTypes, Handle, Position } from '@xyflow/react'
import '@xyflow/react/dist/style.css'

const CHANNELS = ['sirens', 'broadcast', 'social']

interface ConditionNodeData {
  kind: 'condition'
  field: string
  value: string
  [key: string]: string
}

interface ActionNodeData {
  kind: 'action'
  channel: 'sirens' | 'broadcast' | 'social'
}

// The CAP condition fields the editor offers, and each field's schema
// enumeration. A condition node names ONE field and ONE value from it.
const CAP_FIELDS = ['severity', 'urgency', 'certainty'] as const
type CapField = (typeof CAP_FIELDS)[number]
const CAP_FIELD_VALUES: Record<string, readonly string[]> = {
  severity: ['Extreme', 'Severe', 'Moderate', 'Minor', 'Unknown'],
  urgency: ['Immediate', 'Expected', 'Future', 'Past', 'Unknown'],
  certainty: ['Observed', 'Likely', 'Possible', 'Unlikely', 'Unknown'],
}

interface WireNode {
  id: string
  kind: 'condition' | 'action'
  field?: string
  value?: string
  channel?: string
}

interface WireEdge {
  from: string
  to: string
}

interface WireGraph {
  name: string
  nodes: WireNode[]
  edges: WireEdge[]
}

function graphToWire(name: string, graphNodes: Node[], graphEdges: Edge[]): WireGraph {
  return {
    name,
    nodes: graphNodes.map((node): WireNode => {
      const nodeData = node.data ?? {}
      return node.data?.kind === 'action'
        ? { id: node.id, kind: 'action', channel: nodeData.channel as string }
        : { id: node.id, kind: 'condition', field: nodeData.field as string, value: nodeData.value as string }
    }),
    edges: graphEdges.map((edge): WireEdge => ({ from: edge.source, to: edge.target })),
  }
}

function graphFromWire(wire: WireGraph): { nodes: Node[]; edges: Edge[] } {
  return {
    nodes: wire.nodes.map((node, index) => ({
      id: node.id,
      type: node.kind,
      position: { x: 100 + (index % 4) * 220, y: 100 + Math.floor(index / 4) * 140 },
      data: node.kind === 'action'
        ? { kind: 'action', channel: node.channel ?? CHANNELS[0] }
        : { kind: 'condition', field: node.field ?? 'severity', value: node.value ?? 'Extreme' },
    })),
    edges: wire.edges.map((edge) => ({
      id: `edge-${edge.from}-${edge.to}`,
      source: edge.from,
      target: edge.to,
      animated: true,
    })),
  }
}

const CONDITION_FIELDS = ['severity', 'urgency', 'certainty'] as const
type ConditionField = (typeof CONDITION_FIELDS)[number]

interface ConditionNodeComponentProps {
  id: string
  data: ConditionNodeData
}

function ConditionNodeComponent({ id, data }: ConditionNodeComponentProps) {
  const { setNodes } = useReactFlow()
  const context = useContext(DirtyContext)

  const handleFieldChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextField = e.target.value as ConditionField
    setNodes((nds) => nds.map((n) =>
      n.id === id ? { ...n, data: { ...n.data, field: nextField, value: CAP_FIELD_VALUES[nextField][0] } } : n))
    context?.setDirty()
  }

  const handleValueChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextValue = e.target.value
    setNodes((nds) => nds.map((n) =>
      n.id === id ? { ...n, data: { ...n.data, value: nextValue } } : n))
    context?.setDirty()
  }

  return (
    <div className="cap-node cap-node-condition" data-testid="condition-node">
      <Handle type="target" position={Position.Left} className="cap-handle" />
      <div className="cap-node-header">Condition</div>
      <div className="cap-node-row">
        <span>field: </span>
        <select
          aria-label="condition field"
          className="cap-node-select"
          data-testid="condition-field-select"
          value={data.field}
          onChange={handleFieldChange}
        >
          {CONDITION_FIELDS.map(field => <option key={field} value={field}>{field}</option>)}
        </select>
      </div>
      <div className="cap-node-row">
        <span>value: </span>
        <select
          aria-label="condition value"
          className="cap-node-select"
          data-testid="condition-value-select"
          value={data.value}
          onChange={handleValueChange}
        >
          {(CAP_FIELD_VALUES[data.field as CapField] ?? []).map(value => <option key={value} value={value}>{value}</option>)}
        </select>
      </div>
      <Handle type="source" position={Position.Right} className="cap-handle" />
    </div>
  )
}

function ActionNodeComponent({ id, data }: { id: string; data: ActionNodeData }) {
  const { setNodes } = useReactFlow()
  const context = useContext(DirtyContext)

  const handleChannelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextChannel = e.target.value as ActionNodeData['channel']
    setNodes((nds) => nds.map((n) =>
      n.id === id ? { ...n, data: { ...n.data, channel: nextChannel } } : n))
    context?.setDirty()
  }

  return (
    <div className="cap-node cap-node-action" data-testid="action-node">
      <Handle type="target" position={Position.Left} className="cap-handle-action" />
      <div className="cap-node-header">Action</div>
      <div className="cap-node-row">
        <span>Channel: </span>
        <select
          aria-label="action channel"
          className="cap-node-select"
          value={data.channel}
          onChange={handleChannelChange}
        >
          {CHANNELS.map(ch => (
            <option key={ch} value={ch}>{ch}</option>
          ))}
        </select>
      </div>
    </div>
  )
}

interface AlertRuleEditProps {
  endpoint?: string
  graphName?: string
}

// Create a React context for dirty state management
const DirtyContext = createContext<{ setDirty: () => void } | null>(null)

function AlertRuleEdit({ endpoint = '/rules', graphName = 'tornado-routing' }: AlertRuleEditProps) {
  const [nodes, setNodes, baseOnNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, baseOnEdgesChange] = useEdgesState<Edge>([])

  const onNodesChange = useCallback((changes: any[]) => {
    baseOnNodesChange(changes)
    const shouldDirty = changes.some((c: any) => c.type === 'add' || c.type === 'remove')
    if (shouldDirty) {
      setDirty(true)
    }
  }, [baseOnNodesChange])

  const onEdgesChange = useCallback((changes: any[]) => {
    baseOnEdgesChange(changes)
    const shouldDirty = changes.some((c: any) => c.type === 'add' || c.type === 'remove')
    if (shouldDirty) {
      setDirty(true)
    }
  }, [baseOnEdgesChange])

  const onSelectionChange = useCallback(({ nodes: selected }: { nodes: Node[] }) => {
    setSelectedNodeId(selected.length > 0 ? selected[selected.length - 1].id : null)
  }, [])

  const reactFlowInstance = useRef<ReactFlowInstance | null>(null)
  const [dirty, setDirty] = useState(false)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [graphNameLocal, setGraphNameLocal] = useState(graphName)
  const [graphNameDraft, setGraphNameDraft] = useState(graphName)
  const [showEmptyHint, setShowEmptyHint] = useState(true)
  const [renameInput, setRenameInput] = useState<string | null>(null)
  const [renameInputDraft, setRenameInputDraft] = useState<string>('')
  const [sync, setSync] = useState<{ kind: 'idle' | 'loading' | 'ok' | 'error' | 'info'; message: string }>({ kind: 'idle', message: '' })

  const nodeTypes: NodeTypes = useMemo(() => ({
    condition: ConditionNodeComponent,
    action: ActionNodeComponent,
  }), [])

  // Load the graph from the backend
  useEffect(() => {
    let cancelled = false
    async function load(): Promise<void> {
      setSync({ kind: 'loading', message: 'Loading graph...' })
      try {
        const res = await fetch(`${endpoint}/${encodeURIComponent(graphNameLocal)}`)
        if (cancelled) return
        if (!res.ok) {
          if (res.status === 404) {
            setSync({ kind: 'info', message: `No saved graph named ${graphNameLocal}. Starting with an empty canvas.` })
          } else {
            setSync({ kind: 'error', message: 'Could not reach the rule edit endpoint. Your graph is still editable.' })
          }
          return
        }
        const wire = await res.json()
        if (cancelled) return
        if (!wire || !Array.isArray(wire.nodes) || !Array.isArray(wire.edges)) {
          setSync({ kind: 'info', message: `No saved graph named ${graphNameLocal}. Starting with an empty canvas.` })
          return
        }
        const restored = graphFromWire(wire)
        setNodes(restored.nodes)
        setEdges(restored.edges)
        if (typeof wire.name === 'string' && wire.name.length > 0) {
          setGraphNameLocal(wire.name)
          setGraphNameDraft(wire.name)
        }
        setShowEmptyHint(false)
        setSync({ kind: 'idle', message: '' })
      } catch {
        if (!cancelled) {
          setSync({ kind: 'error', message: 'Could not reach the rule edit endpoint. Your graph is still editable.' })
        }
      }
    }
    void load()
    return () => { cancelled = true }
    // Runs once when the editor opens: graphNameLocal is the name in effect
    // at that point, and renaming it must not re-fetch over the officer's work.
  }, [endpoint])

  // Post the changed graph as JSON
  async function postGraph(): Promise<void> {
    setSync({ kind: 'loading', message: 'Posting graph...' })
    try {
      const res = await fetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(graphToWire(graphNameLocal, nodes, edges)),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ problems: [] as string[] }))
        const detail = Array.isArray(body?.problems) && body.problems.length > 0
          ? String(body.problems[0])
          : `the endpoint rejected the graph (HTTP ${res.status})`
        setSync({ kind: 'error', message: detail })
        return
      }
      await res.json().catch(() => ({ ruleCount: 0 }))
      setDirty(false)
      setSync({ kind: 'ok', message: 'Graph saved successfully' })
    } catch {
      setSync({ kind: 'error', message: 'Could not reach the rule edit endpoint. Your graph is still editable.' })
    }
  }

  // Sync status updates the graph name when saved
  useEffect(() => {
    if (sync.kind === 'ok') {
      // The backend returns the saved graph, extract its name
      // For now, we keep the local name; the user can rename if needed
    }
  }, [sync.kind, graphNameLocal])

  // Handle rename functionality
  function applyRename() {
    if (!selectedNodeId || !renameInput) return

    const newId = renameInputDraft.length > 0 ? renameInputDraft : renameInput
    if (!newId || newId === selectedNodeId) {
      setSelectedNodeId(null)
      setRenameInput(null)
      setRenameInputDraft('')
      return
    }

    const oldId = selectedNodeId

    // Update the node's id
    setNodes(nodes => nodes.map(n =>
      n.id === oldId ? { ...n, id: newId } : n
    ))

    // Rebuild edges that reference the old id
    setEdges(edges => edges.map(edge =>
      edge.source === oldId || edge.target === oldId ? ({
        ...edge,
        ...(edge.source === oldId ? { source: newId } : { target: newId }),
      }) : edge
    ))

    setSelectedNodeId(null)
    setRenameInput(null)
    setRenameInputDraft('')
    setDirty(true)
  }

  useEffect(() => {
    if (renameInput !== null) {
      setRenameInputDraft(renameInput)
    } else {
      setRenameInputDraft('')
    }
  }, [renameInput])

  useEffect(() => {
    setGraphNameDraft(graphNameLocal)
  }, [graphNameLocal])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) {
      return
    }
    if (e.key === 'Backspace') {
      e.preventDefault()
      if (selectedNodeId) {
        setNodes(nodes => nodes.filter(n => n.id !== selectedNodeId))
        setSelectedNodeId(null)
        setDirty(true)
      }
    }
  }

  function onConnect(conn: { source: string; target: string }) {
    setEdges(eds => addEdge({
      id: `edge-${conn.source}-${conn.target}`,
      source: conn.source,
      target: conn.target,
      animated: true,
    }, eds))
    setDirty(true)
  }

  function onNodeDragStop() {
    setDirty(true)
  }

  function createDefaultGraph() {
    const conditionId = 'condition-1'
    const actionId = 'action-1'
    const conditionNode: Node = {
      id: conditionId,
      position: { x: 100, y: 100 },
      type: 'condition',
      data: { kind: 'condition', field: 'severity', value: 'Extreme' },
    }
    const actionNode: Node = {
      id: actionId,
      position: { x: 400, y: 100 },
      type: 'action',
      data: { kind: 'action', channel: 'sirens' },
    }
    const edge: Edge = {
      id: `edge-${conditionId}-${actionId}`,
      source: conditionId,
      target: actionId,
      animated: true,
    }

    setNodes([conditionNode, actionNode])
    setEdges([edge])
    setDirty(true)
    setShowEmptyHint(false)
    setSync({ kind: 'idle', message: '' })
  }

  // Create default graph only when canvas is truly empty
  useEffect(() => {
    if (nodes.length === 0 && showEmptyHint) {
      createDefaultGraph()
    }
  }, [showEmptyHint])

  // Create dirty context provider
  const DirtyContextValue = useMemo(() => ({ setDirty: () => setDirty(true) }), [setDirty])

  return (
    <DirtyContext.Provider value={DirtyContextValue}>
      <div className="cap-editor">
        {/* Toolbar with graph name and save button */}
        <div className="cap-toolbar">
          <label className="cap-graph-name-label" data-testid="rule-edit-graph-name-label">
            <span>Graph name</span>
            <input
              type="text"
              className="cap-graph-name-input"
              data-testid="rule-edit-graph-name-input"
              value={graphNameDraft}
              onChange={(e) => { setGraphNameDraft(e.target.value); }}
              onBlur={() => {
                if (graphNameDraft !== graphNameLocal) {
                  setGraphNameLocal(graphNameDraft)
                  setDirty(true)
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  if (graphNameDraft !== graphNameLocal) {
                    setGraphNameLocal(graphNameDraft)
                    setDirty(true)
                  }
                  ;(e.target as HTMLInputElement).blur()
                }
              }}
              placeholder="tornado-routing"
            />
          </label>
          <button data-testid="rule-edit-save" onClick={postGraph}>Save</button>
          {dirty && <span className="cap-editor-unsaved" data-testid="rule-edit-unsaved">Unsaved changes</span>}
          {sync.kind !== 'idle' && sync.kind !== 'loading' && (
            <span role="status" className={sync.kind === 'error' ? 'cap-editor-status-error' : 'cap-editor-status'} data-testid="rule-edit-status">
              {sync.message}
            </span>
          )}
        </div>

        {/* Canvas area */}
        <div style={{ flex: 1, position: 'relative', width: 600, height: 400 }} onKeyDown={handleKeyDown} tabIndex={0}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onConnect={onConnect}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onSelectionChange={onSelectionChange}
            onNodeDragStop={onNodeDragStop}
            fitView
            nodeTypes={nodeTypes}
            onlyRenderVisibleElements
            defaultEdgeOptions={{ animated: true }}
            snapToGrid
            snapGrid={[10, 10]}
            nodeOrigin={[0.5, 0]}
            onInit={(instance) => { reactFlowInstance.current = instance as ReactFlowInstance }}
          >
            <Background gap={16} />
            <MiniMap
              nodeColor={(node: Node) => (node.type === 'condition' ? 'var(--cap-node-condition-bg)' : 'var(--cap-node-action-bg)')}
            />
            <Controls />
          </ReactFlow>

          {/* Empty hint when canvas has no nodes */}
          {showEmptyHint && nodes.length === 0 && sync.kind !== 'loading' && (
            <div className="cap-empty-hint" data-testid="rule-edit-empty-hint">
              Start by adding nodes or load an existing graph
            </div>
          )}

          {/* Loading status */}
          {sync.kind === 'loading' && (
            <div role="status" className="cap-status-pill" data-testid="rule-edit-loading-status">
              {sync.message}
            </div>
          )}

          {/* Success status */}
          {sync.kind === 'ok' && (
            <div role="status" className="cap-editor-status" data-testid="rule-edit-ok-status">
              {sync.message}
            </div>
          )}

          {/* Rename panel */}
          {selectedNodeId && renameInput && (
            <div className="cap-rename-panel" data-testid="rule-edit-rename-panel">
              <span className="cap-rename-label">Rename:</span>
              <input
                type="text"
                className="cap-rename-input"
                data-testid="rule-edit-rename-input"
                value={renameInputDraft}
                onChange={(e) => setRenameInputDraft(e.target.value)}
                onBlur={applyRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    applyRename()
                  }
                }}
                autoFocus
              />
            </div>
          )}
        </div>

        {/* Footer with channel badges */}
        <div className="cap-footer">
          <div className="cap-footer-channels">
            <span>Channels:</span>
            {CHANNELS.map(c => <span key={c} className="cap-footer-channel-badge" data-testid={`rule-edit-channel-${c}`}>{c}</span>)}
          </div>
        </div>
      </div>
    </DirtyContext.Provider>
  )
}

export { AlertRuleEdit, graphToWire, graphFromWire }
