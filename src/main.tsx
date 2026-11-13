import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'

const Root = React.lazy(() => import.meta.env.VITE_APP_MODE === 'staging'
  ? import('./staging/StagingWorkspace')
  : import('./App'))

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <React.Suspense fallback={<div className="p-8">Loading P6 workspace…</div>}>
      <Root />
    </React.Suspense>
  </React.StrictMode>,
)
