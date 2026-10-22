import { createContext, useContext, useMemo, useState, useEffect, useRef, useCallback } from 'react'
import { ReactFlow, Background, Controls, MiniMap, useNodesState, useEdgesState, addEdge, useReactFlow, type Node, type Edge, type ReactFlowInstance, type NodeTypes, Handle, Position } from '@xyflow/react'
import { CapFieldCatalogue } from './CapFieldCatalogue'
import './CapFieldCatalogue.css'
import '@xyflow/react/dist/style.css'

const CHANNELS = ['sirens', 'broadcast', 'social']
// The CAP condition fields the designer offers, and each field's schema
// enumeration. A condition node names ONE field and ONE value from it.
import capCatalogue from './cap-fields.json'
const catalogue = capCatalogue as Record<string, { type: string; values?: string[] }>
const CAP_FIELDS = ['severity', 'urgency', 'certainty'] as const
type CapField = (typeof CAP_FIELDS)[number]
const CAP_FIELD_VALUES: Record<string, readonly string[]> = {
  severity: catalogue.severity?.values ?? ['Extreme', 'Severe', 'Moderate', 'Minor', 'Unknown'],
  urgency: catalogue.urgency?.values ?? ['Immediate', 'Expected', 'Future', 'Past', 'Unknown'],
  certainty: catalogue.certainty?.values ?? ['Observed', 'Likely', 'Possible', 'Unlikely', 'Unknown'],
}
// Full catalogue available for extension (issue #68)
export const CAP_CATALOGUE = catalogue

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

// Create a React context for dirty state management
const DirtyContext = createContext<{ setDirty: () => void } | null>(null)

function ConditionNodeComponent({ id, data }: { id: string; data: ConditionNodeData }) {
  const { setNodes } = useReactFlow()
  const context = useContext(DirtyContext)

  return (
    <div className="cap-node cap-node-condition" data-testid="condition-node">
      <Handle type="target" position={Position.Left} className="cap-handle" data-testid="handle-source" />
      <div className="cap-node-header">Condition</div>
      <div className="cap-node-row">
        <span>field: </span>
        <select
          aria-label="condition field" data-testid="field-dropdown"
          className="cap-node-select"
          value={data.field}
          onChange={(e) => {
            const nextField = e.target.value as CapField
            setNodes((nds) => nds.map((n) =>
              n.id === id ? { ...n, data: { ...n.data, field: nextField, value: CAP_FIELD_VALUES[nextField][0] } } : n))
            context?.setDirty()
          }}
        >
          {CAP_FIELDS.map(field => <option key={field} value={field}>{field}</option>)}
        </select>
      </div>
      <div className="cap-node-row">
        <span>value: </span>
        <select
          aria-label="condition value" data-testid="value-input"
          className="cap-node-select"
          value={data.value}
          onChange={(e) => {
            const nextValue = e.target.value
            setNodes((nds) => nds.map((n) =>
              n.id === id ? { ...n, data: { ...n.data, value: nextValue } } : n))
            context?.setDirty()
          }}
        >
          {(CAP_FIELD_VALUES[data.field as CapField] ?? []).map(value => <option key={value} value={value}>{value}</option>)}
        </select>
      </div>
      <Handle type="source" position={Position.Right} className="cap-handle" data-testid="handle-source" />
    </div>
  )
}

function ActionNodeComponent({ id, data }: { id: string; data: ActionNodeData }) {
  const { setNodes } = useReactFlow()
  const context = useContext(DirtyContext)

  const handleValueChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextChannel = e.target.value as ActionNodeData['channel']
    setNodes((nds) => nds.map((n) =>
      n.id === id ? { ...n, data: { ...n.data, channel: nextChannel } } : n))
    context?.setDirty()
  }

  return (
    <div className="cap-node cap-node-action" data-testid="action-node">
      <Handle type="target" position={Position.Left} className="cap-handle-action" data-testid="handle-target" />
      <div className="cap-node-header">Action</div>
      <div className="cap-node-row">
        <span>Channel: </span>
        <select
          value={data.channel}
          className="cap-node-select"
          onChange={handleValueChange}
        >
          {CHANNELS.map(ch => (
            <option key={ch} value={ch}>{ch}</option>
          ))}
        </select>
      </div>
    </div>
  )
}

