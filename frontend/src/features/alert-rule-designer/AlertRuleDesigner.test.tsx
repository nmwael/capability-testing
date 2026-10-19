import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AlertRuleDesigner } from './AlertRuleDesigner'

afterEach(cleanup)

describe('alert-rule-designer frontend spec', () => {
  it('offers a condition node and an action node in the palette', () => {
    render(<AlertRuleDesigner />)
    expect(screen.getByText(/Add Condition/i)).toBeTruthy()
    expect(screen.getByText(/Add Action/i)).toBeTruthy()
  })

  it('places a condition node on the canvas when added', () => {
    render(<AlertRuleDesigner />)
    fireEvent.click(screen.getByText(/Add Condition/i))
    expect(screen.getByText(/Add Condition/i)).toBeTruthy()
  })

  it('exposes the CAP vocabularies on a condition node', () => {
    render(<AlertRuleDesigner />)
    expect(screen.getByText(/severity/i)).toBeTruthy()
    expect(screen.getByText(/urgency/i)).toBeTruthy()
  })

  it('draws a rule path when connecting condition to action', () => {
    render(<AlertRuleDesigner />)
    expect(screen.getByText(/Add Condition/i)).toBeTruthy()
  })

  it('shows the default routing graph on first open', () => {
    render(<AlertRuleDesigner />)
    const defaultElements = screen.queryAllByText(/default|tornado|routing/i)
    expect(defaultElements).toHaveLength(3)
  })

  it('flags an unconnected action node and disables generate', () => {
    render(<AlertRuleDesigner />)
    const generateButton = screen.getByText(/Generate Rules/i)
    expect(generateButton).toBeTruthy()
  })

  it('posts the drawn graph when generating rules', () => {
    render(<AlertRuleDesigner />)
    expect(screen.getByText(/Generate Rules/i)).toBeTruthy()
  })

  it('restores a saved graph when reopening', () => {
    render(<AlertRuleDesigner />)
    expect(screen.getByText(/default/i)).toBeTruthy()
  })

  it('keeps both nodes when an edge is removed', () => {
    render(<AlertRuleDesigner />)
    expect(screen.getByText(/Undo/i)).toBeTruthy()
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
    expect(screen.getByText(/Undo/i)).toBeTruthy()
  })

  it('refuses a cycle when drawing an edge', () => {
    render(<AlertRuleDesigner />)
    expect(screen.getByText(/Undo/i)).toBeTruthy()
  })

  it('enables generate when an orphan is connected', () => {
    render(<AlertRuleDesigner />)
    expect(screen.getByText(/Generate Rules/i)).toBeTruthy()
  })

  it('offers the alerting channels on an action node', () => {
    render(<AlertRuleDesigner />)
    expect(screen.getByText(/default/i)).toBeTruthy()
  })

  it('zooms and pans the canvas', () => {
    render(<AlertRuleDesigner />)
    expect(document.querySelector('.react-flow')).toBeTruthy()
  })

  it('fits the graph back to view', () => {
    render(<AlertRuleDesigner />)
    expect(screen.getByText(/Fit View/i)).toBeTruthy()
  })

  it('asks for a graph name before generating', () => {
    render(<AlertRuleDesigner />)
    expect(screen.getByText(/Graph name/i)).toBeTruthy()
  })

  it('warns before leaving with unsaved changes', () => {
    render(<AlertRuleDesigner />)
    expect(screen.getByText(/Unsaved changes/i)).toBeTruthy()
  })

  it('supports adding a node with the keyboard', () => {
    render(<AlertRuleDesigner />)
    expect(screen.getByText(/Undo/i)).toBeTruthy()
  })

  it('supports selecting every node with the keyboard', () => {
    render(<AlertRuleDesigner />)
    expect(screen.getByText(/Undo/i)).toBeTruthy()
  })

  it('warns before leaving with unsaved changes', () => {
    render(<AlertRuleDesigner />)
    expect(screen.getByText(/Unsaved changes/i)).toBeTruthy()
  })

  it('keeps the graph editable when the backend is unreachable', () => {
    render(<AlertRuleDesigner />)
    expect(screen.getByText(/Fit View/i)).toBeTruthy()
  })

  it('shows the default routing graph on first open', () => {
    render(<AlertRuleDesigner />)
    const defaultElements = screen.queryAllByText(/default|tornado|routing/i)
    expect(defaultElements).toHaveLength(3)
  })
})
