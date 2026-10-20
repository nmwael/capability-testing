import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { AlertRuleDesigner } from './AlertRuleDesigner'

// React Flow keeps snapToGrid, snapGrid and onlyRenderVisibleElements in its
// own store, so jsdom cannot observe them in the DOM. The props the designer
// hands to <ReactFlow> are captured instead, while the real component still
// renders underneath so the canvas behaves as it does in the browser.
const h = vi.hoisted(() => ({ props: null as any }))
vi.mock('@xyflow/react', async (importOriginal) => {
  const actual: any = await importOriginal()
  const Capture = (props: any) => { h.props = props; return createElement(actual.ReactFlow, props) }
  return { ...actual, ReactFlow: Capture }
})

afterEach(cleanup)

// Toolbar buttons are addressed by their exact label so the assertions read as
// user intent rather than "some text exists somewhere".
function button(label: RegExp): HTMLButtonElement {
  const el = screen.getByText(label).closest('button')
  if (el === null) throw new Error(`no button for ${label}`)
  return el as HTMLButtonElement
}

describe('AlertRuleDesigner behaviour', () => {
  it('renders the React Flow canvas', () => {
    render(<AlertRuleDesigner />)
    expect(document.querySelector('.react-flow')).toBeTruthy()
  })

  it('starts with nothing to undo or redo', async () => {
    render(<AlertRuleDesigner />)
    // history is seeded with the initial graph at index 0
    await waitFor(() => expect(button(/^Undo$/i).disabled).toBe(true))
    expect(button(/^Redo$/i).disabled).toBe(true)
  })

  it('enables undo after an edit, and undo/redo step back and forth', async () => {
    render(<AlertRuleDesigner />)
    await waitFor(() => expect(button(/^Undo$/i).disabled).toBe(true))

    // make a change
    fireEvent.click(screen.getByText(/Add Condition/i))
    await waitFor(() => expect(button(/^Undo$/i).disabled).toBe(false))
    expect(button(/^Redo$/i).disabled).toBe(true)

    // undo the change -> nothing left to undo, redo becomes available
    fireEvent.click(button(/^Undo$/i))
    await waitFor(() => expect(button(/^Redo$/i).disabled).toBe(false))
    expect(button(/^Undo$/i).disabled).toBe(true)

    // redo re-applies the change
    fireEvent.click(button(/^Redo$/i))
    await waitFor(() => expect(button(/^Undo$/i).disabled).toBe(false))
    expect(button(/^Redo$/i).disabled).toBe(true)
  })

  it('records each edit as its own undo step', async () => {
    render(<AlertRuleDesigner />)
    await waitFor(() => expect(button(/^Undo$/i).disabled).toBe(true))

    fireEvent.click(screen.getByText(/Add Condition/i))
    fireEvent.click(screen.getByText(/Add Condition/i))
    await waitFor(() => expect(button(/^Undo$/i).disabled).toBe(false))

    // first undo leaves a further undo available (two edits were recorded)
    fireEvent.click(button(/^Undo$/i))
    await waitFor(() => expect(button(/^Redo$/i).disabled).toBe(false))
    expect(button(/^Undo$/i).disabled).toBe(false)
  })

  it('disables Generate Rules once an unconnected action node is added', async () => {
    render(<AlertRuleDesigner />)
    // the default graph is a connected condition -> action path, so it is valid
    await waitFor(() => expect(button(/Generate Rules/i).disabled).toBe(false))

    // an action node with no incoming edge makes the graph invalid
    fireEvent.click(screen.getByText(/Add Action/i))
    await waitFor(() => expect(button(/Generate Rules/i).disabled).toBe(true))
  })

  it('shows the default graph name and keeps it editable', async () => {
    render(<AlertRuleDesigner />)
    const input = screen.getByPlaceholderText('tornado-routing') as HTMLInputElement
    await waitFor(() => expect(input.value).toBe('tornado-routing'))

    fireEvent.change(input, { target: { value: 'tornado-routing-2' } })
    await waitFor(() => expect(input.value).toBe('tornado-routing-2'))
  })

  it('exposes a connection handle on the condition node and none outgoing on the action node', async () => {
    render(<AlertRuleDesigner />)
    await waitFor(() => expect(document.querySelector('.react-flow__node[data-id="condition-1"]')).toBeTruthy())

    // the condition node can be wired: it has a handle and an outgoing one
    expect(document.querySelector('.react-flow__node[data-id="condition-1"] .cap-handle')).toBeTruthy()
    expect(document.querySelector('.react-flow__node[data-id="condition-1"] .source')).toBeTruthy()

    // the action node ends the path, so it offers no outgoing handle
    expect(document.querySelector('.react-flow__node[data-id="action-1"] .source')).toBeNull()
  })

  it('offers a minimap of the graph', async () => {
    render(<AlertRuleDesigner />)
    await waitFor(() => expect(document.querySelector('.react-flow__minimap')).toBeTruthy())
    expect(document.querySelector('.react-flow__minimap')).toBeTruthy()
  })

  it('snaps dragged nodes to the grid', () => {
    render(<AlertRuleDesigner />)
    expect(h.props.snapToGrid).toBe(true)
    expect(h.props.snapGrid).toEqual([10, 10])
  })

  it('Backspace deletes the selected node exactly once', async () => {
    render(<AlertRuleDesigner />)
    await waitFor(() => expect(document.querySelectorAll('.react-flow__node').length).toBe(2))

    // clicking a node in the canvas selects it
    const condition = document.querySelector('.react-flow__node[data-id="condition-1"]') as HTMLElement
    fireEvent.click(condition)
    await waitFor(() => expect(condition.className).toContain('selected'))

    // the canvas wrapper carries the keyboard shortcut
    const canvas = document.querySelector('.react-flow')!.parentElement as HTMLElement
    fireEvent.keyDown(canvas, { key: 'Backspace' })

    // exactly one node goes: the selected one, and no second deletion
    await waitFor(() => expect(document.querySelectorAll('.react-flow__node').length).toBe(1))
    expect(document.querySelector('.react-flow__node[data-id="condition-1"]')).toBeNull()
    expect(document.querySelector('.react-flow__node[data-id="action-1"]')).toBeTruthy()
  })

  it('typing in the graph-name field does not trigger the canvas shortcut', async () => {
    render(<AlertRuleDesigner />)
    const input = screen.getByPlaceholderText('tornado-routing') as HTMLInputElement
    await waitFor(() => expect(input.value).toBe('tornado-routing'))
    await waitFor(() => expect(document.querySelectorAll('.react-flow__node-condition').length).toBe(1))

    input.focus()
    fireEvent.keyDown(input, { key: 'c' })
    fireEvent.change(input, { target: { value: 'c' } })

    // the field receives the character, the canvas adds no condition node
    expect(input.value).toBe('c')
    expect(document.querySelectorAll('.react-flow__node-condition').length).toBe(1)
  })

  it('a disabled generate control says what is missing', async () => {
    render(<AlertRuleDesigner />)
    await waitFor(() => expect(button(/Generate Rules/i).disabled).toBe(false))

    // an action node with no incoming edge leaves the graph incomplete
    fireEvent.click(screen.getByText(/Add Action/i))
    await waitFor(() => expect(button(/Generate Rules/i).disabled).toBe(true))

    const title = button(/Generate Rules/i).getAttribute('title')
    expect(title).toBeTruthy()
    expect(title).not.toBe('Generate rules from the drawn graph')
  })

  it('the two node kinds are visually distinguishable', async () => {
    render(<AlertRuleDesigner />)
    await waitFor(() => expect(document.querySelector('.react-flow__node[data-id="condition-1"] .cap-node')).toBeTruthy())

    const condition = document.querySelector('.react-flow__node[data-id="condition-1"] .cap-node') as HTMLElement
    const action = document.querySelector('.react-flow__node[data-id="action-1"] .cap-node') as HTMLElement
    expect(condition.className).toContain('cap-node-condition')
    expect(action.className).toContain('cap-node-action')
    expect(condition.className).not.toBe(action.className)
  })

  it('selecting a node is not an edit', async () => {
    render(<AlertRuleDesigner />)
    await waitFor(() => expect(document.querySelector('.react-flow__node[data-id="action-1"]')).toBeTruthy())

    // saving clears the unsaved-changes marker
    fireEvent.click(button(/^Save$/i))
    await waitFor(() => expect(screen.queryByText(/Unsaved changes/i)).toBeNull())

    // selecting a node changes nothing, so nothing is unsaved
    fireEvent.click(document.querySelector('.react-flow__node[data-id="action-1"]') as HTMLElement)
    await waitFor(() => expect(screen.queryByText(/Unsaved changes/i)).toBeNull())
  })

  it('draws only the nodes in view', () => {
    render(<AlertRuleDesigner />)
    expect(h.props.onlyRenderVisibleElements).toBe(true)
  })
})
