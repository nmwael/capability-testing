import { useEffect, useRef, useState } from 'react'
import { ReactFlow, Background, Controls, useNodesState, useEdgesState, addEdge, type Node, type Edge, type Connection } from '@xyflow/react'
import '@xyflow/react/dist/style.css'

export interface RoutingDecision {
  channels: Array<{ label: string; reached: boolean }>
  severity: string
  urgency: string
  rule: string
}

interface AlertFlowProps {
  alertId?: string
  endpoint?: string
}

export function AlertFlow({ alertId = 'ALERT-001', endpoint = 'http://localhost:8080/alerts' }: AlertFlowProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [status, setStatus] = useState<'loading' | 'ok' | 'error' | 'notfound'>('loading')
  const [error, setError] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(`${endpoint}/${alertId}/distribution`)
        if (res.status === 404) { if (!cancelled) setStatus('notfound'); return }
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data: RoutingDecision = await res.json()
        if (cancelled) return
        const alertNode: Node = { id: 'alert', position: { x: 0, y: 0 }, data: { label: `${data.severity} / ${data.urgency}` }, style: { background: data.severity === 'Extreme' ? '#fca5a5' : data.severity === 'Minor' ? '#fde68a' : '#bfdbfe', padding: 8, borderRadius: 4 } }
        const chNodes: Node[] = data.channels.map((ch, i) => ({ id: ch.label, position: { x: 200, y: i * 80 }, data: { label: ch.label }, style: { background: ch.reached ? '#86efac' : '#e5e7eb', padding: 8, borderRadius: 4 } }))
        const chEdges: Edge[] = data.channels.map(ch => ({ id: `e-alert-${ch.label}`, source: 'alert', target: ch.label }))
        setNodes([alertNode, ...chNodes])
        setEdges(chEdges)
        setStatus('ok')
      } catch (e) {
        if (!cancelled) { setError(String(e)); setStatus('error') }
      }
    }
    load()
    return () => { cancelled = true }
  }, [alertId, endpoint])

  function onConnect(conn: Connection) {
    setEdges(eds => addEdge(conn, eds))
  }

  return (
    <div ref={containerRef} style={{ width: '100%', height: 400 }}>
      <h2>Alert flow</h2>
      {status === 'loading' && <div>Loading…</div>}
      {status === 'notfound' && <div>Alert {alertId} not found.</div>}
      {status === 'error' && (
        <div>Failed to load: {error}</div>
      )}
      {status === 'error' && (
        <button onClick={() => { setStatus('loading'); setError('') }}>Retry</button>
      )}
      <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} fitView>
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  )
}
