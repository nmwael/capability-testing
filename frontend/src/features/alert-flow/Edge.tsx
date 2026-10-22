import { BaseEdge, getBezierPath } from '@xyflow/react'
import type { Position } from '@xyflow/react'

export interface AlertEdgeData {
  'data-testid'?: string
  style?: React.CSSProperties
}

export function EdgeComponent(props: {
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
  sourcePosition?: Position
  targetPosition?: Position
  data?: AlertEdgeData
}) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition = 'right' as Position, targetPosition = 'left' as Position, data } = props
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  return (
    <BaseEdge
      path={edgePath}
      markerEnd={data?.markerEnd ?? 'cap-arrow'}
      data-testid="alert-flow-edge"
      data-testid="connection"
      style={data?.style}
    />
  )
}

export const edgeTypes = {} satisfies EdgeTypes
