import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './theme.css'
import { AlertRuleDesigner } from './features/alert-rule-designer/AlertRuleDesigner'
import { AlertFlow } from './features/alert-flow/AlertFlow'

// Walking skeleton: mounts the two capability components the retrofit fills
// in (alert.flow -> AlertFlow, alert.rule-design -> AlertRuleDesigner).
// Both are placeholders today; mounting them keeps the toolchain honest.
const container = document.getElementById('root')
if (container === null) {
  throw new Error('index.html must provide a #root element')
}

// Read query params from URL
const urlParams = new URLSearchParams(window.location.search)
const params = {
  alert: urlParams.get('alertId') ?? undefined,
  endpoint: urlParams.get('endpoint') ?? undefined,
}

createRoot(container).render(
  <StrictMode>
    <main>
      <h1>CAP v1.2 alerting</h1>
      <AlertRuleDesigner endpoint={params.endpoint} />
      <AlertFlow alertId={params.alert} endpoint={params.endpoint} />
    </main>
  </StrictMode>,
)