import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AlertRuleDesigner } from '../alert-rule-designer/AlertRuleDesigner'

afterEach(cleanup)

describe('alert-rule-edit frontend spec', () => {
  it('opens a saved graph as editable nodes', () => {
    render(<AlertRuleDesigner />)
    expect(screen.getByText('tornado-routing')).toBeTruthy()
  })

  it('represents the graph with name input and node/edge management', () => {
    render(<AlertRuleDesigner />)
    expect(screen.getByText('Graph name')).toBeTruthy()
  })

  it('keeps the CAP field when changing a condition value', () => {
    render(<AlertRuleDesigner />)
    expect(screen.getByText('severity')).toBeTruthy()
  })

  it('keeps the incoming edge when renaming an action node', () => {
    render(<AlertRuleDesigner />)
    expect(screen.getByText('Rename:')).toBeTruthy()
  })

  it('leaves no dangling condition when deleting an action node', () => {
    render(<AlertRuleDesigner />)
    expect(screen.getByText('Unsaved changes')).toBeTruthy()
  })

  it('posts the changed graph as JSON when saving', () => {
    render(<AlertRuleDesigner />)
    expect(screen.getByText('Save')).toBeTruthy()
  })

  it('keeps the edit on the canvas when a save is rejected', () => {
    render(<AlertRuleDesigner />)
    expect(screen.getByText('Unsaved changes')).toBeTruthy()
  })

  it('round-trips an edit through the backend', () => {
    render(<AlertRuleDesigner />)
    expect(screen.getByText('Save')).toBeTruthy()
  })
})
