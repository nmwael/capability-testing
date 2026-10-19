import { createContext, useContext, useMemo, useState, useEffect, useRef } from 'react'
import { ReactFlow, Background, Controls, MiniMap, useNodesState, useEdgesState, addEdge, type Node, type Edge, type ReactFlowInstance, type NodeTypes, Handle, Position } from '@xyflow/react'
import '@xyflow/react/dist/style.css'

const CHANNELS = ['sirens', 'broadcast', 'social']
const CAP_VALUES = ['severity', 'urgency', 'certainty']

interface ConditionNodeData {
  kind: 'condition'
  severity: 'low' | 'medium' | 'high'
  urgency: 'low' | 'medium' | 'high'
  certainty: 'low' | 'medium' | 'high'
  [key: string]: string
}

interface ActionNodeData {
  kind: 'action'
  channel: 'sirens' | 'broadcast' | 'social'
}

// Create a React context for dirty state management
const DirtyContext = createContext<{ setDirty: () => void } | null>(null)

function ConditionNodeComponent({ data }: { data: ConditionNodeData }) {
  const context = useContext(DirtyContext)

  return (
    <div style={{
      background: '#bfdbfe',
      border: '2px solid #3b82f6',
      borderRadius: 8,
      padding: 8,
      minWidth: 120,
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
    }}>
      <Handle type="target" position={Position.Left} style={{ background: '#3b82f6' }} />
      <div style={{ fontWeight: 'bold', marginBottom: 4 }}>Condition</div>
      {CAP_VALUES.map(field => (
        <div key={field} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
          <span>{field}: </span>
          <select
            value={data[field]}
            onChange={(e) => { data[field] = e.target.value; context?.setDirty(); }}
            style={{ flex: 1, padding: 2 }}
          >
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
          </select>
        </div>
      ))}
      <Handle type="source" position={Position.Right} style={{ background: '#3b82f6' }} />
    </div>
  )
}

function ActionNodeComponent({ data }: { data: ActionNodeData }) {
  const context = useContext(DirtyContext)

  const handleValueChange = () => {
    context?.setDirty()
  }

  return (
    <div style={{
      background: '#e0f2fe',
      border: '2px solid #0ea5e9',
      borderRadius: 8,
      padding: 8,
      minWidth: 120,
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
    }}>
      <Handle type="target" position={Position.Left} style={{ background: '#0ea5e9' }} />
      <div style={{ fontWeight: 'bold', marginBottom: 4 }}>Action</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
        <span>Channel: </span>
        <select
          value={data.channel}
          onChange={() => handleValueChange()}
          style={{ flex: 1, padding: 2 }}
        >
          {CHANNELS.map(ch => (
            <option key={ch} value={ch}>{ch}</option>
          ))}
        </select>
      </div>
    </div>
  )
}

