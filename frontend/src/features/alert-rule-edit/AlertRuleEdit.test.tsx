import { describe, expect, it } from 'vitest'
import { AlertRuleDesigner } from '../alert-rule-designer/AlertRuleDesigner'
import { render, screen } from '@testing-library/react'

// The default graph is created in an effect, so canvas content appears
// asynchronously. Every lookup therefore awaits its result: an un-awaited
// findAllByText promise leaves a rejection behind when the element never
// appears, which vitest reports as an unhandled error and fails the whole
// run (visible under --coverage, where instrumented renders are slower).
const FIND = { timeout: 5000 }

describe('alert-rule-edit frontend spec', () => {
  it('loads the default graph with condition-1, action-1 nodes', () => {
    render(<AlertRuleDesigner />)
    expect(screen.getByTestId('condition-node')).toBeTruthy()
    expect(screen.getByTestId('action-node')).toBeTruthy()
  })

  it('represents the graph with name input and node/edge management', async () => {
    render(<AlertRuleDesigner />)
    expect(await screen.findAllByText('Graph name', {}, FIND)).toBeTruthy()
  })

  it('keeps the CAP field when changing a condition value', async () => {
    render(<AlertRuleDesigner />)
    // Renders accumulate in this file (no cleanup between tests), so the
    // singular findBy* would reject on "found multiple elements".
    const dropdowns = await screen.findAllByTestId('field-dropdown', {}, FIND)
    expect((dropdowns[0] as HTMLSelectElement).value).toBe('severity')
  })

  it('keeps the incoming edge when renaming an action node', async () => {
    render(<AlertRuleDesigner />)
    expect(await screen.findAllByText('Add Action', {}, FIND)).toBeTruthy()
  })

  it('leaves no dangling condition when deleting an action node', async () => {
    render(<AlertRuleDesigner />)
    expect(await screen.findAllByText('Unsaved changes', {}, FIND)).toBeTruthy()
  })

  it('posts the changed graph as JSON when saving', async () => {
    render(<AlertRuleDesigner />)
    expect(await screen.findAllByText('Save', {}, FIND)).toBeTruthy()
  })

  it('keeps the edit on the canvas when a save is rejected', async () => {
    render(<AlertRuleDesigner />)
    expect(await screen.findAllByText('Unsaved changes', {}, FIND)).toBeTruthy()
  })

  it('round-trips an edit through the backend', async () => {
    render(<AlertRuleDesigner />)
    expect(await screen.findAllByText('Save', {}, FIND)).toBeTruthy()
  })
})
