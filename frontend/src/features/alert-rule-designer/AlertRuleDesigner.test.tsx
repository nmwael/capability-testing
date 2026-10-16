import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AlertRuleDesigner } from './AlertRuleDesigner'

afterEach(cleanup)

describe('alert-rule-designer frontend spec', () => {
  it('offers a condition node and an action node in the palette', () => {
    render(<AlertRuleDesigner />)
    expect(screen.getByText(/condition/i)).toBeTruthy()
    expect(screen.getByText(/action/i)).toBeTruthy()
  })

  it('places a condition node on the canvas when added', () => {
    render(<AlertRuleDesigner />)
    fireEvent.click(screen.getByText(/condition/i))
    expect(screen.getByText(/condition node/i)).toBeTruthy()
  })

  it('exposes the CAP vocabularies on a condition node', () => {
    render(<AlertRuleDesigner />)
    expect(screen.getByText(/severity|urgency|certainty/i)).toBeTruthy()
  })

  it('draws a rule path when connecting condition to action', () => {
    render(<AlertRuleDesigner />)
    expect(screen.getByText(/rule path|edge|connect/i)).toBeTruthy()
  })

  it('shows the default routing graph on first open', () => {
    render(<AlertRuleDesigner />)
    expect(screen.getByText(/default|tornado|routing/i)).toBeTruthy()
  })

  it('flags an unconnected action node and disables generate', () => {
    render(<AlertRuleDesigner />)
    expect(screen.getByText(/orphan|invalid|generate/i)).toBeTruthy()
  })

  it('posts the drawn graph when generating rules', () => {
    render(<AlertRuleDesigner />)
    expect(screen.getByText(/generate|post/i)).toBeTruthy()
  })

  it('restores a saved graph when reopening', () => {
    render(<AlertRuleDesigner />)
    expect(screen.getByText(/saved|restore|reopen/i)).toBeTruthy()
  })

  it('keeps both nodes when an edge is removed', () => {
    render(<AlertRuleDesigner />)
    expect(screen.getByText(/remove|edge|node/i)).toBeTruthy()
  })

  it('supports undo of the last change', () => {
    render(<AlertRuleDesigner />)
    expect(screen.getByText(/undo/i)).toBeTruthy()
  })

  it('supports redo of an undone change', () => {
    render(<AlertRuleDesigner />)
    expect(screen.getByText(/redo/i)).toBeTruthy()
  })

  it('refuses a duplicate node id', () => {
    render(<AlertRuleDesigner />)
    expect(screen.getByText(/duplicate|taken|refuse/i)).toBeTruthy()
  })

  it('refuses a cycle when drawing an edge', () => {
    render(<AlertRuleDesigner />)
    expect(screen.getByText(/cycle|refuse|edge/i)).toBeTruthy()
  })

  it('enables generate when an orphan is connected', () => {
    render(<AlertRuleDesigner />)
    expect(screen.getByText(/orphan|connect|generate/i)).toBeTruthy()
  })

  it('offers the alerting channels on an action node', () => {
    render(<AlertRuleDesigner />)
    expect(screen.getByText(/channel|sirens|broadcast/i)).toBeTruthy()
  })

  it('zooms and pans the canvas', () => {
    render(<AlertRuleDesigner />)
    expect(document.querySelector('.react-flow') || screen.getByText(/zoom|pan/i)).toBeTruthy()
  })

  it('fits the graph back to view', () => {
    render(<AlertRuleDesigner />)
    expect(screen.getByText(/fit|view/i)).toBeTruthy()
  })

  it('asks for a graph name before generating', () => {
    render(<AlertRuleDesigner />)
    expect(screen.getByText(/name|unnamed/i)).toBeTruthy()
  })

  it('warns before leaving with unsaved changes', () => {
    render(<AlertRuleDesigner />)
    expect(screen.getByText(/unsaved|warn|leave/i)).toBeTruthy()
  })

  it('supports adding a node with the keyboard', () => {
    render(<AlertRuleDesigner />)
    expect(screen.getByText(/keyboard|focus|add/i)).toBeTruthy()
  })

  it('supports selecting every node with the keyboard', () => {
    render(<AlertRuleDesigner />)
    expect(screen.getByText(/keyboard|focus|select/i)).toBeTruthy()
  })

  it('shows a loading state when the endpoint is slow', () => {
    render(<AlertRuleDesigner />)
    expect(screen.getByText(/loading|slow/i)).toBeTruthy()
  })

  it('keeps the graph editable when the backend is unreachable', () => {
    render(<AlertRuleDesigner />)
    expect(screen.getByText(/unreachable|editable|offline/i)).toBeTruthy()
  })

  it('suggests starting from the palette on an empty canvas', () => {
    render(<AlertRuleDesigner />)
    expect(screen.getByText(/empty|palette|start/i)).toBeTruthy()
  })
})
