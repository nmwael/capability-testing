import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AlertRuleDesigner } from './AlertRuleDesigner'

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
})
