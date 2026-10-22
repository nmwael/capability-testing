import { BaseEdge, EdgeTypes } from '@xyflow/react'
import { getBezierPath } from '@xyflow/react'

export interface AlertEdgeData {
  'data-testid'?: string
  style?: React.CSSProperties
  sourceX?: number
  sourceY?: number
  targetX?: number
  targetY?: number
}

export function EdgeComponent(props: { data: AlertEdgeData; selected?: boolean; selectable?: boolean; deletable?: boolean; animated?: boolean; }) {
  const { data } = props
  const [edge] = getBezierPath({
    sourceX: data.sourceX || 0,
    sourceY: data.sourceY || 0,
    targetX: data.targetX || 0,
    targetY: data.targetY || 0,
  })

  return (
    <BaseEdge
      markerEnd="cap-arrow"
      data-testid="alert-flow-edge"
      path={edge}
      style={data.style}
    />
  )
}

export const edgeTypes = {
  alertFlowEdge: EdgeComponent,
} satisfies EdgeTypes
