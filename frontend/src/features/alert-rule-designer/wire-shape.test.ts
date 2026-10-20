import { describe, expect, it } from 'vitest'
import type { Edge, Node } from '@xyflow/react'
import { graphFromWire, graphToWire } from './AlertRuleDesigner'

// The graph is the wire format between the designer and the rule design
// endpoint. features/frontend/alert-rule-edit.feature pins its shape: a name,
// a node list and an edge list; a condition node has kind/field/value; an
// action node has kind/channel; an edge has from/to.

const nodes = [
  { id: 'severe', type: 'condition', position: { x: 0, y: 0 }, data: { kind: 'condition', field: 'severity', value: 'Severe' } },
  { id: 'broadcast', type: 'action', position: { x: 300, y: 0 }, data: { kind: 'action', channel: 'broadcast' } },
] as unknown as Node[]

const edges = [{ id: 'edge-severe-broadcast', source: 'severe', target: 'broadcast' }] as Edge[]

describe('rule graph wire shape', () => {
  it('carries a name, a node list and an edge list', () => {
    const wire = graphToWire('tornado-routing', nodes, edges)
    expect(wire.name).toBe('tornado-routing')
    expect(wire.nodes).toHaveLength(2)
    expect(wire.edges).toHaveLength(1)
  })

  it('writes a condition node as kind, field and value', () => {
    const wire = graphToWire('g', nodes, edges)
    expect(wire.nodes[0]).toEqual({ id: 'severe', kind: 'condition', field: 'severity', value: 'Severe' })
  })

  it('writes an action node as kind and channel', () => {
    const wire = graphToWire('g', nodes, edges)
    expect(wire.nodes[1]).toEqual({ id: 'broadcast', kind: 'action', channel: 'broadcast' })
  })

  it('writes an edge as from and to, never source or target', () => {
    const wire = graphToWire('g', nodes, edges)
    expect(wire.edges[0]).toEqual({ from: 'severe', to: 'broadcast' })
    expect(Object.keys(wire.edges[0])).not.toContain('source')
    expect(Object.keys(wire.edges[0])).not.toContain('target')
  })

  it('never leaks React Flow layout onto the wire', () => {
    const wire = graphToWire('g', nodes, edges)
    for (const node of wire.nodes) expect(Object.keys(node)).not.toContain('position')
  })

  it('reads a wire graph back without losing a condition field or value', () => {
    const back = graphFromWire(graphToWire('g', nodes, edges))
    expect(back.nodes.find(node => node.id === 'severe')?.data).toMatchObject({ kind: 'condition', field: 'severity', value: 'Severe' })
    expect(back.edges[0]).toMatchObject({ source: 'severe', target: 'broadcast' })
  })
})
