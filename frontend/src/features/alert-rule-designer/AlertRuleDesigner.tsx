import { useEffect, useRef, useState } from 'react'
import { ReactFlow, Background, Controls, useNodesState, useEdgesState, addEdge, type Node, type Edge, type ReactFlowInstance } from '@xyflow/react'
import '@xyflow/react/dist/style.css'

const CHANNELS = ['sirens', 'broadcast', 'social']
const CAP_VALUES = ['severity', 'urgency', 'certainty']

interface AlertRuleDesignerProps {
  endpoint?: string
  graphName?: string
}

export function AlertRuleDesigner({ graphName = 'tornado-routing' }: AlertRuleDesignerProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const reactFlowInstance = useRef<ReactFlowInstance | null>(null)
  const [history, setHistory] = useState<any[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [dirty, setDirty] = useState(false)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [renameInput, setRenameInput] = useState<string | null>(null)
  const [showEmptyHint, setShowEmptyHint] = useState(true)

  // Check if graph is invalid (orphan, duplicate, cycle, unnamed)
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

    // Check for cycles using BFS
    const conn = { source: '', target: '' }
    if (hasCycle(edges, conn)) return true

    return false
  }

  // Keyboard handler for canvas
  function handleKeyDown(e: React.KeyboardEvent) {
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

  function hasCycle(edges: Edge[], conn: { source: string; target: string }): boolean {
    const target = conn.target
    const source = conn.source
    const visited = new Set<string>()
    const queue: string[] = [target]

    while (queue.length > 0) {
      const current = queue.shift()!
      if (current === source) return true

      if (visited.has(current)) continue
      visited.add(current)

      const outgoing = edges.filter(e => e.source === current)
      for (const edge of outgoing) {
        queue.push(edge.target)
      }
    }

    return false
  }

  function pushToHistory() {
    setHistory(prev => {
      const newHistory = [...prev.slice(0, historyIndex + 1), [{ nodes, edges }]]
      return newHistory
    })
    setHistoryIndex(prev => prev + 1)
    setDirty(true)
  }

  function undo() {
    if (historyIndex > 0) {
      const snapshot = history[historyIndex - 1]
      setNodes(snapshot[0].nodes)
      setEdges(snapshot[0].edges)
      setHistoryIndex(historyIndex - 1)
      setDirty(true)
    }
  }

  function redo() {
    if (historyIndex < history.length - 1) {
      const snapshot = history[historyIndex + 1]
      setNodes(snapshot[0].nodes)
      setEdges(snapshot[0].edges)
      setHistoryIndex(historyIndex + 1)
      setDirty(true)
    }
  }

  function fitView() {
    reactFlowInstance.current?.fitView?.()
  }

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [dirty])

  useEffect(() => {
    setDirty(true)
  }, [nodes, edges])

  useEffect(() => {
    if (!onNodesChange) return
    setNodes(nodes => nodes)
  }, [nodes])

  useEffect(() => {
    if (!onEdgesChange) return
    setEdges(edges => edges)
  }, [edges])

  const nodeTypes: Record<string, React.FC<any>> = {
    condition: ConditionNode,
    action: ActionNode,
  }

  function ConditionNode({ data }: { data: any }) {
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
        <div style={{ fontWeight: 'bold', marginBottom: 4 }}>Condition</div>
        {CAP_VALUES.map(field => (
          <div key={field} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
            <span>{field}: </span>
            <select
              value={data[field]}
              onChange={(e) => {
                setNodes(nodes => nodes.map(n => {
                  if (n.id !== data.id) return n
                  if (data.kind !== 'condition') return n
                  const next = { ...n.data }
                  next[field] = e.target.value
                  return { ...n, data: next }
                }))
                setDirty(true)
              }}
              style={{ flex: 1, padding: 2 }}
            >
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
            </select>
          </div>
        ))}
      </div>
    )
  }

  function ActionNode({ data }: { data: any }) {
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
        <div style={{ fontWeight: 'bold', marginBottom: 4 }}>Action</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
          <span>Channel: </span>
          <select
            value={data.channel}
            onChange={(e) => {
              setNodes(nodes => nodes.map(n => {
                if (n.id !== data.id) return n
                if (data.kind !== 'action') return n
                const next = { ...n.data }
                next.channel = e.target.value
                return { ...n, data: next }
              }))
              setDirty(true)
            }}
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

  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: 8, background: '#f3f4f6', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={undo} disabled={historyIndex <= 0}>Undo</button>
        <button onClick={redo} disabled={historyIndex >= history.length - 1}>Redo</button>
        <button onClick={fitView}>Fit View</button>
        <button onClick={() => { pushToHistory(); setDirty(true); }}>Save</button>
        <button onClick={() => { pushToHistory(); setDirty(true); }} disabled={isGraphInvalid()}>
          Generate Rules
        </button>

        <label style={{ marginLeft: 8 }}>
          <span>Graph name</span>
          <input
            type="text"
            value={graphName}
            onChange={() => { pushToHistory(); setDirty(true); }}
            placeholder="tornado-routing"
            style={{ marginLeft: 4 }}
          />
        </label>
      </div>

      <div style={{ padding: 8, background: '#f9fafb', display: 'flex', gap: 8 }}>
        <button onClick={() => { addConditionNode(); pushToHistory(); setDirty(true); }}>Add Condition</button>
        <button onClick={() => { addActionNode(); pushToHistory(); setDirty(true); }}>Add Action</button>
      </div>

      <div style={{ flex: 1, position: 'relative' }} onKeyDown={handleKeyDown} tabIndex={0}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onConnect={onConnect}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          fitView
          deleteKeyCode="Backspace"
          nodeTypes={nodeTypes}
          ref={(r: HTMLDivElement | null) => { reactFlowInstance.current = r as ReactFlowInstance | null }}
        >
          <Background gap={16} />
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
              onBlur={() => { setRenameInput(null); setSelectedNodeId(null); setDirty(true); }}
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
  )
}
