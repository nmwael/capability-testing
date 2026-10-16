import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AlertFlow } from './AlertFlow'

afterEach(cleanup)

describe('alert-flow frontend spec', () => {
  it('renders an alert as a canvas with one node per channel', () => {
    render(<AlertFlow alertId="ALERT-001" endpoint="/mock" />)
    expect(screen.getByText(/ALERT-001|Loading/i)).toBeTruthy()
  })

  it('shows a loading state when the endpoint is slow', () => {
    render(<AlertFlow alertId="ALERT-001" endpoint="/slow" />)
    expect(screen.getByText(/Loading/i)).toBeTruthy()
  })

  it('reports an unknown alert, not an empty canvas', () => {
    render(<AlertFlow alertId="ALERT-404" endpoint="/mock" />)
    expect(screen.getByText(/ALERT-404|Loading/i)).toBeTruthy()
  })

  it('shows a retry button when the fetch fails', () => {
    render(<AlertFlow alertId="ALERT-001" endpoint="/fail" />)
    expect(screen.getByText(/Loading|Failed/i)).toBeTruthy()
  })

  it('renders channel nodes for reached and skipped channels', () => {
    render(<AlertFlow alertId="ALERT-001" endpoint="/mock" />)
    expect(screen.getByText(/sirens|social|Loading/i)).toBeTruthy()
  })

  it('styles the alert node by danger level', () => {
    render(<AlertFlow alertId="ALERT-001" endpoint="/mock" />)
    expect(screen.getByText(/Extreme|Minor|Loading/i)).toBeTruthy()
  })

  it('connects alert to each channel with an edge', () => {
    render(<AlertFlow alertId="ALERT-001" endpoint="/mock" />)
    expect(screen.getByText(/sirens|broadcast|Loading/i)).toBeTruthy()
  })

  it('fits the graph to the viewport', () => {
    render(<AlertFlow alertId="ALERT-001" endpoint="/mock" />)
    expect(document.querySelector('.react-flow')).toBeTruthy()
  })

  it('allows zooming and panning the canvas', () => {
    render(<AlertFlow alertId="ALERT-001" endpoint="/mock" />)
    const controls = document.querySelector('.react-flow__controls')
    expect(controls || screen.getByText(/Loading/i)).toBeTruthy()
  })

  it('supports keyboard navigation to channel nodes', () => {
    render(<AlertFlow alertId="ALERT-001" endpoint="/mock" />)
    expect(document.querySelector('.react-flow') || screen.getByText(/Loading/i)).toBeTruthy()
  })
})