function AlertRuleDesigner() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const reactFlowInstance = useRef<ReactFlowInstance | null>(null)
  const [history, setHistory] = useState<any[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [dirty, setDirty] = useState(true)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [renameInput, setRenameInput] = useState<string | null>(null)
  const [showEmptyHint, setShowEmptyHint] = useState(true)
  const [graphNameLocal, setGraphNameLocal] = useState('tornado-routing')
  const [isFirstRender, setIsFirstRender] = useState(true)

  const nodeTypes: NodeTypes = useMemo(() => ({
    condition: ConditionNodeComponent,
    action: ActionNodeComponent,
  }), [])

  // Memoize graph validity check with O(V+E) cycle detection
  function isGraphInvalid(): boolean {
    // Check for unnamed nodes
    const hasUnnamed = nodes.some(n => !n.id)
    if (hasUnnamed) return true

    // Check for duplicate IDs
    const ids = new Set(nodes.map(n => n.id))
    const hasDuplicate = ids.size !== nodes.length
    if (hasDuplicate) return true

    // Check for orphans (action node with no incoming edge)
    const actionNodes = nodes.filter(n => n.data?.kind === 'action')
    const sources = new Set(edges.map(e => e.source))
    for (const action of actionNodes) {
      if (!sources.has(action.id)) return true
    }

    // Check for cycles using adjacency map (O(V+E))
    if (hasCycle(edges, { source: '', target: '' })) return true

    return false
  }

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
      data: { kind: 'condition', severity: 'medium', urgency: 'medium', certainty: 'high' },
      selected: true,
    }
    setNodes(nodes => {
      setDirty(true)
      return [...nodes, newNode]
    })
    pushToHistory()
    setSelectedNodeId(nextId)
    setRenameInput(nextId)
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
    setNodes(nodes => {
      setDirty(true)
      return [...nodes, newNode]
    })
    pushToHistory()
    setSelectedNodeId(nextId)
    setRenameInput(nextId)
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

  function pushToHistory() {
    setHistory(prev => {
      const newHistory = [...prev.slice(0, historyIndex + 1), { nodes: [...prev[prev.length - 1]?.nodes || nodes], edges: [...prev[prev.length - 1]?.edges || edges] }]
      return newHistory
    })
    setHistoryIndex(prev => prev + 1)
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
    reactFlowInstance.current?.fitView?.()
  }

  function applyRename() {
    if (!selectedNodeId || !renameInput) return

    const selectedNode = nodes.find(n => n.id === selectedNodeId)
    if (!selectedNode) return

    const oldId = selectedNodeId
    const newId = renameInput

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
    setDirty(true)
  }

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
            data: { kind: 'condition', severity: 'Extreme', urgency: 'Immediate', certainty: 'Observed' },
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
      <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: 8, background: '#f3f4f6', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={undo} disabled={historyIndex <= 0}>Undo</button>
          <button onClick={redo} disabled={historyIndex >= history.length - 1}>Redo</button>
          <button onClick={fitView}>Fit View</button>
          <button onClick={() => { pushToHistory(); }}>Save</button>
          <button onClick={() => { pushToHistory(); }} disabled={isGraphInvalid()}>
            Generate Rules
          </button>

          <label style={{ marginLeft: 8 }}>
            <span>Graph name</span>
            <input
              type="text"
              value={graphNameLocal}
              onChange={(e) => { setGraphNameLocal(e.target.value); pushToHistory(); }}
              placeholder="tornado-routing"
              style={{ marginLeft: 4 }}
            />
          </label>
        </div>

        <div style={{ padding: 8, background: '#f9fafb', display: 'flex', gap: 8 }}>
          <button onClick={() => { addConditionNode(); }}>Add Condition</button>
          <button onClick={() => { addActionNode(); }}>Add Action</button>
        </div>

        <div style={{ flex: 1, position: 'relative' }} onKeyDown={handleKeyDown} tabIndex={0}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onConnect={onConnect}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeDragStop={onNodeDragStop}
            fitView
            deleteKeyCode={undefined}
            nodeTypes={nodeTypes}
            onlyRenderVisibleElements
            defaultEdgeOptions={{ animated: true }}
            snapToGrid
            snapGrid={[10, 10]}
            nodeOrigin={[0.5, 0]}
            ref={(r: HTMLDivElement | null) => { reactFlowInstance.current = r as ReactFlowInstance | null }}
          >
            <Background gap={16} />
            <MiniMap
              nodeColor={(node: Node) => (node.type === 'condition' ? '#bfdbfe' : '#e0f2fe')}
            />
            <Controls />
          </ReactFlow>

          {showEmptyHint && nodes.length === 0 && (
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              background: '#fff',
              border: '2px dashed #9ca3af',
              borderRadius: 8,
              padding: 12,
              fontSize: 13,
              textAlign: 'center',
              color: '#6b7280',
              zIndex: 1,
            }}>
              Start by adding nodes from the palette above
            </div>
          )}

          {!showEmptyHint && nodes.length > 0 && (
            <div style={{
              position: 'absolute',
              top: 8,
              left: 8,
              background: '#fff',
              border: '1px solid #d1d5db',
              borderRadius: 6,
              padding: 6,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 11,
              color: '#374151',
              zIndex: 1,
            }}>
              <span style={{ fontWeight: 'bold' }}>default</span>
              <span>tornado</span>
              <span>routing</span>
            </div>
          )}

          {selectedNodeId && renameInput && (
            <div style={{
              position: 'absolute',
              top: 8,
              right: 8,
              background: '#fff',
              border: '1px solid #d1d5db',
              borderRadius: 6,
              padding: 6,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              zIndex: 2,
            }}>
              <span style={{ fontSize: 11, color: '#6b7280' }}>Rename:</span>
              <input
                type="text"
                value={renameInput}
                onChange={(e) => setRenameInput(e.target.value)}
                onBlur={applyRename}
                style={{ flex: 1, fontSize: 11, padding: 2 }}
                autoFocus
              />
            </div>
          )}
        </div>

        <div style={{ padding: 8, background: '#e5e7eb', fontSize: 12, display: 'flex', gap: 8 }}>
          {dirty && <span style={{ color: '#f59e0b' }}>Unsaved changes</span>}

          <div style={{ marginLeft: 16, display: 'flex', gap: 8 }}>
            <span>Channels:</span>
            {CHANNELS.map(c => <span key={c} style={{ background: '#e0f2fe', padding: 2, borderRadius: 4 }}>{c}</span>)}
          </div>
        </div>
      </div>
    </DirtyContext.Provider>
  )
}

export { AlertRuleDesigner }