// --- wire format -----------------------------------------------------------
// The JSON the rule design endpoint accepts (see RuleGraph.java). A condition
// node crosses as { id, kind, field, value }; an action node as
// { id, kind, channel }; an edge as { from, to }. React Flow's own
// source/target/position never leave the browser.

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
      const nodeData = (node.data ?? {}) as Record<string, string | undefined>
      return node.data?.kind === 'action'
        ? { id: node.id, kind: 'action', channel: nodeData.channel ?? '' }
        : { id: node.id, kind: 'condition', field: nodeData.field ?? '', value: nodeData.value ?? '' }
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

function AlertRuleDesigner({ endpoint = '/rules' }: { endpoint?: string } = {}) {
  const [nodes, setNodes, baseOnNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, baseOnEdgesChange] = useEdgesState<Edge>([])

  const onNodesChange = useCallback((changes: any[]) => {
    baseOnNodesChange(changes)
    // Only mark dirty for structural changes, not just position updates during drag
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
  // React Flow owns the canvas selection: clicking a node selects it there.
  // The designer's own Backspace handler works on selectedNodeId, so that
  // state mirrors the canvas selection - the last selected node wins and an
  // empty selection clears it.
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const reactFlowInstance = useRef<ReactFlowInstance | null>(null)
  const [history, setHistory] = useState<any[]>([])
  const [historyIndex, setHistoryIndex] = useState(0)
  const [dirty, setDirty] = useState(true)
  const onSelectionChange = useCallback(({ nodes: selected }: { nodes: Node[] }) => {
    setSelectedNodeId(selected.length > 0 ? selected[selected.length - 1].id : null)
  }, [])
  const [renameInput, setRenameInput] = useState<string | null>(null)
  const [renameInputDraft, setRenameInputDraft] = useState<string>('')
  const [showEmptyHint, setShowEmptyHint] = useState(true)
  const [graphNameLocal, setGraphNameLocal] = useState('tornado-routing')
  const [catalogueOpen, setCatalogueOpen] = useState(false)
  const [graphNameDraft, setGraphNameDraft] = useState('tornado-routing')
  const [isFirstRender, setIsFirstRender] = useState(true)
  // One status line carries every endpoint state: while a request is in
  // flight, after a successful save (the rule count comes back in the
  // message), after a rejection, and when the backend cannot be reached.
  const [sync, setSync] = useState<{ kind: 'idle' | 'loading' | 'ok' | 'error' | 'info'; message: string }>({ kind: 'idle', message: '' })

  const nodeTypes: NodeTypes = useMemo(() => ({
    condition: ConditionNodeComponent,
    action: ActionNodeComponent,
  }), [])

  // --- rule design endpoint ---------------------------------------------
  // Save and Generate Rules both post the drawn graph to POST /rules and
  // show the rule count the response reports back
  // (features/frontend/alert-rule-designer.feature:48-53 and
  // features/frontend/alert-rule-edit.feature:21-26). A rejection is shown
  // verbatim and the canvas is left untouched so the edit stays on it; an
  // unreachable backend keeps the graph editable.
  async function postGraph(): Promise<void> {
    setSync({ kind: 'loading', message: 'Saving graph...' })
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(graphToWire(graphNameLocal, nodes, edges)),
      })
      if (!res.ok) {
        // POST /rules answers 400 with SaveResult(ruleCount, problems)
        const body = await res.json().catch(() => ({ problems: [] as string[] }))
        const detail = Array.isArray(body?.problems) && body.problems.length > 0
          ? String(body.problems[0])
          : `the endpoint rejected the graph (HTTP ${res.status})`
        setSync({ kind: 'error', message: detail })
        return
      }
      const ok = await res.json().catch(() => ({ ruleCount: 0 }))
      const count = typeof ok?.ruleCount === 'number' ? ok.ruleCount : 0
      setDirty(false)
      setSync({ kind: 'ok', message: `Generated ${count} rules` })
    } catch {
      setSync({ kind: 'error', message: 'Could not reach the rule design endpoint. Your graph is still editable.' })
    }
  }

  // Reopening the designer fetches the graph stored under the graph name
  // (alert-rule-designer.feature:55-58). A slow endpoint must show a loading
  // state rather than an empty canvas (154-158) and an unreachable one must
  // leave the browser's own graph editable while reporting the failure
  // (160-164), so neither path ever touches the canvas.
  useEffect(() => {
    let cancelled = false
    async function load(): Promise<void> {
      setSync({ kind: 'loading', message: 'Loading graph...' })
      try {
        const res = await fetch(`${endpoint}/${encodeURIComponent(graphNameLocal)}`)
        if (cancelled) return
        if (!res.ok) {
          // GET /rules/{name} answers 404 with an empty body for a graph that
          // was never stored - that is not a failure to reach the backend, so
          // the default example stays up instead of raising an error.
          if (res.status === 404) {
            setSync({ kind: 'info', message: `No saved graph named ${graphNameLocal}. The default example is shown.` })
          } else {
            setSync({ kind: 'error', message: 'Could not reach the rule design endpoint. Your graph is still editable.' })
          }
          return
        }
        const wire = await res.json()
        if (cancelled) return
        if (!wire || !Array.isArray(wire.nodes) || !Array.isArray(wire.edges)) {
          setSync({ kind: 'info', message: `No saved graph named ${graphNameLocal}. The default example is shown.` })
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
          setSync({ kind: 'error', message: 'Could not reach the rule design endpoint. Your graph is still editable.' })
        }
      }
    }
    void load()
    return () => { cancelled = true }
    // Runs once when the designer opens: graphNameLocal is the name in effect
    // at that point, and renaming it must not re-fetch over the officer's work.
  }, [endpoint])

  // Memoized graph validity check with O(V+E) cycle detection
  const isGraphInvalid = useMemo(() => {
    // Check for unnamed nodes
    const hasUnnamed = nodes.some(n => !n.id)
    if (hasUnnamed) return true

    // Check for duplicate IDs
    const ids = new Set(nodes.map(n => n.id))
    const hasDuplicate = ids.size !== nodes.length
    if (hasDuplicate) return true

    // Check for orphans (action node with no incoming edge)
    const actionNodes = nodes.filter(n => n.data?.kind === 'action')
    const targets = new Set(edges.map(e => e.target))
    for (const action of actionNodes) {
      if (!targets.has(action.id)) return true
    }

    // Check for cycles using adjacency map (O(V+E))
    if (graphHasCycle(nodes, edges)) return true

    return false
  }, [nodes, edges])

  // Build adjacency map once per call
  function hasCycle(edges: Edge[], conn: { source: string; target: string }): boolean {
    const visited = new Set<string>()
    const queue: string[] = [conn.target]

    while (queue.length > 0) {
      const current = queue.shift()!
      if (current === conn.source) return true

      if (visited.has(current)) continue
      visited.add(current)

      const outgoing = edges.filter(e => e.source === current)
      for (const edge of outgoing) {
        queue.push(edge.target)
      }
    }

    return false
  }

  // Detect a cycle anywhere in the graph using DFS colouring (O(V+E))
  function graphHasCycle(graphNodes: Node[], graphEdges: Edge[]): boolean {
    const adjacency = new Map<string, string[]>()
    for (const e of graphEdges) {
      const list = adjacency.get(e.source)
      if (list) list.push(e.target)
      else adjacency.set(e.source, [e.target])
    }
    const visiting = new Set<string>()
    const done = new Set<string>()
    const visit = (id: string): boolean => {
      if (done.has(id)) return false
      if (visiting.has(id)) return true
      visiting.add(id)
      for (const next of adjacency.get(id) ?? []) {
        if (visit(next)) return true
      }
      visiting.delete(id)
      done.add(id)
      return false
    }
    return graphNodes.some(n => visit(n.id))
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    // Guard against input/textarea focus
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) {
      return
    }
    if (e.key === 'c' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault()
      addConditionNode()
      return
    }
    if (e.key === 'a' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault()
      addActionNode()
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

  function addConditionNode() {
    const nextId = `condition-${nodes.length + 1}`
    const newNode: Node = {
      id: nextId,
      position: { x: 100 + nodes.length * 50, y: nodes.length * 50 },
      type: 'condition',
      data: { kind: 'condition', field: 'severity', value: 'Moderate' },
      selected: true,
    }
    const nextNodes = [...nodes, newNode]
    setNodes(nextNodes)
    setDirty(true)
    pushToHistory(nextNodes, edges)
    setSelectedNodeId(nextId)
    setRenameInput(nextId)
    setRenameInputDraft(nextId)
    setShowEmptyHint(nodes.length > 0)
  }

  function addActionNode() {
    const nextId = `action-${nodes.length + 1}`
    const newNode: Node = {
      id: nextId,
      position: { x: 400 + nodes.length * 50, y: nodes.length * 50 },
      type: 'action',
      data: { kind: 'action', channel: 'sirens' },
      selected: true,
    }
    const nextNodes = [...nodes, newNode]
    setNodes(nextNodes)
    setDirty(true)
    pushToHistory(nextNodes, edges)
    setSelectedNodeId(nextId)
    setRenameInput(nextId)
    setRenameInputDraft(nextId)
    setShowEmptyHint(nodes.length > 0)
  }

  function onConnect(conn: { source: string; target: string }) {
    const wouldCreateCycle = hasCycle(edges, conn)
    if (wouldCreateCycle) {
      setDirty(true)
      return
    }
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

  function pushToHistory(nextNodes: Node[] = nodes, nextEdges: Edge[] = edges) {
    setHistory(prev => [...prev.slice(0, historyIndex + 1), { nodes: nextNodes, edges: nextEdges }])
    setHistoryIndex(historyIndex + 1)
  }

  function undo() {
    if (historyIndex > 0) {
      const snapshot = history[historyIndex - 1]
      setNodes(snapshot.nodes)
      setEdges(snapshot.edges)
      setHistoryIndex(historyIndex - 1)
    }
  }

  function redo() {
    if (historyIndex < history.length - 1) {
      const snapshot = history[historyIndex + 1]
      setNodes(snapshot.nodes)
      setEdges(snapshot.edges)
      setHistoryIndex(historyIndex + 1)
    }
  }

  function fitView() {
    try {
      reactFlowInstance.current?.fitView?.({ padding: 0.2 })
    } catch {
      // ignore
    }
  }

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

  // Create dirty context provider
  const DirtyContextValue = useMemo(() => ({ setDirty: () => setDirty(true) }), [setDirty])

  function handleBeforeUnload(e: BeforeUnloadEvent) {
    if (dirty) {
      e.preventDefault()
      e.returnValue = ''
    }
  }

  // Initialize default graph only when canvas is truly empty
  useEffect(() => {
    if (isFirstRender && nodes.length === 0) {
      // Create default condition node
      const conditionId = 'condition-1'
      setNodes(prevNodes => {
        const hasCondition = prevNodes.some(n => n.data?.kind === 'condition')
        if (!hasCondition) {
          const newNode: Node = {
            id: conditionId,
            position: { x: 100, y: 100 },
            type: 'condition',
            data: { kind: 'condition', field: 'severity', value: 'Extreme' },
          }
          setDirty(true)
          return [...prevNodes, newNode]
        }
        return prevNodes
      })

      // Create default action node
      const actionId = 'action-1'
      setNodes(prevNodes => {
        const hasAction = prevNodes.some(n => n.data?.kind === 'action')
        if (!hasAction) {
          const newNode: Node = {
            id: actionId,
            position: { x: 400, y: 100 },
            type: 'action',
            data: { kind: 'action', channel: 'sirens' },
          }
          setDirty(true)
          return [...prevNodes, newNode]
        }
        return prevNodes
      })

      // Connect condition to action
      setEdges(prevEdges => {
        const hasEdge = prevEdges.some(e => e.source === conditionId && e.target === actionId)
        if (!hasEdge) {
          setDirty(true)
          return [...prevEdges, {
            id: `edge-${conditionId}-${actionId}`,
            source: conditionId,
            target: actionId,
            animated: true,
          }]
        }
        return prevEdges
      })

      // Hide empty hint when default graph is present
      setShowEmptyHint(false)
    }
  }, [nodes.length, isFirstRender])

  // Seed the history with the initial graph so undo can restore it
  useEffect(() => {
    if (nodes.length > 0 && history.length === 0) {
      setHistory([{ nodes, edges }])
      setHistoryIndex(0)
    }
  }, [nodes.length, edges.length, history.length])

  // Mark as not first render after initialization
  useEffect(() => {
    if (!isFirstRender) {
      setIsFirstRender(false)
    }
  }, [isFirstRender])

  useEffect(() => {
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [handleBeforeUnload])

  return (
    <DirtyContext.Provider value={DirtyContextValue}>
      <div className="cap-designer">
        {/* Sticky toolbar at top of viewport */}
        <div className="cap-toolbar">
          <button data-testid="rule-designer-toggle-catalogue" onClick={() => setCatalogueOpen(!catalogueOpen)} disabled={catalogueOpen}>Toggle Catalogue</button>
          <button data-testid="rule-designer-undo" onClick={undo} disabled={historyIndex <= 0}>Undo</button>
          <button data-testid="rule-designer-redo" onClick={redo} disabled={historyIndex >= history.length - 1}>Redo</button>
          <button data-testid="rule-designer-fit-view" onClick={fitView}>Fit View</button>
          <button data-testid="save-button" onClick={() => { pushToHistory(); void postGraph(); }}>Save</button>
          <button data-testid="generate-rules-button" onClick={() => { pushToHistory(); void postGraph(); }} disabled={isGraphInvalid} title={isGraphInvalid ? 'Add a complete connected graph before generating' : 'Generate rules from the drawn graph'}>
            Generate Rules
          </button>

          {catalogueOpen && (
            <div className="cap-catalogue-panel">
              <CapFieldCatalogue catalogue={catalogue} />
            </div>
          )}

          <label className="cap-graph-name-label" data-testid="rule-designer-graph-name-label">
            <span>Graph name</span>
            <input
              type="text"
              className="cap-graph-name-input"
              data-testid="rule-designer-graph-name-input"
              value={graphNameDraft}
              onChange={(e) => { setGraphNameDraft(e.target.value); }}
              onBlur={() => {
                if (graphNameDraft !== graphNameLocal) {
                  setGraphNameLocal(graphNameDraft)
                  pushToHistory()
                  setDirty(true)
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  if (graphNameDraft !== graphNameLocal) {
                    setGraphNameLocal(graphNameDraft)
                    pushToHistory()
                    setDirty(true)
                  }
                  ;(e.target as HTMLInputElement).blur()
                }
              }}
              placeholder="tornado-routing"
            />
          </label>
        </div>

        <div className="cap-palette">
          <button data-testid="rule-designer-add-condition" onClick={() => { addConditionNode(); }}>Add Condition</button>
          <button data-testid="rule-designer-add-action" onClick={() => { addActionNode(); }}>Add Action</button>
        </div>

        <div className="cap-canvas" onKeyDown={handleKeyDown} tabIndex={0} data-testid="canvas">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onConnect={onConnect}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onSelectionChange={onSelectionChange}
            onNodeDragStop={onNodeDragStop}
            fitView
            deleteKeyCode={undefined}
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

          {showEmptyHint && nodes.length === 0 && sync.kind !== 'loading' && (
            <div className="cap-empty-hint" data-testid="rule-designer-empty-hint">
              Start by adding nodes from the palette above
            </div>
          )}

          {sync.kind === 'loading' && (
            <div role="status" className="cap-status-pill" data-testid="rule-designer-loading-status">
              {sync.message}
            </div>
          )}

          {!showEmptyHint && nodes.length > 0 && sync.kind !== 'loading' && (
            <div className="cap-graph-badge" data-testid="rule-count">
              <span style={{ fontWeight: 'bold' }}>default</span>
              <span>tornado</span>
              <span>routing</span>
            </div>
          )}

          {selectedNodeId && renameInput && (
            <div className="cap-rename-panel" data-testid="rule-designer-rename-panel">
              <span className="cap-rename-label">Rename:</span>
              <input
                type="text"
                className="cap-rename-input"
                data-testid="rename-input"
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

        <div className="cap-footer">
          {dirty && <span className="cap-footer-unsaved" data-testid="unsaved-changes">Unsaved changes</span>}

          {sync.kind !== 'idle' && sync.kind !== 'loading' && (
            <span role="status" className={sync.kind === 'error' ? 'cap-footer-status-error' : 'cap-footer-status'} data-testid="rule-designer-status">
              {sync.message}
            </span>
          )}

          <div className="cap-footer-channels">
            <span>Channels:</span>
            {CHANNELS.map(c => <span key={c} className="cap-footer-channel-badge" data-testid={`rule-designer-channel-${c}`}>{c}</span>)}
          </div>
        </div>
      </div>
    </DirtyContext.Provider>
  )
}

export { AlertRuleDesigner, graphToWire, graphFromWire }