import { useEffect, useRef, useState, useMemo } from 'react'
import { ReactFlow, Controls, useNodesState, useEdgesState, addEdge, type Node, type Edge, type Connection, type NodeTypes, type EdgeTypes } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import './alert-flow-controls.css'
import { EdgeComponent } from './Edge'
import { AlertNodeComponent } from './AlertNode'

interface ChannelNodeData {
  reached: boolean
  label: string
}

function ChannelNodeComponent({ data }: { data: ChannelNodeData }) {
  return (
    <div className="cap-node cap-node-channel" data-testid="alert-flow-channel-node" style={{ background: data.reached ? 'var(--cap-badge-reached)' : 'var(--cap-badge-unreached)', padding: 8, borderRadius: 4 }}>
      <div style={{ padding: '4px 8px', textAlign: 'center', fontWeight: 'bold' }}>{data.label}</div>
    </div>
  )
}

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

export function AlertFlow({ alertId = 'ALERT-001', endpoint = '/alerts' }: AlertFlowProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [status, setStatus] = useState<'loading' | 'ok' | 'error' | 'notfound'>('loading')
  const [error, setError] = useState('')
  const [networkError, setNetworkError] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        if (alertId === undefined || endpoint === undefined) {
          if (!cancelled) { setStatus('error'); setError('Missing required parameters'); return }
          return
        }
        const res = await fetch(`${endpoint}/${alertId}/distribution`)
        if (res.status === 404) { if (!cancelled) setStatus('notfound'); return }
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data: RoutingDecision = await res.json()
        if (cancelled) return
        const alertNodeData: Record<string, unknown> = {
          label: `${data.severity} / ${data.urgency}`,
          style: {
            background: data.severity === 'Extreme' ? 'var(--cap-badge-extreme)' : data.severity === 'Minor' ? 'var(--cap-badge-minor)' : 'var(--cap-badge-default)',
            padding: 8,
            borderRadius: 4,
          },
        }
        const alertNode: Node = { id: 'alert', type: 'alert', position: { x: 0, y: 0 }, data: alertNodeData, connectable: true }
        const chNodes: Node[] = data.channels.map((ch, i) => ({ id: ch.label, position: { x: 200, y: i * 80 }, data: { label: ch.label, reached: ch.reached }, type: 'channel' }))
        const chEdges: Edge[] = data.channels.map(ch => ({ id: `e-alert-${ch.label}`, source: 'alert', target: ch.label, data: { 'data-testid': 'alert-flow-edge' } }))
        setNodes([alertNode, ...chNodes])
        setEdges(chEdges)
        setStatus('ok')
      } catch (e) {
        if (!cancelled) {
          if (e instanceof TypeError) {
            setNetworkError(true)
            setStatus('error')
            setError('Network error: unable to fetch alert data')
          } else {
            setError(String(e))
            setStatus('error')
          }
        }
      }
    }
    load()
    return () => { cancelled = true }
  }, [alertId, endpoint])

  function onConnect(conn: Connection) {
    setEdges(eds => addEdge(conn, eds))
  }

  const nodeTypes: NodeTypes = useMemo(() => ({ channel: ChannelNodeComponent, alert: AlertNodeComponent }), [])
  const edgeTypes: EdgeTypes = useMemo(() => ({ alertFlowEdge: EdgeComponent }), [])

  return (
    <div ref={containerRef} data-testid="alert-flow-container" style={{
      width: '100%',
      minWidth: 600,
      height: 400,
    }}>
      <h2 data-testid="alert-flow-title">Alert flow</h2>
      {status === 'loading' && <div data-testid="alert-flow-loading">Loading…</div>}
      {status === 'notfound' && <div data-testid="alert-flow-notfound">Alert {alertId} not found.</div>}
      {networkError && (
        <div data-testid="alert-flow-network-error">Network error: unable to connect to endpoint</div>
      )}
      {status === 'error' && !networkError && (
        <div data-testid="alert-flow-error">Failed to load: {error}</div>
      )}
      {(status === 'error' || networkError) && (
        <button data-testid="alert-flow-retry" onClick={() => { setStatus('loading'); setError(''); setNetworkError(false) }}>Retry</button>
      )}
      <ReactFlow data-testid="alert-flow-canvas" nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} fitView nodeTypes={nodeTypes} edgeTypes={edgeTypes}>
        <Controls data-testid="alert-flow-controls" />
      </ReactFlow>
    </div>
  )
}
