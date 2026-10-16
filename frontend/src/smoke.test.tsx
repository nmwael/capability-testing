import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AlertRuleDesigner } from './features/alert-rule-designer/AlertRuleDesigner'
import { AlertFlow } from './features/alert-flow/AlertFlow'

// Toolchain smoke test, not a capability spec. It proves vitest + jsdom +
// @testing-library/react can render the components the feature specs under
// features/frontend/ will drive (alert.flow, alert.rule-design).
// Deliberately lives outside src/features/ so .depcruiser.js's no-cross-feature
// rule does not fire on a test importing its own feature.
afterEach(cleanup)

describe('frontend toolchain', () => {
  it('renders the alert distribution canvas', () => {
    render(<AlertFlow />)
    expect(screen.getByText(/Alert flow/)).toBeTruthy()
  })

  it('renders the routing rule designer', () => {
    render(<AlertRuleDesigner />)
    expect(screen.getByText(/Alert rule designer/)).toBeTruthy()
  })
})
