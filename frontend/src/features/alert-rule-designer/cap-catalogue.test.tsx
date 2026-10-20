import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import catalogue from './cap-fields.json'
import { AlertRuleDesigner } from './AlertRuleDesigner'

afterEach(cleanup)

describe('CAP field catalogue', () => {
  it('lists all CAP fields and their types', () => {
    const fields = Object.keys(catalogue)
    expect(fields.length).toBe(50)
    expect(catalogue).toHaveProperty('severity')
    expect(catalogue).toHaveProperty('urgency')
    expect(catalogue).toHaveProperty('certainty')
    expect(catalogue).toHaveProperty('sent')
    expect(catalogue).toHaveProperty('headline')
  })

  it('severity has closed vocabulary', () => {
    expect((catalogue as any).severity).toHaveProperty('values')
    expect((catalogue as any).severity.values).toEqual(['Extreme', 'Severe', 'Moderate', 'Minor', 'Unknown'])
  })

  it('renders designer with catalogue-backed fields', () => {
    render(<AlertRuleDesigner />)
    expect(screen.getByText(/severity/i)).toBeTruthy()
    expect(screen.getByText(/urgency/i)).toBeTruthy()
    expect(screen.getByText(/certainty/i)).toBeTruthy()
  })
})
