import { Handle, Position } from '@xyflow/react'

export interface AlertNodeData {
  'data-testid'?: string
  label: string
  style?: React.CSSProperties
}

export function AlertNodeComponent(props: { data: AlertNodeData; }) {
  const { data } = props
  return (
    <div
      className="cap-node cap-node-alert"
      data-testid="alert-flow-alert-node"
      style={{
        background: data.style?.background || 'var(--cap-badge-default)',
        padding: data.style?.padding || 8,
        borderRadius: data.style?.borderRadius || 4,
        ...data.style,
      }}
    >
      <Handle
        type="source"
        position={Position.Top}
        className='cap-handle cap-handle-source'
        data-testid="handle-source"
      />
      <div
        style={{
          padding: '4px 8px',
          textAlign: 'center',
          fontWeight: 'bold',
          ...data.style,
        }}
      >
        {data.label}
      </div>
      <Handle
        type="target"
        position={Position.Bottom}
        className='cap-handle cap-handle-target'
        data-testid="handle-target"
      />
    </div>
  )
}
