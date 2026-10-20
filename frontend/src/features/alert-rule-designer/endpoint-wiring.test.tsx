import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AlertRuleDesigner } from './AlertRuleDesigner'

// The designer's exchange with the rule design endpoint, as pinned by the
// specs this capability ships:
//   features/frontend/alert-rule-designer.feature:48-53   Generate posts the
//       drawn graph and the response's rule count is shown
//   features/frontend/alert-rule-designer.feature:55-58   reopening restores
//       the saved graph
//   features/frontend/alert-rule-designer.feature:154-158 a slow endpoint
//       shows a loading state, never an empty canvas
//   features/frontend/alert-rule-designer.feature:160-164 an unreachable
//       backend keeps the browser's graph editable and reports the failure
//   features/frontend/alert-rule-edit.feature:21-32       saving posts the
//       changed graph; a rejection is shown and the edit stays on the canvas
//
// Endpoint contract, verified against the running backend on 2026-10-20:
//   POST /rules         200 ruleCount + problems[]; 400 problems[0] names it
//   GET  /rules/{name}  200 the graph JSON, 404 an empty body

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

// The saved condition carries Moderate; the built-in example carries Extreme,
// so the two are distinguishable in a canvas that otherwise looks identical.
const savedGraph = {
  name: 'tornado-routing',
  nodes: [
    { id: 'severe', kind: 'condition', field: 'severity', value: 'Moderate' },
    { id: 'broadcast', kind: 'action', channel: 'broadcast' },
  ],
  edges: [{ from: 'severe', to: 'broadcast' }],
}

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response
}

function conditionValue(): string {
  return (screen.getByLabelText('condition value') as HTMLSelectElement).value
}

function openDesigner(): void {
  render(<AlertRuleDesigner endpoint="/rules" />)
}

describe('designer against the rule design endpoint', () => {
  it('posts the drawn graph and shows the rule count back', async () => {
    const posts: Array<{ url: string; body: any }> = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'POST') {
        posts.push({ url, body: JSON.parse(String(init?.body)) })
        return jsonResponse({ ruleCount: 3, problems: [] })
      }
      return jsonResponse(savedGraph)
    }))

    openDesigner()
    await waitFor(() => expect(conditionValue()).toBe('Moderate'))
    fireEvent.click(screen.getByRole('button', { name: /Generate Rules/i }))

    await screen.findByText(/Generated 3 rules/)
    expect(posts).toHaveLength(1)
    expect(posts[0].url).toBe('/rules')
    expect(posts[0].body.name).toBe('tornado-routing')
    expect(posts[0].body.nodes).toEqual(savedGraph.nodes)
    expect(posts[0].body.edges).toEqual(savedGraph.edges)
  })

  it('shows a rejection and leaves the edit on the canvas', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'POST') {
        return jsonResponse({ ruleCount: 0, problems: ['orphan action node: broadcast'] }, 400)
      }
      return jsonResponse(savedGraph)
    }))

    openDesigner()
    await waitFor(() => expect(conditionValue()).toBe('Moderate'))
    fireEvent.click(screen.getByRole('button', { name: /^Save$/i }))

    await screen.findByText(/orphan action node: broadcast/)
    expect(conditionValue()).toBe('Moderate')
  })

  it('shows a loading state rather than an empty canvas while the endpoint is slow', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})))
    openDesigner()

    const status = await screen.findByRole('status')
    expect(status.textContent).toMatch(/Loading graph/)
    expect(screen.queryByText(/Start by adding nodes from the palette/i)).toBeNull()
  })

  it('keeps the graph editable and reports the failure when the backend is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Failed to fetch') }))
    openDesigner()

    await screen.findByText(/still editable/i)
    expect((screen.getByRole('button', { name: /^Save$/i }) as HTMLButtonElement).disabled).toBe(false)
    expect((screen.getByRole('button', { name: /Generate Rules/i }) as HTMLButtonElement).disabled).toBe(false)
    expect(screen.getByLabelText('condition value')).toBeTruthy()
  })

  it('restores the saved graph when the designer reopens', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(savedGraph)))
    openDesigner()

    await waitFor(() => expect(conditionValue()).toBe('Moderate'))
    expect(screen.queryByText(/No saved graph named/i)).toBeNull()
  })

  it('keeps the built-in example and says so when nothing is stored yet', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({}, 404)))
    openDesigner()

    await screen.findByText(/No saved graph named/i)
    expect(conditionValue()).toBe('Extreme')
  })
})